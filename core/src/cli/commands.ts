import { Command } from 'commander';
import { ModuleManager } from '../manager/module.js';
import { ProcessManager } from '../manager/process.js';
import { ConfigManager } from '../manager/config.js';
import { Logger } from '../manager/logger.js';
import { SystemManager } from '../manager/system.js';

// ── CLI entry ──────────────────────────────────────────────────────────────

export function buildCli(): Command {
  const program = new Command();

  program
    .name('lh')
    .description('LexHub — AI 应用管理器')
    .version('2.0.0');

  // ── status ────────────────────────────────────────────────────────────────
  program
    .command('status')
    .alias('ps')
    .description('查看所有服务状态')
    .action(() => {
      const modules = ModuleManager.scanInstalledModules();
      if (modules.length === 0) {
        console.log('暂无已安装的模块。');
        return;
      }
      console.log('\n=== LexHub 服务状态 ===\n');
      for (const mod of modules) {
        const icon =
          mod.status === 'RUNNING' ? '🟢' :
          mod.status === 'CRASHED' ? '🔴' :
          mod.status === 'INSTALLING' ? '🟡' : '⚪';
        const pid = mod.pid ? ` (PID: ${mod.pid})` : '';
        console.log(`  ${icon} ${mod.name.padEnd(20)} [${mod.status}]${pid}`);
      }
      console.log('');
    });

  // ── start ─────────────────────────────────────────────────────────────────
  program
    .command('start <module>')
    .description('启动模块')
    .action(async (moduleId: string) => {
      try {
        Logger.init();
        await ModuleManager.startModule(moduleId);
        console.log(`✔ 模块 ${moduleId} 已启动`);
      } catch (err) {
        console.error(`✘ 启动失败: ${err}`);
        process.exit(1);
      }
    });

  // ── stop ──────────────────────────────────────────────────────────────────
  program
    .command('stop [module]')
    .description('停止模块（不传则停止全部）')
    .action(async (moduleId?: string) => {
      Logger.init();
      if (moduleId) {
        await ModuleManager.stopModule(moduleId);
        console.log(`✔ 模块 ${moduleId} 已停止`);
      } else {
        await ProcessManager.stopAll();
        console.log('✔ 所有服务已停止');
      }
    });

  // ── restart ───────────────────────────────────────────────────────────────
  program
    .command('restart <module>')
    .description('重启模块')
    .action(async (moduleId: string) => {
      Logger.init();
      await ModuleManager.stopModule(moduleId);
      await ModuleManager.startModule(moduleId);
      console.log(`✔ 模块 ${moduleId} 已重启`);
    });

  // ── log ───────────────────────────────────────────────────────────────────
  program
    .command('log <module>')
    .description('查看模块日志')
    .option('-t, --type <type>', 'stdout | stderr', 'stdout')
    .option('-n, --lines <n>', '显示行数', '50')
    .action((moduleId: string, opts: { type: string; lines: string }) => {
      const logPaths = Logger.getModuleLogPaths(moduleId);
      const filePath = opts.type === 'stderr' ? logPaths.stderr : logPaths.stdout;
      const content = Logger.readTail(filePath, parseInt(opts.lines, 10));
      if (!content) {
        console.log(`暂无日志: ${filePath}`);
      } else {
        console.log(content);
      }
    });

  // ── web ───────────────────────────────────────────────────────────────────
  program
    .command('web')
    .description('启动 Web 管理面板')
    .action(async () => {
      const { startServer } = await import('../web/server.js');
      Logger.init();
      await startServer();
    });

  // ── install ───────────────────────────────────────────────────────────────
  program
    .command('install <module>')
    .description('安装模块')
    .action(async (moduleId: string) => {
      Logger.init();
      try {
        await ModuleManager.installModule(moduleId);
        console.log(`✔ 模块 ${moduleId} 安装完成`);
      } catch (err) {
        console.error(`✘ 安装失败: ${err}`);
        process.exit(1);
      }
    });

  // ── info ──────────────────────────────────────────────────────────────────
  program
    .command('info <module>')
    .description('查看模块详情')
    .action((moduleId: string) => {
      const mod = ModuleManager.getModuleById(moduleId);
      if (!mod) {
        console.error(`模块 ${moduleId} 不存在`);
        process.exit(1);
      }
      console.log(JSON.stringify(mod, null, 2));
    });

  // ── sysinfo ───────────────────────────────────────────────────────────────
  program
    .command('sysinfo')
    .description('查看系统信息')
    .action(() => {
      const metrics = SystemManager.getSystemMetrics();
      const mem = metrics.memory;
      console.log(`\n平台: ${metrics.platform} (${metrics.arch})`);
      console.log(`CPU: ${metrics.cpu.model} × ${metrics.cpu.cores}核  负载: ${metrics.cpu.load1m.toFixed(2)}`);
      console.log(`内存: ${toMB(mem.used)}MB / ${toMB(mem.total)}MB  (${mem.percentage}%)`);
      console.log(`运行时间: ${formatUptime(metrics.uptime)}\n`);
    });

  return program;
}

function toMB(bytes: number): number {
  return Math.round(bytes / 1024 / 1024);
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
