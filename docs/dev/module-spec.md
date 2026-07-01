# 模块接入规范

> **目标读者**：希望为 LexHub 编写并发布模块的开发者  
> **版本**：v2.0  
> 另见：[lifecycle-api.md](./lifecycle-api.md) — ctx 上下文 API 完整参考

---

## 模块目录结构

每个模块在 `modules/<module-id>/` 目录下需包含以下文件：

```
modules/
└── my-module/
    ├── lexhub-module.json   # 必须 — 模块元数据
    └── lifecycle.js         # 必须 — 生命周期钩子实现
```

可选文件：
```
    ├── app/                 # 应用程序目录（安装后由 lifecycle.js 填充）
    └── README.md            # 模块说明（可选）
```

---

## lexhub-module.json 字段规范

### 完整示例

```json
{
  "id": "my-module",
  "name": "我的模块",
  "aliases": ["mymod"],
  "version": "1.0.0",
  "author": "作者名",
  "description": "一句话描述模块功能（显示在商店卡片上）",
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
      "description": "API 密钥（留空则不启用）"
    }
  },
  "port_mapping": {
    "source": 8080,
    "target": 8080
  }
}
```

### 字段说明

| 字段 | 类型 | 必须 | 说明 |
|---|---|---|---|
| `id` | `string` | ✅ | 模块唯一标识符，全小写，仅字母/数字/中划线，如 `sillytavern` |
| `name` | `string` | ✅ | 显示名称 |
| `aliases` | `string[]` | — | 别名，用于 CLI 命令匹配 |
| `version` | `string` | ✅ | 语义化版本号，如 `1.0.0` |
| `author` | `string` | ✅ | 作者名 |
| `description` | `string` | ✅ | 简介，建议 ≤50 字 |
| `icon` | `string` | — | Emoji 图标，显示在 Web UI 中 |
| `repo_url` | `string` | — | 上游 Git 仓库地址（`.git` 结尾） |
| `branch` | `string` | — | 默认克隆分支 |
| `categories` | `string[]` | — | 分类标签，如 `["AI", "Proxy"]` |
| `platforms` | `string[]` | — | 支持平台：`linux` / `termux` / `windows` |
| `dependencies.binaries` | `string[]` | — | 需要预先安装的系统命令（LexHub 会在启动前检测） |
| `env` | `Record` | — | 用户可配置的环境变量，显示在 Web UI 配置面板 |
| `env.<KEY>.default` | `string\|number\|boolean` | ✅（env内） | 默认值 |
| `env.<KEY>.description` | `string` | — | 配置项说明，显示在 Web UI 中 |
| `port_mapping.source` | `number` | — | 本地监听端口（与 `env.PORT.default` 一致） |
| `port_mapping.target` | `number` | — | 外部访问端口（一般与 source 相同） |

### id 命名规则

```
✅ sillytavern
✅ clewd
✅ my-module
✅ cli-proxy-api

❌ MyModule        (大写)
❌ my_module       (下划线)
❌ my module       (空格)
```

---

## lifecycle.js 规范

### 必须导出的函数

```js
// CommonJS 或 ESM 均可
module.exports = { install, start, stop, update };
// 或
export { install, start, stop, update };
```

| 函数 | 签名 | 返回值 | 说明 |
|---|---|---|---|
| `install` | `(ctx) => Promise<void>` | `void` | 安装：克隆仓库、安装依赖、初始化配置 |
| `start` | `(ctx) => Promise<ChildProcess>` | **必须返回 `ChildProcess`** | 启动服务进程 |
| `stop` | `(ctx) => Promise<void>` | `void` | 停止服务（可调用 `ctx.killProcess()`） |
| `update` | `(ctx) => Promise<void>` | `void` | 更新：拉取最新代码，重新安装依赖 |

### 可选导出的函数

| 函数 | 说明 |
|---|---|
| `backup(ctx)` | 备份模块数据 |
| `restore(ctx)` | 恢复模块数据 |
| `routeDns(ctx, opts)` | DNS 路由配置（Cloudflare 联动专用） |

### start 钩子约定

> **这是最重要的约定**：`start` 钩子必须返回 `ChildProcess` 实例，LexHub 依赖此实例进行：
> - 进程存活监测
> - 崩溃自动重启
> - PID 记录
> - 进程终止（`stop` 时）

```js
// ✅ 正确：返回 ChildProcess
async function start(ctx) {
  const child = ctx.spawnCmd('node', ['server.js'], { cwd: ctx.paths.appDir });
  return child;
}

// ❌ 错误：未返回 ChildProcess
async function start(ctx) {
  ctx.spawnCmd('node', ['server.js'], { cwd: ctx.paths.appDir });
  // 没有 return！LexHub 无法管理此进程
}
```

---

## 平台适配规范

所有平台差异通过 `ctx.isTermux` 判断，**不得**在模块中自行检测平台：

```js
// ✅ 正确
if (ctx.isTermux) {
  await ctx.execCmd('pkg', ['install', '-y', 'nodejs']);
} else {
  await ctx.execCmd('apt-get', ['install', '-y', 'nodejs']);
}

// ❌ 错误 — 自行检测
const isTermux = fs.existsSync('/data/data/com.termux');
```

---

## 日志规范

**只使用** `ctx.logger`，不使用 `console`：

```js
// ✅ 正确
ctx.logger.info('正在安装...');
ctx.logger.success('安装完成！');
ctx.logger.warn('未检测到可选依赖 xxx，部分功能可能不可用');
ctx.logger.error('安装失败: ' + err.message);

// ❌ 错误
console.log('安装完成');
console.error('失败');
```

---

## 错误处理规范

`install` / `update` 钩子中，遇到**不可恢复**的错误应直接抛出，LexHub 会将错误显示在 Web UI 中：

```js
async function install(ctx) {
  const binPath = path.join(ctx.paths.appDir, 'server.js');
  if (!fs.existsSync(binPath)) {
    throw new Error('安装失败：server.js 不存在，克隆可能不完整');
  }
}
```

`start` 钩子中，不要捕获进程启动错误，让 LexHub 的崩溃重启机制处理。

---

## 提交到 LexHub 商店

> 商店目前由 LexHub 团队维护，暂不开放社区提交。  
> 如需将模块收录到商店，请在 [GitHub Issues](https://github.com/Future-404/LexHub/issues) 中提交申请，并附上：
> 1. `lexhub-module.json`
> 2. `lifecycle.js`
> 3. 简短的模块功能说明

---

## 完整示例

参考现有模块实现：
- [SillyTavern lifecycle.js](../../modules/sillytavern/lifecycle.js)
- [ClewdR lifecycle.js](../../modules/clewd/lifecycle.js)
- [GCLI2API lifecycle.js](../../modules/gcli2api/lifecycle.js)
