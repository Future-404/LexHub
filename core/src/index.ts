import { Logger } from './manager/logger.js';
import { ConfigManager } from './manager/config.js';
import { buildCli } from './cli/commands.js';
import { startServer } from './web/server.js';

async function bootstrap(): Promise<void> {
  // 1. Init directories and config files
  Logger.init();
  ConfigManager.init();

  const { NetworkManager } = await import('./manager/network.js');
  NetworkManager.init();

  const { ModuleManager } = await import('./manager/module.js');
  ModuleManager.initBuiltInModules();

  Logger.info('LexHub v2.0 启动中...', 'Bootstrap');

  const args = process.argv.slice(2);

  // 2. If CLI arguments are provided, delegate to commander
  if (args.length > 0) {
    const cli = buildCli();
    await cli.parseAsync(process.argv);
    return;
  }

  // 3. No arguments: default to launching the web server
  const settings = ConfigManager.loadSettings();
  Logger.info(`启动 Web 管理面板 (端口: ${settings.webPort})...`, 'Bootstrap');

  if (settings.autoStartModules && settings.autoStartModules.length > 0) {
    const { ModuleManager } = await import('./manager/module.js');
    Logger.info(`正在拉起自启模块: ${settings.autoStartModules.join(', ')}`, 'Bootstrap');
    for (const modId of settings.autoStartModules) {
      ModuleManager.startModule(modId).catch(err => {
        Logger.error(`自启模块 ${modId} 失败: ${err}`, 'Bootstrap');
      });
    }
  }

  await startServer();
}

bootstrap().catch((err) => {
  console.error('致命错误:', err);
  process.exit(1);
});
