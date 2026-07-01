import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export async function install(ctx) {
  const { paths, execCmd, logger, isTermux } = ctx;
  const { appDir } = paths;

  logger.info('正在安装 Clewd (Rust版)...');

  // Determine architecture and platform to choose correct release asset
  const arch = process.arch;
  
  let assetPattern = 'linux-x86_64';
  if (isTermux) {
    if (arch === 'arm64') {
      assetPattern = 'android-aarch64';
    } else if (arch === 'x64') {
      assetPattern = 'musllinux-x86_64';
    } else {
      assetPattern = 'musllinux-x86_64';
    }
  } else {
    if (arch === 'arm64') {
      assetPattern = 'linux-aarch64';
    } else {
      assetPattern = 'linux-x86_64';
    }
  }

  logger.info(`匹配的目标架构为: ${assetPattern}`);

  // Fetch release info from GitHub API
  const apiUrl = 'https://api.github.com/repos/Xerxes-2/clewdr/releases/latest';
  let releaseData;
  try {
    const response = await fetch(apiUrl, {
      headers: { 'User-Agent': 'LexHub-Agent' }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    releaseData = await response.json();
  } catch (err) {
    throw new Error(`请求 GitHub API 失败: ${err.message}`);
  }

  const asset = releaseData.assets.find(a => a.name.includes(assetPattern));
  if (!asset) {
    throw new Error(`找不到适配架构 ${assetPattern} 的发布包。`);
  }

  const downloadUrl = asset.browser_download_url;
  logger.info(`正在下载: ${downloadUrl}`);

  const tmpZip = path.join(appDir, '..', 'clewdr_temp.zip');
  fs.mkdirSync(appDir, { recursive: true });

  // Use curl to download the file
  await execCmd('curl', ['-L', '-o', tmpZip, downloadUrl]);

  logger.info('下载完成，正在解压...');
  await execCmd('unzip', ['-o', '-d', appDir, tmpZip]);

  // Cleanup temp zip
  if (fs.existsSync(tmpZip)) {
    fs.unlinkSync(tmpZip);
  }

  // Find the binary file and make sure it is at the root of appDir
  let binaryPath = path.join(appDir, 'clewdr');
  if (!fs.existsSync(binaryPath)) {
    // If nested in a subfolder, search and move it
    const files = fs.readdirSync(appDir, { recursive: true });
    const found = files.find(f => path.basename(f) === 'clewdr' && fs.statSync(path.join(appDir, f)).isFile());
    if (found) {
      fs.renameSync(path.join(appDir, found), binaryPath);
    }
  }

  if (fs.existsSync(binaryPath)) {
    fs.chmodSync(binaryPath, '755');
    logger.success('ClewdR 安装成功！');
  } else {
    throw new Error('未找到编译完成的 clewdr 二进制文件。');
  }
}

export async function start(ctx) {
  const { paths, config, spawnCmd, logger } = ctx;
  const { appDir } = paths;

  const binaryPath = path.join(appDir, 'clewdr');
  if (!fs.existsSync(binaryPath)) {
    throw new Error('ClewdR 程序未安装，请先安装模块。');
  }

  const port = config.PORT || 8444;
  logger.info(`启动 ClewdR 服务，监听端口: ${port}`);

  return spawnCmd(binaryPath, [], {
    cwd: appDir,
    env: {
      ...process.env,
      PORT: String(port)
    }
  });
}

export async function stop(ctx) {
  const { logger } = ctx;
  logger.info('停止 ClewdR 服务...');
}
