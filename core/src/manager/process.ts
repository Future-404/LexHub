import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { Logger } from './logger.js';
import { ConfigManager, ModuleStatus, MODULES_DIR, LOGS_DIR } from './config.js';
import { SystemManager } from './system.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProcessRecord {
  id: string;
  pid: number;
  child: ChildProcess;
  startedAt: Date;
  crashCount: number;
}

export type ProcessEventType = 'started' | 'stopped' | 'crashed' | 'restarted' | 'log';

export interface ProcessEvent {
  moduleId: string;
  event: ProcessEventType;
  pid?: number;
  code?: number | null;
  signal?: string | null;
  message?: string;
  timestamp: string;
}

// WebSocket broadcast callback — injected by the web layer
export type BroadcastFn = (event: ProcessEvent) => void;

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_CRASH_RESTARTS = 3;

// ── Process Manager ────────────────────────────────────────────────────────

export class ProcessManager {
  /** Live process map: moduleId → ProcessRecord */
  private static processes = new Map<string, ProcessRecord>();
  private static broadcast: BroadcastFn = () => {};

  /**
   * Inject the WebSocket broadcast function from the web layer.
   */
  static setBroadcast(fn: BroadcastFn): void {
    this.broadcast = fn;
  }

  private static emit(event: ProcessEvent): void {
    this.broadcast(event);
  }

  // ── Core: spawn ───────────────────────────────────────────────────────────

