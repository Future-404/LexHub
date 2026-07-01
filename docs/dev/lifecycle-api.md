# lifecycle.js — 上下文 API 参考

> **目标读者**：希望为 LexHub 编写自定义模块的开发者  
> **适用版本**：LexHub Core v2.0+

---

## 概述

每个 LexHub 模块的 `lifecycle.js` 文件会在以下场景被框架调用：

| 钩子函数 | 触发时机 |
|---|---|
| `install(ctx)` | 用户点击"安装"后 |
| `start(ctx)` | 用户点击"启动"后 |
| `stop(ctx)` | 用户点击"停止"后 |
| `update(ctx)` | 用户点击"更新"后 |
| `backup(ctx)` *(可选)* | 备份操作触发时 |
| `restore(ctx)` *(可选)* | 恢复操作触发时 |
| `routeDns(ctx, opts)` *(可选)* | DNS 路由配置时（Cloudflare 模块专用） |

框架在调用每个钩子时，会注入一个 **`ctx` 上下文对象**，包含当前模块的全部运行时信息和工具函数。

---

## ctx 上下文对象 API

### 平台与环境

```ts
ctx.isTermux: boolean
```

`true` 表示当前运行于 Termux（Android）环境，`false` 表示 VPS/Linux/Windows。  
由框架在 `buildContext` 阶段自动注入，模块代码**不需要**自行检测。

```js
// ✅ 正确用法
if (ctx.isTermux) {
  // Termux 专属逻辑
}

// ❌ 避免在 lifecycle.js 中重复检测平台
const isTermux = fs.existsSync('/data/data/com.termux'); // 不必要
```

---

### 模块元数据

```ts
ctx.module: ModuleMetadata
```

来自 `lexhub-module.json` 的完整模块定义，包含以下字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `ctx.module.id` | `string` | 模块唯一标识符（如 `"sillytavern"`） |
| `ctx.module.name` | `string` | 模块显示名称 |
| `ctx.module.version` | `string` | 模块版本号 |
| `ctx.module.repo_url` | `string` | 上游仓库 URL |
| `ctx.module.branch` | `string` | 默认分支（如 `"release"`） |
| `ctx.module.platforms` | `string[]` | 支持平台列表 |
| `ctx.module.env` | `Record` | 环境变量配置定义 |

---

### 用户配置

```ts
ctx.config: Record<string, string | number | boolean>
```

用户通过 Web UI 面板修改的配置项。键名对应 `lexhub-module.json` 中 `env` 字段定义的变量名。

```js
// 示例：读取用户配置的端口
const port = ctx.config.ST_PORT || 8000;
```

---

### 文件路径

```ts
ctx.paths: {
  moduleDir: string;  // 模块根目录（含 lexhub-module.json）
  appDir: string;     // 应用程序目录（moduleDir/app/）
  logsDir: string;    // 日志目录（LexHub 根目录/logs/）
}
```

```js
const appDir = ctx.paths.appDir;
// 例如：/root/.lexhub/modules/sillytavern/app
```

---

### 日志函数

```ts
ctx.logger: {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  success(msg: string): void;
}
```

日志会自动附加模块 ID 标记，并写入 LexHub 的统一日志文件。  
**请勿使用 `console.log`**，它不会被 LexHub 日志系统收集。

```js
// ✅ 正确
ctx.logger.info('SillyTavern 正在启动...');
ctx.logger.success('启动完成，端口: ' + port);
ctx.logger.error('启动失败: ' + err.message);

// ❌ 避免
console.log('启动了');
```

---

### 命令执行

#### execCmd — 同步等待命令

```ts
ctx.execCmd(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; env?: NodeJS.ProcessEnv }
): Promise<void>
```

以 `spawnSync` 方式执行命令，**等待完成后** resolve。适合安装步骤。  
内部自动注入代理环境变量（`HTTP_PROXY` 等）和平台二进制名称解析。

```js
// 安装 npm 依赖
await ctx.execCmd('npm', ['install', '--production'], { cwd: ctx.paths.appDir });
```

#### spawnCmd — 异步启动进程

```ts
ctx.spawnCmd(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; env?: NodeJS.ProcessEnv }
): ChildProcess
```

以 `spawn` 方式异步启动进程，**立即返回** `ChildProcess` 实例。适合 `start` 钩子中启动长期运行的服务。

```js
// start 钩子：启动服务并返回子进程
async function start(ctx) {
  const port = ctx.config.ST_PORT || 8000;
  const child = ctx.spawnCmd('node', ['server.js', '--port', String(port)], {
    cwd: ctx.paths.appDir
  });
  return child; // 必须返回 ChildProcess，LexHub 用它来监控和管理进程
}
```

> **重要**：`start` 钩子**必须返回** `ChildProcess` 实例。LexHub 进程管理器依赖此实例进行进程监控、崩溃检测和自动重启。

