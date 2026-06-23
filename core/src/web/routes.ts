import { FastifyInstance } from 'fastify';
import { ModuleManager } from '../manager/module.js';
import { ConfigManager } from '../manager/config.js';
import { SystemManager } from '../manager/system.js';
import { Logger } from '../manager/logger.js';
import path from 'path';
import fs from 'fs';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // ── Global preHandler for path traversal protection ───────────────
  fastify.addHook('preHandler', async (req, reply) => {
    const params = req.params as { id?: string };
    if (params.id && !/^[a-zA-Z0-9_-]+$/.test(params.id)) {
      reply.code(400).send({ error: 'Invalid module ID format' });
      return reply;
    }
  });

  // ── System ────────────────────────────────────────────────────────────────

  fastify.get('/api/system/info', async (_req, reply) => {
    return reply.send(SystemManager.getSystemMetrics());
  });

  fastify.get('/api/system/settings', async (_req, reply) => {
    return reply.send(ConfigManager.loadSettings());
  });

  fastify.patch('/api/system/settings', async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    const updated = ConfigManager.patchSettings(body as never);
    return reply.send(updated);
  });

  fastify.get('/api/system/autostart', async (_req, reply) => {
    try {
      const { execSync } = require('child_process');
      const { LEXHUB_DIR } = require('../manager/config.js');
      const lhBin = path.join(LEXHUB_DIR, process.platform === 'win32' ? 'lh.exe' : 'lh');
      const out = execSync(`"${lhBin}" autostart-status`, { encoding: 'utf8' }).trim();
      return reply.send({ enabled: out === 'enabled' });
    } catch (err) {
      return reply.send({ enabled: false });
    }
  });

  fastify.post('/api/system/autostart', async (req, reply) => {
    const { enabled } = req.body as { enabled: boolean };
    try {
      const { execSync } = require('child_process');
      const { LEXHUB_DIR } = require('../manager/config.js');
      const lhBin = path.join(LEXHUB_DIR, process.platform === 'win32' ? 'lh.exe' : 'lh');
      if (enabled) {
        execSync(`"${lhBin}" enable`, { stdio: 'ignore' });
      } else {
        execSync(`"${lhBin}" disable`, { stdio: 'ignore' });
      }
      return reply.send({ enabled });
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  // ── Modules list ──────────────────────────────────────────────────────────

  fastify.get('/api/modules', async (_req, reply) => {
    const modules = ModuleManager.scanInstalledModules();
    return reply.send(modules);
  });

  // ── Single module ─────────────────────────────────────────────────────────

  fastify.get('/api/modules/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const mod = ModuleManager.getModuleById(id);
    if (!mod) return reply.code(404).send({ error: `模块 ${id} 不存在` });
    return reply.send(mod);
  });

  // ── Install ───────────────────────────────────────────────────────────────

  fastify.post('/api/modules/:id/install', async (req, reply) => {
    const { id } = req.params as { id: string };
    reply.code(202).send({ message: `正在安装模块 ${id}...` });
    ModuleManager.installModule(id).catch((err) => {
      Logger.error(`安装模块 ${id} 失败: ${err}`, 'API');
    });
  });

  // ── Start ─────────────────────────────────────────────────────────────────

  fastify.post('/api/modules/:id/start', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await ModuleManager.startModule(id);
      return reply.send({ message: `模块 ${id} 已启动` });
    } catch (err) {
      Logger.error(`启动模块 ${id} 失败: ${err}`, 'API');
      return reply.code(500).send({ error: String(err) });
    }
  });

  // ── Stop ──────────────────────────────────────────────────────────────────

  fastify.post('/api/modules/:id/stop', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await ModuleManager.stopModule(id);
      return reply.send({ message: `模块 ${id} 已停止` });
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  // ── LexHub Config (env vars in config.json) ───────────────────────────────

  fastify.post('/api/modules/:id/config', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, string | number | boolean>;
    ModuleManager.updateModuleConfig(id, body);
    return reply.send({ message: '配置已更新' });
  });

  // ── Update ────────────────────────────────────────────────────────────────

  fastify.post('/api/modules/:id/update', async (req, reply) => {
    const { id } = req.params as { id: string };
    const mod = ModuleManager.getModuleById(id);
    if (!mod) return reply.code(404).send({ error: `模块 ${id} 不存在` });

    reply.code(202).send({ message: `正在更新模块 ${id}...` });

    ModuleManager.callLifecycle(id, 'update').catch((err) => {
      Logger.error(`更新模块 ${id} 失败: ${err}`, 'API');
    });
  });

  // ── Versions ──────────────────────────────────────────────────────────────

  fastify.get('/api/modules/:id/versions', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await ModuleManager.callLifecycle(id, 'getVersions');
      return reply.send(result);
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  fastify.post('/api/modules/:id/rollback', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { version } = req.body as { version: string };
    if (!version) return reply.code(400).send({ error: '缺少 version 参数' });

    reply.code(202).send({ message: `正在回退到版本 ${version}...` });
    ModuleManager.callLifecycle(id, 'rollback', version).catch((err) => {
      Logger.error(`回退模块 ${id} 到 ${version} 失败: ${err}`, 'API');
    });
  });

  fastify.post('/api/modules/:id/channel', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { channel } = req.body as { channel: string };
    if (!channel) return reply.code(400).send({ error: '缺少 channel 参数' });

    reply.code(202).send({ message: `正在切换到 ${channel} 通道...` });
    ModuleManager.callLifecycle(id, 'switchChannel', channel).catch((err) => {
      Logger.error(`切换通道失败: ${err}`, 'API');
    });
  });

  fastify.post('/api/modules/:id/unlock', async (req, reply) => {
    const { id } = req.params as { id: string };
    reply.code(202).send({ message: '正在解锁版本...' });
    ModuleManager.callLifecycle(id, 'unlock').catch((err) => {
      Logger.error(`解锁版本失败: ${err}`, 'API');
    });
  });

  // ── App Config (config.yaml) ──────────────────────────────────────────────

  fastify.get('/api/modules/:id/app-config', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await ModuleManager.callLifecycle(id, 'readAppConfig');
      // Read app_config_schema directly from lexhub-module.json (not from ModuleInfo type)
      const { MODULES_DIR } = require('../manager/config.js');
      const metaPath = path.join(MODULES_DIR, id, 'lexhub-module.json');
      let schema = null;
      if (fs.existsSync(metaPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          schema = raw.app_config_schema || null;
        } catch { /* ignore parse errors */ }
      }
      return reply.send({ config: result, schema });
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  fastify.patch('/api/modules/:id/app-config', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    try {
      await ModuleManager.callLifecycle(id, 'writeAppConfig', body);
      return reply.send({ message: '应用配置已保存' });
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  fastify.post('/api/modules/:id/app-config/reset', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await ModuleManager.callLifecycle(id, 'resetAppConfig');
      return reply.send({ message: '配置已重置' });
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  fastify.post('/api/modules/:id/reset-password', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { username, password } = req.body as { username?: string; password: string };
    if (!password) return reply.code(400).send({ error: '缺少 password 参数' });
    try {
      await ModuleManager.callLifecycle(id, 'resetPassword', username, password);
      return reply.send({ message: '密码已重置' });
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  // ── Backup / Restore ──────────────────────────────────────────────────────

  fastify.post('/api/modules/:id/backup', async (req, reply) => {
    const { id } = req.params as { id: string };
    reply.code(202).send({ message: '正在创建备份...' });
    ModuleManager.callLifecycle(id, 'backup').catch((err) => {
      Logger.error(`备份模块 ${id} 失败: ${err}`, 'API');
    });
  });

  fastify.get('/api/modules/:id/backups', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await ModuleManager.callLifecycle(id, 'listBackups');
      return reply.send(result);
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  fastify.post('/api/modules/:id/restore', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { backupPath } = req.body as { backupPath: string };
    if (!backupPath) return reply.code(400).send({ error: '缺少 backupPath 参数' });

    // Security: prevent path traversal
    const os = await import('os');
    const allowedBase = path.normalize(path.join(os.default.homedir(), 'LexHub_Backup'));
    const resolved = path.normalize(path.resolve(backupPath));
    
    const isWin = os.default.platform() === 'win32';
    const isAllowed = isWin
      ? resolved.toLowerCase().startsWith(allowedBase.toLowerCase())
      : resolved.startsWith(allowedBase);

    if (!isAllowed) {
      return reply.code(403).send({ error: '不允许的备份路径' });
    }

    reply.code(202).send({ message: '正在恢复备份...' });
    ModuleManager.callLifecycle(id, 'restore', backupPath).catch((err) => {
      Logger.error(`恢复备份失败: ${err}`, 'API');
    });
  });

  // ── Plugin Management ─────────────────────────────────────────────────────

  fastify.get('/api/modules/:id/plugins', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const result = await ModuleManager.callLifecycle(id, 'getPluginCatalog');
      return reply.send(result);
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  fastify.post('/api/modules/:id/plugins/:pluginId/install', async (req, reply) => {
    const { id, pluginId } = req.params as { id: string; pluginId: string };
    // Security: validate pluginId
    if (!/^[a-zA-Z0-9_-]+$/.test(pluginId)) {
      return reply.code(400).send({ error: 'Invalid plugin ID' });
    }
    reply.code(202).send({ message: `正在安装插件 ${pluginId}...` });
    ModuleManager.callLifecycle(id, 'installPlugin', pluginId).catch((err) => {
      Logger.error(`安装插件 ${pluginId} 失败: ${err}`, 'API');
    });
  });

  fastify.delete('/api/modules/:id/plugins/:pluginId', async (req, reply) => {
    const { id, pluginId } = req.params as { id: string; pluginId: string };
    if (!/^[a-zA-Z0-9_-]+$/.test(pluginId)) {
      return reply.code(400).send({ error: 'Invalid plugin ID' });
    }
    try {
      await ModuleManager.callLifecycle(id, 'uninstallPlugin', pluginId);
      return reply.send({ message: `插件 ${pluginId} 已卸载` });
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  fastify.post('/api/modules/:id/plugins/reset', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await ModuleManager.callLifecycle(id, 'resetAllPlugins');
      return reply.send({ message: '所有插件已重置' });
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  // ── Uninstall ─────────────────────────────────────────────────────────────

  fastify.delete('/api/modules/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await ModuleManager.uninstallModule(id);
      return reply.send({ message: `模块 ${id} 已卸载` });
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  // ── Logs ──────────────────────────────────────────────────────────────────

  fastify.get('/api/modules/:id/logs', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { type = 'stdout', lines = '200' } = req.query as {
      type?: 'stdout' | 'stderr' | 'install';
      lines?: string;
    };
    const lineCount = Math.min(parseInt(lines, 10) || 200, 1000);
    const logPaths = Logger.getModuleLogPaths(id);
    const filePath = type === 'stderr' ? logPaths.stderr : logPaths.stdout;
    const content = Logger.readTail(filePath, lineCount);
    return reply.type('text/plain').send(content);
  });

  // ── Engine log ─────────────────────────────────────────────────────────────

  fastify.get('/api/system/logs', async (req, reply) => {
    const { lines = '200' } = req.query as { lines?: string };
    const lineCount = Math.min(parseInt(lines, 10) || 200, 1000);
    const { LOGS_DIR } = require('../manager/config.js');
    const logPath = path.join(LOGS_DIR, 'lexhub.log');
    const content = Logger.readTail(logPath, lineCount);
    return reply.type('text/plain').send(content);
  });

  // ── Network Status ────────────────────────────────────────────────────────

  fastify.get('/api/system/network', async (_req, reply) => {
    const { NetworkManager } = require('../manager/network.js');
    return reply.send(NetworkManager.getStatus());
  });

  fastify.post('/api/system/network/rescan', async (_req, reply) => {
    const { NetworkManager } = require('../manager/network.js');
    await NetworkManager.forceRescan();
    return reply.send(NetworkManager.getStatus());
  });

  // ── Mirrors ───────────────────────────────────────────────────────────────

  fastify.post('/api/system/mirrors', async (req, reply) => {
    const { action } = req.body as { action: string };
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
      if (action === 'npm') {
        await execAsync('npm config set registry https://registry.npmmirror.com');
        return reply.send({ message: 'NPM 源已成功切换至 npmmirror' });
      } else if (action === 'pip') {
        await execAsync('pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple');
        return reply.send({ message: 'PIP 源已切换至清华大学镜像' });
      } else if (action === 'system') {
        if (process.platform === 'android' || process.env.PREFIX?.includes('com.termux')) {
          await execAsync(`sed -i 's@packages.termux.org@mirrors.tuna.tsinghua.edu.cn/termux@g' $PREFIX/etc/apt/sources.list`);
          return reply.send({ message: 'Termux 系统源已成功切换至清华大学镜像' });
        } else if (process.platform === 'linux') {
          return reply.send({ message: 'Linux 请在终端执行: bash <(curl -sSL https://linuxmirrors.cn/main.sh)' });
        } else {
          return reply.send({ message: '当前系统无需更换系统源' });
        }
      } else if (action === 'reset') {
        try { await execAsync('git config --global --unset http.proxy'); } catch {}
        try { await execAsync('git config --global --unset https.proxy'); } catch {}
        try { await execAsync('npm config delete registry'); } catch {}
        return reply.send({ message: '网络设置与代理缓存已重置' });
      }
      return reply.code(400).send({ error: '未知操作' });
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  // ── Store ─────────────────────────────────────────────────────────────────

  fastify.get('/api/store/modules', async (_req, reply) => {
    try {
      const { NetworkManager } = require('../manager/network.js');
      const settings = ConfigManager.loadSettings();
      const storeUrl = NetworkManager.getSmartUrl(settings.storeIndexUrl);

      try {
        const res = await NetworkManager.fetch(storeUrl);
        if (res.ok) {
          const data = await res.json();
          return reply.send(data);
        }
      } catch (networkErr) {
        Logger.warn(`无法连接远端商店: ${networkErr}，尝试使用本地内置数据 fallback`, 'API');
      }

      // Fallback for development/offline
      const fallbackPath = path.join(path.resolve(__dirname, '../../..'), '../lexhub-store/index.json');
      if (fs.existsSync(fallbackPath)) {
        const fallbackData = fs.readFileSync(fallbackPath, 'utf-8');
        return reply.send(JSON.parse(fallbackData));
      }

      throw new Error('Remote store unreachable and no local fallback found');
    } catch (err) {
      Logger.error(`获取远端商店列表失败: ${err}`, 'API');
      return reply.code(500).send({ error: String(err) });
    }
  });
}