  /**
   * Spawn a module process by executing its lifecycle start hook.
   */
  static async startModule(moduleId: string): Promise<void> {
    if (this.processes.has(moduleId)) {
      Logger.warn(`模块 ${moduleId} 已在运行中，跳过启动。`, 'Process');
      return;
    }

    const moduleDir = path.join(MODULES_DIR, moduleId);
    const lifecyclePath = path.join(moduleDir, 'lifecycle.js');

    if (!fs.existsSync(lifecyclePath)) {
      throw new Error(`未找到模块生命周期文件: ${lifecyclePath}`);
    }

    // Prepare log streams
    Logger.init();
    const { stdout: stdoutLog, stderr: stderrLog } = Logger.getModuleLogPaths(moduleId);
    const stdoutStream = fs.createWriteStream(stdoutLog, { flags: 'a' });
    const stderrStream = fs.createWriteStream(stderrLog, { flags: 'a' });

    // Resolve node binary (Windows needs .cmd extension)
    const nodeBin = SystemManager.resolveBinaryName('node');

    // We use a small wrapper script for context injection
    const wrapperScript = path.join(__dirname, '../runtime/starter.js');
    const child = spawn(nodeBin, [wrapperScript, moduleDir], {
      env: {
        ...process.env,
        LEXHUB_MODULE_ID: moduleId,
        LEXHUB_MODULE_DIR: moduleDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    if (!child.pid) {
      stdoutStream.end();
      stderrStream.end();
      throw new Error(`无法启动模块 ${moduleId} — spawn 失败`);
    }
    
    child.on('error', (err) => {
      stdoutStream.end();
      stderrStream.end();
      Logger.error(`模块 ${moduleId} 启动异常: ${err.message}`, 'Process');
    });

    // Pipe streams and broadcast live logs
    child.stdout?.pipe(stdoutStream);
    child.stdout?.on('data', (chunk) => {
      this.emit({ moduleId, event: 'log', message: chunk.toString(), timestamp: new Date().toISOString() });
    });
    
    child.stderr?.pipe(stderrStream);
    child.stderr?.on('data', (chunk) => {
      this.emit({ moduleId, event: 'log', message: chunk.toString(), timestamp: new Date().toISOString() });
    });

    const moduleRecord = ConfigManager.getModuleRecord(moduleId);
    const crashCount = moduleRecord?.crashCount ?? 0;
    this.processes.set(moduleId, {
      id: moduleId,
      pid: child.pid,
      child,
      startedAt: new Date(),
      crashCount,
    });

    ConfigManager.setModuleStatus(moduleId, 'RUNNING', { pid: child.pid });
    Logger.success(`模块 ${moduleId} 已启动 (PID: ${child.pid})`, 'Process');
    this.emit({ moduleId, event: 'started', pid: child.pid, timestamp: new Date().toISOString() });

    const resetCrashTimer = setTimeout(() => {
      const rec = this.processes.get(moduleId);
      if (rec) {
        rec.crashCount = 0;
        ConfigManager.upsertModuleRecord(moduleId, { crashCount: 0 });
        Logger.info(`模块 ${moduleId} 已稳定运行，重置崩溃计数`, 'Process');
      }
    }, 30000);

    // ── Exit handler ─────────────────────────────────────────────────────
    child.on('exit', (code, signal) => {
      clearTimeout(resetCrashTimer);
      const record = this.processes.get(moduleId);
      this.processes.delete(moduleId);
      stdoutStream.end();
      stderrStream.end();

      const isAbnormal = code !== 0 && code !== null;

      if (isAbnormal) {
        const newCrashCount = (record?.crashCount ?? 0) + 1;
        Logger.error(
          `模块 ${moduleId} 异常退出 (code=${code}, signal=${signal})，crash #${newCrashCount}`,
          'Process'
        );
        ConfigManager.setModuleStatus(moduleId, 'CRASHED', {
          pid: undefined,
          crashCount: newCrashCount,
          lastError: `Exit code: ${code}`,
        });
        this.emit({ moduleId, event: 'crashed', code, signal, timestamp: new Date().toISOString() });

        // Auto-restart logic
        const moduleRecord = ConfigManager.getModuleRecord(moduleId);
        const autoRestart = (moduleRecord?.config?.auto_restart as boolean | undefined) ?? false;
        if (autoRestart && newCrashCount <= MAX_CRASH_RESTARTS) {
          Logger.warn(
            `自动重启模块 ${moduleId} (${newCrashCount}/${MAX_CRASH_RESTARTS})...`,
            'Process'
          );
          setTimeout(() => this.startModule(moduleId), 3000);
        } else if (autoRestart && newCrashCount > MAX_CRASH_RESTARTS) {
          Logger.error(
            `模块 ${moduleId} 已超过最大重试次数 (${MAX_CRASH_RESTARTS})，停止自动重启。`,
            'Process'
          );
        }
      } else {
        Logger.info(`模块 ${moduleId} 正常退出 (code=${code})`, 'Process');
        ConfigManager.setModuleStatus(moduleId, 'STOPPED', { pid: undefined });
        this.emit({ moduleId, event: 'stopped', code, signal, timestamp: new Date().toISOString() });
      }
    });
  }

  // ── Stop ──────────────────────────────────────────────────────────────────

  /**
   * Gracefully stop a running module (SIGTERM → SIGKILL after timeout).
   */
  static async stopModule(moduleId: string, timeoutMs = 8000): Promise<void> {
    const record = this.processes.get(moduleId);
    if (!record) {
      // Check if there is an orphaned running process in settings/db
      const dbRecord = ConfigManager.getModuleRecord(moduleId);
      if (dbRecord?.status === 'RUNNING' && dbRecord.pid) {
        Logger.info(`正在停止孤立的模块进程 ${moduleId} (PID: ${dbRecord.pid})...`, 'Process');
        if (os.platform() === 'win32') {
          spawn('taskkill', ['/PID', String(dbRecord.pid), '/T'], { stdio: 'ignore' });
        } else {
          try {
            process.kill(-dbRecord.pid, 'SIGTERM');
          } catch {
            try {
              process.kill(dbRecord.pid, 'SIGTERM');
            } catch {}
          }
        }

        // Wait up to 2 seconds for graceful exit
        for (let i = 0; i < 20; i++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          try {
            process.kill(dbRecord.pid, 0);
          } catch {
            // Process exited
            break;
          }
        }

        // Force kill if still alive
        try {
          process.kill(dbRecord.pid, 0);
          Logger.warn(`模块 ${moduleId} 未响应 SIGTERM，发送 SIGKILL...`, 'Process');
          this.killProcessTree(dbRecord.pid);
        } catch {
          // Already exited
        }

        ConfigManager.setModuleStatus(moduleId, 'STOPPED', { pid: undefined });
        this.emit({ moduleId, event: 'stopped', timestamp: new Date().toISOString() });
        return;
      }

      Logger.warn(`模块 ${moduleId} 未在运行，无需停止。`, 'Process');
      return;
    }

    Logger.info(`正在停止模块 ${moduleId} (PID: ${record.pid})...`, 'Process');

    return new Promise((resolve) => {
      const { child, pid } = record;

      const timer = setTimeout(() => {
        Logger.warn(`模块 ${moduleId} 未响应 SIGTERM，发送 SIGKILL...`, 'Process');
        this.killProcessTree(pid);
        resolve();
      }, timeoutMs);

      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });

      // Send SIGTERM (or taskkill on Windows)
      if (os.platform() === 'win32') {
        spawn('taskkill', ['/PID', String(pid), '/T'], { stdio: 'ignore' });
      } else {
        try {
          process.kill(-pid, 'SIGTERM');
        } catch {
          child.kill('SIGTERM');
        }
      }
    });
  }

  /**
   * Forcefully kill a process tree (supports Windows taskkill).
   */
  private static killProcessTree(pid: number): void {
    try {
      if (os.platform() === 'win32') {
        spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        process.kill(-pid, 'SIGKILL');
      }
    } catch {
      // Process may have already exited
    }
  }

  // ── Status ────────────────────────────────────────────────────────────────

  static isRunning(moduleId: string): boolean {
    if (this.processes.has(moduleId)) return true;
    const record = ConfigManager.getModuleRecord(moduleId);
    if (record?.status === 'RUNNING' && record.pid) {
      try {
        process.kill(record.pid, 0);
        return true;
      } catch {
        // Stale process PID, clean up status
        ConfigManager.setModuleStatus(moduleId, 'STOPPED', { pid: undefined });
        return false;
      }
    }
    return false;
  }

  static getPid(moduleId: string): number | undefined {
    if (this.processes.has(moduleId)) {
      return this.processes.get(moduleId)?.pid;
    }
    const record = ConfigManager.getModuleRecord(moduleId);
    if (record?.status === 'RUNNING' && record.pid) {
      try {
        process.kill(record.pid, 0);
        return record.pid;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  static getAllRunning(): string[] {
    return Array.from(this.processes.keys());
  }

  // ── Stop all ──────────────────────────────────────────────────────────────

  static async stopAll(): Promise<void> {
    const ids = this.getAllRunning();
    Logger.info(`正在停止全部 ${ids.length} 个运行中的模块...`, 'Process');
    await Promise.all(ids.map((id) => this.stopModule(id)));
    Logger.success('所有模块已停止。', 'Process');
  }
}
