# SillyTavern 集成指南

> **文档类型**: How-to Guide（集成操作指南）
> 本文档仅涵盖通过 LexHub 安装和管理 SillyTavern 的方法。
>
> 📖 上游项目文档：[SillyTavern GitHub](https://github.com/SillyTavern/SillyTavern)

---

## 概述

SillyTavern 是一个功能丰富的本地 AI 角色扮演前端，支持对接多种大语言模型 API。LexHub 将其作为托管模块，提供一键安装、生命周期管理和日志集成。

---

## 前置要求

| 要求 | 说明 |
|------|------|
| LexHub | 守护进程运行中（`lh status` 确认） |
| 端口 8000 | 默认端口，确保未被其他进程占用 |
| 网络 | 安装时需要访问 GitHub |

### Termux（Android）额外要求

```bash
# 确保以下包已安装
pkg install nodejs-lts git -y
```

---

## 安装

### 通过 Web UI 安装（推荐）

1. 打开 LexHub Web 控制台：`http://localhost:3000`
2. 进入「**模块市场**」
3. 找到 **SillyTavern** 卡片，点击「**安装**」
4. 等待安装完成（首次安装约需 2–5 分钟，视网速而定）
5. 卡片状态变为「**运行中**」后，即可访问

安装过程中可在 `lh log` 中观察进度：

```
[sillytavern] 正在从 GitHub 克隆仓库...
[sillytavern] 正在安装 Node.js 依赖...
[sillytavern] ✓ SillyTavern 安装完成，启动中...
[sillytavern] 监听于 http://localhost:8000
```

---

## 访问

安装完成后，在浏览器中访问：

```
http://localhost:8000
```

---

## 平台注意事项

### Termux（Android）

- 首次启动较慢（约 30 秒），属于正常现象
- 如遇权限报错，确认 `nodejs-lts` 版本为 LTS 版：`node --version`
- Termux 关闭后 SillyTavern 将停止运行；使用 `lh enable` 可配置 Termux 启动时自动拉起

### Linux / VPS

- 若需从外网访问，建议配合 [Cloudflare 模块](./cloudflare.md) 创建安全隧道，避免直接暴露 8000 端口
- 防火墙规则：若仅本地使用，无需开放 8000 端口

---

## 配置

可在 LexHub Web 控制台 → 「**应用面板**」→「**SillyTavern**」→「**设置**」中调整：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| 端口 | SillyTavern 监听端口 | `8000` |
| 自动启动 | LexHub 启动时自动启动此模块 | 启用 |

SillyTavern 本身的 AI 模型 API 配置（如 OpenAI Key、Claude Key）请在 SillyTavern Web 界面内完成，LexHub 不介入上游配置。

---

## 卸载

在 LexHub Web 控制台中，点击 SillyTavern 应用卡片上的「**卸载**」按钮。

> **注意**：卸载将删除 SillyTavern 的数据目录，包括角色卡和聊天记录。卸载前请备份 `~/.lexhub/modules/sillytavern/` 目录。

---

## 故障排查

| 症状 | 可能原因 | 解决方法 |
|------|----------|----------|
| 安装失败，提示 clone 错误 | GitHub 访问受限 | 检查网络或配置代理 |
| 访问 8000 端口无响应 | 模块未启动 | 运行 `lh status` 确认，查看 `lh log` |
| Termux 中 node 报错 | nodejs 版本不匹配 | 运行 `pkg install nodejs-lts -y` |
| 页面空白 | 前端资源未编译 | 在 Web UI 中点击「重启」，等待重新编译 |

---

## 相关资源

- [LexHub 快速入门](../guide/quickstart.md)
- [Cloudflare 模块指南](./cloudflare.md) — 将 SillyTavern 安全暴露到公网
- 📖 [SillyTavern 官方文档](https://docs.sillytavern.app/)
- 📖 [SillyTavern GitHub](https://github.com/SillyTavern/SillyTavern)
