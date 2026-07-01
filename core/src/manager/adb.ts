import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'child_process';
import { Logger } from './logger.js';
import { CONFIG_DIR } from './config.js';
import { SystemManager } from './system.js';

const SILENCE_FILE = path.join(CONFIG_DIR, 'silence.wav');
const OPTIMIZED_FLAG = path.join(CONFIG_DIR, '.adb_optimized');
const PKG = 'com.termux';

export interface AdbStatus {
  installed: boolean;
  connected: boolean;
  devices: string[];
  heartbeatRunning: boolean;
  optimized: boolean;
  manufacturer: string;
}

export class AdbManager {
  /**
   * 检查是否安装了 adb
   */
  static checkAdbInstalled(): boolean {
    try {
      execSync('command -v adb', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 自动在 Termux/Linux 下安装 adb
   */
  static async installAdb(): Promise<void> {
    if (this.checkAdbInstalled()) return;

    const platform = SystemManager.getPlatform();
    if (platform === 'termux') {
      Logger.info('检测到 Termux，正在安装 android-tools...', 'ADB');
      // 用我们 Go 里面优化后的策略：如果当前是 root 用 apt-get，否则用 pkg 并带 fallback
      const isRoot = os.userInfo().username === 'root' || process.getuid?.() === 0;
      try {
        if (isRoot) {
          execSync('apt-get install -y android-tools', { stdio: 'inherit' });
        } else {
          try {
            execSync('pkg install -y android-tools', { stdio: 'inherit' });
          } catch {
            execSync('apt-get install -y android-tools', { stdio: 'inherit' });
          }
        }
      } catch (err) {
        throw new Error(`安装 android-tools 失败: ${err}`);
      }
    } else if (platform === 'linux') {
      Logger.info('正在为 Linux 安装 adb...', 'ADB');
      try {
        execSync('sudo apt-get update && sudo apt-get install -y adb', { stdio: 'inherit' });
      } catch (err) {
        throw new Error(`Linux 下安装 adb 失败: ${err}`);
      }
    } else {
      throw new Error('当前系统不支持自动安装 ADB，请手动安装并将 adb 添加到环境变量 PATH 中。');
    }
  }

  /**
   * 检查 ADB 是否连接并授权
   */
  static checkAdbConnection(): boolean {
    if (!this.checkAdbInstalled()) return false;
    try {
      const output = execSync('adb devices', { encoding: 'utf8', timeout: 2000 });
      // 检查是否有处于 "device" 状态的设备（不包括 un-authorized 等）
      const lines = output.trim().split('\n').slice(1);
      return lines.some(line => line.includes('\tdevice'));
    } catch {
      return false;
    }
  }

  /**
   * 获取所有连接成功的设备列表
   */
  static getConnectedDevices(): string[] {
    if (!this.checkAdbInstalled()) return [];
    try {
      const output = execSync('adb devices', { encoding: 'utf8' });
      return output
        .trim()
        .split('\n')
        .slice(1)
        .map(line => line.trim())
        .filter(line => line.includes('\tdevice'))
        .map(line => line.split('\t')[0]);
    } catch {
      return [];
    }
  }

  /**
   * ADB 无线配对
   */
  static pairDevice(host: string, code: string): void {
    if (!this.checkAdbInstalled()) throw new Error('ADB 未安装');
    try {
      // adb pair 命令运行较快，超时设为 5 秒
      const res = execSync(`adb pair ${host} ${code}`, { encoding: 'utf8', timeout: 5000 });
      Logger.info(`ADB 配对成功: ${res.trim()}`, 'ADB');
    } catch (err) {
      throw new Error(`配对失败: ${String(err).trim()}`);
    }
  }

  /**
   * ADB 快速连接
   */
  static connectDevice(host: string): void {
    if (!this.checkAdbInstalled()) throw new Error('ADB 未安装');
    try {
      const res = execSync(`adb connect ${host}`, { encoding: 'utf8', timeout: 5000 });
      if (res.includes('failed') || res.includes('unable')) {
        throw new Error(res.trim());
      }
      Logger.info(`ADB 连接成功: ${res.trim()}`, 'ADB');
    } catch (err) {
      throw new Error(`连接失败: ${String(err).trim()}`);
    }
  }

  /**
   * 运行 ADB shell 命令并返回结果
   */
  private static runAdbShell(cmd: string): string {
    try {
      return execSync(`adb shell "${cmd}"`, { encoding: 'utf8', timeout: 5000 }).trim();
    } catch (err) {
      Logger.warn(`执行 ADB shell 命令失败 [${cmd}]: ${err}`, 'ADB');
      return '';
    }
  }

  /**
   * 获取 Android SDK 版本
   */
  private static getSdkVersion(): number {
    const val = this.runAdbShell('getprop ro.build.version.sdk');
    const num = parseInt(val, 10);
    return isNaN(num) ? 0 : num;
  }

  /**
   * 获取手机厂商标识
   */
  static getManufacturer(): string {
    return this.runAdbShell('getprop ro.product.manufacturer').toLowerCase();
  }

  /**
   * 应用通用保活策略
   */
  static applyUniversalFixes(): void {
    if (!this.checkAdbConnection()) throw new Error('未检测到已连接的授权 ADB 设备');

    Logger.info('正在应用 Android 通用免杀保活策略...', 'ADB');
    const sdkVer = this.getSdkVersion();

    // 1. Android 12+ (SDK 31) 突破 Phantom Process Killer 限制
    if (sdkVer >= 31) {
      this.runAdbShell('device_config set_sync_disabled_for_tests persistent');
      this.runAdbShell('device_config put activity_manager max_phantom_processes 2147483647');
      this.runAdbShell('device_config put activity_manager settings_enable_monitor_phantom_procs false');
      Logger.success('已解除 Phantom Process 进程限制', 'ADB');
    }

    // 2. AOSP 白名单和后台权限设置
    this.runAdbShell(`dumpsys deviceidle whitelist +${PKG}`);
    this.runAdbShell(`cmd appops set ${PKG} RUN_IN_BACKGROUND allow`);
    this.runAdbShell(`cmd appops set ${PKG} RUN_ANY_IN_BACKGROUND allow`);
    this.runAdbShell(`cmd appops set ${PKG} WAKE_LOCK allow`);
    this.runAdbShell(`cmd appops set ${PKG} START_FOREGROUND allow`);
    this.runAdbShell(`am set-standby-bucket ${PKG} active`);

    // 3. 申请系统 wake lock
    if (SystemManager.getPlatform() === 'termux') {
      try {
        execSync('command -v termux-wake-lock && termux-wake-lock', { stdio: 'ignore' });
      } catch {
        // ignore
      }
    }

    fs.writeFileSync(OPTIMIZED_FLAG, '1', 'utf8');
    Logger.success('通用保活参数配置完成', 'ADB');
  }

  /**
   * 应用厂商深度杀后台拦截策略 (激进模式)
   */
  static applyVendorFixes(): string {
    if (!this.checkAdbConnection()) throw new Error('未检测到已连接 of 授权 ADB 设备');
    
    const manufacturer = this.getManufacturer();
    const sdkVer = this.getSdkVersion();
    let message = `当前检测到厂商: ${manufacturer}\n`;

    Logger.info(`正在为 ${manufacturer} 机型匹配应用深度优化...`, 'ADB');

    if (manufacturer.includes('huawei') || manufacturer.includes('honor')) {
      this.runAdbShell('pm disable-user --user 0 com.huawei.powergenie');
      this.runAdbShell('pm disable-user --user 0 com.huawei.android.hwaps');
      this.runAdbShell('am stopservice hwPfwService');
      message += '已成功冻结华为 PowerGenie / 墓碑监控。提示：建议同时在手机【电池管理】中将 Termux 设为【手动管理】。';
    } 
    else if (manufacturer.includes('xiaomi') || manufacturer.includes('redmi')) {
      this.runAdbShell('pm disable-user --user 0 com.xiaomi.joyose');
      this.runAdbShell('pm disable-user --user 0 com.xiaomi.powerchecker');
      try {
        // 唤醒小米自启动管理
        this.runAdbShell('am start -n com.miui.securitycenter/com.miui.permcenter.autostart.AutoStartManagementActivity');
      } catch {}
      message += '已冻结小米 Joyose/云控 杀进程组件。提示：请在手机上弹出的界面中开启 Termux 的【自启动】权限。';
    } 
    else if (manufacturer.includes('oppo') || manufacturer.includes('realme') || manufacturer.includes('oneplus')) {
      if (sdkVer >= 34) {
        // Android 14+ 禁用 Athena 可能会卡米/死机，安全起见仅禁用超级省电
        this.runAdbShell('settings put global coloros_super_power_save 0');
        message += '已关闭超级省电。';
      } else {
        this.runAdbShell('pm disable-user --user 0 com.coloros.athena');
        message += '已冻结 OPPO Athena 后台清理框架。';
      }
      try {
        this.runAdbShell('am start -n com.coloros.safecenter/.startupapp.StartupAppListActivity');
      } catch {}
      message += ' 提示：请在手机上弹出的窗口中允许 Termux 自启动。';
    } 
    else if (manufacturer.includes('vivo') || manufacturer.includes('iqoo')) {
      this.runAdbShell('pm disable-user --user 0 com.vivo.pem');
      this.runAdbShell('pm disable-user --user 0 com.vivo.abe');
      try {
        this.runAdbShell('am start -a android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
      } catch {}
      message += '已禁用 VIVO ABE/PEM 保活杀后台拦截器。提示：请在手机弹出的界面中将 Termux 设置为【不限制/忽略电池优化】。';
    } 
    else {
      message += '非四大厂商机型，已自动降级应用 AOSP 标准保活。';
    }

    fs.writeFileSync(OPTIMIZED_FLAG, '1', 'utf8');
    Logger.success('深度保活策略执行完毕', 'ADB');
    return message;
  }

  /**
   * 确保静音 wav 文件存在
   */
  private static ensureSilenceFile(): void {
    if (fs.existsSync(SILENCE_FILE)) return;
    fs.mkdirSync(path.dirname(SILENCE_FILE), { recursive: true });
    // TAV-X 极简 44 字节 silent wav 文件 base64
    const base64Wav = 'UklGRigAAABXQVZFRm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
    fs.writeFileSync(SILENCE_FILE, Buffer.from(base64Wav, 'base64'));
  }

  /**
   * 检查音频心跳是否正在后台播放
   */
  static isHeartbeatRunning(): boolean {
    const platform = SystemManager.getPlatform();
    if (platform === 'termux') {
      try {
        const output = execSync('sv status audio_keeper', { encoding: 'utf8', stdio: 'pipe' });
        return output.includes('run:');
      } catch {
        return false;
      }
    }
    
    // 非 Termux 下，查 pid/进程名 mpv (带 silence.wav 参数)
    try {
      const output = execSync('ps -ef | grep mpv', { encoding: 'utf8' });
      return output.includes('silence.wav') && !output.includes('grep');
    } catch {
      return false;
    }
  }

  /**
   * 音频心跳管理开关
   */
  static toggleAudioHeartbeat(enable: boolean): void {
    const platform = SystemManager.getPlatform();

    if (!enable) {
      Logger.info('正在停止音频心跳...', 'ADB');
      if (platform === 'termux') {
        try {
          execSync('sv down audio_keeper', { stdio: 'ignore' });
          const svcPath = '/data/data/com.termux/files/usr/var/service/audio_keeper';
          if (fs.existsSync(svcPath)) {
            fs.rmSync(svcPath, { recursive: true, force: true });
          }
        } catch {}
      } else {
        try {
          execSync('pkill -f "mpv.*silence.wav"', { stdio: 'ignore' });
        } catch {}
      }
      try {
        execSync('command -v termux-wake-unlock && termux-wake-unlock', { stdio: 'ignore' });
      } catch {}
      Logger.info('音频心跳已关闭', 'ADB');
      return;
    }

    // 开启心跳
    Logger.info('正在启动后台音频心跳...', 'ADB');
    this.ensureSilenceFile();

    // 检查 mpv 是否安装
    try {
      execSync('command -v mpv', { stdio: 'ignore' });
    } catch {
      Logger.info('未找到 mpv，开始自动安装 mpv 依赖...', 'ADB');
      if (platform === 'termux') {
        execSync('pkg install -y mpv', { stdio: 'ignore' });
      } else if (platform === 'linux') {
        execSync('sudo apt-get install -y mpv', { stdio: 'ignore' });
      } else {
        throw new Error('未检测到已安装的 mpv，请手动安装后开启。');
      }
    }

    if (platform === 'termux') {
      const prefix = process.env.PREFIX || '/data/data/com.termux/files/usr';
      const svcDir = path.join(prefix, 'var', 'service', 'audio_keeper');
      fs.mkdirSync(svcDir, { recursive: true });

      const runScript = path.join(svcDir, 'run');
      const runContent = `#!/bin/sh\nexec 2>&1\nexec mpv --no-terminal --volume=0 --loop=inf "${SILENCE_FILE}"\n`;
      fs.writeFileSync(runScript, runContent, { mode: 0o755 });

      try {
        execSync('sv-enable audio_keeper', { stdio: 'ignore' });
        Logger.success('已注册并开启 Termux 音频守护服务', 'ADB');
      } catch (err) {
        // Fallback: spawn directly
        const proc = spawn('mpv', ['--no-terminal', '--volume=0', '--loop=inf', SILENCE_FILE], {
          detached: true,
          stdio: 'ignore'
        });
        proc.unref();
        Logger.success('已注册本地音频守护后台', 'ADB');
      }
    } else {
      const proc = spawn('mpv', ['--no-terminal', '--volume=0', '--loop=inf', SILENCE_FILE], {
        detached: true,
        stdio: 'ignore'
      });
      proc.unref();
      Logger.success('音频心跳守护已在独立后台开启', 'ADB');
    }
  }

  /**
   * 恢复所有系统优化 (还原环境)
   */
  static revertOptimizations(): void {
    if (!this.checkAdbConnection()) throw new Error('未检测到已连接的授权 ADB 设备');

    Logger.info('正在撤销所有 Android 保活优化参数，恢复系统默认值...', 'ADB');
    
    // 1. 还原 Phantom Process Killer 限制
    this.runAdbShell('device_config set_sync_disabled_for_tests none');
    this.runAdbShell('device_config delete activity_manager max_phantom_processes');
    this.runAdbShell('device_config delete activity_manager settings_enable_monitor_phantom_procs');

    // 2. 还原 AOSP 白名单和 AppOps
    this.runAdbShell(`dumpsys deviceidle whitelist -${PKG}`);
    this.runAdbShell(`cmd appops set ${PKG} RUN_IN_BACKGROUND default`);
    this.runAdbShell(`cmd appops set ${PKG} RUN_ANY_IN_BACKGROUND default`);
    this.runAdbShell(`cmd appops set ${PKG} WAKE_LOCK default`);
    this.runAdbShell(`cmd appops set ${PKG} START_FOREGROUND default`);

    // 3. 还原各手机厂商组件
    this.runAdbShell('pm enable com.huawei.powergenie');
    this.runAdbShell('pm enable com.huawei.android.hwaps');
    this.runAdbShell('pm enable com.xiaomi.joyose');
    this.runAdbShell('pm enable com.xiaomi.powerchecker');
    this.runAdbShell('pm enable com.coloros.athena');
    this.runAdbShell('pm enable com.vivo.pem');
    this.runAdbShell('pm enable com.vivo.abe');

    // 4. 关闭本地 WakeLock
    try {
      execSync('command -v termux-wake-unlock && termux-wake-unlock', { stdio: 'ignore' });
    } catch {}

    // 5. 关闭音频心跳
    this.toggleAudioHeartbeat(false);

    if (fs.existsSync(OPTIMIZED_FLAG)) {
      fs.unlinkSync(OPTIMIZED_FLAG);
    }
    
    Logger.success('保活参数已全部撤销还原。建议重启手机使更改完全生效。', 'ADB');
  }

  /**
   * 获取当前所有状态信息
   */
  static getStatus(): AdbStatus {
    return {
      installed: this.checkAdbInstalled(),
      connected: this.checkAdbConnection(),
      devices: this.getConnectedDevices(),
      heartbeatRunning: this.isHeartbeatRunning(),
      optimized: fs.existsSync(OPTIMIZED_FLAG),
      manufacturer: this.checkAdbConnection() ? this.getManufacturer() : ''
    };
  }
}
