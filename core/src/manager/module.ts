import fs from 'fs';
import path from 'path';
import { Logger } from './logger.js';
import { ConfigManager, MODULES_DIR } from './config.js';
import { ProcessManager } from './process.js';
import { SystemManager } from './system.js';
import { NetworkManager } from './network.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ModuleMetadata {
  id: string;
  name: string;
  aliases?: string[];
  version: string;
  author: string;
  description: string;
  icon?: string;
  repo_url?: string;
  branch?: string;
  categories?: string[];
  platforms?: string[];
  dependencies?: {
    binaries?: string[];
    npm?: string[];
  };
  env?: Record<
    string,
    { default: string | number | boolean; description?: string }
  >;
  port_mapping?: {
    source: number;
    target: number;
  };
}

export interface ModuleInfo extends ModuleMetadata {
  isInstalled: boolean;
  status: string;
  pid?: number;
  crashCount: number;
  config: Record<string, string | number | boolean>;
  paths: {
    moduleDir: string;
    appDir: string;
    lifecyclePath: string;
  };
}

// ── Module Manager ─────────────────────────────────────────────────────────

export class ModuleManager {
  /**
   * Read and parse the lexhub-module.json for a given module directory.
   */
  static readMetadata(moduleDir: string): ModuleMetadata | null {
    const metaPath = path.join(moduleDir, 'lexhub-module.json');
    if (!fs.existsSync(metaPath)) return null;
    try {
      const raw = fs.readFileSync(metaPath, 'utf8');
      return JSON.parse(raw) as ModuleMetadata;
    } catch (err) {
      Logger.warn(`解析模块元数据失败 (${moduleDir}): ${err}`, 'Module');
      return null;
    }
  }

  /**
   * Scan the modules/ directory and return all valid ModuleInfo objects.
   */
  static scanInstalledModules(): ModuleInfo[] {
    if (!fs.existsSync(MODULES_DIR)) return [];
    const dirs = fs.readdirSync(MODULES_DIR, { withFileTypes: true });
    const results: ModuleInfo[] = [];

    for (const dirent of dirs) {
      if (!dirent.isDirectory()) continue;
      const moduleDir = path.join(MODULES_DIR, dirent.name);
      const meta = this.readMetadata(moduleDir);
      if (!meta) continue;

      const record = ConfigManager.getModuleRecord(meta.id);
      results.push(this.buildModuleInfo(meta, moduleDir, record));
    }

    return results;
  }

  /**
   * Get full info for a single module by ID.
   */
  static getModuleById(id: string): ModuleInfo | null {
    const moduleDir = path.join(MODULES_DIR, id);
    const meta = this.readMetadata(moduleDir);
    if (!meta) return null;
    const record = ConfigManager.getModuleRecord(id);
    return this.buildModuleInfo(meta, moduleDir, record);
  }

  private static buildModuleInfo(
    meta: ModuleMetadata,
    moduleDir: string,
    record: ReturnType<typeof ConfigManager.getModuleRecord>
  ): ModuleInfo {
    const appDir = path.join(moduleDir, 'app');
    const lifecyclePath = path.join(moduleDir, 'lifecycle.js');
    const isRunning = ProcessManager.isRunning(meta.id);
    let status = record?.status ?? 'STOPPED';
    if (status === 'RUNNING' && !isRunning) {
      status = 'STOPPED';
    } else if (isRunning) {
      status = 'RUNNING';
    }

    return {
      ...meta,
      isInstalled: fs.existsSync(lifecyclePath),
      status,
      pid: ProcessManager.getPid(meta.id),
      crashCount: record?.crashCount ?? 0,
      config: record?.config ?? this.buildDefaultConfig(meta),
      paths: { moduleDir, appDir, lifecyclePath },
    };
  }