---

### 网络工具

```ts
ctx.network: {
  getSmartUrl(url: string): string;
  buildGitCloneArgs(repoUrl: string, targetDir: string, branch?: string): string[];
}
```

#### getSmartUrl

根据当前网络状态和镜像配置，将原始 URL 转换为最优访问地址。

```js
// 如果用户配置了镜像，会自动替换为镜像地址
const cloneUrl = ctx.network.getSmartUrl(ctx.module.repo_url);
```

#### buildGitCloneArgs

生成经过镜像优化的 `git clone` 参数数组。

```js
const args = ctx.network.buildGitCloneArgs(ctx.module.repo_url, ctx.paths.appDir, 'release');
await ctx.execCmd('git', args);
// 等价于: git clone --depth=1 --branch release <mirror-url> <appDir>
```

---

### 进程管理

```ts
ctx.killProcess(): Promise<void>
ctx.checkProcessActive(): boolean
```

| 函数 | 说明 |
|---|---|
| `ctx.killProcess()` | 停止当前模块进程（通常在 `stop` 钩子中由框架自动调用） |
| `ctx.checkProcessActive()` | 检查当前模块进程是否在运行 |

---

## 完整 lifecycle.js 示例

```js
'use strict';

/**
 * 安装钩子 — 克隆仓库，安装依赖
 */
async function install(ctx) {
  ctx.logger.info('开始安装...');
  
  const args = ctx.network.buildGitCloneArgs(ctx.module.repo_url, ctx.paths.appDir, ctx.module.branch);
  await ctx.execCmd('git', args);
  
  await ctx.execCmd('npm', ['install', '--production'], { cwd: ctx.paths.appDir });
  
  ctx.logger.success('安装完成');
}

/**
 * 启动钩子 — 必须返回 ChildProcess
 */
async function start(ctx) {
  const port = ctx.config.PORT || 8080;
  
  ctx.logger.info(`正在启动，端口: ${port}...`);
  
  const env = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'production',
  };
  
  // Termux 可能需要特殊处理
  if (ctx.isTermux) {
    env.HOME = process.env.HOME || '/data/data/com.termux/files/home';
  }
  
  const child = ctx.spawnCmd('node', ['server.js'], {
    cwd: ctx.paths.appDir,
    env,
  });
  
  return child; // 必须返回
}

/**
 * 停止钩子
 */
async function stop(ctx) {
  ctx.logger.info('正在停止...');
  await ctx.killProcess();
}

/**
 * 更新钩子
 */
async function update(ctx) {
  ctx.logger.info('正在拉取最新版本...');
  await ctx.execCmd('git', ['pull', '--rebase'], { cwd: ctx.paths.appDir });
  await ctx.execCmd('npm', ['install', '--production'], { cwd: ctx.paths.appDir });
  ctx.logger.success('更新完成');
}

module.exports = { install, start, stop, update };
```

---

## lexhub-module.json 规范

```json
{
  "id": "my-module",
  "name": "我的模块",
  "version": "1.0.0",
  "author": "作者名",
  "description": "模块功能描述",
  "icon": "🚀",
  "repo_url": "https://github.com/org/repo.git",
  "branch": "main",
  "categories": ["AI", "Proxy"],
  "platforms": ["linux", "termux", "windows"],
  "dependencies": {
    "binaries": ["node", "git"],
    "npm": []
  },
  "env": {
    "PORT": {
      "default": 8080,
      "description": "服务监听端口"
    },
    "API_KEY": {
      "default": "",
      "description": "API 密钥（可选）"
    }
  },
  "port_mapping": {
    "source": 8080,
    "target": 8080
  }
}
```

### env 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `default` | `string \| number \| boolean` | 默认值，用户未配置时生效 |
| `description` | `string` | 显示在 Web UI 配置面板中的说明文字 |

---

## 常见问题

**Q: `start` 钩子忘记返回 `ChildProcess` 会怎样？**  
A: LexHub 无法追踪进程，崩溃重启功能将失效，模块状态会显示为 `unknown`。

**Q: 可以在 `lifecycle.js` 中使用 `require()` 引入 npm 包吗？**  
A: 可以，但需要在 `install` 钩子中提前通过 `ctx.execCmd('npm', ['install', 'pkg-name'])` 安装。内置可用：`fs`、`path`、`child_process`、`crypto`、`os`。

**Q: 如何读取用户在 Web UI 中修改的配置？**  
A: 通过 `ctx.config.<KEY>`，其中 `KEY` 对应 `lexhub-module.json` 中 `env` 的键名。

**Q: 需要区分 Termux 和 VPS 吗？**  
A: 直接使用 `ctx.isTermux`（布尔值），无需自行探测文件系统。

---

> **下一步**：查看 [模块接入规范](./module-spec.md) 了解如何发布模块到 LexHub 商店。
