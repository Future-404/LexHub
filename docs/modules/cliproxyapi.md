# ⚡ CLIProxyAPI — LexHub 集成说明

> **上游项目**：[router-for-me/CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)  
> **完整文档**：[上游 README](https://github.com/router-for-me/CLIProxyAPI#readme)  
> **平台支持**：Linux · Termux (Android)

---

## 简介

CLIProxyAPI 是一个用 **Go 语言**编写的高性能 AI API 代理工具，带有 WebUI 后台管理界面，特别适合在手机端（Termux）作为代理中转使用。通过 LexHub 可自动完成编译和配置。

---

## 快速开始

1. 打开 **Web UI** → 顶部导航 → **商店**
2. 找到 **CLIProxyAPI** ⚡，点击 **安装**
   > 安装过程包括克隆仓库 + Go 编译，耗时约 1-3 分钟，请耐心等待
3. 安装完成后，在 **模块** 页面点击 **启动**
4. 访问 `http://localhost:8317` 打开 CLIProxyAPI 管理后台

---

## 配置选项

在 **Web UI → 模块 → CLIProxyAPI → 配置** 中可调整：

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `8317` | 服务监听端口 |

更多高级配置（账号、策略等）请通过 `config.yaml` 文件或 WebUI 后台管理界面修改。

---

## 安装过程说明

LexHub 安装时会自动：
1. 检测是否安装了 Go 环境；如未安装则自动安装：
   - Termux：`pkg install golang`
   - Linux：`apt-get install golang`
2. 克隆 CLIProxyAPI 仓库
3. 使用 `CGO_ENABLED=0` 静态编译，确保跨环境兼容
4. 自动初始化 `config.yaml`（从 `config.example.yaml` 复制）

---

## 平台注意事项

- **Termux**：编译时间较长（Go 首次编译约 3-5 分钟），请保持 Termux 前台运行
- **Linux VPS**：需要 `git` 和 `golang`，LexHub 会自动安装
- 编译产物为静态二进制，不依赖外部运行时

---

## 常见问题

| 问题 | 解决方案 |
|---|---|
| 安装时卡在 "正在编译" | 编译 Go 项目需要时间，Termux 环境下最长可达 5 分钟 |
| `go: command not found` | 重启 LexHub 再安装；或手动运行 `pkg install golang`（Termux） |
| 启动后 8317 端口无法访问 | 查看日志：Web UI → 模块 → CLIProxyAPI → 日志 |
| 配置未生效 | 修改配置后需要重启模块 |

→ [查看上游完整文档](https://github.com/router-for-me/CLIProxyAPI#readme)
