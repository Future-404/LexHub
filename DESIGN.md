# LexHub 2.0 详细设计规格书 (跨平台兼容与日志诊断版)

本文档定义了 **LexHub** 的具体实现细节，包括模块元数据规范、生命周期 JavaScript API、HTTP/WebSocket 接口规范、跨平台兼容性策略以及日志与异常反馈子系统。

## 目录
- [1. 项目目录结构规划](#-1-项目目录结构规划)
- [2. 日志与异常反馈系统设计](#-2-日志与异常反馈系统设计-logging--diagnostics)
- [3. 跨平台兼容性设计](#-3-跨平台兼容性设计-windows-termux-debianubuntu)
- [4. 模块元数据规范](#-4-模块元数据规范-lexhub-modulejson)
- [5. 模块生命周期钩子 API](#️-5-模块生命周期钩子-api-lifecyclejs)
- [6. 后端 API 设计](#-6-后端-api-设计-http--websocket)

---

## 📂 1. 项目目录结构规划

```text
/root/LexHub/
├── core/                       # 后端核心引擎源码 (TypeScript)
│   ├── src/
│   │   ├── cli/                # CLI 快捷指令处理器
│   │   │   └── commands.ts     # 解析并执行 status, stop, restart, logs 等
│   │   ├── web/                # Fastify/Polka Web 服务
│   │   │   ├── server.ts       # 启动类与 WebSocket 配置
│   │   │   ├── routes.ts       # API 路由 (/api/modules, /api/system)
│   │   │   └── ws.ts           # WebSocket 推流 (日志与系统监控)
│   │   ├── manager/            # 核心业务管理器
│   │   │   ├── process.ts      # 负责 spawn 守护进程，维护 PID
│   │   │   ├── module.ts       # 扫描/下载/升级模块，动态执行钩子
│   │   │   ├── system.ts       # 跨平台系统设配器 (OS 探测, 依赖检测)
│   │   │   └── logger.ts       # 统一日志与诊断管理器 (新增)
│   │   │   └── config.ts       # 读写 settings.json 及本地状态
│   │   └── index.ts            # 主入口
│   ├── tsconfig.json
│   └── package.json
│
├── web-ui/                     # 前端项目 (Vite + TS + Preact/React)
│   ├── src/
│   │   ├── components/         # 磨砂玻璃拟态组件 (卡片、实时控制台)
│   │   ├── views/              # 仪表盘、模块中心、系统设置
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts          # 打包输出至 core/dist/web-ui
│
├── modules/                    # 本地与云端下载的功能模块目录
│   └── sillytavern/            # 模块示例
│       ├── lexhub-module.json  # 模块定义文件
│       └── lifecycle.js        # 生命周期脚本
│
├── config/                     # 数据与配置存储目录
│   ├── settings.json           # 全局配置文件
│   └── installed.json          # 已安装模块及运行状态记录
│
├── logs/                       # 日志归档目录 (由 core 自动创建) (新增)
│   ├── lexhub.log              # 核心引擎运行日志 (API 请求、引擎报错)
│   └── modules/                # 功能模块运行日志
│       ├── sillytavern_stdout.log # 模块运行时标准输出
│       └── sillytavern_stderr.log # 模块运行时异常报错日志
│
├── lh.sh                       # Linux / Ubuntu / Termux 引导入口
├── lh.bat                      # Windows CMD 引导入口
├── lh.ps1                      # Windows PowerShell 引导入口
└── DESIGN.md                   # 本设计规格书
```

---

## 🪵 2. 日志与异常反馈系统设计 (Logging & Diagnostics)

为了能够快速定位用户的异常（特别是在各种复杂的 Android/Windows 环境中），系统设计了多级日志体系：

### A. 日志分流存储
1.  **LexHub 引擎日志 (`logs/lexhub.log`)**：
    *   记录 Web 服务启动失败、跨平台探测失败、配置文件损坏、动态加载生命周期脚本报错。
    *   格式：`[2026-06-21 17:05:00] [ERROR] [Engine] Failed to load module 'sillytavern': Cannot find module '...'`
2.  **模块标准日志 (`logs/modules/<id>_stdout.log`)**：
    *   接收模块应用正常运行打印的信息。
3.  **模块异常日志 (`logs/modules/<id>_stderr.log`)**：
    *   接收模块应用发生 Crash、运行时抛出的 Stack Trace、端口冲突被强制终止的报错。

### B. 进程异常奔溃自愈 (Crash Auto-Healing)
在 `core/src/manager/process.ts` 中，当 spawn 的子进程退出时：
*   如果退出码（Exit Code）不为 0（代表异常奔溃）：
    1.  自动在 `logs/lexhub.log` 写入告警日志。
    2.  更新 `installed.json` 的状态为 `CRASHED`，并记录错误码。
    3.  若用户配置中该模块开启了 `auto_restart`: true，则引擎尝试重新拉起（限制最大重试次数为 3 次，防止死循环占用 CPU）。
    4.  向所有订阅该模块的 WebSocket 前端推流客户端发送系统通知：`"event": "crashed", "code": 1`。

### C. Web 前端报错诊断面板
当模块启动失败或异常退出时：
1.  前端卡片转为 **红色警告态**。
2.  卡片提供 **“查看报错诊断”** 按钮。
3.  点击后，前端直接通过接口 `GET /api/modules/:id/logs?type=stderr` 获取末尾 200 行报错日志，并在弹出的黑框控制台内渲染，方便用户复制报错信息向社区求助。

---

## 💻 3. 跨平台兼容性设计 (Windows, Termux, Debian/Ubuntu)

*   **双平台启动引导**：`lh.sh` 与 `lh.bat`/`lh.ps1`。
*   **智能依赖检测**：PATH 环境探测优先，缺什么就提示什么。
*   **路径与命令执行抽象**：使用 `path.join()`，Windows 自动适配 `.cmd` 扩展，以及 Windows 使用 `taskkill` 清理进程树。

---

## 📄 4. 模块元数据规范 (`lexhub-module.json`)

```json
{
  "id": "sillytavern",
  "name": "SillyTavern",
  "version": "1.12.0",
  "author": "Cohee1207",
  "description": "一个用于对接大语言模型的精美 Web 前端用户界面。",
  "icon": "/assets/icons/sillytavern.png",
  "repo_url": "https://github.com/SillyTavern/SillyTavern.git",
  "branch": "release",
  "dependencies": {
    "binaries": ["git", "node"],
    "npm": []
  },
  "env": {
    "PORT": {
      "default": 8000,
      "description": "应用运行端口"
    }
  },
  "port_mapping": {
    "source": 8000,
    "target": 8000
  }
}
```

---

## ⚙️ 5. 模块生命周期钩子 API (`lifecycle.js`)

```javascript
module.exports = {
  async install(ctx) {
    ctx.logger.info("正在克隆 SillyTavern 仓库...");
    await ctx.execCmd(`git clone -b ${ctx.module.branch} ${ctx.module.repo_url} "${ctx.paths.appDir}"`);
    
    ctx.logger.info("正在安装依赖项...");
    await ctx.execCmd("npm install --production", { cwd: ctx.paths.appDir });
    ctx.logger.success("SillyTavern 安装成功！");
  },

  async start(ctx) {
    ctx.logger.info("正在拉起 SillyTavern...");
    const child = ctx.spawnCmd("node", ["server.js"], {
      cwd: ctx.paths.appDir,
      env: {
        ...process.env,
        ...ctx.config
      }
    });
    return child.pid;
  },

  async stop(ctx) {
    ctx.logger.info("正在终止 SillyTavern 进程...");
    await ctx.killProcess();
  },

  async status(ctx) {
    const active = await ctx.checkProcessActive();
    return active ? "RUNNING" : "STOPPED";
  }
};
```

---

## 📡 6. 后端 API 设计 (HTTP & WebSocket)

### HTTP API 路由
*   `GET /api/modules`：返回模块列表与状态。
*   `GET /api/modules/:id`：返回单模块详情。
*   `GET /api/modules/:id/logs`：获取模块的日志内容（支持 `type=stdout|stderr|install`，并支持 query `lines=200` 限流）。
*   `POST /api/modules/:id/config`：更新环境变量。
*   `POST /api/modules/:id/install`：触发安装。
*   `POST /api/modules/:id/start`：启动。
*   `POST /api/modules/:id/stop`：停止。
*   `GET /api/system/info`：返回系统状态、操作系统类型等。

### WebSocket 路由
*   `WS /ws/logs?module_id=<id>`：日志实时推流。
*   `WS /ws/system`：系统负载实时广播。
