<div align="center">

# 🎭 LexHub

**轻量跨平台 AI 应用生命周期管理器**

一行命令，完成安装 · 启动 · 守护 · 可视化监控

[![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat-square&logo=go)](https://golang.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![React](https://img.shields.io/badge/React-Vite-61DAFB?style=flat-square&logo=react)](https://react.dev)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?style=flat-square&logo=fastify)](https://fastify.dev)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Termux%20%7C%20Windows-blue?style=flat-square)](#-平台支持)

```bash
# 🚀 一键安装（主线路）
curl -s -L https://lex.rka.qzz.io | bash

# 🔄 备用线路（主线路异常时使用）
curl -s -L https://lexhub-installer.future404.workers.dev | bash
```

</div>

---

## 📖 简介

**LexHub** 是一套专为 AI 应用（SillyTavern、Claude 代理、Gemini 桥接等）设计的轻量级应用生命周期管理器。

它整合了三层架构：
- **`lh`** — 纯 Go 编译的单文件守护进程控制器，无额外依赖，跨平台一键运行
- **`core/`** — TypeScript/Fastify 后端引擎，提供 REST API + WebSocket 实时推流
- **`web-ui/`** — React/Vite 暗黑磨砂玻璃风格控制面板，内置实时日志与系统监控

**面向用户**：Termux (Android) 用户 · VPS/Linux 服务器用户 · Windows 桌面用户

---

## ✨ 核心特性

| 特性 | 说明 |
|---|---|
| ⚡ **零依赖启动** | `lh` 为单一 Go 二进制，无需 Runtime，开箱即用 |
| 🪞 **智能镜像加速** | Goroutine 并发测速 9 大 GitHub 镜像节点，自动选最优线路 |
| 🔄 **守护进程保活** | 崩溃自动重启（最多 3 次），支持 Unix `setsid` / Windows New Process Group |
| 📦 **自动依赖安装** | 自动检测并安装 `git` / `node` / `npm`，支持 apt / yum / brew / winget |
| 🌐 **可视化控制面板** | 实时 CPU / 内存 / 磁盘 / 运行时长，模块一键启停，WebSocket 日志流 |
| 🧩 **模块化扩展** | 基于 `lexhub-module.json` + `lifecycle.js` 的插件规范，按需安装模块 |
| 🖥️ **全平台覆盖** | Linux · macOS · Termux (Android) · Windows |
| 🔐 **配置解耦** | 端口 / 白名单 / 环境变量均可通过 Web UI 可视化修改，无需手动编辑配置文件 |

---

## 🚀 快速开始

### 安装

```bash
# 主线路（推荐）
curl -s -L https://lex.rka.qzz.io | bash

# 备用线路（主线路 DNS 解析异常时）
curl -s -L https://lexhub-installer.future404.workers.dev | bash
```

> **支持平台**：Linux (Debian/Ubuntu/CentOS/RHEL) · macOS (Intel/Apple Silicon) · Termux (Android) · Windows

### 启动

```bash
# 启动守护进程（进入后台运行）
lh start

# 查看运行状态
lh status

# 打开浏览器访问控制面板
# 默认地址：http://localhost:3000
```

### Windows 用户

```powershell
# PowerShell（推荐）
.\lh.ps1 start

# 或 CMD
lh.bat start
```

---

## 📦 模块商店

通过 Web UI 的「模块中心」页面，可一键安装以下模块：

| 图标 | 模块名 | 功能描述 |
|:---:|---|---|
| 🎭 | **SillyTavern** | 主流 AI 角色扮演/聊天前端，对接各大语言模型 |
| 🦞 | **ClewdR / clewd** | Claude API 代理，突破访问限制 |
| ⚡ | **CLIProxyAPI** | 基于 Go 的高性能轻量代理工具 |
| 🌐 | **GCLI2API** | 将 Gemini CLI 桥接为标准 OpenAI API 格式 |
| ☁️ | **Cloudflare** | Zero Trust 隧道，安全暴露本地服务 |

每个模块包含：
- `lexhub-module.json` — 模块元数据（仓库地址、依赖、端口映射）
- `lifecycle.js` — 生命周期钩子（`install` / `start` / `stop` / `status`）

---

## 🛠️ CLI 命令参考

`lh` 是 LexHub 的核心命令行工具。

| 命令 | 说明 |
|---|---|
| `lh` | 等同于 `lh start`，直接启动守护进程 |
| `lh start` | 启动 LexHub 守护进程（含 Web UI） |
| `lh stop` | 停止守护进程 |
| `lh restart` | 重启守护进程 |
| `lh status` | 查看守护进程运行状态 |
| `lh ps` | 同 `lh status`，显示进程列表 |
| `lh log` | 实时跟踪守护进程日志（类似 `tail -f`） |
| `lh install` | 初始化安装（依赖检测 + 环境配置） |
| `lh update` | 将 LexHub 更新到最新版本 |
| `lh enable` | 开启开机自启（systemd / launchd / 启动项） |
| `lh disable` | 关闭开机自启 |

### 示例

```bash
# 完整工作流示例
lh install       # 首次安装，自动配置环境
lh start         # 后台启动
lh status        # 确认运行中
lh log           # 查看实时日志

# 更新到最新版
lh stop && lh update && lh start

# 配置开机自启
lh enable
```

---

## 🏗️ 项目架构

采用模块化 Monorepo 结构，各层职责清晰分离：

```
LexHub/
│
├── lh.go                       # Go 守护进程控制器（核心引导程序）
├── sys_unix.go                 # Unix 平台系统调用适配
├── sys_windows.go              # Windows 平台系统调用适配
│
├── core/                       # 后端核心引擎（TypeScript + Fastify）
│   └── src/
│       ├── cli/                # CLI 快捷指令处理器
│       ├── web/
│       │   ├── server.ts       # Fastify 服务启动 + WebSocket 配置
│       │   ├── routes.ts       # REST API 路由（/api/modules, /api/system）
│       │   └── ws.ts           # WebSocket 实时推流（日志 + 系统监控）
│       └── manager/
│           ├── process.ts      # 子进程生命周期管理（spawn/kill/restart）
│           ├── module.ts       # 模块扫描 / 下载 / 升级 / 钩子执行
│           ├── system.ts       # 跨平台系统探测与依赖检测
│           ├── logger.ts       # 统一日志与诊断管理
│           └── config.ts       # settings.json / installed.json 读写
│
├── web-ui/                     # 前端控制面板（React + Vite）
│   └── src/
│       ├── components/         # 磨砂玻璃拟态组件（卡片、实时控制台）
│       └── views/              # 仪表盘 / 模块中心 / 系统设置
│
├── modules/                    # 本地模块目录
│   ├── sillytavern/
│   ├── clewd/
│   ├── cliproxyapi/
│   ├── gcli2api/
│   └── cloudflare/
│
├── config/
│   ├── settings.json           # 全局配置
│   └── installed.json          # 已安装模块状态记录
│
├── logs/
│   ├── lexhub.log              # 引擎运行日志
│   └── modules/                # 各模块独立日志（stdout / stderr）
│
├── worker/                     # Cloudflare Worker 全球边缘分发脚本
└── .github/workflows/          # CI/CD 自动构建与 R2 对象存储同步
```

---

## 🌐 Web UI & API

控制面板默认运行在 **`http://localhost:3000`**（可在 `config/settings.json` 修改端口）。

### HTTP API 概览

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/modules` | 获取所有模块列表与状态 |
| `GET` | `/api/modules/:id` | 获取单个模块详情 |
| `GET` | `/api/modules/:id/logs` | 读取日志（`?type=stdout\|stderr`, `?lines=200`） |
| `POST` | `/api/modules/:id/install` | 触发安装 |
| `POST` | `/api/modules/:id/start` | 启动模块 |
| `POST` | `/api/modules/:id/stop` | 停止模块 |
| `POST` | `/api/modules/:id/config` | 更新环境变量配置 |
| `GET` | `/api/system/info` | 获取系统状态（OS / CPU / 内存 / 磁盘） |

### WebSocket 实时推流

| 路径 | 说明 |
|---|---|
| `WS /ws/logs?module_id=<id>` | 指定模块日志实时推流 |
| `WS /ws/system` | 系统负载实时广播 |

---

## 🖥️ 平台支持

| 平台 | 架构 | 引导入口 | 说明 |
|---|---|---|---|
| **Linux** (Debian/Ubuntu) | x86_64 / arm64 | `lh` / `lh.sh` | apt 自动安装依赖 |
| **Linux** (CentOS/RHEL) | x86_64 | `lh` / `lh.sh` | yum 自动安装依赖 |
| **macOS** | Intel / Apple Silicon | `lh` | Homebrew 自动安装依赖 |
| **Termux** (Android) | arm64 | `lh` | pkg 自动安装依赖 |
| **Windows** | x86_64 | `lh.bat` / `lh.ps1` | winget 自动安装依赖 |

---

## 🔧 开发者指南

### 环境要求

- Go `1.22+`
- Node.js `18+`
- Git

### 本地启动

```bash
# 1. 克隆仓库
git clone https://github.com/Future-404/LexHub.git
cd LexHub

# 2. 启动后端开发服务器
cd core && npm install && npm run dev

# 3. 启动前端开发服务器（新终端）
cd web-ui && npm install && npm run dev

# 4. 编译 Go 守护进程
go build -o lh .
```

### 构建生产包

```bash
# 编译前端，输出到 core/dist/web-ui
cd web-ui && npm run build

# 编译后端
cd core && npm run build

# 编译 Go 二进制（压缩体积）
go build -ldflags="-s -w" -o lh .
```

### 模块开发规范

新增模块需在 `modules/<id>/` 目录下创建以下两个文件：

**`lexhub-module.json`**（元数据）

```json
{
  "id": "my-module",
  "name": "My Module",
  "version": "1.0.0",
  "description": "模块功能描述",
  "repo_url": "https://github.com/author/repo.git",
  "branch": "main",
  "dependencies": { "binaries": ["node", "git"], "npm": [] },
  "env": {
    "PORT": { "default": 8080, "description": "应用运行端口" }
  }
}
```

**`lifecycle.js`**（生命周期钩子）

```javascript
module.exports = {
  async install(ctx) { /* 克隆仓库、安装依赖 */ },
  async start(ctx)   { /* spawn 子进程，返回 PID */ },
  async stop(ctx)    { /* ctx.killProcess() */ },
  async status(ctx)  { /* 返回 "RUNNING" | "STOPPED" */ }
};
```

---

## 📁 文档目录

```
docs/
├── architecture/   # 系统架构设计文档
├── guide/          # 用户使用指南
└── modules/        # 各模块专属文档
```

---

## 🤝 贡献指南

欢迎 PR 和 Issue！请遵循以下步骤：

1. Fork 本仓库并创建功能分支：`git checkout -b feat/my-feature`
2. 提交变更：`git commit -m "feat: add my feature"`
3. 推送分支：`git push origin feat/my-feature`
4. 提交 Pull Request，描述清楚变更内容

---

## 📄 许可证

本项目基于 [MIT License](LICENSE) 开源。

---

<div align="center">

**由 [Future-404](https://github.com/Future-404) 团队用 ❤️ 构建**

[🐛 报告问题](https://github.com/Future-404/LexHub/issues) · [💡 功能建议](https://github.com/Future-404/LexHub/issues/new) · [📖 查阅文档](https://github.com/Future-404/LexHub/tree/main/docs)

</div>

---

<!-- llms.txt — AI 爬虫友好摘要
     建议在项目根目录创建 llms.txt 文件，内容如下：

# LexHub
> 轻量跨平台 AI 应用生命周期管理器

LexHub manages AI applications (SillyTavern, Claude proxies, Gemini bridges) on Linux, Termux, and Windows.

## Architecture
- lh (Go binary): daemon controller — start/stop/restart/status/log/install/update/enable/disable
- core/ (TypeScript + Fastify): REST API + WebSocket server, default port 3000
- web-ui/ (React + Vite): glassmorphism dark dashboard with real-time logs and system monitoring

## Install
- Primary: curl -s -L https://lex.rka.qzz.io | bash
- Backup:  curl -s -L https://lexhub-installer.future404.workers.dev | bash

## CLI Commands
- lh / lh start   : start daemon
- lh stop         : stop daemon
- lh restart      : restart daemon
- lh status / ps  : view running status
- lh log          : tail real-time logs
- lh install      : initial install and environment setup
- lh update       : update to latest version
- lh enable       : enable autostart on boot
- lh disable      : disable autostart on boot

## Modules (available via Web UI store)
- SillyTavern (🎭): AI roleplay/chat frontend
- ClewdR/clewd (🦞): Claude API proxy
- CLIProxyAPI (⚡): Go-based lightweight proxy tool
- GCLI2API (🌐): Gemini CLI to OpenAI API bridge
- Cloudflare (☁️): Zero Trust tunnel for secure local service exposure

## REST API (port 3000)
- GET  /api/modules                   — list all modules + status
- POST /api/modules/:id/install       — install a module
- POST /api/modules/:id/start         — start a module
- POST /api/modules/:id/stop          — stop a module
- GET  /api/modules/:id/logs          — fetch logs (?type=stdout|stderr&lines=200)
- GET  /api/system/info               — system status (OS/CPU/RAM/disk)

## WebSocket
- WS /ws/logs?module_id=<id>  — real-time log stream for a module
- WS /ws/system               — real-time system metrics broadcast

## Key Files
- lh.go              : Go daemon controller source
- core/src/          : TypeScript backend source (Fastify + manager)
- web-ui/src/        : React frontend source
- modules/           : installed modules directory
- config/settings.json : global runtime configuration
- logs/              : engine and per-module log archives
-->
