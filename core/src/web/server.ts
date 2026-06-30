import Fastify, { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import path from 'path';
import fs from 'fs';
import { Logger } from '../manager/logger.js';
import { ConfigManager } from '../manager/config.js';
import { ProcessManager, ProcessEvent } from '../manager/process.js';
import { ModuleManager } from '../manager/module.js';
import { registerRoutes } from './routes.js';
import { initWebSocket } from './ws.js';

const WEB_UI_DIST = path.resolve(__dirname, '../../../web-ui/dist');
const WEB_UI_FALLBACK = path.resolve(__dirname, '../../public');

export async function createServer(): Promise<FastifyInstance> {
  const settings = ConfigManager.loadSettings();

  const fastify = Fastify({
    logger: false, // We use our own Logger
    trustProxy: true,
  });

  // ── Plugins ────────────────────────────────────────────────────────────────
  await fastify.register(fastifyWebsocket);
  await fastify.register(fastifyCookie);
  await fastify.register(require('@fastify/reply-from'));

  fastify.addHook('onRequest', async (req, reply) => {
    const host = req.headers.host;
    if (!host) return;

    const targetUrl = ModuleManager.getProxyTarget(host);
    if (targetUrl) {
      const settings = ConfigManager.loadSettings();
      if (settings.adminPasswordHash) {
        try {
          await req.jwtVerify();
        } catch (err) {
          const rootDomain = settings.gatewayCookieDomain 
            ? `https://lexhub${settings.gatewayCookieDomain}` 
            : '/';
          return reply.code(302).redirect(rootDomain); 
        }
      }
      return (reply as any).from(targetUrl + req.url);
    }
  });
  
  // Try to load a JWT secret, generate one if none exists in a hidden file
  const secretPath = path.join(ConfigManager.loadSettings().storeIndexUrl ? path.join(__dirname, '../../../config') : '/tmp', '.jwt_secret');
  let jwtSecret = 'default_dev_secret';
  if (fs.existsSync(secretPath)) {
    jwtSecret = fs.readFileSync(secretPath, 'utf8');
  } else {
    jwtSecret = require('crypto').randomBytes(32).toString('hex');
    try { fs.writeFileSync(secretPath, jwtSecret); } catch(e){}
  }

  await fastify.register(fastifyJwt, {
    secret: jwtSecret,
    cookie: {
      cookieName: 'lexhub_auth',
      signed: false
    }
  });

  // Serve web-ui dist if built, otherwise serve bundled public fallback
  const staticRoot = fs.existsSync(WEB_UI_DIST) ? WEB_UI_DIST : WEB_UI_FALLBACK;
  await fastify.register(fastifyStatic, {
    root: staticRoot,
    prefix: '/',
    decorateReply: false,
  });

  // ── WebSocket ──────────────────────────────────────────────────────────────
  const { broadcastEvent } = initWebSocket(fastify);

  // Wire broadcast into ProcessManager
  ProcessManager.setBroadcast((event: ProcessEvent) => broadcastEvent(event));

  // ── REST API ───────────────────────────────────────────────────────────────
  await registerRoutes(fastify);

  // ── SPA fallback (forward unknown GET to index.html) ──────────────────────
  fastify.setNotFoundHandler((_req, reply) => {
    const indexPath = path.join(staticRoot, 'index.html');
    if (fs.existsSync(indexPath)) {
      reply.type('text/html').send(fs.readFileSync(indexPath));
    } else {
      reply.code(404).send({ error: 'Not found' });
    }
  });

  return fastify;
}

export async function startServer(): Promise<void> {
  const settings = ConfigManager.loadSettings();
  const fastify = await createServer();

  try {
    await fastify.listen({ port: settings.webPort, host: settings.webHost });
    Logger.success(
      `LexHub Web 服务已启动 → http://localhost:${settings.webPort}`,
      'Server'
    );
  } catch (err) {
    Logger.error(`Web 服务启动失败: ${err}`, 'Server');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    Logger.info('正在关闭服务...', 'Server');
    await ProcessManager.stopAll();
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
