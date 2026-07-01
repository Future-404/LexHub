# 安装指南

> **文档类型**: How-to Guide（操作指南）
> 本页面描述如何在各平台上安装 LexHub。若您是首次使用，建议阅读完安装后继续阅读 [快速入门](./quickstart.md)。

---

## 前置要求

| 平台 | 最低要求 |
|------|----------|
| Android (Termux) | Termux ≥ 0.118，已授予存储权限 |
| VPS / Linux | Ubuntu 20.04+ / Debian 11+ / CentOS 8+，具有 sudo 权限 |
| Windows | Windows 10 21H2+，已安装 winget |

---

## 一键安装（推荐）

对于所有平台，均可使用以下一键安装脚本：

```bash
# 主要地址
curl -s -L https://lex.rka.qzz.io | bash

# 备用地址（主要地址不可用时）
curl -s -L https://lexhub-installer.future404.workers.dev | bash
```

安装脚本会自动检测当前平台，并执行对应的安装流程。

---

## 平台专属安装说明

### Android（Termux）

**步骤 1：准备 Termux 环境**

```bash
# 更新软件包列表
pkg update && pkg upgrade -y

# 安装基础依赖
pkg install git curl nodejs-lts -y
```

**步骤 2：运行安装脚本**

```bash
curl -s -L https://lex.rka.qzz.io | bash
```

预期输出：
```
[LexHub] 检测到平台: Termux (Android)
[LexHub] PREFIX: /data/data/com.termux/files/usr
[LexHub] 正在安装 LexHub...
[LexHub] ✓ 安装完成！运行 `lh install` 初始化依赖。
```

**步骤 3：初始化 LexHub**

```bash
lh install
```

> **注意**：Termux 环境不支持 systemd，LexHub 以前台进程或 Termux 会话方式运行。使用 `lh enable` 可写入 `~/.bashrc` 实现登录自启。

---

### VPS / Linux（Debian / Ubuntu）

**步骤 1：确保系统已更新**

```bash
sudo apt-get update && sudo apt-get upgrade -y
```

**步骤 2：运行安装脚本**

```bash
curl -s -L https://lex.rka.qzz.io | bash
```

预期输出：
```
[LexHub] 检测到平台: Linux (Debian/Ubuntu)
[LexHub] 正在通过 apt-get 安装依赖...
[LexHub] ✓ lh 二进制已安装到 /usr/local/bin/lh
[LexHub] ✓ systemd 用户服务已注册
[LexHub] 运行 `lh install` 完成初始化。
```

**步骤 3：初始化并启动**

```bash
lh install
lh start
```

**步骤 4（可选）：设置开机自启**

```bash
# 启用 systemd 用户服务开机自启
lh enable

# 确认状态
lh status
```

---

### VPS / Linux（CentOS / RHEL）

**步骤 1：安装依赖**

```bash
sudo yum update -y
sudo yum install -y curl git
```

**步骤 2：运行安装脚本**

```bash
curl -s -L https://lex.rka.qzz.io | bash
```

**步骤 3：初始化并启动**

```bash
lh install
lh start
lh enable
```

---

### Windows

**步骤 1：确认 winget 可用**

在 PowerShell 中运行：

```powershell
winget --version
```

预期输出：`v1.x.x`（若未安装，请通过 Microsoft Store 安装「应用安装程序」）

**步骤 2：安装 LexHub**

在 PowerShell（管理员）中运行：

```powershell
winget install LexHub
```

或使用 curl（需已安装 curl）：

```powershell
curl -s -L https://lex.rka.qzz.io | bash
```

**步骤 3：初始化**

```powershell
lh install
lh start
```

> **注意**：Windows 上 LexHub 作为后台进程运行，可通过系统托盘或 `lh status` 查看状态。

---

## 验证安装

安装完成后，运行以下命令验证：

```bash
lh status
```

预期输出：
```
LexHub 守护进程状态: ✓ 运行中
后端 API (port 3000): ✓ 在线
前端 UI:              ✓ 在线 → http://localhost:3000
```

打开浏览器访问 [http://localhost:3000](http://localhost:3000)，可看到 LexHub Web 控制台。

---

## 卸载

```bash
# 停止守护进程
lh stop

# 禁用自启
lh disable

# 删除 lh 二进制（Linux/Termux）
rm $(which lh)

# 删除数据目录
rm -rf ~/.lexhub
```

---

## 下一步

- [快速入门](./quickstart.md) — 5 分钟内完成第一次应用部署
- [CLI 参考](./cli.md) — 完整命令列表
