import fs from 'fs';
import path from 'path';

export async function install(ctx) {
  const { paths, execCmd, logger, network, isTermux } = ctx;
  const { appDir } = paths;

  logger.info('正在安装 GCLI2API...');

  // 1. Clone repository
  if (fs.existsSync(appDir)) {
    logger.info('代码目录已存在，跳过克隆，直接安装依赖');
  } else {
    logger.info('从 GitHub 克隆 GCLI2API 仓库...');
    const gitArgs = network.buildGitCloneArgs('https://github.com/su-kaka/gcli2api.git', appDir, 'master');
    await execCmd(gitArgs.cmd, gitArgs.args);
  }

  // 2. Create python virtualenv
  const venvDir = path.join(appDir, 'venv');
  if (!fs.existsSync(venvDir)) {
    logger.info('正在创建 Python 虚拟环境 (venv)...');
    await execCmd('python3', ['-m', 'venv', 'venv'], { cwd: appDir });
  }

  // 3. Install requirements
  let reqFile = 'requirements.txt';
  if (isTermux && fs.existsSync(path.join(appDir, 'requirements-termux.txt'))) {
    logger.info('检测到 Termux 专用依赖，自动加载优化依赖列表...');
    reqFile = 'requirements-termux.txt';
  }

  const pipPath = path.join(venvDir, 'bin', 'pip');
  logger.info(`正在通过 pip 安装模块依赖 (使用 ${reqFile})...`);
  await execCmd(pipPath, ['install', '-i', 'https://pypi.tuna.tsinghua.edu.cn/simple', '-r', reqFile], { cwd: appDir });

  logger.success('GCLI2API 部署完成！');
}

export async function start(ctx) {
  const { paths, config, spawnCmd, logger } = ctx;
  const { appDir } = paths;

  const pythonPath = path.join(appDir, 'venv', 'bin', 'python');
  if (!fs.existsSync(pythonPath)) {
    throw new Error('GCLI2API 虚拟环境未初始化，请先安装模块。');
  }

  const port = config.PORT || 7861;
  const password = config.PASSWORD || 'pwd';
  const host = config.HOST || '0.0.0.0';

  logger.info(`启动 GCLI2API，监听端口: ${port}`);

  return spawnCmd(pythonPath, ['web.py'], {
    cwd: appDir,
    env: {
      ...process.env,
      PORT: String(port),
      PASSWORD: password,
      HOST: host
    }
  });
}

export async function stop(ctx) {
  const { logger } = ctx;
  logger.info('停止 GCLI2API 服务...');
}
