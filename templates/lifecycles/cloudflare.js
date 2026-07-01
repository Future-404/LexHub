import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';

export async function install(ctx) {
  const { paths, logger, execCmd } = ctx;
  const platform = process.platform;

  if (platform === 'android' || process.env.PREFIX?.includes('com.termux')) {
    logger.info('正在检测 Termux 环境下的 cloudflared...');
    try {
      await execCmd('command', ['-v', 'cloudflared']);
      logger.success('cloudflared (Termux) 依赖已就绪。');
    } catch {
      logger.info('正在通过 pkg 安装 cloudflared...');
      await execCmd('pkg', ['install', 'cloudflared', '-y']);
      logger.success('cloudflared (Termux) 安装完成。');
    }
    return;
  }

  const ext = platform === 'win32' ? '.exe' : '';
  const binPath = path.join(paths.appDir, 'bin', `cloudflared${ext}`);

  if (fs.existsSync(binPath)) {
    logger.success('cloudflared 引擎依赖已就绪。');
  } else {
    throw new Error('未检测到 cloudflared 引擎依赖，请使用 Go 引导程序重新安装或配置系统依赖。');
  }
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
  
  const platform = process.platform;
  let binExists = false;
  if (platform === 'android' || process.env.PREFIX?.includes('com.termux')) {
    binExists = true;
  } else {
    const ext = platform === 'win32' ? '.exe' : '';
    const binPath = path.join(ctx.paths.appDir, 'bin', `cloudflared${ext}`);
    binExists = fs.existsSync(binPath);
  }

  return { ok: true, exists, binExists };
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