  static async resolveModuleId(input: string): Promise<string | null> {
    const term = input.toLowerCase();
    
    const installed = this.scanInstalledModules();
    for (const mod of installed) {
      if (mod.id.toLowerCase() === term) return mod.id;
      if (mod.aliases?.some(a => a.toLowerCase() === term)) return mod.id;
    }

    try {
      const settings = ConfigManager.loadSettings();
      const storeUrl = NetworkManager.getSmartUrl(settings.storeIndexUrl);
      const res = await NetworkManager.fetch(storeUrl);
      if (res.ok) {
        const storeModules = JSON.parse(await res.text()) as ModuleMetadata[];
        for (const mod of storeModules) {
          if (mod.id.toLowerCase() === term) return mod.id;
          if (mod.aliases?.some(a => a.toLowerCase() === term)) return mod.id;
        }
      }
    } catch {}

    const localStorePath = path.join(path.resolve(__dirname, '../../..'), 'store', 'index.json');
    if (fs.existsSync(localStorePath)) {
      try {
        const storeModules = JSON.parse(fs.readFileSync(localStorePath, 'utf8')) as ModuleMetadata[];
        for (const mod of storeModules) {
          if (mod.id.toLowerCase() === term) return mod.id;
          if (mod.aliases?.some(a => a.toLowerCase() === term)) return mod.id;
        }
      } catch {}
    }

    return null;
  }

  private static buildDefaultConfig(
    meta: ModuleMetadata
  ): Record<string, string | number | boolean> {
    const cfg: Record<string, string | number | boolean> = {};
    if (meta.env) {
      for (const [key, def] of Object.entries(meta.env)) {
        cfg[key] = def.default;
      }
    }
    return cfg;
  }

  // ── Install ───────────────────────────────────────────────────────────────

