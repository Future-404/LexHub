import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes } from './routes.js';
import { ModuleManager } from '../manager/module.js';
import { Logger } from '../manager/logger.js';
import { ConfigManager } from '../manager/config.js';

// Mock ModuleManager
vi.mock('../manager/module.js', () => {
  return {
    ModuleManager: {
      startModule: vi.fn(),
      isOperationRunning: vi.fn().mockReturnValue(false),
      getRunningOperation: vi.fn().mockReturnValue('install'),
    }
  };
});

describe('Web Routes Error Masking Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should mask 500 errors and log original stack trace with TraceID', async () => {
    // 1. Arrange: setup ModuleManager mock to throw an error
    vi.spyOn(ConfigManager, 'loadSettings').mockReturnValue({
      adminPasswordHash: null
    } as any);
    const mockError = new Error('Database connection failed! SecretPath: /data/data/com.termux/files/home');
    vi.mocked(ModuleManager.startModule).mockImplementation(() => {
      throw mockError;
    });

    // Spy on Logger.error
    const loggerSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});

    // Create Fastify instance and register routes
    const fastify = Fastify({ logger: false });
    await registerRoutes(fastify);

    // 2. Act: inject POST request to /api/modules/clewd/start
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/modules/clewd/start'
    });

    // 3. Assert
    expect(response.statusCode).toBe(500);

    const body = JSON.parse(response.body);
    expect(body).toEqual({
      error: 'Internal Server Error',
      code: 'INTERNAL_SERVER_ERROR',
      traceId: expect.any(String)
    });

    // TraceId should be 8 characters hex (randomBytes(4))
    expect(body.traceId).toMatch(/^[0-9A-F]{8}$/);

    // Confirm that Logger.error was called with the stack trace and matching traceId
    expect(loggerSpy).toHaveBeenCalledTimes(2);
    const logCall = loggerSpy.mock.calls[1];
    expect(logCall[0]).toContain(`[TraceID: ${body.traceId}]`);
    expect(logCall[0]).toContain('Database connection failed!');
    expect(logCall[1]).toBe('WebAPI'); // Category parameter
  });
});
