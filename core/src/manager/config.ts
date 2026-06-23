import fs from 'fs';
import path from 'path';
import { Logger } from './logger.js';

// ── Paths ──────────────────────────────────────────────────────────────────
export const ROOT_DIR = path.resolve(__dirname, '../../..');
export const CONFIG_DIR = path.join(ROOT_DIR, 'config');
export const MODULES_DIR = path.join(ROOT_DIR, 'modules');
export const LOGS_DIR = path.join(ROOT_DIR, 'logs');

const SETTINGS_PATH = path.join(CONFIG_DIR, 'settings.json');
const INSTALLED_PATH = path.join(CONFIG_DIR, 'installed.json');

// ── Types ──────────────────────────────────────────────────────────────────

export interface GlobalSettings {
  webPort: number;
  webHost: string;
  language: 'zh' | 'en';
  theme: 'dark' | 'light';
  autoStartModules: string[];
  storeIndexUrl: string;
  networkStrategy: 'auto' | 'proxy' | 'mirror' | 'direct';
  proxyUrl?: string;
  mirrorUrl?: string;
}

export type ModuleStatus = 'STOPPED' | 'RUNNING' | 'INSTALLING' | 'CRASHED' | 'ERROR';

export interface InstalledModuleRecord {
  id: string;
  name: string;
  version: string;
  installedAt: string;
  status: ModuleStatus;
  pid?: number;
  crashCount: number;
  lastError?: string;
  config: Record<string, string | number | boolean>;
}

export interface InstalledRegistry {
  modules: Record<string, InstalledModuleRecord>;
  updatedAt: string;
}

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: GlobalSettings = {
  webPort: 3000,
  webHost: '127.0.0.1', // Changed from 0.0.0.0 to prevent LAN access by default without auth
  language: 'zh',
  theme: 'dark',
  autoStartModules: [],
  storeIndexUrl: 'https://raw.githubusercontent.com/Future-404/LexHub-store/main/index.json',
  networkStrategy: 'auto',
};

// ── Config Manager ─────────────────────────────────────────────────────────

export class ConfigManager {
  /**
   * 初始化配置目录与默认文件
   */
  static init(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    if (!fs.existsSync(MODULES_DIR)) {
      fs.mkdirSync(MODULES_DIR, { recursive: true });
    }
    if (!fs.existsSync(SETTINGS_PATH)) {
      this.saveSettings(DEFAULT_SETTINGS);
      Logger.info('已创建默认配置文件 settings.json', 'Config');
    }
    if (!fs.existsSync(INSTALLED_PATH)) {
      this.saveInstalled({ modules: {}, updatedAt: new Date().toISOString() });
      Logger.info('已创建模块注册表 installed.json', 'Config');
    }
  }

  // ── Settings ─────────────────────────────────────────────────────────────

  static loadSettings(): GlobalSettings {
    try {
      const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (err) {
      Logger.warn(`读取 settings.json 失败，使用默认配置: ${err}`, 'Config');
      return { ...DEFAULT_SETTINGS };
    }
  }

  static saveSettings(settings: GlobalSettings): void {
    const tmp = SETTINGS_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), 'utf8');
    fs.renameSync(tmp, SETTINGS_PATH);
  }

  static patchSettings(partial: Partial<GlobalSettings>): GlobalSettings {
    const current = this.loadSettings();
    const updated = { ...current, ...partial };
    this.saveSettings(updated);
    return updated;
  }

  // ── Installed Registry ────────────────────────────────────────────────────

  static loadInstalled(): InstalledRegistry {
    try {
      const raw = fs.readFileSync(INSTALLED_PATH, 'utf8');
      return JSON.parse(raw);
    } catch {
      return { modules: {}, updatedAt: new Date().toISOString() };
    }
  }

  static saveInstalled(registry: InstalledRegistry): void {
    registry.updatedAt = new Date().toISOString();
    const tmp = INSTALLED_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(registry, null, 2), 'utf8');
    fs.renameSync(tmp, INSTALLED_PATH);
  }

  static getModuleRecord(id: string): InstalledModuleRecord | undefined {
    return this.loadInstalled().modules[id];
  }

  static upsertModuleRecord(id: string, patch: Partial<InstalledModuleRecord>): void {
    const registry = this.loadInstalled();
    const existing = registry.modules[id] ?? {
      id,
      name: id,
      version: '0.0.0',
      installedAt: new Date().toISOString(),
      status: 'STOPPED' as ModuleStatus,
      crashCount: 0,
      config: {},
    };
    registry.modules[id] = { ...existing, ...patch };
    this.saveInstalled(registry);
  }

  static removeModuleRecord(id: string): void {
    const registry = this.loadInstalled();
    delete registry.modules[id];
    this.saveInstalled(registry);
  }

  static getAllInstalledModules(): InstalledModuleRecord[] {
    return Object.values(this.loadInstalled().modules);
  }

  static setModuleStatus(id: string, status: ModuleStatus, extra?: Partial<InstalledModuleRecord>): void {
    this.upsertModuleRecord(id, { status, ...extra });
  }
}
