import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

// Mock child_process and fs
vi.mock('child_process', () => {
  const execSync = vi.fn();
  const spawn = vi.fn();
  const mod = { execSync, spawn };
  return { default: mod, ...mod };
});

vi.mock('fs', () => {
  const existsSync = vi.fn();
  const mkdirSync = vi.fn();
  const unlinkSync = vi.fn();
  const renameSync = vi.fn();
  const readdirSync = vi.fn();
  const statSync = vi.fn();
  const chmodSync = vi.fn();
  const writeFileSync = vi.fn();
  const readFileSync = vi.fn();
  const mod = { existsSync, mkdirSync, unlinkSync, renameSync, readdirSync, statSync, chmodSync, writeFileSync, readFileSync };
  return { default: mod, ...mod };
});

// Import the lifecycles under test
import * as clewd from '../../../modules/clewd/lifecycle.js';
import * as cliproxyapi from '../../../modules/cliproxyapi/lifecycle.js';
import * as gcli2api from '../../../modules/gcli2api/lifecycle.js';

describe('Apps Lifecycle Edge Cases', () => {
  let ctx: any;
  let loggerMock: any;
  let execCmdMock: any;
  let spawnCmdMock: any;
  let networkMock: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    loggerMock = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
    };
    execCmdMock = vi.fn().mockResolvedValue(undefined);
    spawnCmdMock = vi.fn().mockResolvedValue({ pid: 1234 } as any);
    networkMock = {
      getSmartUrl: vi.fn((url) => url),
      buildGitCloneArgs: vi.fn((repoUrl, targetDir, branch) => ({
        cmd: 'git',
        args: ['clone', '--depth=1', ...(branch ? ['-b', branch] : []), repoUrl, targetDir]
      })),
    };

    ctx = {
      module: {},
      config: {},
      get isTermux() {
        return !!(process.env.PREFIX?.includes('com.termux') || fs.existsSync('/data/data/com.termux'));
      },
      paths: {
        moduleDir: '/fake/moduleDir',
        appDir: '/fake/moduleDir/app',
        logsDir: '/fake/logsDir',
      },
      logger: loggerMock,
      execCmd: execCmdMock,
      spawnCmd: spawnCmdMock,
      network: networkMock,
    };

    // Default fs mock behaviors
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true } as any);
    vi.mocked(fs.readdirSync).mockReturnValue([] as any);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('ClewdR (clewd) Lifecycle', () => {
    const mockLatestRelease = {
      assets: [
        { name: 'clewdr-linux-x86_64.zip', browser_download_url: 'http://dl/linux-x64' },
        { name: 'clewdr-musllinux-x86_64.zip', browser_download_url: 'http://dl/musl-x64' },
        { name: 'clewdr-android-aarch64.zip', browser_download_url: 'http://dl/android-arm64' },
        { name: 'clewdr-linux-aarch64.zip', browser_download_url: 'http://dl/linux-arm64' }
      ]
    };

    it('should map architectures correctly - Standard Linux x64', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockLatestRelease)
      }));

      vi.stubEnv('PREFIX', '');
      Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('/data/data/com.termux')) return false;
        return true;
      });

      await clewd.install(ctx);
      expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('linux-x86_64'));
      expect(execCmdMock).toHaveBeenCalledWith('curl', expect.arrayContaining(['http://dl/linux-x64']));
    });

    it('should map architectures correctly - Termux x64 fallback to musllinux', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockLatestRelease)
      }));

      vi.stubEnv('PREFIX', '/data/data/com.termux/files/usr');
      Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('/data/data/com.termux')) return true;
        return true;
      });

      await clewd.install(ctx);
      expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('musllinux-x86_64'));
      expect(execCmdMock).toHaveBeenCalledWith('curl', expect.arrayContaining(['http://dl/musl-x64']));
    });

    it('should throw error if GitHub API request fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      }));

      await expect(clewd.install(ctx)).rejects.toThrow(/请求 GitHub API 失败: HTTP 500/);
    });

    it('should throw error if adapter asset is not found', async () => {
      const badRelease = { assets: [{ name: 'clewdr-windows.zip', browser_download_url: 'http://dl/win' }] };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(badRelease)
      }));

      Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });
      vi.stubEnv('PREFIX', '');
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('/data/data/com.termux')) return false;
        return true;
      });

      await expect(clewd.install(ctx)).rejects.toThrow(/找不到适配架构 linux-x86_64 的发布包/);
    });

    it('should handle nested binary resolution if not directly in appDir', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockLatestRelease)
      }));

      Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });
      vi.stubEnv('PREFIX', '');

      let binaryExists = false;
      vi.mocked(fs.renameSync).mockImplementation(() => {
        binaryExists = true;
      });

      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        if (typeof p === 'string' && p.endsWith('/app/clewdr')) return binaryExists;
        if (typeof p === 'string' && p.includes('/data/data/com.termux')) return false;
        return true;
      });
      vi.mocked(fs.readdirSync).mockReturnValue(['some-folder/clewdr'] as any);

      await clewd.install(ctx);
      expect(fs.renameSync).toHaveBeenCalledWith(
        expect.stringContaining('some-folder/clewdr'),
        expect.stringContaining('app/clewdr')
      );
    });

    it('should check for binary existence on start', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await expect(clewd.start(ctx)).rejects.toThrow(/ClewdR 程序未安装/);
    });
  });

  describe('CLIProxyAPI (cliproxyapi) Lifecycle', () => {
    it('should check and attempt automatic golang install if missing', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('go command not found');
      });
      vi.stubEnv('PREFIX', '/data/data/com.termux/files/usr');

      await cliproxyapi.install(ctx);

      expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('尝试自动安装 golang'));
      expect(execCmdMock).toHaveBeenCalledWith('pkg', ['install', '-y', 'golang']);
    });

    it('should check and attempt apt-get golang install on linux if missing', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('go command not found');
      });
      vi.stubEnv('PREFIX', '');
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        if (typeof p === 'string' && p.includes('/data/data/com.termux')) return false;
        return true;
      });

      await cliproxyapi.install(ctx);

      expect(execCmdMock).toHaveBeenCalledWith('apt-get', ['install', '-y', 'golang']);
    });

    it('should skip git clone if app directory already exists', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        if (typeof p === 'string' && p.endsWith('/app')) return true;
        return true;
      });

      await cliproxyapi.install(ctx);

      expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('代码目录已存在，跳过克隆'));
      expect(networkMock.buildGitCloneArgs).not.toHaveBeenCalled();
    });

    it('should throw error if compilation fails to produce a binary', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        if (typeof p === 'string' && p.endsWith('/cli-proxy-api')) return false;
        return true;
      });

      await expect(cliproxyapi.install(ctx)).rejects.toThrow(/未找到编译完成的/);
    });

    it('should write default configurations if config.yaml is missing', async () => {
      const mockConfigExample = 'allow-remote: false\nsecret-key: "123"\ndisable-control-panel: true';
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        if (typeof p === 'string' && p.endsWith('config.yaml')) return false;
        return true;
      });
      vi.mocked(fs.readFileSync).mockReturnValue(mockConfigExample);

      await cliproxyapi.install(ctx);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('config.yaml'),
        expect.stringContaining('allow-remote: true'),
        'utf8'
      );
    });
  });

  describe('GCLI2API (gcli2api) Lifecycle', () => {
    it('should create python venv if not existing', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        if (typeof p === 'string' && p.endsWith('/venv')) return false;
        return true;
      });

      await gcli2api.install(ctx);

      expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('正在创建 Python 虚拟环境'));
      expect(execCmdMock).toHaveBeenCalledWith('python3', ['-m', 'venv', 'venv'], { cwd: expect.any(String) });
    });

    it('should select requirements-termux.txt if on Termux platform', async () => {
      vi.stubEnv('PREFIX', '/data/data/com.termux/files/usr');
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        if (typeof p === 'string' && p.endsWith('requirements-termux.txt')) return true;
        return true;
      });

      await gcli2api.install(ctx);

      expect(loggerMock.info).toHaveBeenCalledWith(expect.stringContaining('检测到 Termux 专用依赖'));
      expect(execCmdMock).toHaveBeenCalledWith(
        expect.stringContaining('pip'),
        expect.arrayContaining(['requirements-termux.txt']),
        { cwd: expect.any(String) }
      );
    });

    it('should throw if virtual environment python path is missing on start', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p: any) => {
        if (typeof p === 'string' && p.endsWith('/bin/python')) return false;
        return true;
      });

      await expect(gcli2api.start(ctx)).rejects.toThrow(/GCLI2API 虚拟环境未初始化/);
    });
  });
});
