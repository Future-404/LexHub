import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export async function install(ctx) {
  const { paths, execCmd, logger, network, isTermux } = ctx;
  const { appDir } = paths;

  logger.info('正在安装 CLIProxyAPI...');

  // 1. Check/Install Golang
  try {
    execSync('go version', { stdio: 'ignore' });
  } catch {
    logger.warn('未检测到 Go 语言环境，尝试自动安装 golang...');
    if (isTermux) {
      await execCmd('pkg', ['install', '-y', 'golang']);
    } else {
      await execCmd('apt-get', ['update']);
      await execCmd('apt-get', ['install', '-y', 'golang']);
    }
  }

  // 2. Clone repository
  if (fs.existsSync(appDir)) {
    logger.info('代码目录已存在，跳过克隆，直接重新编译');
  } else {
    logger.info('从 GitHub 克隆 CLIProxyAPI 仓库...');
    const gitArgs = network.buildGitCloneArgs('https://github.com/router-for-me/CLIProxyAPI.git', appDir);
    await execCmd(gitArgs.cmd, gitArgs.args);
  }

  // 3. Compile binary
  const goArch = process.arch === 'x64' ? 'amd64' : (process.arch === 'arm64' ? 'arm64' : process.arch);
  logger.info(`正在编译 Go 二进制文件 (cli-proxy-api, target: linux/${goArch})...`);
  await execCmd('go', ['build', '-ldflags=-s -w', '-o', 'cli-proxy-api', './cmd/server'], {
    cwd: appDir,
    env: {
      ...process.env,
      CGO_ENABLED: '0',
      GOOS: 'linux',
      GOARCH: goArch
    }
  });

  const binPath = path.join(appDir, 'cli-proxy-api');
  if (fs.existsSync(binPath)) {
    fs.chmodSync(binPath, '755');
    logger.success('编译成功！');
  } else {
    throw new Error('未找到编译完成的 cli-proxy-api 二进制文件。');
  }

  // 4. Initialize config
  const configExample = path.join(appDir, 'config.example.yaml');
  const configPath = path.join(appDir, 'config.yaml');
  if (fs.existsSync(configExample) && !fs.existsSync(configPath)) {
    logger.info('初始化默认配置文件 config.yaml...');
    let configContent = fs.readFileSync(configExample, 'utf8');

    configContent = configContent.replace(/allow-remote:\s*false/g, 'allow-remote: true');
    configContent = configContent.replace(/secret-key:\s*".*"/g, 'secret-key: "admin123"');
    configContent = configContent.replace(/disable-control-panel:\s*true/g, 'disable-control-panel: false');

    fs.writeFileSync(configPath, configContent, 'utf8');
    logger.success('配置文件初始化完成！(默认管理密钥: admin123)');
  }
}

export async function start(ctx) {
  const { paths, config, spawnCmd, logger } = ctx;
  const { appDir } = paths;

  const binPath = path.join(appDir, 'cli-proxy-api');
  if (!fs.existsSync(binPath)) {
    throw new Error('CLIProxyAPI 未安装或未编译，请先安装模块。');
  }

  const port = config.PORT || 8317;
  logger.info(`启动 CLIProxyAPI 代理，监听端口: ${port}`);

  const configPath = path.join(appDir, 'config.yaml');
  if (fs.existsSync(configPath)) {
    let configContent = fs.readFileSync(configPath, 'utf8');
    configContent = configContent.replace(/^port:\s*\d+/m, `port: ${port}`);
    fs.writeFileSync(configPath, configContent, 'utf8');
  }

  return spawnCmd('./cli-proxy-api', [], {
    cwd: appDir
  });
}

export async function stop(ctx) {
  const { logger } = ctx;
  logger.info('停止 CLIProxyAPI 代理...');
}
