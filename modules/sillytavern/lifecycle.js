import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import YAML from 'yaml';

// ── Helpers ─────────────────────────────────────────────────────────────────

function loadYaml(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return YAML.parse(fs.readFileSync(filePath, 'utf8')) || {};
    }
  } catch {
    // fallback
  }
  return {};
}

function saveYaml(filePath, obj) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, YAML.stringify(obj), 'utf8');
  fs.renameSync(tmp, filePath);
}

function getNestedValue(obj, keyPath) {
  return keyPath.split('.').reduce((acc, key) => acc?.[key], obj);
}

function setNestedValue(obj, keyPath, value) {
  const keys = keyPath.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

// ── Install ──────────────────────────────────────────────────────────────────

export async function install(ctx) {
  const { paths, execCmd, logger, network } = ctx;
  const { appDir } = paths;

  logger.info('正在拉取 SillyTavern 源码 (release 分支)...');

  let wasCreated = false;
  try {
    if (fs.existsSync(appDir)) {
      logger.warn('目录已存在，跳过克隆，直接安装依赖');
    } else {
      wasCreated = true;
      const gitArgs = network.buildGitCloneArgs(
        'https://github.com/SillyTavern/SillyTavern.git',
        appDir,
        'release'
      );
      await execCmd(gitArgs.cmd, gitArgs.args);
      logger.success('源码拉取完成');
    }

    logger.info('正在安装 NPM 依赖...');
    await execCmd('npm', ['install', '--no-audit', '--no-fund'], { cwd: appDir });
    logger.success('依赖安装完成！');

    // Apply recommended defaults
    await _applyRecommendedConfig(appDir, logger);
  } catch (err) {
    if (wasCreated && fs.existsSync(appDir)) {
      logger.warn('安装失败，正在清理残留的损坏目录...');
      fs.rmSync(appDir, { recursive: true, force: true });
    }
    throw err;
  }
}

// ── Start ────────────────────────────────────────────────────────────────────

export async function start(ctx) {
  const { paths, config, spawnCmd, logger } = ctx;
  const { appDir } = paths;

  if (!fs.existsSync(path.join(appDir, 'server.js'))) {
    throw new Error('SillyTavern server.js 未找到，请先安装模块');
  }

  const port = config.PORT || 8000;
  const listen = config.LISTEN || '0.0.0.0';
  const nodeMemory = config.NODE_MEMORY ? Number(config.NODE_MEMORY) : 0;

  logger.info(`启动 SillyTavern → ${listen}:${port}`);

  const nodeArgs = [];
  if (nodeMemory > 0) nodeArgs.push(`--max-old-space-size=${nodeMemory}`);
  nodeArgs.push('server.js');

  return spawnCmd('node', nodeArgs, {
    cwd: appDir,
    env: {
      ...process.env,
      PORT: String(port),
      LISTEN: listen,
    },
  });
}

export async function stop(ctx) {
  const { logger } = ctx;
  logger.info('正在准备停止服务...');
  // LexHub will handle SIGTERM after this hook completes.
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function update(ctx) {
  const { paths, execCmd, logger, network } = ctx;
  const { appDir } = paths;

  if (!fs.existsSync(path.join(appDir, '.git'))) {
    throw new Error('找不到 .git 目录，无法更新');
  }

  // Check if HEAD is detached (version-locked)
  try {
    execSync('git symbolic-ref HEAD', { cwd: appDir, stdio: 'pipe' });
  } catch {
    throw new Error('当前版本已锁定 (detached HEAD)，请先在版本管理中解锁再更新');
  }

  logger.info('正在拉取最新 release 代码...');
  const repoUrl = network.getSmartUrl('https://github.com/SillyTavern/SillyTavern.git');
  await execCmd('git', ['fetch', '--autostash', repoUrl, 'release'], { cwd: appDir });
  await execCmd('git', ['reset', '--hard', 'FETCH_HEAD'], { cwd: appDir });
  logger.success('代码更新完成');

  logger.info('正在同步 NPM 依赖...');
  await execCmd('npm', ['install', '--no-audit', '--no-fund'], { cwd: appDir });
  logger.success('更新完成！');
}

// ── Rollback / Version Management ─────────────────────────────────────────────

export async function getVersions(ctx) {
  const { paths } = ctx;
  const { appDir } = paths;

  if (!fs.existsSync(path.join(appDir, '.git'))) {
    return { current: null, isLocked: false, tags: [], channel: null };
  }

  let current = null;
  let isLocked = false;
  let channel = null;
  let tags = [];

  try {
    // Check for detached HEAD
    try {
      const branch = execSync('git symbolic-ref --short HEAD', { cwd: appDir, encoding: 'utf8', stdio: 'pipe' }).trim();
      channel = branch;
      isLocked = false;
      } catch {
        try {
          const tag = execSync('git describe --tags --exact-match', { cwd: appDir, encoding: 'utf8', stdio: 'pipe' }).trim();
          current = tag;
        } catch {
          const hash = execSync('git rev-parse --short HEAD', { cwd: appDir, encoding: 'utf8', stdio: 'pipe' }).trim();
          current = hash;
        }
        isLocked = true;
      }

      // Get available tags (last 20)
      try {
        const tagOutput = execSync('git tag --sort=-v:refname', {
          cwd: appDir, encoding: 'utf8', stdio: 'pipe'
        }).trim();
        tags = tagOutput ? tagOutput.split('\n').filter(Boolean).slice(0, 20) : [];
      } catch {
        tags = [];
      }

    if (!current) {
      try {
        current = execSync('git describe --tags --abbrev=0', { cwd: appDir, encoding: 'utf8', stdio: 'pipe' }).trim();
      } catch {
        current = execSync('git rev-parse --short HEAD', { cwd: appDir, encoding: 'utf8', stdio: 'pipe' }).trim();
      }
    }
  } catch (err) {
    // Ignore errors in git detection
  }

  return { current, isLocked, channel, tags };
}

export async function rollback(ctx, version) {
  const { paths, execCmd, logger } = ctx;
  const { appDir } = paths;

  if (!/^[a-zA-Z0-9._-]+$/.test(version)) {
    throw new Error('非法的版本号格式');
  }

  logger.info(`正在回退到版本: ${version}...`);
  await execCmd('git', ['fetch', '--depth=1', 'origin', `refs/tags/${version}:refs/tags/${version}`], { cwd: appDir });
  await execCmd('git', ['checkout', version], { cwd: appDir });
  logger.success(`已锁定版本: ${version}`);

  logger.info('同步依赖...');
  await execCmd('npm', ['install', '--no-audit', '--no-fund'], { cwd: appDir });
  logger.success('回退完成！需要重启服务生效。');
}

export async function switchChannel(ctx, channel) {
  const { paths, execCmd, logger, network } = ctx;
  const { appDir } = paths;

  logger.info(`正在切换到 ${channel} 通道...`);
  const repoUrl = network.getSmartUrl('https://github.com/SillyTavern/SillyTavern.git');
  await execCmd('git', ['fetch', '--depth=1', repoUrl, channel], { cwd: appDir });
  await execCmd('git', ['checkout', channel], { cwd: appDir });
  await execCmd('git', ['reset', '--hard', 'FETCH_HEAD'], { cwd: appDir });

  logger.info('同步依赖...');
  await execCmd('npm', ['install', '--no-audit', '--no-fund'], { cwd: appDir });
  logger.success(`已切换到 ${channel} 通道！`);
}

export async function unlock(ctx) {
  const { paths, execCmd, logger, network } = ctx;
  const { appDir } = paths;

  logger.info('正在解锁版本，切换回 release 通道...');
  const repoUrl = network.getSmartUrl('https://github.com/SillyTavern/SillyTavern.git');
  await execCmd('git', ['fetch', '--depth=1', repoUrl, 'release'], { cwd: appDir });
  await execCmd('git', ['checkout', 'release'], { cwd: appDir });
  await execCmd('git', ['reset', '--hard', 'FETCH_HEAD'], { cwd: appDir });
  logger.success('版本已解锁，切换到最新 release！');
}

// ── Backup / Restore ──────────────────────────────────────────────────────────

export async function backup(ctx) {
  const { paths, execCmd, logger } = ctx;
  const { appDir } = paths;
  const os = await import('os');

  const backupDir = path.join(os.default.homedir(), 'LexHub_Backup');
  fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const filename = `LexHub_Backup_SillyTavern_${timestamp}.tar.gz`;
  const outPath = path.join(backupDir, filename);

  // Determine which directories exist to back up
  const targets = [];
  const dataDir = path.join(appDir, 'data');
  const secretsFile = path.join(appDir, 'secrets.json');
  const pluginsDir = path.join(appDir, 'plugins');
  const extDir = path.join(appDir, 'public', 'scripts', 'extensions', 'third-party');

  if (fs.existsSync(dataDir)) targets.push('data');
  if (fs.existsSync(secretsFile)) targets.push('secrets.json');
  if (fs.existsSync(pluginsDir)) targets.push('plugins');
  if (fs.existsSync(extDir)) targets.push('public/scripts/extensions/third-party');

  if (targets.length === 0) throw new Error('没有可备份的数据目录');

  logger.info(`正在备份 ${targets.length} 个目录...`);
  // Use a relative path output to avoid Windows drive letters/colon bugs in tar
  const relativeOutName = `./${filename}`;
  await execCmd('tar', ['-czf', relativeOutName, ...targets], { cwd: appDir });

  // Move the archive to the final backup directory (handles cross-device moves cleanly)
  const localFile = path.join(appDir, filename);
  fs.copyFileSync(localFile, outPath);
  fs.unlinkSync(localFile);

  logger.success(`备份完成: ${outPath}`);

  return { path: outPath, filename };
}

export async function listBackups(ctx) {
  const os = await import('os');
  const backupDir = path.join(os.default.homedir(), 'LexHub_Backup');
  if (!fs.existsSync(backupDir)) return [];

  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.tar.gz') && (f.startsWith('LexHub_Backup_SillyTavern') || f.startsWith('TAVX_Backup_') || f.startsWith('ST_Data_')))
    .map(f => {
      const fullPath = path.join(backupDir, f);
      const stat = fs.statSync(fullPath);
      return { filename: f, path: fullPath, size: stat.size, mtime: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.mtime) - new Date(a.mtime));

  return files;
}

export async function restore(ctx, backupPath) {
  const { paths, execCmd, logger } = ctx;
  const { appDir } = paths;

  if (!fs.existsSync(backupPath)) throw new Error(`备份文件不存在: ${backupPath}`);

  const tmpDir = path.join(appDir, '_restore_tmp');
  fs.mkdirSync(tmpDir, { recursive: true });

  const tmpBackupName = `_restore_backup.tar.gz`;
  const tmpBackupPath = path.join(appDir, tmpBackupName);

  // Copy archive file locally to avoid Windows drive letter colon parsing bug in tar
  fs.copyFileSync(backupPath, tmpBackupPath);

  try {
    logger.info('正在解压备份...');
    await execCmd('tar', ['-xzf', tmpBackupName, '-C', '_restore_tmp'], { cwd: appDir });

    // Atomic restore for data/ directory
    const restoredData = path.join(tmpDir, 'data');
    if (fs.existsSync(restoredData)) {
      const liveData = path.join(appDir, 'data');
      const oldData = path.join(appDir, 'data_old_bak');

      if (fs.existsSync(liveData)) {
        fs.renameSync(liveData, oldData);
      }

      try {
        fs.cpSync(restoredData, liveData, { recursive: true });
        if (fs.existsSync(oldData)) fs.rmSync(oldData, { recursive: true });
        logger.success('对话数据恢复成功');
      } catch (err) {
        // Rollback
        if (fs.existsSync(liveData)) fs.rmSync(liveData, { recursive: true });
        if (fs.existsSync(oldData)) fs.renameSync(oldData, liveData);
        throw new Error(`data/ 恢复失败 (已自动回滚): ${err}`);
      }
    }

    // Restore other items (non-atomic)
    const others = ['secrets.json', 'plugins', 'public/scripts/extensions/third-party'];
    for (const item of others) {
      const src = path.join(tmpDir, item);
      const dst = path.join(appDir, item);
      if (fs.existsSync(src)) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.cpSync(src, dst, { recursive: true });
        logger.info(`已恢复: ${item}`);
      }
    }

    logger.success('恢复完成！请重启服务使更改生效。');
  } finally {
    if (fs.existsSync(tmpBackupPath)) fs.unlinkSync(tmpBackupPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── App Config (config.yaml) ───────────────────────────────────────────────────

export async function readAppConfig(ctx) {
  const { paths } = ctx;
  const configPath = path.join(paths.appDir, 'config.yaml');
  if (!fs.existsSync(configPath)) return {};
  return await loadYaml(configPath);
}

export async function writeAppConfig(ctx, patch) {
  const { paths, logger } = ctx;
  const configPath = path.join(paths.appDir, 'config.yaml');
  const current = await loadYaml(configPath);

  for (const [key, value] of Object.entries(patch)) {
    setNestedValue(current, key, value);
  }

  await saveYaml(configPath, current);
  logger.success('SillyTavern 配置已保存');
}

export async function resetAppConfig(ctx) {
  const { paths, logger } = ctx;
  const configPath = path.join(paths.appDir, 'config.yaml');
  if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
  logger.success('配置已重置为默认值，重启服务生效');
}

export async function resetPassword(ctx, username, password) {
  const { paths, execCmd, logger } = ctx;
  const recoverScript = path.join(paths.appDir, 'recover.js');
  if (!fs.existsSync(recoverScript)) throw new Error('recover.js 不存在');
  await execCmd('node', ['recover.js', username || 'default-user', password], { cwd: paths.appDir });
  logger.success(`用户 ${username || 'default-user'} 的密码已重置`);
}

// ── Plugin Management ──────────────────────────────────────────────────────────

const PLUGIN_CATALOG = [
  { id: 'dialogue-colorizer', name: '对话文本着色', repo: 'https://github.com/knifeayumu/SillyTavern-Dialogue-Colorizer.git', serverBranch: null, clientBranch: 'HEAD', dir: 'SillyTavern-Dialogue-Colorizer' },
  { id: 'top-info-bar', name: '顶部信息栏', repo: 'https://github.com/Bronya-Rand/Extension-TopInfoBar.git', serverBranch: null, clientBranch: 'HEAD', dir: 'Extension-TopInfoBar' },
  { id: 'custom-models', name: '自定义模型列表', repo: 'https://github.com/SillyTavern/SillyTavern-CustomModels.git', serverBranch: null, clientBranch: 'HEAD', dir: 'SillyTavern-CustomModels' },
  { id: 'chat-stats', name: '聊天统计面板', repo: 'https://github.com/Qlitre/chat-companion-stats.git', serverBranch: null, clientBranch: 'HEAD', dir: 'chat-companion-stats' },
  { id: 'quick-reply', name: '快速回复', repo: 'https://github.com/sillylossy/SillyTavern-QuickReply.git', serverBranch: null, clientBranch: 'HEAD', dir: 'QR' },
  { id: 'input-helper', name: '输入辅助助手', repo: 'https://github.com/Bronya-Rand/st-input-helper.git', serverBranch: null, clientBranch: 'HEAD', dir: 'st-input-helper' },
  { id: 'prompt-template', name: '提示词模板管理', repo: 'https://github.com/liriliri/ST-Prompt-Template.git', serverBranch: null, clientBranch: 'HEAD', dir: 'ST-Prompt-Template' },
  { id: 'message-star', name: '消息收藏/星标', repo: 'https://github.com/Bronya-Rand/Extension-Star.git', serverBranch: null, clientBranch: 'HEAD', dir: 'star' },
  { id: 'memory-enhancement', name: '记忆增强扩展', repo: 'https://github.com/ziv-dl/st-memory-enhancement.git', serverBranch: 'HEAD', clientBranch: null, dir: 'st-memory-enhancement' },
  { id: 'message-limit', name: '上下文消息限制', repo: 'https://github.com/Bronya-Rand/Extension-MessageLimit.git', serverBranch: null, clientBranch: 'HEAD', dir: 'Extension-MessageLimit' },
  { id: 'frontend-tokenizer', name: '前端 Token 计数', repo: 'https://github.com/liriliri/ST-Frontend-Tokenizer.git', serverBranch: null, clientBranch: 'HEAD', dir: 'ST-Frontend-Tokenizer' },
  { id: 'preset-manager-momo', name: '预设管理器 Momo', repo: 'https://github.com/momoexe/preset-manager-momo.git', serverBranch: null, clientBranch: 'HEAD', dir: 'preset-manager-momo' },
  { id: 'js-slash-runner', name: '酒馆助手', repo: 'https://github.com/N-Syst/JS-Slash-Runner.git', serverBranch: null, clientBranch: 'HEAD', dir: 'JS-Slash-Runner' },
  { id: 'chat-history-backup', name: '聊天记录备份', repo: 'https://github.com/corbt/chat-history-backup.git', serverBranch: null, clientBranch: 'HEAD', dir: 'chat-history-backup' },
  { id: 'extension-silence', name: '静音/停止生成', repo: 'https://github.com/Bronya-Rand/Extension-Silence.git', serverBranch: null, clientBranch: 'HEAD', dir: 'Extension-Silence' },
  { id: 'quick-persona', name: '快捷人格切换', repo: 'https://github.com/Bronya-Rand/Extension-QuickPersona.git', serverBranch: null, clientBranch: 'HEAD', dir: 'Extension-QuickPersona' },
];

export function getPluginCatalog(ctx) {
  const { paths } = ctx;
  const { appDir } = paths;

  return PLUGIN_CATALOG.map(p => {
    const serverPath = path.join(appDir, 'plugins', p.dir);
    const clientPath = path.join(appDir, 'public', 'scripts', 'extensions', 'third-party', p.dir);
    const isInstalled = (p.serverBranch && fs.existsSync(serverPath)) ||
                        (p.clientBranch && fs.existsSync(clientPath));
    return { ...p, isInstalled };
  });
}

export async function installPlugin(ctx, pluginId) {
  const { paths, execCmd, logger, network } = ctx;
  const { appDir } = paths;

  const plugin = PLUGIN_CATALOG.find(p => p.id === pluginId);
  if (!plugin) throw new Error(`插件 ${pluginId} 不在目录中`);

  // Security: validate dir name
  if (/[./\\]/.test(plugin.dir)) throw new Error(`插件目录名不合法: ${plugin.dir}`);

  const repoUrl = network.getSmartUrl(plugin.repo);
  logger.info(`正在安装插件: ${plugin.name}...`);

  if (plugin.serverBranch) {
    const dest = path.join(appDir, 'plugins', plugin.dir);
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
    const args = network.buildGitCloneArgs(plugin.repo, dest, plugin.serverBranch === 'HEAD' ? undefined : plugin.serverBranch);
    await execCmd(args.cmd, args.args);
    // Install plugin npm deps if needed
    const pkgJson = path.join(dest, 'package.json');
    if (fs.existsSync(pkgJson)) {
      await execCmd('npm', ['install', '--no-audit', '--no-fund'], { cwd: dest });
    }
  }

  if (plugin.clientBranch) {
    const dest = path.join(appDir, 'public', 'scripts', 'extensions', 'third-party', plugin.dir);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
    const args = network.buildGitCloneArgs(plugin.repo, dest, plugin.clientBranch === 'HEAD' ? undefined : plugin.clientBranch);
    await execCmd(args.cmd, args.args);
    const pkgJson = path.join(dest, 'package.json');
    if (fs.existsSync(pkgJson)) {
      await execCmd('npm', ['install', '--no-audit', '--no-fund'], { cwd: dest });
    }
  }

  logger.success(`插件 ${plugin.name} 安装完成！重启服务后生效。`);
}

export async function uninstallPlugin(ctx, pluginId) {
  const { paths, logger } = ctx;
  const { appDir } = paths;

  const plugin = PLUGIN_CATALOG.find(p => p.id === pluginId);
  if (!plugin) throw new Error(`插件 ${pluginId} 不在目录中`);

  const serverPath = path.join(appDir, 'plugins', plugin.dir);
  const clientPath = path.join(appDir, 'public', 'scripts', 'extensions', 'third-party', plugin.dir);

  if (fs.existsSync(serverPath)) fs.rmSync(serverPath, { recursive: true });
  if (fs.existsSync(clientPath)) fs.rmSync(clientPath, { recursive: true });

  logger.success(`插件 ${plugin.name} 已删除`);
}

export async function resetAllPlugins(ctx) {
  const { paths, logger } = ctx;
  const extDir = path.join(paths.appDir, 'public', 'scripts', 'extensions', 'third-party');
  if (fs.existsSync(extDir)) {
    fs.rmSync(extDir, { recursive: true });
    fs.mkdirSync(extDir, { recursive: true });
  }
  logger.success('所有第三方扩展已清除！请重启服务。');
}

// ── Internal helpers ─────────────────────────────────────────────────────────

async function _applyRecommendedConfig(appDir, logger) {
  const configPath = path.join(appDir, 'config.yaml');
  try {
    const config = await loadYaml(configPath) || {};
    if (!config.extensions) config.extensions = {};
    config.extensions.enabled = true;
    config.enableServerPlugins = true;
    if (!config.performance) config.performance = {};
    config.performance.useDiskCache = false;
    await saveYaml(configPath, config);
    logger.info('已应用推荐配置（插件启用，磁盘缓存关闭）');
  } catch {
    logger.warn('推荐配置写入失败，请安装完成后手动配置');
  }
}
