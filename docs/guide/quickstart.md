# 快速入门

> **文档类型**: Tutorial（教程）
> 本教程将引导您在 5–10 分钟内完成 LexHub 的安装、启动，并部署第一个应用模块。
> 完成后您将理解 LexHub 的核心工作流程。

---

## 你将学到什么

- ✅ 安装并启动 LexHub 守护进程
- ✅ 访问 Web 控制台
- ✅ 从 Web UI 安装一个应用模块（以 SillyTavern 为例）
- ✅ 查看日志并管理应用生命周期

**预计用时**：5–10 分钟

---

## 第一步：安装 LexHub

在终端中运行一键安装脚本：

```bash
curl -s -L https://lex.rka.qzz.io | bash
```

脚本会自动检测您的平台（Termux / Linux / Windows）并完成安装。

安装完成后，运行初始化命令：

```bash
lh install
```

预期输出（Linux 示例）：
```
[LexHub] 正在安装 Node.js 依赖...
[LexHub] 正在编译前端...
[LexHub] ✓ 初始化完成！
```

> **Termux 用户**：若提示缺少依赖，请先运行 `pkg install nodejs-lts git -y`，再重试 `lh install`。

---

## 第二步：启动守护进程

```bash
lh start
```

预期输出：
```
[LexHub] 守护进程已启动
[LexHub] 后端 API: http://localhost:3000
[LexHub] Web UI:    http://localhost:3000
```

确认守护进程正在运行：

```bash
lh status
```

预期输出：
```
LexHub 守护进程状态: ✓ 运行中
后端 API (port 3000): ✓ 在线
前端 UI:              ✓ 在线
```

---

## 第三步：查看实时日志（可选）

在新的终端窗口中运行：

```bash
lh log
```

您会看到后端的实时日志流。按 `Ctrl+C` 退出日志查看，**不会**影响守护进程运行。

---

### ✅ 检查点 1

此时您应该：

- [x] `lh status` 显示守护进程为「运行中」
- [x] 浏览器可以访问 `http://localhost:3000`（看到 LexHub Web 控制台）
- [x] `lh log` 可以输出日志

如果以上任一项不满足，请参阅 [安装指南](./installation.md) 排查问题。

---

## 第四步：打开 Web 控制台

在浏览器中打开：

```
http://localhost:3000
```

您将看到 LexHub 的玻璃拟态（glassmorphism）深色控制台。

界面分为以下主要区域：

| 区域 | 说明 |
|------|------|
| **应用面板** | 已安装应用的运行状态列表 |
| **模块市场** | 可一键安装的应用模块 |
| **设置** | 网络、Cloudflare 隧道等系统配置 |

---

## 第五步：安装第一个模块 — SillyTavern

在 Web 控制台的「**模块市场**」中找到 **SillyTavern** 卡片，点击「**安装**」。

安装过程中，控制台底部会显示进度日志。完成后，SillyTavern 卡片状态变为「**运行中**」。

您也可以在终端确认：

```bash
lh status
```

预期输出（安装后）：
```
LexHub 守护进程状态: ✓ 运行中
后端 API (port 3000): ✓ 在线

已安装模块:
  sillytavern    ✓ 运行中   http://localhost:8000
```

打开 SillyTavern：

```
http://localhost:8000
```

---

## 第六步：停止与重启应用

从 Web UI 的应用卡片上点击「停止」或「重启」，或在终端使用：

```bash
# 重启整个 LexHub 守护进程（包含所有模块）
lh restart

# 停止守护进程
lh stop
```

---

## 第七步（可选）：设置开机自启

如果您希望设备重启后 LexHub 自动运行：

```bash
lh enable
```

预期输出（Linux/systemd）：
```
[LexHub] ✓ systemd 用户服务已启用
[LexHub] 下次登录或重启后将自动启动
```

取消自启：

```bash
lh disable
```

---

### ✅ 检查点 2

此时您应该：

- [x] SillyTavern 在 `http://localhost:8000` 可正常访问
- [x] `lh status` 列出 `sillytavern` 模块为运行中
- [x] （可选）`lh enable` 已设置开机自启

---

## 恭喜！🎉

您已完成 LexHub 的快速入门，掌握了：

1. 安装并初始化 LexHub
2. 启动/停止/重启守护进程
3. 通过 Web UI 安装应用模块
4. 查看运行状态与日志

---

## 下一步推荐

- [CLI 参考](./cli.md) — 完整命令速查
- [SillyTavern 集成指南](../modules/sillytavern.md) — SillyTavern 高级配置
- [Cloudflare 模块指南](../modules/cloudflare.md) — 将本地服务暴露到公网
