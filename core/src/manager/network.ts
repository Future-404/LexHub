import net from 'net';
import { ConfigManager } from './config.js';
import { Logger } from './logger.js';

const GITHUB_MIRRORS = [
  'https://ghproxy.net/',
  'https://mirror.ghproxy.com/',
  'https://ghproxy.cc/',
  'https://gh.likk.cc/',
  'https://hub.gitmirror.com/',
  'https://hk.gh-proxy.com/',
  'https://ui.ghproxy.cc/',
  'https://gh-proxy.com/',
  'https://gh.jasonzeng.dev/',
  'https://gh.idayer.com/',
  'https://edgeone.gh-proxy.com/',
  'https://ghproxy.site/',
  'https://www.gitwarp.com/',
  'https://cors.isteed.cc/',
  'https://ghproxy.vip/',
];

const PROXY_PORTS = [
  7890, 7891,     // Clash
  1080, 1081,     // Shadowsocks
  10809, 10808,   // v2rayN
  17890, 17891,   // Clash Verge
  20171, 20170,   // v2rayN alternative
  9090, 8080, 2080, 8888
];

export class NetworkManager {
  private static bestMirror: string | null = null;
  private static detectedProxy: string | null = null;
  private static isScanning = false;

  /**
   * Initializes network environment and caches best mirror / proxy
   */
  static async init(): Promise<void> {
    const settings = ConfigManager.loadSettings();
    if (settings.networkStrategy === 'auto') {
      this.scanAndRank();
    } else if (settings.networkStrategy === 'proxy' && settings.proxyUrl) {
      this.detectedProxy = settings.proxyUrl;
    } else if (settings.networkStrategy === 'mirror' && settings.mirrorUrl) {
      this.bestMirror = settings.mirrorUrl;
    }
  }

  /**
   * Scans local ports and mirrors without blocking
   */
  private static async scanAndRank(): Promise<void> {
    if (this.isScanning) return;
    this.isScanning = true;
    Logger.info('Starting network background probe...', 'Network');

    try {
      // 1. Scan proxies
      for (const port of PROXY_PORTS) {
        if (await this.checkPortOpen('127.0.0.1', port)) {
          this.detectedProxy = `http://127.0.0.1:${port}`;
          Logger.info(`Found local proxy at ${this.detectedProxy}`, 'Network');
          ConfigManager.patchSettings({ proxyUrl: this.detectedProxy });
          break;
        }
      }

      // 2. Race GitHub mirrors
      const results = await Promise.allSettled(
        GITHUB_MIRRORS.map(mirror => this.pingMirror(mirror))
      );

      let bestDur = Infinity;
      let winner = null;

      for (const res of results) {
        if (res.status === 'fulfilled' && res.value.dur < bestDur) {
          bestDur = res.value.dur;
          winner = res.value.url;
        }
      }

      if (winner) {
        this.bestMirror = winner;
        Logger.info(`Best mirror selected: ${winner} (${bestDur}ms)`, 'Network');
        ConfigManager.patchSettings({ mirrorUrl: winner });
      }
    } catch (err) {
      Logger.warn(`Network probe failed: ${err}`, 'Network');
    } finally {
      this.isScanning = false;
    }
  }

