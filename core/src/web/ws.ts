import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { Logger } from '../manager/logger.js';
import { ProcessEvent } from '../manager/process.js';
import { SystemManager } from '../manager/system.js';

// ── Client registry ────────────────────────────────────────────────────────

interface WsClient {
  socket: WebSocket;
  subscriptions: Set<string>; // module IDs, or '*' for system
}

const clients = new Set<WsClient>();

// ── Broadcast helper ───────────────────────────────────────────────────────

export function broadcastEvent(event: ProcessEvent): void {
  const payload = JSON.stringify(event);
  for (const client of clients) {
    if (
      client.socket.readyState === WebSocket.OPEN &&
      (client.subscriptions.has('*') || client.subscriptions.has(event.moduleId))
    ) {
      client.socket.send(payload);
    }
  }
}

function broadcastSystem(data: object): void {
  const payload = JSON.stringify({ event: 'system_metrics', ...data });
  for (const client of clients) {
    if (client.socket.readyState === WebSocket.OPEN && client.subscriptions.has('__system__')) {
      client.socket.send(payload);
    }
  }
}

// ── System metrics push ────────────────────────────────────────────────────
// Push system metrics every 3 seconds to subscribers

let metricsInterval: ReturnType<typeof setInterval> | null = null;

function ensureMetricsBroadcast(): void {
  if (metricsInterval) return;
  metricsInterval = setInterval(() => {
    let hasSystemSub = false;
    for (const c of clients) {
      if (c.subscriptions.has('__system__') && c.socket.readyState === WebSocket.OPEN) {
        hasSystemSub = true;
        break;
      }
    }
    if (!hasSystemSub) {
      if (metricsInterval) clearInterval(metricsInterval);
      metricsInterval = null;
      return;
    }
    broadcastSystem({ data: SystemManager.getSystemMetrics(), timestamp: new Date().toISOString() });
  }, 3000);
}

// ── WebSocket route registration ───────────────────────────────────────────

export function initWebSocket(fastify: FastifyInstance): { broadcastEvent: typeof broadcastEvent } {
  /**
   * WS /ws/logs?module_id=<id>
   * Streams live process events for a specific module (or all with module_id=*)
   */
  fastify.get('/ws/logs', { websocket: true }, (socket, req) => {
    const rawId = (req.query as Record<string, string>)['module_id'] ?? '*';
    const moduleIds = rawId.split(',').map((s) => s.trim());

    const client: WsClient = { socket, subscriptions: new Set(moduleIds) };
    clients.add(client);
    Logger.info(`WS 客户端已连接，订阅: [${moduleIds.join(', ')}]`, 'WS');

    socket.send(
      JSON.stringify({ event: 'connected', subscriptions: moduleIds, timestamp: new Date().toISOString() })
    );

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { action?: string; module_id?: string };
        if (msg.action === 'subscribe' && msg.module_id) {
          client.subscriptions.add(msg.module_id);
          socket.send(JSON.stringify({ event: 'subscribed', module_id: msg.module_id }));
        }
        if (msg.action === 'unsubscribe' && msg.module_id) {
          client.subscriptions.delete(msg.module_id);
        }
      } catch {
        // ignore malformed messages
      }
    });

    socket.on('close', () => {
      clients.delete(client);
      Logger.info('WS 客户端已断开。', 'WS');
    });

    socket.on('error', (err) => {
      Logger.warn(`WS 错误: ${err.message}`, 'WS');
      clients.delete(client);
    });
  });

  /**
   * WS /ws/system
   * Streams system resource metrics every 3 seconds
   */
  fastify.get('/ws/system', { websocket: true }, (socket, _req) => {
    const client: WsClient = { socket, subscriptions: new Set(['__system__']) };
    clients.add(client);
    Logger.info('WS 系统监控客户端已连接。', 'WS');
    ensureMetricsBroadcast();

    // Send immediate snapshot
    socket.send(
      JSON.stringify({
        event: 'system_metrics',
        data: SystemManager.getSystemMetrics(),
        timestamp: new Date().toISOString(),
      })
    );

    socket.on('close', () => {
      clients.delete(client);
    });

    socket.on('error', () => {
      clients.delete(client);
    });
  });

  return { broadcastEvent };
}
