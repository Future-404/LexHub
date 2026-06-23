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
  await startServer();
}

bootstrap().catch((err) => {
  console.error('致命错误:', err);
  process.exit(1);
});
