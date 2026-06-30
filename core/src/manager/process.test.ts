import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// ── ESM-compatible mocks ───────────────────────────────────────────────────

vi.mock('fs', () => {
  const existsSync = vi.fn();
  const statSync = vi.fn();
  const unlinkSync = vi.fn();
  const renameSync = vi.fn();
  const createWriteStream = vi.fn();
  const mkdirSync = vi.fn();
  const mod = { existsSync, statSync, unlinkSync, renameSync, createWriteStream, mkdirSync };
  return { default: mod, ...mod };
});

vi.mock('child_process', () => {
  const mockSpawn = vi.fn();
  return { default: { spawn: mockSpawn }, spawn: mockSpawn };
});

vi.mock('./logger.js', () => {
  const Logger = {
    init: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    getModuleLogPaths: vi.fn().mockReturnValue({
      stdout: '/tmp/test_stdout.log',
      stderr: '/tmp/test_stderr.log',
    }),
  };
  return { Logger };
});

vi.mock('./config.js', () => {
  const ConfigManager = {
    getModuleRecord: vi.fn(),
    setModuleStatus: vi.fn(),
    upsertModuleRecord: vi.fn(),
  };
  return {
    ConfigManager,
    MODULES_DIR: '/fake/modules',
    LOGS_DIR: '/fake/logs',
  };
});

vi.mock('./system.js', () => {
  const SystemManager = {
    resolveBinaryName: vi.fn().mockReturnValue('node'),
  };
  return { SystemManager };
});

// ── Import SUT & mocked modules ───────────────────────────────────────────

import { ProcessManager } from './process.js';
import fs from 'fs';
import { spawn } from 'child_process';
import { Logger } from './logger.js';
import { ConfigManager } from './config.js';
import { SystemManager } from './system.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a fake ChildProcess EventEmitter with stub stdout/stderr streams
 * and an optional pid value.
 */
function createFakeChild(pid: number | undefined = 1234): any {
  const child = new EventEmitter() as any;
  child.pid = pid;
  child.kill = vi.fn();

  const stdoutStream = new EventEmitter() as any;
  stdoutStream.pipe = vi.fn().mockReturnThis();
  stdoutStream.unpipe = vi.fn();

  const stderrStream = new EventEmitter() as any;
  stderrStream.pipe = vi.fn().mockReturnThis();
  stderrStream.unpipe = vi.fn();

  child.stdout = stdoutStream;
  child.stderr = stderrStream;

  return child;
}

/** Create a no-op WriteStream stub */
function createFakeWriteStream(): any {
  return { end: vi.fn(), write: vi.fn() };
}

// ── Test suite ─────────────────────────────────────────────────────────────

