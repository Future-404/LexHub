import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Setup mocked environment before importing config.ts
const mockTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexhub-test-'));
const mockRootBase = path.resolve(__dirname, '../../..');

vi.mock('fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('fs')>();
  
  function mapPath(p: any): any {
    if (typeof p === 'string' && (p.includes('/config') || p.includes('/modules') || p.includes('/logs'))) {
      const rel = path.relative(mockRootBase, p);
      return path.join(mockTempDir, rel);
    }
    return p;
  }

  const mockedFs = {
    ...original,
    existsSync: (p: any) => original.existsSync(mapPath(p)),
    mkdirSync: (p: any, options: any) => original.mkdirSync(mapPath(p), options),
    readFileSync: (p: any, options: any) => original.readFileSync(mapPath(p), options),
    writeFileSync: (p: any, data: any, options: any) => original.writeFileSync(mapPath(p), data, options),
    renameSync: (oldPath: any, newPath: any) => original.renameSync(mapPath(oldPath), mapPath(newPath)),
  };

  return {
    ...mockedFs,
    default: mockedFs,
  };
});

// Import the module under test
import { ConfigManager } from './config.js';

describe('ConfigManager', () => {
  beforeAll(() => {
    // Initialize config manager (creates config & modules dirs, writes defaults)
    ConfigManager.init();
  });

  afterAll(() => {
    // Clean up temp dir
    try {
      fs.rmSync(mockTempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('Settings management', () => {
    it('should load default settings initially', () => {
      const settings = ConfigManager.loadSettings();
      expect(settings).toBeDefined();
      expect(settings.webPort).toBe(3000);
      expect(settings.webHost).toBe('127.0.0.1');
      expect(settings.language).toBe('zh');
    });

    it('should save settings and load them back', () => {
      const settings = ConfigManager.loadSettings();
      settings.language = 'en';
      settings.theme = 'light';
      ConfigManager.saveSettings(settings);

      const loaded = ConfigManager.loadSettings();
      expect(loaded.language).toBe('en');
      expect(loaded.theme).toBe('light');
    });

    it('should patch settings correctly', () => {
      ConfigManager.patchSettings({ theme: 'dark', webPort: 8080 });
      const loaded = ConfigManager.loadSettings();
      expect(loaded.theme).toBe('dark');
      expect(loaded.webPort).toBe(8080);
      expect(loaded.language).toBe('en'); // should persist previous value
    });
  });

  describe('Installed Registry management', () => {
    it('should load empty registry initially', () => {
      const registry = ConfigManager.loadInstalled();
      expect(registry.modules).toEqual({});
    });

    it('should upsert and retrieve module record', () => {
      ConfigManager.upsertModuleRecord('sillytavern', {
        name: 'SillyTavern',
        version: '1.12.0',
        status: 'RUNNING',
      });

      const record = ConfigManager.getModuleRecord('sillytavern');
      expect(record).toBeDefined();
      expect(record?.name).toBe('SillyTavern');
      expect(record?.version).toBe('1.12.0');
      expect(record?.status).toBe('RUNNING');
      expect(record?.crashCount).toBe(0);
    });

    it('should list all installed modules', () => {
      const modules = ConfigManager.getAllInstalledModules();
      expect(modules.length).toBe(1);
      expect(modules[0].id).toBe('sillytavern');
    });

    it('should update module status', () => {
      ConfigManager.setModuleStatus('sillytavern', 'STOPPED', { pid: undefined });
      const record = ConfigManager.getModuleRecord('sillytavern');
      expect(record?.status).toBe('STOPPED');
      expect(record?.pid).toBeUndefined();
    });

    it('should remove module record', () => {
      ConfigManager.removeModuleRecord('sillytavern');
      const record = ConfigManager.getModuleRecord('sillytavern');
      expect(record).toBeUndefined();

      const modules = ConfigManager.getAllInstalledModules();
      expect(modules.length).toBe(0);
    });
  });
});