  private static checkPortOpen(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(200);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        resolve(false);
      });

      socket.connect(port, host);
    });
  }

  private static pingMirror(mirrorUrl: string): Promise<{ url: string; dur: number }> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const testUrl = `${mirrorUrl}https://github.com/Future-404/LexHub/info/refs?service=git-upload-pack`;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      fetch(testUrl, { signal: controller.signal })
        .then(res => {
          clearTimeout(timeout);
          const contentType = res.headers.get('content-type') || '';
          if (res.ok && contentType.includes('application/x-git')) {
            resolve({ url: mirrorUrl, dur: Date.now() - start });
          } else {
            reject(new Error('Invalid response type or status'));
          }
        })
        .catch(err => {
          clearTimeout(timeout);
          reject(err);
        });
    });
  }

  // ── Smart API ────────────────────────────────────────────────────────────

  /**
   * Replaces github.com URLs with mirrors if network strategy requires it.
   */
  static getSmartUrl(url: string): string {
    const settings = ConfigManager.loadSettings();
    if (!url.includes('github.com') && !url.includes('raw.githubusercontent.com')) {
      return url;
    }

    if (settings.networkStrategy === 'proxy' || settings.networkStrategy === 'direct') {
      // If forced proxy or direct, use original URL
      return url;
    }

    const mirror = settings.networkStrategy === 'mirror' ? settings.mirrorUrl : this.bestMirror;
    if (mirror) {
      return `${mirror}${url}`;
    }

    return url;
  }

  /**
   * Smart fetch wrapper that automatically applies proxies if needed.
   */
  static async fetch(url: string, init?: RequestInit): Promise<Response> {
    const settings = ConfigManager.loadSettings();
    const isGithub = url.includes('github.com') || url.includes('raw.githubusercontent.com');
    let proxyToUse: string | null = null;

    if (settings.networkStrategy === 'proxy') {
      proxyToUse = settings.proxyUrl || null;
    } else if (settings.networkStrategy === 'auto' && this.detectedProxy && isGithub && !this.bestMirror) {
      // If we are on auto, target is github, and we don't have a fast mirror but DO have a proxy
      proxyToUse = this.detectedProxy;
    }

    if (proxyToUse) {
      const { ProxyAgent } = await import('undici');
      const dispatcher = new ProxyAgent(proxyToUse);
      // Native fetch in Node 18+ can take a dispatcher
      return fetch(url, { ...init, dispatcher } as any);
    }

    return fetch(url, init);
  }

  /**
   * Builds git clone arguments including optimal proxy/mirror setup.
   */
  static buildGitCloneArgs(repoUrl: string, targetDir: string, branch?: string): { cmd: string, args: string[] } {
    const settings = ConfigManager.loadSettings();
    const isGithub = repoUrl.includes('github.com');
    const branchArgs = branch ? ['-b', branch] : [];
    
    let cloneUrl = repoUrl;
    let proxyArgs: string[] = [];

    if (settings.networkStrategy === 'proxy' || (settings.networkStrategy === 'auto' && this.detectedProxy)) {
      const proxy = settings.networkStrategy === 'proxy' ? settings.proxyUrl : this.detectedProxy;
      if (proxy) {
        proxyArgs = ['-c', `http.proxy=${proxy}`, '-c', `https.proxy=${proxy}`];
      }
    } else if (isGithub && (settings.networkStrategy === 'mirror' || (settings.networkStrategy === 'auto' && this.bestMirror))) {
      const mirror = settings.networkStrategy === 'mirror' ? settings.mirrorUrl : this.bestMirror;
      cloneUrl = `${mirror}${repoUrl}`;
      proxyArgs = ['-c', 'http.proxy=', '-c', 'https.proxy='];
    }

    return {
      cmd: 'git',
      args: [...proxyArgs, 'clone', ...branchArgs, '--depth', '1', cloneUrl, targetDir]
    };
  }

  /**
   * Injects http_proxy environment variables for spawned processes
   */
  static injectProxyEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const settings = ConfigManager.loadSettings();
    if (settings.networkStrategy === 'proxy' || (settings.networkStrategy === 'auto' && this.detectedProxy)) {
      const proxy = settings.networkStrategy === 'proxy' ? settings.proxyUrl : this.detectedProxy;
      if (proxy) {
        return { ...env, http_proxy: proxy, https_proxy: proxy, all_proxy: proxy };
      }
    }
    return env;
  }

  // ── State ─────────────────────────────────────────────────────────────────

  static getStatus() {
    return {
      bestMirror: this.bestMirror,
      detectedProxy: this.detectedProxy,
      isScanning: this.isScanning
    };
  }

  static async forceRescan(): Promise<void> {
    this.bestMirror = null;
    this.detectedProxy = null;
    this.isScanning = false; // Reset lock just in case
    await this.scanAndRank();
  }
}
