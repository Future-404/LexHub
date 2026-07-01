import { FastifyInstance } from 'fastify';
import { ModuleManager } from '../manager/module.js';
import { ConfigManager, ROOT_DIR, MODULES_DIR, LOGS_DIR } from '../manager/config.js';
import { SystemManager } from '../manager/system.js';
import { Logger } from '../manager/logger.js';
import { MigrateManager } from '../manager/migrate.js';
import { NetworkManager } from '../manager/network.js';
import { AdbManager } from '../manager/adb.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { spawnSync, execFileSync } from 'child_process';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + 'lexhub_salt_v1').digest('hex');
}

function handleError(reply: any, err: any): any {
  const traceId = crypto.randomBytes(4).toString('hex').toUpperCase();
  Logger.error(`[TraceID: ${traceId}] ${err instanceof Error ? err.stack : String(err)}`, 'WebAPI');
  return reply.code(500).send({
    error: 'Internal Server Error',
    code: 'INTERNAL_SERVER_ERROR',
    traceId
  });
}


export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // ── Global preHandler for path traversal protection ───────────────
  fastify.addHook('preHandler', async (req, reply) => {
    const params = req.params as { id?: string };
    if (params.id && !/^[a-zA-Z0-9_-]+$/.test(params.id)) {
      reply.code(400).send({ error: 'Invalid module ID format' });
      return reply;
    }

    // Mutex locking for mutating module operations
    if (params.id && req.method !== 'GET') {
      const url = req.url;
      const backgroundOperations = [
        '/install',
        '/update',
        '/rollback',
        '/channel',
        '/unlock',
        '/restore',
        '/backup',
        '/plugins/'
      ];
      
      const isBackground = backgroundOperations.some(op => url.includes(op)) || 
                           (req.method === 'DELETE' && /^\/api\/modules\/[a-zA-Z0-9_-]+$/.test(url.split('?')[0]));

      if (isBackground) {
        if (ModuleManager.isOperationRunning(params.id)) {
          const op = ModuleManager.getRunningOperation(params.id);
          reply.code(409).send({ error: `模块 ${params.id} 有其他任务 (${op}) 正在后台运行，请稍候再试。` });
          return reply;
        }

        // Infer operation name
        let op = 'write';
        if (req.method === 'DELETE') {
          op = url.includes('/plugins/') ? 'uninstallPlugin' : 'uninstall';
        } else {
          const parts = url.split('?')[0].split('/');
          op = parts[parts.length - 1] || 'write';
        }

        // Acquire lock synchronously to prevent concurrency race conditions
        try {
          ModuleManager.acquireLock(params.id, op);
        } catch (lockErr: any) {
          reply.code(409).send({ error: lockErr.message || '获取操作锁失败' });
          return reply;
        }
      }
    }

    if (req.url.startsWith('/api/') && !req.url.startsWith('/api/auth/')) {
      const settings = ConfigManager.loadSettings();
      if (settings.adminPasswordHash) {
        try {
          await req.jwtVerify();
        } catch (err) {
          reply.code(401).send({ error: 'Unauthorized' });
          return reply;
        }
      }
    }
  });

  // Release acquired operation locks if the request was rejected with non-202 status
  fastify.addHook('onSend', async (req, reply, payload) => {
    const params = req.params as { id?: string };
    if (params.id && reply.statusCode !== 202 && req.method !== 'GET') {
      const url = req.url;
      let op = '';
      if (req.method === 'DELETE') {
        op = url.includes('/plugins/') ? 'uninstallPlugin' : 'uninstall';
      } else {
        const parts = url.split('?')[0].split('/');
        op = parts[parts.length - 1] || '';
      }
      if (op && ModuleManager.getRunningOperation(params.id) === op) {
        ModuleManager.releaseLock(params.id, op);
      }
    }
    return payload;
  });

  // ── Auth ────────────────────────────────────────────────────────────────

  fastify.get('/api/auth/status', async (_req, reply) => {
    const settings = ConfigManager.loadSettings();
    return reply.send({ needSetup: !settings.adminPasswordHash });
  });

  fastify.post('/api/auth/setup', async (req, reply) => {
    const { password } = req.body as { password?: string };
    if (!password) return reply.code(400).send({ error: 'Password required' });
    
    const settings = ConfigManager.loadSettings();
    if (settings.adminPasswordHash) return reply.code(403).send({ error: 'Already setup' });

    ConfigManager.patchSettings({ adminPasswordHash: hashPassword(password) });
    const token = await reply.jwtSign({ role: 'admin' }, { expiresIn: '30d' });
    reply.setCookie('lexhub_auth', token, {
      domain: settings.gatewayCookieDomain || undefined,
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60
    });
    return reply.send({ success: true });
  });

  fastify.post('/api/auth/login', async (req, reply) => {
    const { password } = req.body as { password?: string };
    const settings = ConfigManager.loadSettings();
    
    if (!settings.adminPasswordHash) return reply.code(400).send({ error: 'Not setup' });

    if (hashPassword(password || '') === settings.adminPasswordHash) {
      const token = await reply.jwtSign({ role: 'admin' }, { expiresIn: '30d' });
      reply.setCookie('lexhub_auth', token, {
        domain: settings.gatewayCookieDomain || undefined,
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60
      });
      return reply.send({ success: true });
    }
    return reply.code(401).send({ error: 'Invalid password' });
  });

  fastify.post('/api/auth/logout', async (_req, reply) => {
    const settings = ConfigManager.loadSettings();
    reply.clearCookie('lexhub_auth', { domain: settings.gatewayCookieDomain || undefined, path: '/' });
    return reply.send({ success: true });
  });

  // ── System ────────────────────────────────────────────────────────────────

  fastify.get('/api/system/info', async (_req, reply) => {
    return reply.send(SystemManager.getSystemMetrics());
  });

  fastify.get('/api/system/migrate/scan', async (_req, reply) => {
    try {
      const res = MigrateManager.scan();
      return reply.send(res);
    } catch (err) {
      Logger.error(`扫描 TAV-X 遗留数据失败: ${err}`, 'API');
      return handleError(reply, err);
    }
  });

  fastify.post('/api/system/migrate/execute/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await MigrateManager.execute(id);
      return reply.send({ success: true, message: `模块 ${id} 迁移成功` });
    } catch (err) {
      Logger.error(`迁移模块 ${id} 失败: ${err}`, 'API');
      return handleError(reply, err);
    }
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
      const lhBin = path.join(ROOT_DIR, SystemManager.getPlatform() === 'windows' ? 'lh.exe' : 'lh');
      const res = spawnSync(lhBin, ['autostart-status'], { encoding: 'utf8' });
      const out = (res.stdout || '').trim();
      return reply.send({ enabled: out === 'enabled' });
    } catch (err) {
      return reply.send({ enabled: false });
    }
  });

  fastify.post('/api/system/autostart', async (req, reply) => {
    const { enabled } = req.body as { enabled: boolean };
    try {
      const lhBin = path.join(ROOT_DIR, SystemManager.getPlatform() === 'windows' ? 'lh.exe' : 'lh');
      
      if (enabled) {
        spawnSync(lhBin, ['enable'], { stdio: 'ignore' });
        let warning = '';
        if (SystemManager.getPlatform() === 'termux') {
           warning = '如果您是首次开启开机自启功能，请注意：\n您必须【彻底退出并重启 Termux App】（例如输入 exit 强制结束会话），守护进程底座 (termux-services) 才能正式接管系统！';
        }
        return reply.send({ enabled, warning });
      } else {
        spawnSync(lhBin, ['disable'], { stdio: 'ignore' });
        return reply.send({ enabled });
      }
    } catch (err) {
      return handleError(reply, err);
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
      return handleError(reply, err);
    }
  });

  // ── Stop ──────────────────────────────────────────────────────────────────

  fastify.post('/api/modules/:id/stop', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await ModuleManager.stopModule(id);
      return reply.send({ message: `模块 ${id} 已停止` });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ── LexHub Config (env vars in config.json) ───────────────────────────────

  fastify.post('/api/modules/:id/config', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, string | number | boolean>;
    
    const oldMod = ModuleManager.getModuleById(id);
    const oldHost = oldMod?.config?.publicHost;

    ModuleManager.updateModuleConfig(id, body);

    const newHost = body.publicHost as string;
    if (newHost && newHost !== oldHost) {
      // Trigger cloudflare route automatically
      ModuleManager.callLifecycle('cloudflare', 'routeDns', { hostname: newHost }).then(() => {
        Logger.info(`自动注册了公网域名解析: ${newHost}`, 'API');
      }).catch(err => {
        Logger.error(`自动注册公网域名解析失败 (${newHost}): ${err}`, 'API');
      });
    }

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
      return handleError(reply, err);
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
      return handleError(reply, err);
    }
  });

  fastify.patch('/api/modules/:id/app-config', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    try {
      await ModuleManager.callLifecycle(id, 'writeAppConfig', body);
      return reply.send({ message: '应用配置已保存' });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  fastify.post('/api/modules/:id/app-config/reset', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await ModuleManager.callLifecycle(id, 'resetAppConfig');
      return reply.send({ message: '配置已重置' });
    } catch (err) {
      return handleError(reply, err);
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
      return handleError(reply, err);
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
      return handleError(reply, err);
    }
  });

  fastify.post('/api/modules/:id/restore', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { backupPath } = req.body as { backupPath: string };
    if (!backupPath) return reply.code(400).send({ error: '缺少 backupPath 参数' });

    // Security: prevent path traversal
    const os = await import('os');
    const homeDir = os.default.homedir();
    const allowedBases = [
      path.normalize(path.join(homeDir, 'LexHub_Backup')),
      path.normalize(path.join(homeDir, 'TAVX_Backup')),
      path.normalize(path.join(homeDir, 'storage', 'downloads', 'TAVX_Backup')),
      path.normalize(path.join(homeDir, 'storage', 'downloads', 'LexHub_Backup'))
    ];
    const resolved = path.normalize(path.resolve(backupPath));
    
    const isWin = os.default.platform() === 'win32';
    const isAllowed = allowedBases.some(base => 
      isWin ? resolved.toLowerCase().startsWith(base.toLowerCase()) : resolved.startsWith(base)
    );

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
      return handleError(reply, err);
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
      return handleError(reply, err);
    }
  });

  fastify.post('/api/modules/:id/plugins/reset', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await ModuleManager.callLifecycle(id, 'resetAllPlugins');
      return reply.send({ message: '所有插件已重置' });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ── Custom Lifecycle Calls ────────────────────────────────────────────────

  fastify.post('/api/modules/:id/call/:method', async (req, reply) => {
    const { id, method } = req.params as { id: string, method: string };
    const body = req.body as any; // Allow array or single object arguments
    try {
      const args = Array.isArray(body) ? body : (body ? [body] : []);
      const result = await ModuleManager.callLifecycle(id, method, ...args);
      return reply.send({ result });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ── Uninstall ─────────────────────────────────────────────────────────────

  fastify.delete('/api/modules/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      await ModuleManager.uninstallModule(id);
      return reply.send({ message: `模块 ${id} 已卸载` });
    } catch (err) {
      return handleError(reply, err);
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
    const logPath = path.join(LOGS_DIR, 'lexhub.log');
    const content = Logger.readTail(logPath, lineCount);
    return reply.type('text/plain').send(content);
  });

  // ── Network Status ────────────────────────────────────────────────────────

  fastify.get('/api/system/network', async (_req, reply) => {
    return reply.send(NetworkManager.getStatus());
  });

  fastify.post('/api/system/network/rescan', async (_req, reply) => {
    await NetworkManager.forceRescan();
    return reply.send(NetworkManager.getStatus());
  });

  // ── Custom Ingress ────────────────────────────────────────────────────────

  fastify.get('/api/system/ingress', async (_req, reply) => {
    const settings = ConfigManager.loadSettings();
    return reply.send(settings.customIngress || []);
  });

  fastify.post('/api/system/ingress', async (req, reply) => {
    const { hostname, targetUrl } = req.body as { hostname: string; targetUrl: string };
    if (!hostname || !targetUrl) return reply.code(400).send({ error: 'Missing hostname or targetUrl' });
    
    try {
      const settings = ConfigManager.loadSettings();
      const ingress = settings.customIngress || [];
      const existing = ingress.findIndex(r => r.hostname === hostname);
      if (existing >= 0) {
        ingress[existing].targetUrl = targetUrl;
      } else {
        ingress.push({ hostname, targetUrl });
      }
      
      ConfigManager.patchSettings({ customIngress: ingress });
      
      // Auto route DNS via cloudflare module
      try {
        await ModuleManager.callLifecycle('cloudflare', 'routeDns', { hostname });
      } catch (err) {
        Logger.warn(`Failed to route DNS for ${hostname}: ${err}`, 'API');
      }
      
      return reply.send({ message: '自定义路由已保存' });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  fastify.delete('/api/system/ingress/:hostname', async (req, reply) => {
    const { hostname } = req.params as { hostname: string };
    try {
      const settings = ConfigManager.loadSettings();
      if (settings.customIngress) {
        const filtered = settings.customIngress.filter(r => r.hostname !== hostname);
        ConfigManager.patchSettings({ customIngress: filtered });
      }
      return reply.send({ message: '自定义路由已删除' });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  // ── Mirrors ───────────────────────────────────────────────────────────────

  fastify.post('/api/system/mirrors', async (req, reply) => {
    const { action, url } = req.body as { action: string; url?: string };

    try {
      if (action === 'npm') {
        const targetUrl = url || 'https://registry.npmmirror.com';
        execFileSync('npm', ['config', 'set', 'registry', targetUrl]);
        return reply.send({ message: `NPM 源已成功切换至 ${targetUrl}` });
      } else if (action === 'pip') {
        const targetUrl = url || 'https://pypi.tuna.tsinghua.edu.cn/simple';
        execFileSync('pip', ['config', 'set', 'global.index-url', targetUrl]);
        return reply.send({ message: `PIP 源已切换至 ${targetUrl}` });
      } else if (action === 'system') {
        const platform = SystemManager.getPlatform();
        if (platform === 'termux') {
          const sourcesPath = path.join(process.env.PREFIX || '/data/data/com.termux/files/usr', 'etc/apt/sources.list');
          if (fs.existsSync(sourcesPath)) {
            let content = fs.readFileSync(sourcesPath, 'utf8');
            let domain = 'packages.termux.org';
            if (url === 'tsinghua') domain = 'mirrors.tuna.tsinghua.edu.cn/termux';
            else if (url === 'aliyun') domain = 'mirrors.aliyun.com/termux';
            else if (url === 'ustc') domain = 'mirrors.ustc.edu.cn/termux';
            else if (url === 'bfsu') domain = 'mirrors.bfsu.edu.cn/termux';
            else if (url === 'default') domain = 'packages.termux.org';
            else if (url && url.includes('.')) domain = url;

            content = content.replace(/(https?:\/\/)[^\/\s]+(\/apt\/termux-main|\/termux)/g, `$1${domain}`);
            fs.writeFileSync(sourcesPath, content, 'utf8');
            return reply.send({ message: `Termux 系统源已成功切换至 ${domain}` });
          } else {
            return reply.code(400).send({ error: '未找到 sources.list 配置文件' });
          }
        } else if (platform === 'linux') {
          return reply.send({ message: 'Linux 请在终端执行: bash <(curl -sSL https://linuxmirrors.cn/main.sh)' });
        } else {
          return reply.send({ message: '当前系统无需更换系统源' });
        }
      } else if (action === 'reset') {
        try { execFileSync('git', ['config', '--global', '--unset', 'http.proxy']); } catch {}
        try { execFileSync('git', ['config', '--global', '--unset', 'https.proxy']); } catch {}
        try { execFileSync('npm', ['config', 'delete', 'registry']); } catch {}
        try { execFileSync('pip', ['config', 'unset', 'global.index-url']); } catch {}
        return reply.send({ message: '网络设置与代理缓存已重置' });
      }
      return reply.code(400).send({ error: '未知操作' });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  fastify.get('/api/store/modules', async (_req, reply) => {
    try {
      const settings = ConfigManager.loadSettings();
      const storeUrl = NetworkManager.getSmartUrl(settings.storeIndexUrl);
      let data: any[] = [];

      try {
        const res = await NetworkManager.fetch(storeUrl);
        if (res.ok) {
          data = await res.json();
        }
      } catch (networkErr) {
        Logger.warn(`无法连接远端商店: ${networkErr}，尝试使用本地内置数据 fallback`, 'API');
      }

      if (!data || data.length === 0) {
        // Fallback for development
        const fallbackPath = path.join(path.resolve(__dirname, '../../..'), '../lexhub-store/index.json');
        if (fs.existsSync(fallbackPath)) {
          const fallbackData = fs.readFileSync(fallbackPath, 'utf-8');
          data = JSON.parse(fallbackData);
        }
      }

      if (!data || data.length === 0) {
        // Production Offline Fallback
        Logger.warn('Remote store unreachable, using bundled offline store', 'API');
        data = [
          {
            "id": "sillytavern",
            "name": "SillyTavern",
            "version": "1.12.0",
            "author": "SillyTavern Team",
            "description": "SillyTavern 是一款本地化的大语言模型 (LLM) 角色扮演与聊天前端，专为深度沉浸和高度自定义打造。",
            "icon": "🎭",
            "categories": ["AI", "Chat", "Roleplay"],
            "platforms": ["linux", "windows", "termux"],
            "repo_url": "https://github.com/SillyTavern/SillyTavern.git",
            "branch": "release"
          }
        ];
      }

      // Always inject built-in Cloudflare module if not present in the store listing
      if (!data.some(m => m.id === 'cloudflare')) {
        data.push({
          "id": "cloudflare",
          "name": "Cloudflare Zero Trust",
          "version": "1.0.0",
          "author": "Cloudflare",
          "description": "提供端到端的隧道穿透服务，结合 LexHub 实现无感知的内网穿透与外网反向代理。",
          "icon": "☁️",
          "categories": ["Network", "Proxy", "Security"],
          "platforms": ["linux", "termux", "windows"],
          "repo_url": "",
          "branch": "main"
        });
      }

      // Force ClewdR metadata
      const clewdIdx = data.findIndex(m => m.id === 'clewd');
      const clewdMeta = {
        "id": "clewd",
        "name": "ClewdR (Rust版)",
        "version": "1.0.0",
        "author": "Xerxes-2",
        "description": "ClewdR 是一个用于 Claude.ai / Claude Code 的 Rust 高性能反向代理程序。它提供 OpenAI 兼容接口，并带有内置的轻量 React Web 管理界面。",
        "icon": "🦞",
        "categories": ["AI", "Proxy"],
        "platforms": ["linux", "termux"],
        "repo_url": "https://github.com/Xerxes-2/clewdr.git",
        "branch": "master"
      };
      if (clewdIdx >= 0) {
        data[clewdIdx] = clewdMeta;
      } else {
        data.push(clewdMeta);
      }

      // Inject cliproxyapi
      if (!data.some(m => m.id === 'cliproxyapi')) {
        data.push({
          "id": "cliproxyapi",
          "name": "CLIProxyAPI 代理",
          "version": "1.0.0",
          "author": "router-for-me",
          "description": "CLIProxyAPI 是一个由 Go 编写的高性能代理工具，支持远程管理和 WebUI 后台，非常适合在手机端作为代理中转使用。",
          "icon": "⚡",
          "categories": ["AI", "Proxy"],
          "platforms": ["linux", "termux"],
          "repo_url": "https://github.com/router-for-me/CLIProxyAPI.git",
          "branch": "main"
        });
      }

      // Inject gcli2api
      if (!data.some(m => m.id === 'gcli2api')) {
        data.push({
          "id": "gcli2api",
          "name": "GCLI2API",
          "version": "1.0.0",
          "author": "su-kaka",
          "description": "GCLI2API 用于将 GeminiCLI 和 Antigravity 转换为 OpenAI、GEMINI 和 Claude API 兼容接口，方便客户端接入使用。",
          "icon": "🌐",
          "categories": ["AI", "Proxy"],
          "platforms": ["linux", "termux"],
          "repo_url": "https://github.com/su-kaka/gcli2api.git",
          "branch": "master"
        });
      }

      return reply.send(data);
    } catch (err) {
      Logger.error(`获取远端商店列表失败: ${err}`, 'API');
      return handleError(reply, err);
    }
  });

  // ── ADB & Keepalive ───────────────────────────────────────────────────────

  fastify.get('/api/system/adb/status', async (_req, reply) => {
    try {
      return reply.send(AdbManager.getStatus());
    } catch (err) {
      return handleError(reply, err);
    }
  });

  fastify.post('/api/system/adb/install', async (_req, reply) => {
    try {
      await AdbManager.installAdb();
      return reply.send({ success: true, message: 'ADB 安装完成' });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  fastify.post('/api/system/adb/pair', async (req, reply) => {
    const { host, code } = req.body as { host: string; code: string };
    if (!host || !code) {
      return reply.code(400).send({ error: '缺少主机端口 (host) 或配对码 (code)' });
    }
    try {
      AdbManager.pairDevice(host, code);
      return reply.send({ success: true, message: '配对指令执行成功' });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  fastify.post('/api/system/adb/connect', async (req, reply) => {
    const { host } = req.body as { host: string };
    if (!host) {
      return reply.code(400).send({ error: '缺少主机端口 (host)' });
    }
    try {
      AdbManager.connectDevice(host);
      return reply.send({ success: true, message: '连接指令执行成功' });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  fastify.post('/api/system/adb/optimize', async (req, reply) => {
    const { mode } = req.body as { mode: 'universal' | 'aggressive' };
    try {
      if (mode === 'aggressive') {
        const msg = AdbManager.applyVendorFixes();
        return reply.send({ success: true, message: msg });
      } else {
        AdbManager.applyUniversalFixes();
        return reply.send({ success: true, message: '通用保活优化策略应用完成' });
      }
    } catch (err) {
      return handleError(reply, err);
    }
  });

  fastify.post('/api/system/adb/heartbeat', async (req, reply) => {
    const { enable } = req.body as { enable: boolean };
    try {
      AdbManager.toggleAudioHeartbeat(enable);
      return reply.send({ success: true, message: enable ? '音频心跳已开启' : '音频心跳已关闭' });
    } catch (err) {
      return handleError(reply, err);
    }
  });

  fastify.post('/api/system/adb/rollback', async (_req, reply) => {
    try {
      AdbManager.revertOptimizations();
      return reply.send({ success: true, message: '所有保活优化参数已撤销' });
    } catch (err) {
      return handleError(reply, err);
    }
  });
}
