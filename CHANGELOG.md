# Changelog

所有值得关注的改动都将记录于此文档。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/)，版本控制遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## 目录
- [未发布](#未发布)
- [v2.0.0 (2026-06-30)](#200--2026-06-30)
- [v1.x (TAV-X 时代)](#1x--tav-x-时代已归档)

---

## [未发布]

### 新增
- ADB 无线配对 / 连接 / 优化功能，支持 Termux 后台保活
- 音频心跳服务（`AdbManager.toggleAudioHeartbeat`），防止系统杀掉后台进程
- 新增模块：ClewdR 🦞、CLIProxyAPI ⚡、GCLI2API 🌐
- Web UI 新增 ADB 保活管理面板

### 改进
- 全局错误掩码：API 异常统一返回 `INTERNAL_SERVER_ERROR` + `TraceID`，杜绝物理路径泄露
- `buildContext` 自动注入 `isTermux`，生命周期脚本无需重复平台检测
- 商店离线 Fallback：网络不可用时展示内置模块列表

### 修复
- 进程崩溃计数器竞态条件（从内存改为磁盘持久化读取）
- SWR 轮询频率从 3s 降至 5s，减少 Termux 电量消耗

---

## [2.0.0] — 2026-06-30

### 新增
- **完整重构**：从 TAV-X shell 脚本迁移至 Go + TypeScript + React 三层架构
- Go 守护进程 (`lh`) — 跨平台二进制，支持 Linux / macOS / Windows / Termux
- TypeScript/Fastify 后端 (`core/`) — REST API + WebSocket 实时通信
- React/Vite Web 控制面板 — 玻璃态暗黑主题，实时系统监控
- Cloudflare Zero Trust 隧道模块，支持内网穿透
- SillyTavern 模块，支持一键安装、启动、插件管理
- 多镜像并发测速，自动选择最快 GitHub 镜像节点
- Goroutine 多路竞速下载机制
- 操作互斥锁（防止同一模块并发操作）
- 路径遍历防护（`/api/modules/:id` 路径合法性校验）

### 架构决策
- [ADR-0001](docs/architecture/decisions/0001-lexhub-architecture-design.md) — 核心架构设计
- [ADR-0002](docs/architecture/decisions/0002-adb-keepalive-architecture.md) — ADB 保活架构

---

## [1.x] — TAV-X 时代（已归档）

TAV-X 为本项目的前身，采用纯 Bash 脚本实现，已停止维护。  
历史记录请查看：[TAV-X 仓库](https://github.com/Future-404/TAV-X)

---

[未发布]: https://github.com/Future-404/LexHub/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/Future-404/LexHub/releases/tag/v2.0.0
