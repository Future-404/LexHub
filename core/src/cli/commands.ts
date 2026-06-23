import { Command } from 'commander';
import { ModuleManager } from '../manager/module.js';
import { ProcessManager } from '../manager/process.js';
import { ConfigManager } from '../manager/config.js';
import { Logger } from '../manager/logger.js';
import { SystemManager } from '../manager/system.js';

// ── CLI entry ──────────────────────────────────────────────────────────────

async function resolveOrHelp(input: string): Promise<string> {
  const id = await ModuleManager.resolveModuleId(input);
  if (!id) {
    console.error(`✘ 未找到应用 '${input}'。`);
    console.error(`提示：运行 'lh list' 查看已安装列表，或运行 'lh store' 浏览在线应用。`);
    console.error(`运行 'lh help' 查看系统命令帮助。`);
    process.exit(1);
  }
  return id;
}

export function buildCli(): Command {
  const program = new Command();

  program
    .name('lh')
    .description('LexHub — AI 应用管理器')
    .version('2.0.0');

  // ── list ──────────────────────────────────────────────────────────────────
  program
    .command('list')
    .alias('ls')
    .description('列出所有已安装的本地应用状态')
    .action(() => {
      const modules = ModuleManager.scanInstalledModules();
      if (modules.length === 0) {
        console.log('暂无已安装的应用。请使用 `lh store` 浏览应用。');
        return;
      }
      console.log('\n=== 已安装应用列表 ===\n');
      for (const mod of modules) {
        const icon =
          mod.status === 'RUNNING' ? '🟢' :
          mod.status === 'CRASHED' ? '🔴' :
          mod.status === 'INSTALLING' ? '🟡' : '⚪';
        const pid = mod.pid ? ` (PID: ${mod.pid})` : '';
        const aliases = mod.aliases && mod.aliases.length > 0 ? ` [${mod.aliases.join(', ')}]` : '';
        console.log(`  ${icon} ${mod.name} (${mod.id})${aliases} - ${mod.status}${pid}`);
      }
      console.log('');
    });

  // ── store ─────────────────────────────────────────────────────────────────
  program
    .command('store')
    .description('浏览云端应用商店')
    .action(async () => {
      const { NetworkManager } = await import('../manager/network.js');
      const settings = ConfigManager.loadSettings();
      console.log('正在获取应用商店列表...');
      try {
        const storeUrl = NetworkManager.getSmartUrl(settings.storeIndexUrl);
        const res = await NetworkManager.fetch(storeUrl);
        if (!res.ok) throw new Error('Store request failed');
        const storeModules = JSON.parse(await res.text()) as any[];
        console.log('\n=== 云端应用商店 ===\n');
        for (const mod of storeModules) {
          const aliases = mod.aliases && mod.aliases.length > 0 ? ` [缩写: ${mod.aliases.join(', ')}]` : '';
          console.log(`📦 ${mod.name} (ID: ${mod.id})${aliases}`);
          console.log(`   ${mod.description}\n`);
        }
      } catch (err) {
        console.error(`✘ 获取商店列表失败: ${err}`);
      }
    });

  // ── install ───────────────────────────────────────────────────────────────
  program
    .command('install <app>')
    .description('安装应用')
    .action(async (app: string) => {
      Logger.init();
      const id = await resolveOrHelp(app);
      try {
        await ModuleManager.installModule(id);
        console.log(`✔ 应用 ${id} 安装完成`);
      } catch (err) {
        console.error(`✘ 安装失败: ${err}`);
        process.exit(1);
      }
    });

  // ── uninstall ─────────────────────────────────────────────────────────────
  program
    .command('uninstall <app>')
    .alias('rm')
    .description('卸载应用')
    .action(async (app: string) => {
      Logger.init();
      const id = await resolveOrHelp(app);
      try {
        await ModuleManager.uninstallModule(id);
        console.log(`✔ 应用 ${id} 已卸载`);
      } catch (err) {
        console.error(`✘ 卸载失败: ${err}`);
        process.exit(1);
      }
    });

  // ── start ─────────────────────────────────────────────────────────────────
  program
    .command('start <app>')
    .description('启动应用')
    .action(async (app: string) => {
      Logger.init();
      const id = await resolveOrHelp(app);
      try {
        await ModuleManager.startModule(id);
        console.log(`✔ 应用 ${id} 已启动`);
      } catch (err) {
        console.error(`✘ 启动失败: ${err}`);
        process.exit(1);
      }
    });

  // ── stop ──────────────────────────────────────────────────────────────────
  program
    .command('stop <app>')
    .description('停止应用')
    .action(async (app: string) => {
      Logger.init();
      const id = await resolveOrHelp(app);
      await ModuleManager.stopModule(id);
      console.log(`✔ 应用 ${id} 已停止`);
    });

  // ── restart ───────────────────────────────────────────────────────────────
  program
    .command('restart <app>')
    .description('重启应用')
    .action(async (app: string) => {
      Logger.init();
      const id = await resolveOrHelp(app);
      await ModuleManager.stopModule(id);
      await ModuleManager.startModule(id);
      console.log(`✔ 应用 ${id} 已重启`);
    });

  // ── update ────────────────────────────────────────────────────────────────
  program
    .command('update <app>')
    .description('触发应用的更新逻辑 (如 git pull)')
    .action(async (app: string) => {
      Logger.init();
      const id = await resolveOrHelp(app);
      try {
        console.log(`正在更新应用 ${id}...`);
        await ModuleManager.callLifecycle(id, 'update');
        console.log(`✔ 应用 ${id} 更新完成`);
      } catch (err) {
        console.error(`✘ 更新应用失败: ${err}`);
        process.exit(1);
      }
    });

  // ── log ───────────────────────────────────────────────────────────────────
  program
    .command('log <app>')
    .description('查看应用日志')
    .option('-t, --type <type>', 'stdout | stderr', 'stdout')
    .option('-n, --lines <n>', '显示行数', '50')
    .action(async (app: string, opts: { type: string; lines: string }) => {
      const id = await resolveOrHelp(app);
      const logPaths = Logger.getModuleLogPaths(id);
      const filePath = opts.type === 'stderr' ? logPaths.stderr : logPaths.stdout;
      const content = Logger.readTail(filePath, parseInt(opts.lines, 10));
      if (!content) {
        console.log(`暂无日志: ${filePath}`);
      } else {
        console.log(content);
      }
    });

  // ── config ────────────────────────────────────────────────────────────────
  program
    .command('config <app>')
    .description('在终端快速修改应用配置')
    .action(async (app: string) => {
      const id = await resolveOrHelp(app);
      const info = ModuleManager.getModuleById(id);
      if (!info) {
         console.error('配置读取失败。');
         process.exit(1);
      }
      console.log(`=== ${info.name} 的当前配置 ===`);
      for (const [key, val] of Object.entries(info.config || {})) {
        console.log(`${key}: ${val}`);
      }
      console.log(`\n提示: 复杂的配置建议使用 Web 界面 (lh web) 修改。`);
    });

  // ── status ────────────────────────────────────────────────────────────────
  program
    .command('status')
    .alias('ps')
    .description('由于该命令由 lh 引导程序托管，仅做保留')
    .action(() => {
      // Unreachable mostly due to Go wrapper intercepting `status`
      console.log('请使用 lh list 查看应用状态。');
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

  // ── web ───────────────────────────────────────────────────────────────────
  program
    .command('web')
    .description('启动 Web 管理面板 (前台)')
    .action(async () => {
      const { startServer } = await import('../web/server.js');
      Logger.init();
      await startServer();
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
