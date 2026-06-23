import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';

export async function install(ctx) {
  const { paths, logger, network, execCmd } = ctx;
  const binDir = path.join(paths.appDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  const platform = process.platform;
  const arch = process.arch;

  // Termux fallback
  if (platform === 'android' || process.env.PREFIX?.includes('com.termux')) {
    logger.info('检测到 Termux 环境，正在通过 pkg 安装 cloudflared...');
    await execCmd('pkg', ['install', 'cloudflared', '-y']);
    logger.success('cloudflared (Termux) 安装完成。');
    return;
  }

  // OS Binary detection
  let dlPlatform = '';
  let dlArch = '';
  let ext = '';

  if (platform === 'win32') { 
    dlPlatform = 'windows'; 
    dlArch = arch === 'x64' ? 'amd64' : '386'; 
    ext = '.exe'; 
  } else if (platform === 'darwin') { 
    dlPlatform = 'darwin'; 
    dlArch = arch === 'x64' ? 'amd64' : 'arm64'; 
  } else {
    dlPlatform = 'linux';
    if (arch === 'x64') dlArch = 'amd64';
    else if (arch === 'arm64') dlArch = 'arm64';
    else if (arch === 'arm') dlArch = 'arm';
    else throw new Error(`不支持的架构: ${platform}-${arch}`);
  }

  const filename = `cloudflared-${dlPlatform}-${dlArch}${ext}`;
  const binName = `cloudflared${ext}`;
  const dest = path.join(binDir, binName);

  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${filename}`;
  const finalUrl = network.getSmartUrl(url);

  logger.info(`正在下载 cloudflared 二进制文件 (${filename})...`);
  
  const fetch = (await import('node-fetch')).default || global.fetch;
  const res = await fetch(finalUrl);
  if (!res.ok) throw new Error(`下载失败: ${res.status} ${res.statusText}`);
  
  const buffer = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buffer));
  fs.chmodSync(dest, 0o755);
  
  logger.success('cloudflared 二进制下载完成。');
}

function getCloudflaredPath(ctx) {
  const platform = process.platform;
  if (platform === 'android' || process.env.PREFIX?.includes('com.termux')) {
    return 'cloudflared'; // In PATH via pkg
  }
  const ext = platform === 'win32' ? '.exe' : '';
  return path.join(ctx.paths.appDir, 'bin', `cloudflared${ext}`);
}

export async function login(ctx) {
  const { paths } = ctx;
  const cfBin = getCloudflaredPath(ctx);
  const dataDir = path.join(paths.appDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const certPath = path.join(dataDir, 'cert.pem');
  if (fs.existsSync(certPath)) {
    return { ok: false, message: '已经存在授权凭证 (cert.pem)。请先在面板删除后再重新授权。' };
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(cfBin, ['tunnel', 'login'], { 
      env: { ...process.env, TUNNEL_ORIGIN_CERT: certPath } 
    });
    let urlFound = false;

    const handleOutput = (data) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-zA-Z0-9./?=_-]+/);
      if (match && !urlFound) {
        urlFound = true;
        resolve({ ok: true, url: match[0] });
      }
    };

    proc.stdout.on('data', handleOutput);
    proc.stderr.on('data', handleOutput);

    proc.on('close', (code) => {
      if (!urlFound) {
        resolve({ ok: false, message: '获取授权链接失败或用户已取消。' });
      }
    });
  });
}

export async function checkCert(ctx) {
  const certPath = path.join(ctx.paths.appDir, 'data', 'cert.pem');
  const exists = fs.existsSync(certPath);
  return { ok: true, exists };
}

export async function scanDownloadsForCert(ctx) {
  const certDest = path.join(ctx.paths.appDir, 'data', 'cert.pem');
  if (fs.existsSync(certDest)) return { ok: true, found: true };

  const homedir = os.homedir();
  const scanPaths = [
    path.join(homedir, 'storage/downloads'),
    path.join(homedir, 'downloads'),
    path.join(homedir, 'Downloads'),
    '/sdcard/Download'
  ];

  for (const dir of scanPaths) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      const certFiles = files.filter(f => f.startsWith('cert') && f.endsWith('.pem'));
      if (certFiles.length > 0) {
        certFiles.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
        const latest = certFiles[0];
        fs.copyFileSync(path.join(dir, latest), certDest);
        ctx.logger.success(`自动从 ${dir} 找到并导入了凭证 ${latest}`);
        return { ok: true, found: true };
      }
    } catch(e) {}
  }
  return { ok: true, found: false };
}

export async function quickTunnel(ctx, args) {
  const targetUrl = args?.targetUrl || 'http://127.0.0.1:8000';
  const cfBin = getCloudflaredPath(ctx);
  
  return new Promise((resolve) => {
    const proc = spawn(cfBin, ['tunnel', '--url', targetUrl, '--no-autoupdate'], { detached: true });
    fs.writeFileSync(path.join(ctx.paths.appDir, 'quick.pid'), String(proc.pid));

    let urlFound = false;
    proc.stderr.on('data', (data) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !urlFound) {
        urlFound = true;
        resolve({ ok: true, url: match[0] });
      }
    });

    proc.on('close', () => {
      if (!urlFound) resolve({ ok: false, message: '进程意外退出' });
    });

    proc.unref(); 
  });
}

export async function stopQuickTunnel(ctx) {
  const pidFile = path.join(ctx.paths.appDir, 'quick.pid');
  if (fs.existsSync(pidFile)) {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8'));
    try {
      process.kill(pid);
    } catch(e) {}
    fs.unlinkSync(pidFile);
  }
  return { ok: true };
}

export async function createGatewayTunnel(ctx) {
  const { paths } = ctx;
  const cfBin = getCloudflaredPath(ctx);
  const certPath = path.join(paths.appDir, 'data', 'cert.pem');
  if (!fs.existsSync(certPath)) return { ok: false, message: '请先完成账号授权' };

  return new Promise((resolve) => {
    const proc = spawn(cfBin, ['tunnel', 'create', 'lexhub-gateway'], { env: { ...process.env, TUNNEL_ORIGIN_CERT: certPath } });
    let output = '';
    proc.stdout.on('data', d => output += d.toString());
    proc.stderr.on('data', d => output += d.toString());
    proc.on('close', code => {
      if (code === 0 || output.includes('already exists') || output.includes('with this name already exists')) {
        resolve({ ok: true });
      } else {
        resolve({ ok: false, message: output });
      }
    });
  });
}

export async function routeDns(ctx, args) {
  const { hostname } = args;
  const cfBin = getCloudflaredPath(ctx);
  const certPath = path.join(ctx.paths.appDir, 'data', 'cert.pem');
  
  return new Promise((resolve) => {
    const proc = spawn(cfBin, ['tunnel', 'route', 'dns', 'lexhub-gateway', hostname], { env: { ...process.env, TUNNEL_ORIGIN_CERT: certPath } });
    let output = '';
    proc.stdout.on('data', d => output += d.toString());
    proc.stderr.on('data', d => output += d.toString());
    proc.on('close', code => {
      if (code === 0 || output.includes('already exists')) {
        resolve({ ok: true });
      } else {
        resolve({ ok: false, message: output });
      }
    });
  });
}

export async function startGatewayTunnel(ctx, args) {
  const { webPort } = args;
  const cfBin = getCloudflaredPath(ctx);
  const certPath = path.join(ctx.paths.appDir, 'data', 'cert.pem');

  const pidFile = path.join(ctx.paths.appDir, 'gateway.pid');
  if (fs.existsSync(pidFile)) {
    try { process.kill(parseInt(fs.readFileSync(pidFile, 'utf8'))); } catch(e){}
  }

  return new Promise((resolve) => {
    const proc = spawn(cfBin, ['tunnel', '--url', `http://127.0.0.1:${webPort}`, 'run', 'lexhub-gateway'], { 
      detached: true,
      env: { ...process.env, TUNNEL_ORIGIN_CERT: certPath } 
    });
    fs.writeFileSync(pidFile, String(proc.pid));

    setTimeout(() => {
      resolve({ ok: true });
    }, 1500);

    proc.unref(); 
  });
}

export async function stopGatewayTunnel(ctx) {
  const pidFile = path.join(ctx.paths.appDir, 'gateway.pid');
  if (fs.existsSync(pidFile)) {
    try { process.kill(parseInt(fs.readFileSync(pidFile, 'utf8'))); } catch(e){}
    fs.unlinkSync(pidFile);
  }
  return { ok: true };
}

export async function start(ctx) {
  ctx.logger.info('Cloudflare 核心模块已挂载，请在详情面板中管理网络隧道。');
  return spawn('node', ['-e', 'setInterval(() => {}, 3600000)'], { stdio: 'ignore' });
}

export async function stop(ctx) {
  // Do nothing
}