  /**
   * Install a module: download if missing, check dependencies, run lifecycle install hook.
   */
  static async installModule(id: string): Promise<void> {
    const moduleDir = path.join(MODULES_DIR, id);
    
    // Remote Download Logic — module dir doesn't exist, need to fetch from store
    if (!fs.existsSync(moduleDir)) {
      Logger.info(`模块 ${id} 不在本地，尝试从商店获取安装信息...`, 'Module');
      ConfigManager.setModuleStatus(id, 'INSTALLING');
      try {
        let storeModules: ModuleMetadata[] | null = null;

        // 1. Try remote store
        try {
          const settings = ConfigManager.loadSettings();
          const storeUrl = NetworkManager.getSmartUrl(settings.storeIndexUrl);
          const res = await NetworkManager.fetch(storeUrl);
          if (res.ok) {
            const text = await res.text();
            storeModules = JSON.parse(text) as ModuleMetadata[];
          } else {
            Logger.warn(`远端商店返回 ${res.status}，降级使用本地 store/index.json`, 'Module');
          }
        } catch (fetchErr) {
          Logger.warn(`远端商店请求失败: ${fetchErr}，降级使用本地 store/index.json`, 'Module');
        }

        // 2. Fallback to local store/index.json
        if (!storeModules) {
          const localStorePath = path.join(
            path.resolve(__dirname, '../../..'),
            'store',
            'index.json'
          );
          if (fs.existsSync(localStorePath)) {
            storeModules = JSON.parse(fs.readFileSync(localStorePath, 'utf8')) as ModuleMetadata[];
            Logger.info('已从本地 store/index.json 加载模块列表', 'Module');
          } else {
            throw new Error('远端商店不可用且本地 store/index.json 不存在');
          }
        }

        const remoteMeta = storeModules.find(m => m.id === id);
        if (!remoteMeta || !remoteMeta.repo_url) {
          throw new Error(`商店中找不到模块 "${id}" 或缺少 repo_url`);
        }

        // Create module directory scaffold FIRST
        fs.mkdirSync(moduleDir, { recursive: true });

        // Write lexhub-module.json — prefer full template (with app_config_schema) over bare store metadata
        const metaPath = path.join(moduleDir, 'lexhub-module.json');
        if (!fs.existsSync(metaPath)) {
          const templateMeta = path.join(path.resolve(__dirname, '../../..'), 'templates', 'lifecycles', `${id}.json`);
          if (fs.existsSync(templateMeta)) {
            fs.copyFileSync(templateMeta, metaPath);
            Logger.info(`已使用内置完整元数据模板: ${id}`, 'Module');
          } else {
            fs.writeFileSync(metaPath, JSON.stringify(remoteMeta, null, 2), 'utf8');
          }
        }

        // Write lifecycle.js — prefer a bundled template, fallback to minimal default
        const lcPath = path.join(moduleDir, 'lifecycle.js');
        if (!fs.existsSync(lcPath)) {
          const templateLc = path.join(path.resolve(__dirname, '../../..'), 'templates', 'lifecycles', `${id}.js`);
          if (fs.existsSync(templateLc)) {
            fs.copyFileSync(templateLc, lcPath);
            Logger.info(`已使用内置 lifecycle 模板: ${id}`, 'Module');
          } else {
            // Minimal default lifecycle — lifecycle.install() will clone + npm install
            fs.writeFileSync(lcPath, `import fs from 'fs';
export async function install(ctx) {
  const { paths, execCmd, logger, network } = ctx;
  if (fs.existsSync(paths.appDir)) {
    logger.info('源码目录已存在，跳过克隆');
  } else {
    logger.info('正在拉取源码...');
    const gitArgs = network.buildGitCloneArgs(${JSON.stringify(remoteMeta.repo_url)}, paths.appDir, ${JSON.stringify(remoteMeta.branch || 'main')});
    await execCmd(gitArgs.cmd, gitArgs.args);
    logger.success('源码拉取完成');
  }
  logger.info('正在安装依赖...');
  await execCmd('npm', ['install', '--no-audit', '--no-fund'], { cwd: paths.appDir });
  logger.success('安装完成！');
}
export async function start(ctx) {
  const { paths, config, spawnCmd } = ctx;
  return spawnCmd('node', ['server.js'], {
    cwd: paths.appDir,
    env: { ...process.env, PORT: String(config.PORT || 8000) }
  });
}
`, 'utf8');
          }
        }

        Logger.success(`模块 ${id} 脚手架已就绪`, 'Module');
        // NOTE: lifecycle.install() below will handle the actual app source download
      } catch (err) {
        const msg = String(err);
        ConfigManager.setModuleStatus(id, 'ERROR', { lastError: msg });
        Logger.error(`模块 ${id} 远端下载失败: ${msg}`, 'Module');
        throw err;
      }
    }

    const meta = this.readMetadata(moduleDir);
    if (!meta) throw new Error(`模块 ${id} 的 lexhub-module.json 不存在`);

    Logger.info(`开始安装模块: ${meta.name} (${id})`, 'Module');
    ConfigManager.setModuleStatus(id, 'INSTALLING');

    // Dependency check
    const missingBinaries = (meta.dependencies?.binaries ?? []).filter(
      (bin) => !SystemManager.hasBinary(bin)
    );
    if (missingBinaries.length > 0) {
      const msg = `缺少依赖: ${missingBinaries.join(', ')}`;
      ConfigManager.setModuleStatus(id, 'ERROR', { lastError: msg });
      throw new Error(msg);
    }

    // Run lifecycle.js install()
    const lifecyclePath = path.join(moduleDir, 'lifecycle.js');
    if (!fs.existsSync(lifecyclePath)) {
      throw new Error(`未找到 lifecycle.js: ${lifecyclePath}`);
    }

    try {
      const lifecycle = await import(lifecyclePath);
      const ctx = this.buildContext(meta, moduleDir);
      await lifecycle.install(ctx);

      ConfigManager.upsertModuleRecord(id, {
        id,
        name: meta.name,
        version: meta.version,
        installedAt: new Date().toISOString(),
        status: 'STOPPED',
        crashCount: 0,
        config: this.buildDefaultConfig(meta),
      });
      Logger.success(`模块 ${meta.name} 安装完成！`, 'Module');
    } catch (err) {
      const msg = String(err);
      ConfigManager.setModuleStatus(id, 'ERROR', { lastError: msg });
      Logger.error(`模块 ${id} 安装失败: ${msg}`, 'Module');
      throw err;
    }
  }

  // ── Start / Stop ──────────────────────────────────────────────────────────

  static async startModule(id: string): Promise<void> {
    const info = this.getModuleById(id);
    if (!info) throw new Error(`模块 ${id} 不存在`);
    if (!info.isInstalled) throw new Error(`模块 ${id} 尚未安装`);
    await ProcessManager.startModule(id);
  }

  static async stopModule(id: string): Promise<void> {
    await ProcessManager.stopModule(id);
  }

  // ── Config ────────────────────────────────────────────────────────────────

