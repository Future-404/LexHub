import Fastify, { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import path from 'path';
import fs from 'fs';
import { Logger } from '../manager/logger.js';
import { ConfigManager } from '../manager/config.js';
import { ProcessManager, ProcessEvent } from '../manager/process.js';
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
