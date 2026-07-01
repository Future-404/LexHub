# 🦞 ClewdR — LexHub 集成说明

> **上游项目**：[Xerxes-2/clewdr](https://github.com/Xerxes-2/clewdr)  
> **完整文档**：[上游 README](https://github.com/Xerxes-2/clewdr#readme)  
> **平台支持**：Linux · Termux (Android)

---

## 简介

ClewdR 是一个用 Rust 编写的高性能 Claude.ai 反向代理程序，通过 LexHub 可一键安装、启动和管理。它提供 **OpenAI 兼容接口**，让任何支持 OpenAI API 格式的客户端（如 SillyTavern、Open WebUI）直接接入 Claude.ai。

---

## 快速开始

1. 打开 **Web UI** → 顶部导航 → **商店**
2. 找到 **ClewdR (Claude.ai Rust Proxy)** 🦞，点击 **安装**
3. 安装完成后，在 **模块** 页面点击 **启动**
4. 访问 `http://localhost:8444` 打开 ClewdR 内置管理界面
5. 在管理界面中填入 Claude.ai 的 Cookie，保存后即可使用

---

## 配置选项

在 **Web UI → 模块 → ClewdR → 配置** 中可调整：

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `8444` | ClewdR 监听端口 |
| `LISTEN` | `0.0.0.0` | 监听地址（`127.0.0.1` 仅允许本机访问，推荐内网使用） |

---

## 安装过程说明

LexHub 安装时会自动：
1. 通过 GitHub API 检测最新 Release
2. 根据当前平台/架构自动选择正确的预编译二进制：
   - **Linux x86_64** → `linux-x86_64`
   - **Linux ARM64** → `linux-aarch64`
   - **Termux aarch64** → `android-aarch64`
   - **Termux x64** → `musllinux-x86_64`（静态链接兼容包）

> 若下载失败，请检查网络或在 **Web UI → 设置 → 镜像** 中切换镜像源。

---

## 与 SillyTavern 联动

安装好 ClewdR 后，在 SillyTavern 中配置 API：

1. SillyTavern → API 设置 → 选择 **Custom (OpenAI-compatible)**
2. API URL 填写：`http://127.0.0.1:8444`
3. API Key 填写任意字符串（占位，实际认证由 Cookie 完成）

---

## 平台注意事项

- **Termux**：需要 `pkg install curl unzip`（LexHub 会自动安装）
- **Linux VPS**：依赖 `curl`、`unzip`，通常已预装
- ClewdR **不支持 Windows**，请在 Linux/Termux 环境下使用

---

## 常见问题

| 问题 | 解决方案 |
|---|---|
| 安装时 "找不到适配架构的发布包" | 当前架构暂未被上游支持，关注上游仓库 Release 更新 |
| 启动后访问 8444 端口无响应 | 检查日志：Web UI → 模块 → ClewdR → 日志 |
| Cookie 失效 | 在 ClewdR 内置管理界面重新填写新 Cookie |

→ [查看上游完整文档](https://github.com/Xerxes-2/clewdr#readme)
