import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── ESM-compatible mocks ───────────────────────────────────────────────────

vi.mock('fs', () => {
  const existsSync = vi.fn();
  const readdirSync = vi.fn();
  const readFileSync = vi.fn();
  const rmSync = vi.fn();
  const mkdirSync = vi.fn();
  const copyFileSync = vi.fn();
  const writeFileSync = vi.fn();
  const mod = { existsSync, readdirSync, readFileSync, rmSync, mkdirSync, copyFileSync, writeFileSync };
  return { default: mod, ...mod };
});

vi.mock('./logger.js', () => {
  const Logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  };
  return { Logger };
});

vi.mock('./config.js', () => {
  const ConfigManager = {
    getModuleRecord: vi.fn(),
    upsertModuleRecord: vi.fn(),
    removeModuleRecord: vi.fn(),
    setModuleStatus: vi.fn(),
    loadSettings: vi.fn().mockReturnValue({ storeIndexUrl: 'http://store.local' }),
    getAllInstalledModules: vi.fn().mockReturnValue([]),
  };
  return {
    ConfigManager,
    MODULES_DIR: '/mock/modules',
  };
});

vi.mock('./process.js', () => {
  const ProcessManager = {
    isRunning: vi.fn(),
    getPid: vi.fn(),
    startModule: vi.fn(),
    stopModule: vi.fn(),
  };
  return { ProcessManager };
});

vi.mock('./network.js', () => {
  const NetworkManager = {
    getSmartUrl: vi.fn((url) => url),
    fetch: vi.fn(),
  };
  return { NetworkManager };
});

vi.mock('./system.js', () => {
  const SystemManager = {
    hasBinary: vi.fn(),
    resolveBinaryName: vi.fn((cmd) => cmd),
  };
  return { SystemManager };
});

// Mock path to behave predictably regardless of OS
vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('path')>();
  return {
    default: {
      ...actual,
      join: (...parts: string[]) => parts.join('/').replace(/\\/g, '/').replace(/\/+/g, '/'),
      resolve: (...parts: string[]) => parts.join('/').replace(/\\/g, '/').replace(/\/+/g, '/'),
    },
    ...actual,
  };
});


// ── Import SUT ─────────────────────────────────────────────────────────────

import { ModuleManager } from './module.js';
import fs from 'fs';
import { ConfigManager } from './config.js';
import { ProcessManager } from './process.js';
import { NetworkManager } from './network.js';

describe('ModuleManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default stubs
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(ConfigManager.getModuleRecord).mockReturnValue(undefined);
    vi.mocked(ProcessManager.isRunning).mockReturnValue(false);
    vi.mocked(ProcessManager.getPid).mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── scanInstalledModules ──────────────────────────────────────────────────

  describe('scanInstalledModules', () => {
    it('should return empty array if modules dir does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(ModuleManager.scanInstalledModules()).toEqual([]);
    });

    it('should skip directories without lexhub-module.json', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        if (p === '/mock/modules') return true;
        if (p.includes('lexhub-module.json')) return false;
        return false;
      });

      const dirs = [
        { isDirectory: () => true, name: 'dir1' },
      ];
      vi.mocked(fs.readdirSync).mockReturnValue(dirs as any);

      expect(ModuleManager.scanInstalledModules()).toEqual([]);
    });

    it('should return module info with correct fields for valid modules', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        if (p === '/mock/modules') return true;
        if (p === '/mock/modules/mod1/lexhub-module.json') return true;
        if (p === '/mock/modules/mod1/lifecycle.js') return true; // installed
        return false;
      });

      const meta = {
        id: 'mod1',
        name: 'Mod One',
        version: '1.0',
        author: 'Test',
        description: 'A test module'
      };

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(meta));

      const dirs = [
        { isDirectory: () => true, name: 'mod1' },
      ];
      vi.mocked(fs.readdirSync).mockReturnValue(dirs as any);
      vi.mocked(ProcessManager.isRunning).mockReturnValue(true);
      vi.mocked(ProcessManager.getPid).mockReturnValue(1234);

      const res = ModuleManager.scanInstalledModules();
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('mod1');
      expect(res[0].isInstalled).toBe(true);
      expect(res[0].status).toBe('RUNNING');
      expect(res[0].pid).toBe(1234);
      expect(res[0].paths.moduleDir).toBe('/mock/modules/mod1');
    });
  });

  // ── getModuleById ─────────────────────────────────────────────────────────

  describe('getModuleById', () => {
    it('should return undefined if module does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(ModuleManager.getModuleById('ghost')).toBeNull();
    });

    it('should return module info for existing module', () => {
      vi.mocked(fs.existsSync).mockImplementation((p: any) => p.includes('mod2'));
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ id: 'mod2', name: 'Mod 2' }));
      vi.mocked(ConfigManager.getModuleRecord).mockReturnValue({ config: { k: 'v' }, crashCount: 2 } as any);
      
      const res = ModuleManager.getModuleById('mod2');
      expect(res).not.toBeNull();
      expect(res?.id).toBe('mod2');
      expect(res?.config).toEqual({ k: 'v' });
      expect(res?.crashCount).toBe(2);
    });
  });

  // ── updateModuleConfig ────────────────────────────────────────────────────

  describe('updateModuleConfig', () => {
    it('should update config in ConfigManager', () => {
      vi.mocked(ConfigManager.getModuleRecord).mockReturnValue({ config: { a: 1 } } as any);
      
      ModuleManager.updateModuleConfig('mod3', { b: 2 });
      
      expect(ConfigManager.upsertModuleRecord).toHaveBeenCalledWith('mod3', {
        config: { a: 1, b: 2 }
      });
    });
  });

  // ── uninstallModule ───────────────────────────────────────────────────────

  describe('uninstallModule', () => {
    it('should stop module if running and remove its directory', async () => {
      vi.mocked(ProcessManager.isRunning).mockReturnValue(true);
      vi.mocked(fs.existsSync).mockImplementation((p: any) => p === '/mock/modules/mod4');

      await ModuleManager.uninstallModule('mod4');

      expect(ProcessManager.stopModule).toHaveBeenCalledWith('mod4');
      expect(fs.rmSync).toHaveBeenCalledWith('/mock/modules/mod4', { recursive: true, force: true });
      expect(ConfigManager.removeModuleRecord).toHaveBeenCalledWith('mod4');
    });
  });

  // ── installModule ─────────────────────────────────────────────────────────

  describe('installModule', () => {
    it('throws if remote module not found in store', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false); // local not found
      vi.mocked(NetworkManager.fetch).mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify([{ id: 'other' }])
      } as any);

      await expect(ModuleManager.installModule('missing-mod')).rejects.toThrow(/商店中找不到模块/);
    });
    
    // Note: detailed install flow requires complex mocking of dynamic imports which we skip for basic coverage
  });

});
