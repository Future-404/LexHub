# CLI 参考

> **文档类型**: Reference（参考手册）
> 本页面列出 `lh` 命令的完整语法与行为描述，适合查阅，不作为操作教程使用。

---

## 概览

`lh` 是 LexHub 的命令行守护进程管理器（Go 二进制）。

```
用法: lh [命令]
```

无参数运行 `lh` 等同于 `lh start`。

---

## 命令列表

### `lh` / `lh start`

启动 LexHub 守护进程。

```bash
lh
lh start
```

- 守护进程包含：TypeScript/Fastify 后端（端口 3000）、React/Vite 前端
- 若守护进程已在运行，此命令为无操作（no-op）并返回当前状态
- 退出码：`0` 成功，`1` 启动失败

**输出示例**：
```
[LexHub] 守护进程已启动
[LexHub] 后端 API: http://localhost:3000
[LexHub] Web UI:    http://localhost:3000
```

---

### `lh stop`

停止正在运行的 LexHub 守护进程（含所有托管模块）。

```bash
lh stop
```

- 向守护进程发送 SIGTERM，等待优雅退出
- 已安装的模块数据不会被删除
- 退出码：`0` 成功，`1` 守护进程未运行

**输出示例**：
```
[LexHub] 守护进程已停止
```

---

### `lh restart`

重启 LexHub 守护进程。

```bash
lh restart
```

- 等同于 `lh stop && lh start` 的原子操作
- 托管模块将随守护进程一同重启

**输出示例**：
```
[LexHub] 正在重启守护进程...
[LexHub] ✓ 重启完成
```

---

### `lh status` / `lh ps`

显示守护进程及所有托管模块的运行状态。

```bash
lh status
lh ps
```

**输出示例**（有模块运行时）：
```
LexHub 守护进程状态: ✓ 运行中
后端 API (port 3000): ✓ 在线
前端 UI:              ✓ 在线

已安装模块:
  sillytavern    ✓ 运行中   http://localhost:8000
  cloudflared    ✓ 运行中   tunnel: xxxx.trycloudflare.com
```

**输出示例**（守护进程未运行时）：
```
LexHub 守护进程状态: ✗ 未运行
```

退出码：`0` 守护进程在线，`1` 守护进程离线。

---

### `lh log`

实时流式输出 LexHub 守护进程日志（跟踪模式，类似 `tail -f`）。

```bash
lh log
```

- 输出守护进程及所有托管模块的合并日志流
- 按 `Ctrl+C` 退出日志查看，**不会**停止守护进程
- 日志级别：`INFO`、`WARN`、`ERROR`

**输出示例**：
```
2026-07-01T12:00:00+08:00 [INFO]  后端服务启动于端口 3000
2026-07-01T12:00:01+08:00 [INFO]  [sillytavern] 进程已启动 PID=12345
2026-07-01T12:00:02+08:00 [INFO]  [sillytavern] 监听于 http://localhost:8000
```

---

### `lh install`

执行初次安装流程：安装 Node.js 依赖并编译前端资源。

```bash
lh install
```

- **首次安装后必须运行**，否则后端将无法正常启动
- 等同于在 `core/` 目录执行 `npm install`，并在 `web-ui/` 目录执行 `npm run build`
- 需要网络连接以下载依赖
- 在 Termux 环境下，需确保 `nodejs-lts` 已安装

**输出示例**：
```
[LexHub] 正在安装 Node.js 依赖 (core/)...
[LexHub] 正在编译前端 (web-ui/)...
[LexHub] ✓ 初始化完成！
```

---

### `lh update`

将 LexHub 更新至最新版本。

```bash
lh update
```

- 从官方发布渠道拉取最新 `lh` 二进制及后端代码
- 更新完成后，守护进程将自动重启
- 数据与模块配置在更新过程中保留

**输出示例**：
```
[LexHub] 当前版本: v1.2.3
[LexHub] 最新版本: v1.3.0
[LexHub] 正在下载更新...
[LexHub] ✓ 更新完成，守护进程已重启
```

---

### `lh enable`

将 LexHub 配置为系统/用户级开机自启。

```bash
lh enable
```

| 平台 | 实现方式 |
|------|----------|
| Linux (systemd) | 注册并启用 systemd 用户服务 (`lexhub.service`) |
| Termux | 在 `~/.bashrc` 追加自启命令 |
| Windows | 在「启动」文件夹注册快捷方式 |

**输出示例**（Linux）：
```
[LexHub] ✓ systemd 用户服务已启用
[LexHub] 下次登录或重启后将自动启动
```

---

### `lh disable`

取消开机自启配置。

```bash
lh disable
```

- 撤销 `lh enable` 的所有操作
- 不会停止当前正在运行的守护进程

**输出示例**：
```
[LexHub] ✓ 开机自启已禁用
```

---

## 退出码汇总

| 退出码 | 含义 |
|--------|------|
| `0` | 命令执行成功 |
| `1` | 一般性错误（守护进程未运行、启动失败等） |
| `2` | 参数错误（未知命令） |

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LEXHUB_PORT` | 后端 API 及 Web UI 监听端口 | `3000` |
| `LEXHUB_HOME` | LexHub 数据目录 | `~/.lexhub` |
| `LEXHUB_LOG_LEVEL` | 日志级别 (`info`/`warn`/`error`) | `info` |

---

## 相关资源

- [安装指南](./installation.md)
- [快速入门](./quickstart.md)
- [SillyTavern 集成指南](../modules/sillytavern.md)
- [Cloudflare 模块指南](../modules/cloudflare.md)