describe('ProcessManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();

    // Reset the internal static processes map between tests
    // Access private static via prototype trick — cast through any
    (ProcessManager as any).processes = new Map();

    // Default fs stubs
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.statSync).mockReturnValue({ size: 0 } as any);
    vi.mocked(fs.createWriteStream).mockReturnValue(createFakeWriteStream() as any);

    // Default ConfigManager stubs
    vi.mocked(ConfigManager.getModuleRecord).mockReturnValue(undefined);
    vi.mocked(ConfigManager.setModuleStatus).mockImplementation(() => {});
    vi.mocked(ConfigManager.upsertModuleRecord).mockImplementation(() => {});

    // Default SystemManager
    vi.mocked(SystemManager.resolveBinaryName).mockReturnValue('node');

    // Default Logger
    vi.mocked(Logger.init).mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── startModule ─────────────────────────────────────────────────────────

  describe('startModule', () => {
    it('should throw if lifecycle.js not found', async () => {
      // existsSync returns false for the lifecycle path
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(ProcessManager.startModule('test-mod')).rejects.toThrow(
        /未找到模块生命周期文件/,
      );
    });

    it('should skip start if module is already running', async () => {
      // Pre-populate the processes map
      (ProcessManager as any).processes.set('test-mod', {
        id: 'test-mod',
        pid: 9999,
        child: createFakeChild(9999),
        startedAt: new Date(),
        crashCount: 0,
      });

      await ProcessManager.startModule('test-mod');

      // Should warn, not spawn
      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('已在运行中'),
        'Process',
      );
      expect(spawn).not.toHaveBeenCalled();
    });

    it('should spawn a child process when lifecycle.js exists', async () => {
      // existsSync: lifecycle.js → true, wrapper script → true
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const fakeChild = createFakeChild(5678);
      vi.mocked(spawn).mockReturnValue(fakeChild as any);

      vi.mocked(ConfigManager.getModuleRecord).mockReturnValue(undefined);

      await ProcessManager.startModule('my-module');

      expect(spawn).toHaveBeenCalled();
      expect(ConfigManager.setModuleStatus).toHaveBeenCalledWith('my-module', 'RUNNING', {
        pid: 5678,
      });
      expect(Logger.success).toHaveBeenCalledWith(
        expect.stringContaining('已启动'),
        'Process',
      );
      expect(ProcessManager.isRunning('my-module')).toBe(true);
      expect(ProcessManager.getPid('my-module')).toBe(5678);
    });

    it('should throw if spawn returns no pid', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const fakeChild = createFakeChild(0);
      vi.mocked(spawn).mockReturnValue(fakeChild as any);

      await expect(ProcessManager.startModule('bad-mod')).rejects.toThrow(
        /spawn 失败/,
      );
    });
  });

  // ── stopModule ──────────────────────────────────────────────────────────

  describe('stopModule', () => {
    it('should warn if module is not running and has no orphan', async () => {
      vi.mocked(ConfigManager.getModuleRecord).mockReturnValue(undefined);

      await ProcessManager.stopModule('ghost-mod');

      expect(Logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('未在运行'),
        'Process',
      );
    });

    it('should send SIGTERM to a running tracked process', async () => {
      const fakeChild = createFakeChild(7777);
      (ProcessManager as any).processes.set('live-mod', {
        id: 'live-mod',
        pid: 7777,
        child: fakeChild,
        startedAt: new Date(),
        crashCount: 0,
      });

      // When stopModule is called it creates a Promise and waits for 'exit'
      const stopPromise = ProcessManager.stopModule('live-mod', 500);

      // Simulate the child exiting promptly
      fakeChild.emit('exit', 0, null);

      await stopPromise;

      expect(Logger.info).toHaveBeenCalledWith(
        expect.stringContaining('正在停止模块 live-mod'),
        'Process',
      );
    });
  });

  // ── isRunning ───────────────────────────────────────────────────────────

  describe('isRunning', () => {
    it('should return true for tracked (in-memory) processes', () => {
      (ProcessManager as any).processes.set('mem-mod', {
        id: 'mem-mod',
        pid: 1111,
        child: createFakeChild(1111),
        startedAt: new Date(),
        crashCount: 0,
      });

      expect(ProcessManager.isRunning('mem-mod')).toBe(true);
    });

    it('should return true when module is in config as RUNNING and OS process alive', () => {
      vi.mocked(ConfigManager.getModuleRecord).mockReturnValue({
        id: 'ext-mod',
        name: 'External',
        version: '1.0.0',
        installedAt: new Date().toISOString(),
        status: 'RUNNING',
        pid: 2222,
        crashCount: 0,
        config: {},
      });

      // process.kill(pid, 0) succeeds when the process exists
      const killSpy = vi.spyOn(process, 'kill').mockImplementation((() => true) as any);

      expect(ProcessManager.isRunning('ext-mod')).toBe(true);
      expect(killSpy).toHaveBeenCalledWith(2222, 0);

      killSpy.mockRestore();
    });

    it('should return false and clean stale PID when process.kill(pid, 0) throws', () => {
      vi.mocked(ConfigManager.getModuleRecord).mockReturnValue({
        id: 'stale-mod',
        name: 'Stale',
        version: '1.0.0',
        installedAt: new Date().toISOString(),
        status: 'RUNNING',
        pid: 3333,
        crashCount: 0,
        config: {},
      });

      // process.kill throws → stale PID
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      expect(ProcessManager.isRunning('stale-mod')).toBe(false);
      expect(ConfigManager.setModuleStatus).toHaveBeenCalledWith('stale-mod', 'STOPPED', {
        pid: undefined,
      });

      killSpy.mockRestore();
    });

    it('should return false when module is not tracked and not in config', () => {
      vi.mocked(ConfigManager.getModuleRecord).mockReturnValue(undefined);
      expect(ProcessManager.isRunning('nope')).toBe(false);
    });
  });

  // ── getPid ──────────────────────────────────────────────────────────────

  describe('getPid', () => {
    it('should return pid for a running (tracked) module', () => {
      (ProcessManager as any).processes.set('pid-mod', {
        id: 'pid-mod',
        pid: 4444,
        child: createFakeChild(4444),
        startedAt: new Date(),
        crashCount: 0,
      });

      expect(ProcessManager.getPid('pid-mod')).toBe(4444);
    });

    it('should return pid from config when process is alive but not in memory', () => {
      vi.mocked(ConfigManager.getModuleRecord).mockReturnValue({
        id: 'cfg-mod',
        name: 'Cfg',
        version: '1.0.0',
        installedAt: new Date().toISOString(),
        status: 'RUNNING',
        pid: 5555,
        crashCount: 0,
        config: {},
      });

      const killSpy = vi.spyOn(process, 'kill').mockImplementation((() => true) as any);

      expect(ProcessManager.getPid('cfg-mod')).toBe(5555);

      killSpy.mockRestore();
    });

    it('should return undefined for non-running module', () => {
      vi.mocked(ConfigManager.getModuleRecord).mockReturnValue(undefined);
      expect(ProcessManager.getPid('absent')).toBeUndefined();
    });

    it('should return undefined when config says RUNNING but process is dead', () => {
      vi.mocked(ConfigManager.getModuleRecord).mockReturnValue({
        id: 'dead-mod',
        name: 'Dead',
        version: '1.0.0',
        installedAt: new Date().toISOString(),
        status: 'RUNNING',
        pid: 6666,
        crashCount: 0,
        config: {},
      });

      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      expect(ProcessManager.getPid('dead-mod')).toBeUndefined();

      killSpy.mockRestore();
    });
  });

  // ── getAllRunning ────────────────────────────────────────────────────────

  describe('getAllRunning', () => {
    it('should return all tracked module IDs', () => {
      (ProcessManager as any).processes.set('mod-a', { id: 'mod-a' });
      (ProcessManager as any).processes.set('mod-b', { id: 'mod-b' });
      (ProcessManager as any).processes.set('mod-c', { id: 'mod-c' });

      const running = ProcessManager.getAllRunning();
      expect(running).toEqual(expect.arrayContaining(['mod-a', 'mod-b', 'mod-c']));
      expect(running).toHaveLength(3);
    });

    it('should return empty array when no modules are tracked', () => {
      expect(ProcessManager.getAllRunning()).toEqual([]);
    });
  });

  // ── stopAll ─────────────────────────────────────────────────────────────

  describe('stopAll', () => {
    it('should stop all running modules', async () => {
      const childA = createFakeChild(1001);
      const childB = createFakeChild(1002);

      (ProcessManager as any).processes.set('mod-x', {
        id: 'mod-x',
        pid: 1001,
        child: childA,
        startedAt: new Date(),
        crashCount: 0,
      });
      (ProcessManager as any).processes.set('mod-y', {
        id: 'mod-y',
        pid: 1002,
        child: childB,
        startedAt: new Date(),
        crashCount: 0,
      });

      const stopPromise = ProcessManager.stopAll();

      // Simulate both children exiting
      childA.emit('exit', 0, null);
      childB.emit('exit', 0, null);

      await stopPromise;

      expect(Logger.info).toHaveBeenCalledWith(
        expect.stringContaining('2 个运行中的模块'),
        'Process',
      );
      expect(Logger.success).toHaveBeenCalledWith(
        expect.stringContaining('所有模块已停止'),
        'Process',
      );
    });

    it('should handle stopAll with no running modules gracefully', async () => {
      await ProcessManager.stopAll();

      expect(Logger.info).toHaveBeenCalledWith(
        expect.stringContaining('0 个运行中的模块'),
        'Process',
      );
      expect(Logger.success).toHaveBeenCalledWith(
        expect.stringContaining('所有模块已停止'),
        'Process',
      );
    });
  });

  // ── setBroadcast ────────────────────────────────────────────────────────

  describe('setBroadcast', () => {
    it('should accept a broadcast function without error', () => {
      const fn = vi.fn();
      expect(() => ProcessManager.setBroadcast(fn)).not.toThrow();
    });
  });
});
