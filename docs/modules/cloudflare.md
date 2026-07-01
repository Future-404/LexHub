# Cloudflare 模块指南

> **文档类型**: How-to Guide（集成操作指南）
> 本文档仅涵盖通过 LexHub 配置和使用 Cloudflare Zero Trust 隧道的方法。
>
> 📖 上游项目文档：[Cloudflare Zero Trust 文档](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)

---

## 概述

Cloudflare Zero Trust 隧道（`cloudflared`）可将您设备上运行的本地服务安全地暴露到公网，无需公网 IP 或开放防火墙端口。LexHub 集成 `cloudflared` 作为模块，统一管理隧道生命周期。

---

## 前置要求

| 要求 | 说明 |
|------|------|
| LexHub | 守护进程运行中（`lh status` 确认） |
| Cloudflare 账户 | 免费账户即可（[注册](https://dash.cloudflare.com/sign-up)） |
| `cloudflared` | LexHub 自动安装，无需手动操作 |

### Termux（Android）

LexHub 会自动安装 `cloudflared`。若自动安装失败，可手动安装：

```bash
pkg install cloudflared -y
```

---

## 安装与启用

### 通过 Web UI 配置（推荐）

1. 打开 LexHub Web 控制台：`http://localhost:3000`
2. 进入「**设置**」→「**网络**」→「**Cloudflare 隧道**」
3. 选择隧道类型：

| 类型 | 说明 | 是否需要 Cloudflare 账户 |
|------|------|--------------------------|
| **快速隧道**（临时） | 自动生成 `*.trycloudflare.com` 地址，重启后变更 | 否 |
| **命名隧道**（持久） | 绑定您的域名，地址固定 | 是 |

4. 选择要暴露的本地服务端口（如 SillyTavern 的 8000）
5. 点击「**启动隧道**」

启动后，控制台会显示可访问的公网地址：

```
[cloudflared] 隧道已建立
[cloudflared] 公网地址: https://xxxx.trycloudflare.com
[cloudflared] → 转发至: http://localhost:8000
```

---

## 平台注意事项

### Termux（Android）

- 手机息屏后网络可能中断，导致隧道断开。建议在 Android 设置中为 Termux 开启「锁定网络」或「禁止后台限制」权限
- 临时隧道地址在 Termux 会话重启后会变更，如需固定地址请使用命名隧道

### Linux / VPS

- `cloudflared` 作为 LexHub 子进程运行，无需单独配置 systemd 服务
- VPS 通常已有公网 IP，Cloudflare 隧道主要用于免配置 HTTPS 和 DDoS 防护场景

---

## 配置

可在 LexHub Web 控制台 → 「**设置**」→「**网络**」中调整：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| 隧道类型 | 快速隧道 / 命名隧道 | 快速隧道 |
| 目标端口 | 转发到本地的端口 | `3000` |
| 开机自启 | LexHub 启动时自动建立隧道 | 禁用 |

命名隧道需要在 Cloudflare 控制台生成 Token，并粘贴至 LexHub 的「**Cloudflare Token**」字段。

---

## 卸载

在 LexHub Web 控制台 → 「**设置**」→「**网络**」中点击「**停止隧道**」，或直接停止 LexHub 守护进程：

```bash
lh stop
```

---

## 故障排查

| 症状 | 可能原因 | 解决方法 |
|------|----------|----------|
| 隧道启动失败 | `cloudflared` 未安装 | 查看 `lh log`，Termux 可手动 `pkg install cloudflared` |
| 公网地址无法访问 | 目标端口服务未启动 | 确认对应模块（如 SillyTavern）已运行 |
| 命名隧道认证失败 | Token 错误或已过期 | 在 Cloudflare 控制台重新生成 Token |
| 隧道频繁断开 | 网络不稳定（多见于 Termux） | 检查手机省电策略，为 Termux 开放后台权限 |

---

## 相关资源

- [LexHub 快速入门](../guide/quickstart.md)
- [SillyTavern 集成指南](./sillytavern.md) — 配合隧道暴露 SillyTavern 到公网
- 📖 [Cloudflare Zero Trust 文档](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- 📖 [cloudflared GitHub](https://github.com/cloudflare/cloudflared)