  static updateModuleConfig(
    id: string,
    patch: Record<string, string | number | boolean>
  ): void {
    const record = ConfigManager.getModuleRecord(id);
    const current = record?.config ?? {};
    ConfigManager.upsertModuleRecord(id, { config: { ...current, ...patch } });
    Logger.info(`模块 ${id} 配置已更新。`, 'Module');
  }

  // ── Uninstall ─────────────────────────────────────────────────────────────

  static async uninstallModule(id: string): Promise<void> {
    if (ProcessManager.isRunning(id)) {
      await ProcessManager.stopModule(id);
    }
    const moduleDir = path.join(MODULES_DIR, id);
    if (fs.existsSync(moduleDir)) {
      fs.rmSync(moduleDir, { recursive: true, force: true });
    }
    ConfigManager.removeModuleRecord(id);
    Logger.info(`模块 ${id} 已卸载。`, 'Module');
  }

  // ── Lifecycle caller ──────────────────────────────────────────────────────

  /**
   * Calls a named exported function from a module's lifecycle.js,
   * injecting a full context object. Extra args are passed after ctx.
   */
  static async callLifecycle(id: string, fn: string, ...args: unknown[]): Promise<unknown> {
    const moduleDir = path.join(MODULES_DIR, id);
    const lifecyclePath = path.join(moduleDir, 'lifecycle.js');
    if (!fs.existsSync(lifecyclePath)) {
      throw new Error(`lifecycle.js 不存在: ${lifecyclePath}`);
    }
    const meta = this.readMetadata(moduleDir);
    if (!meta) throw new Error(`模块元数据不存在: ${moduleDir}`);
    const lifecycle = await import(lifecyclePath);
    if (typeof lifecycle[fn] !== 'function') {
      throw new Error(`lifecycle.js 中不存在函数: ${fn}`);
    }
    const ctx = this.buildContext(meta, moduleDir);
    return lifecycle[fn](ctx, ...args);
  }


  static buildContext(meta: ModuleMetadata, moduleDir: string) {
    const appDir = path.join(moduleDir, 'app');
    const { execCmd, spawnCmd } = buildExec();
    const record = ConfigManager.getModuleRecord(meta.id);

    return {
      module: meta,
      config: record?.config ?? this.buildDefaultConfig(meta),
      paths: {
        moduleDir,
        appDir,
        logsDir: path.join(require('path').resolve(__dirname, '../../..'), 'logs'),
      },
      logger: {
        info: (msg: string) => Logger.info(msg, meta.id),
        warn: (msg: string) => Logger.warn(msg, meta.id),
        error: (msg: string) => Logger.error(msg, meta.id),
        success: (msg: string) => Logger.success(msg, meta.id),
      },
      execCmd,
      spawnCmd,
      network: {
        getSmartUrl: (url: string) => NetworkManager.getSmartUrl(url),
        buildGitCloneArgs: (repoUrl: string, targetDir: string, branch?: string) => NetworkManager.buildGitCloneArgs(repoUrl, targetDir, branch)
      },
      killProcess: () => ProcessManager.stopModule(meta.id),
      checkProcessActive: () => ProcessManager.isRunning(meta.id),
    };
  }
}

// ── Exec helpers ───────────────────────────────────────────────────────────

function buildExec() {
  const { spawn: _spawn, spawnSync } = require('child_process') as typeof import('child_process');

  const execCmd = (cmd: string, args: string[] = [], opts: { cwd?: string, env?: NodeJS.ProcessEnv } = {}): Promise<void> =>
    new Promise((resolve, reject) => {
      try {
        const env = NetworkManager.injectProxyEnv(opts.env ?? process.env);
        const resolvedCmd = SystemManager.resolveBinaryName(cmd);
        const res = spawnSync(resolvedCmd, args, { stdio: 'inherit', cwd: opts.cwd, env });
        if (res.error) throw res.error;
        if (res.status !== 0) throw new Error(`Command failed with status ${res.status}`);
        resolve();
      } catch (err) {
        reject(err);
      }
    });

  const spawnCmd = (
    cmd: string,
    args: string[],
    opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
  ) => {
    const env = NetworkManager.injectProxyEnv(opts.env ?? process.env);
    const resolvedCmd = SystemManager.resolveBinaryName(cmd);
    return _spawn(resolvedCmd, args, {
      cwd: opts.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  };

  return { execCmd, spawnCmd };
}
