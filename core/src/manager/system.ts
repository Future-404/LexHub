import { spawnSync, execSync } from 'child_process';
import os from 'os';
import path from 'path';

export type OSPlatform = 'windows' | 'termux' | 'linux' | 'macos';

export class SystemManager {
  /**
   * 获取当前操作系统平台类型
   */
  static getPlatform(): OSPlatform {
    const platform = os.platform();
    if (platform === 'win32') {
      return 'windows';
    }
    if (platform === 'android' || (platform === 'linux' && process.env.PREFIX?.includes('com.termux'))) {
      return 'termux';
    }
    if (platform === 'darwin') {
      return 'macos';
    }
    return 'linux';
  }

  /**
   * 检查 PATH 中是否存在某个可执行文件
   * @param binaryName 可执行文件名 (如 git, node, python)
   */
  static hasBinary(binaryName: string): boolean {
    const isWin = os.platform() === 'win32';
    const command = isWin ? 'where' : 'command';
    const args = isWin ? [binaryName] : ['-v', binaryName];
    try {
      const res = spawnSync(command, args, { stdio: 'ignore' });
      if (res.status === 0) return true;
    } catch {
      // ignore
    }
    
    // 备用方案：尝试直接 spawn 运行一次
    try {
      const checkName = isWin && binaryName === 'npm' ? 'npm.cmd' : binaryName;
      const res2 = spawnSync(checkName, ['--version'], { stdio: 'ignore' });
      return res2.status === 0;
    } catch {
      return false;
    }
  }

  /**
   * 标准化 Windows 下的命令名称 (如 npm -> npm.cmd)
   */
  static resolveBinaryName(command: string): string {
    if (os.platform() === 'win32') {
      if (command === 'npm') return 'npm.cmd';
      if (command === 'npx') return 'npx.cmd';
      if (command === 'yarn') return 'yarn.cmd';
      if (command === 'pnpm') return 'pnpm.cmd';
    }
    return command;
  }

  /**
   * 获取系统资源使用情况 (CPU, 内存, 磁盘)
   */
  static getSystemMetrics() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const loadAvg = os.loadavg(); // [1min, 5min, 15min]

    return {
      platform: this.getPlatform(),
      arch: os.arch(),
      uptime: os.uptime(),
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        percentage: Math.round((usedMem / totalMem) * 100),
      },
      cpu: {
        cores: os.cpus().length,
        load1m: loadAvg[0],
        model: os.cpus()[0]?.model || 'Unknown',
      }
    };
  }
}
