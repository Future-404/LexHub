import { describe, it, expect, vi, beforeAll } from 'vitest';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';

vi.mock('../manager/config.js', () => ({
  ConfigManager: {
    loadSettings: () => ({ adminPasswordHash: null }),
    patchSettings: () => ({}),
  },
}));

vi.mock('../manager/module.js', () => ({
  ModuleManager: {
    callLifecycle: () => Promise.resolve(),
  },
}));

import { registerRoutes } from './routes.js';

describe('Routes API - Restore Path Traversal Check', () => {
  let app: any;

  beforeAll(async () => {
    app = Fastify();
    await app.register(fastifyCookie);
    await app.register(fastifyJwt, { secret: 'test-secret' });
    await registerRoutes(app);
  });

  it('should reject a backupPath that attempts prefix bypass', async () => {
    const os = await import('os');
    const path = await import('path');
    
    // Construct a path like '/root/LexHub_Backup-dangerous' which starts with allowedBase
    // but is a completely different directory.
    const allowedBase = path.join(os.homedir(), 'LexHub_Backup');
    const dangerousPath = allowedBase + '-dangerous/secrets.json';

    const response = await app.inject({
      method: 'POST',
      url: '/api/modules/sillytavern/restore',
      payload: { backupPath: dangerousPath },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('不允许的备份路径');
  });

  it('should accept a valid backupPath inside allowedBase', async () => {
    const os = await import('os');
    const path = await import('path');
    
    const allowedBase = path.join(os.homedir(), 'LexHub_Backup');
    const validPath = path.join(allowedBase, 'sillytavern_backup.zip');

    const response = await app.inject({
      method: 'POST',
      url: '/api/modules/sillytavern/restore',
      payload: { backupPath: validPath },
    });

    expect(response.statusCode).toBe(202);
  });
});
