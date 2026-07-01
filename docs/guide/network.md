# 网络与镜像配置

> **适用场景**：中国大陆网络环境、访问 GitHub 缓慢、需要内网穿透的用户

---

## 安装时的镜像加速

LexHub 安装器（`lh.go`）内置**多节点并发测速**机制：在下载 LexHub 核心文件之前，自动向多个 GitHub 镜像节点并发发送探测请求，选择响应最快的节点下载，无需手动配置。

---

## Web UI 中的镜像设置

安装完成后，可在 **Web UI → 设置 → 镜像** 中统一配置各类软件源：

### NPM 源切换

| 选项 | 地址 |
|---|---|
| 官方源（默认） | `https://registry.npmjs.org` |
| 淘宝 NPM 镜像 | `https://registry.npmmirror.com` |
| 自定义 URL | 任意 NPM 兼容源 |

点击 **切换** 后，后续所有模块的 `npm install` 均使用新镜像。

### PIP 源切换

| 选项 | 地址 |
|---|---|
| 官方源（默认） | `https://pypi.org/simple` |
| 清华镜像 | `https://pypi.tuna.tsinghua.edu.cn/simple` |

GCLI2API 等 Python 模块的依赖安装将使用此配置。

### 系统包管理器源（Termux）

Termux 环境下，可切换 `apt` 源：

| 选项 | 说明 |
|---|---|
| 官方源 | `packages.termux.org` |
| 清华镜像 | `mirrors.tuna.tsinghua.edu.cn/termux` |

---

## 商店索引 URL 配置

LexHub 商店的模块列表从远程 JSON 索引加载。在 **Web UI → 设置 → 商店** 中可自定义索引地址。

**降级策略**（按优先级）：
1. 从配置的 `storeIndexUrl` 拉取远端数据
2. 若远端不可达 → 使用本地开发目录的 `lexhub-store/index.json`（仅开发环境）
3. 若均不可用 → 使用内置离线 Fallback（包含 SillyTavern、ClewdR 等核心模块）

---

## Cloudflare 隧道（内网穿透）

### 快速隧道（无需账号）

```
Web UI → 模块 → Cloudflare → 启动
```

启动后 LexHub 会自动获取一个临时域名（如 `xxx.trycloudflare.com`），可用于临时分享。

> ⚠️ 快速隧道每次重启后域名会变化，且可能随时被 Cloudflare 回收。

### 命名隧道（推荐，需要 Cloudflare 账号）

1. 在 [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/) 创建隧道
2. 获取隧道 Token
3. 在 **Web UI → 模块 → Cloudflare → 配置** 中填入 Token
4. 重启模块

命名隧道支持绑定自定义域名，且不受 IP 封锁影响。

### 自定义 Ingress 路由

在 **Web UI → 设置 → 自定义路由** 中可将特定域名路由至本地的不同服务：

```
my-st.example.com  →  http://localhost:8000   (SillyTavern)
my-api.example.com →  http://localhost:8444   (ClewdR)
```

保存后 LexHub 会尝试自动通过 Cloudflare 模块配置 DNS 记录。

---

## 代理环境变量

如果你的网络环境需要通过 HTTP 代理才能访问外网，在启动 LexHub 前设置标准代理环境变量：

```bash
export HTTP_PROXY=http://127.0.0.1:7890
export HTTPS_PROXY=http://127.0.0.1:7890
export ALL_PROXY=socks5://127.0.0.1:7890
```

LexHub 的 `NetworkManager.injectProxyEnv()` 会自动将这些变量注入到所有子进程（包括模块的 `install` / `start` 过程）。

---

## 网络状态查看

在 **Web UI → 设置 → 网络** 中可查看：
- 当前检测到的 HTTP_PROXY / HTTPS_PROXY 配置
- 到各镜像节点的延迟
- 点击 **重新扫描** 更新网络状态

通过 API 查询：
```bash
curl http://localhost:3000/api/system/network
```
