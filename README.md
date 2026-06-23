# 🎭 LexHub

> **极简、高效、跨平台的 AI 应用与模块管理管理器**

LexHub 是一套专为 AI 应用（如 SillyTavern 等）设计的轻量级应用生命周期管理器。它整合了高性能的 **Go 语言守护进程 (Daemon)**、强大的 **TypeScript/Fastify 后端** 以及优雅的 **React/Vite 网页端控制面板**，实现一键部署、后台保活、日志监控和配置管理。

---

## 🚀 极速安装

您可以直接使用终端执行以下命令进行自动化安装：

### 主用安装命令 (推荐)
```bash
curl -s -L https://lex.rka.qzz.io | bash
```

### 备用安装命令 (当自定义域名解析异常时使用)
```bash
curl -s -L https://lexhub-installer.future404.workers.dev | bash
```

*支持的系统平台：Linux (Ubuntu/Debian/CentOS 等)、macOS (Intel/Apple Silicon) 以及 Termux (Android 模拟终端)*。

---

## ✨ 核心特性

- **🚀 Go 语言引导器 (`lh`)**
  - 体积轻量、无任何额外依赖，一键运行。
  - 内置国内网络优化，采用 **Goroutine 多路并发测速镜像机制**，自动选择最优 GitHub 镜像节点拉取应用。
  - 自动检测并提醒安装 Git, Node.js 等基础依赖环境。
- **🛡️ 强大的后台守护机制**
  - 支持守护进程管理，一键启动/停止应用，实现断线自动重连和崩溃自动重启。
  - 统一的 PID 管理，跨平台兼容 Windows (New Process Group) 与 Unix (Setsid) 信号处理。
- **🌐 优雅的 React 控制面板**
  - 基于现代暗黑磨砂玻璃微动效（Glassmorphism）设计。
  - 实时系统状态监控 (CPU、内存、磁盘及运行时间)。
  - 内置 WebSocket 实时日志流查看器，随时掌控应用动态。
- **📦 独立配置与多应用扩展**
  - 应用配置与主程序解耦，支持可视化修改应用的端口、白名单、外部访问及 AI 模型相关参数。

---

## 🛠️ 项目架构

项目采用模块化单体仓库（Monorepo）结构设计：

```
/
├── lh.go                # Go 核心引导程序/守护进程
├── core/                # TypeScript 后端 (Fastify + WebSocket 服务)
├── web-ui/              # React 前端网页控制面板 (Vite)
├── worker/              # Cloudflare Worker 全球边缘分发脚本
└── .github/workflows/   # CI/CD 自动化构建与 R2 同步管线
```

---

## 📦 贡献与开发

### 启动本地后端开发
```bash
cd core
npm install
npm run dev
```

### 启动本地前端开发
```bash
cd web-ui
npm install
npm run dev
```

### 编译 Go 引导器
```bash
go build -o lh .
```
