import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'os';
import child_process from 'child_process';

// Mock child_process module with internally declared mock functions to avoid hoisting order issues
vi.mock('child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('child_process')>();
  const mockSpawnSync = vi.fn();
  return {
    ...original,
    spawnSync: mockSpawnSync,
    default: {
      ...original,
      spawnSync: mockSpawnSync,
    }
  };
});

import { SystemManager } from './system.js';

describe('SystemManager', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(child_process.spawnSync).mockReset();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getPlatform', () => {
    it('should detect windows', () => {
      vi.spyOn(os, 'platform').mockReturnValue('win32');
      expect(SystemManager.getPlatform()).toBe('windows');
    });

    it('should detect macos', () => {
      vi.spyOn(os, 'platform').mockReturnValue('darwin');
      expect(SystemManager.getPlatform()).toBe('macos');
    });

    it('should detect termux via android platform', () => {
      vi.spyOn(os, 'platform').mockReturnValue('android');
      expect(SystemManager.getPlatform()).toBe('termux');
    });

    it('should detect termux via prefix env on linux', () => {
      vi.spyOn(os, 'platform').mockReturnValue('linux');
      process.env.PREFIX = '/data/data/com.termux/files/usr';
      expect(SystemManager.getPlatform()).toBe('termux');
    });

    it('should detect standard linux', () => {
      vi.spyOn(os, 'platform').mockReturnValue('linux');
      delete process.env.PREFIX;
      expect(SystemManager.getPlatform()).toBe('linux');
    });
  });

  describe('resolveBinaryName', () => {
    it('should append .cmd on windows for npm-like binaries', () => {
      vi.spyOn(os, 'platform').mockReturnValue('win32');
      expect(SystemManager.resolveBinaryName('npm')).toBe('npm.cmd');
      expect(SystemManager.resolveBinaryName('npx')).toBe('npx.cmd');
      expect(SystemManager.resolveBinaryName('git')).toBe('git'); // should not append for git
    });

    it('should return command as-is on non-windows', () => {
      vi.spyOn(os, 'platform').mockReturnValue('linux');
      expect(SystemManager.resolveBinaryName('npm')).toBe('npm');
    });
  });

  describe('hasBinary', () => {
    it('should return true if command is found via spawnSync', () => {
      vi.spyOn(os, 'platform').mockReturnValue('linux');
      vi.mocked(child_process.spawnSync).mockReturnValue({
        status: 0,
        pid: 123,
        output: [],
        stdout: Buffer.from(''),
        stderr: Buffer.from(''),
        signal: null,
      } as any);

      const hasGit = SystemManager.hasBinary('git');
      expect(hasGit).toBe(true);
      expect(vi.mocked(child_process.spawnSync)).toHaveBeenCalledWith('sh', ['-c', 'command -v git'], { stdio: 'ignore' });
    });

    it('should return false if spawnSync throws or status is non-zero', () => {
      vi.spyOn(os, 'platform').mockReturnValue('linux');
      vi.mocked(child_process.spawnSync)
        .mockImplementationOnce(() => {
          throw new Error('command not found');
        })
        .mockImplementationOnce(() => {
          throw new Error('direct check failed');
        });

      const hasFake = SystemManager.hasBinary('fake-command');
      expect(hasFake).toBe(false);
    });
  });

  describe('getSystemMetrics', () => {
    it('should calculate CPU and Memory metrics correctly', () => {
      vi.spyOn(os, 'platform').mockReturnValue('linux');
      vi.spyOn(os, 'totalmem').mockReturnValue(16 * 1024 * 1024 * 1024); // 16GB
      vi.spyOn(os, 'freemem').mockReturnValue(8 * 1024 * 1024 * 1024);   // 8GB
      vi.spyOn(os, 'loadavg').mockReturnValue([1.5, 1.0, 0.5]);
      vi.spyOn(os, 'uptime').mockReturnValue(3600);
      vi.spyOn(os, 'arch').mockReturnValue('arm64');
      vi.spyOn(os, 'cpus').mockReturnValue([
        { model: 'Apple M1', speed: 2400, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } },
        { model: 'Apple M1', speed: 2400, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } },
      ]);

      const metrics = SystemManager.getSystemMetrics();
      expect(metrics.platform).toBe('linux');
      expect(metrics.arch).toBe('arm64');
      expect(metrics.uptime).toBe(3600);
      expect(metrics.memory.total).toBe(16 * 1024 * 1024 * 1024);
      expect(metrics.memory.free).toBe(8 * 1024 * 1024 * 1024);
      expect(metrics.memory.used).toBe(8 * 1024 * 1024 * 1024);
      expect(metrics.memory.percentage).toBe(50);
      expect(metrics.cpu.cores).toBe(2);
      expect(metrics.cpu.model).toBe('Apple M1');
      expect(metrics.cpu.load1m).toBe(1.5);
    });
  });
});
