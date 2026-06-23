import fs from 'fs';
import path from 'path';
import os from 'os';
import { Logger } from './logger.js';
import { MODULES_DIR, ConfigManager } from './config.js';
import { ModuleManager } from './module.js';

export interface MigrationScanResult {
  hasLegacyTavx: boolean;
  detects: {
    id: string;
    oldPath: string;
    sizeDesc?: string;
    status: 'READY' | 'MIGRATED';
  }[];
}

export class MigrateManager {
  /**
   * Scan for TAV-X legacy installations
   */
  static scan(): MigrationScanResult {
    const home = os.homedir();
    const detects: MigrationScanResult['detects'] = [];

    // 1. SillyTavern special hardcoded path
    const stPath = path.join(home, 'SillyTavern');
    if (fs.existsSync(stPath) && fs.statSync(stPath).isDirectory()) {
      const isMigrated = fs.existsSync(path.join(MODULES_DIR, 'sillytavern', 'app', 'server.js')) && 
                         fs.existsSync(path.join(MODULES_DIR, 'sillytavern', 'app', 'data'));
      
      detects.push({
        id: 'sillytavern',
        oldPath: stPath,
        status: isMigrated ? 'MIGRATED' : 'READY',
      });
    }

    // 2. Other tav_apps
    const tavAppsDir = path.join(home, 'tav_apps');
    if (fs.existsSync(tavAppsDir) && fs.statSync(tavAppsDir).isDirectory()) {
      const dirs = fs.readdirSync(tavAppsDir, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        const id = d.name;
        const oldPath = path.join(tavAppsDir, id);
        const isMigrated = fs.existsSync(path.join(MODULES_DIR, id, 'app'));

        detects.push({
          id,
          oldPath,
          status: isMigrated ? 'MIGRATED' : 'READY',
        });
      }
    }

    return {
      hasLegacyTavx: detects.length > 0,
      detects
    };
  }

  /**
   * Execute migration for a specific module
   */
  static async execute(id: string): Promise<void> {
    const scanRes = this.scan();
    const target = scanRes.detects.find(d => d.id === id);
    
    if (!target) {
      throw new Error(`找不到模块 ${id} 的 TAV-X 遗留数据。`);
    }

    const newModuleDir = path.join(MODULES_DIR, id);
    const newAppDir = path.join(newModuleDir, 'app');

    Logger.info(`开始迁移 TAV-X 数据 [${id}] 从 ${target.oldPath} 到 ${newAppDir}...`, 'Migrate');

    // Make sure the module scaffold exists in LexHub
    if (!fs.existsSync(newModuleDir)) {
      Logger.info(`在 LexHub 中初始化 ${id} 模块结构...`, 'Migrate');
      await ModuleManager.installModule(id).catch(err => {
         Logger.warn(`模块依赖安装时出错，可能影响运行，但将继续迁移用户数据: ${err}`, 'Migrate');
      });
    }

    // Backup current LexHub instance data if exists
    if (fs.existsSync(newAppDir)) {
      Logger.info(`目标位置已存在，正在尝试备份当前数据...`, 'Migrate');
      try {
        await ModuleManager.callLifecycle(id, 'backup');
      } catch (err) {
        Logger.warn(`备份现有数据失败，将直接尝试合并: ${err}`, 'Migrate');
      }
    } else {
      fs.mkdirSync(newAppDir, { recursive: true });
    }

    // For SillyTavern, we selectively copy specific directories.
    // For other apps, we just copy everything if safe.
    if (id === 'sillytavern') {
       this.copyDirectoryOrFile(path.join(target.oldPath, 'data'), path.join(newAppDir, 'data'));
       this.copyDirectoryOrFile(path.join(target.oldPath, 'secrets.json'), path.join(newAppDir, 'secrets.json'));
       this.copyDirectoryOrFile(path.join(target.oldPath, 'plugins'), path.join(newAppDir, 'plugins'));
       this.copyDirectoryOrFile(path.join(target.oldPath, 'public', 'scripts', 'extensions', 'third-party'), path.join(newAppDir, 'public', 'scripts', 'extensions', 'third-party'));
       Logger.success(`SillyTavern 核心用户数据 (data, secrets, plugins, extensions) 迁移完成！`, 'Migrate');
    } else {
       // Generic deep copy
       this.copyDirectoryOrFile(target.oldPath, newAppDir);
       Logger.success(`${id} 数据完整迁移完成！`, 'Migrate');
    }

    // Reset status so the UI knows it's ready to use
    ConfigManager.setModuleStatus(id, 'STOPPED');
  }

  private static copyDirectoryOrFile(src: string, dest: string) {
    if (!fs.existsSync(src)) return;
    
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        this.copyDirectoryOrFile(srcPath, destPath);
      }
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}
