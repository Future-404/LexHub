# 🌐 GCLI2API — LexHub 集成说明

> **上游项目**：[su-kaka/gcli2api](https://github.com/su-kaka/gcli2api)  
> **完整文档**：[上游 README](https://github.com/su-kaka/gcli2api#readme)  
> **平台支持**：Linux · Termux (Android)

---

## 简介

GCLI2API 是一个 Python 应用，将 **GeminiCLI** 和 **Antigravity (agy)** 转换为标准 API 兼容接口，支持输出 OpenAI、Gemini 和 Claude API 三种格式，方便 SillyTavern 等客户端直接接入。

---

## 快速开始

1. 确保已登录 **GeminiCLI** 或 **Antigravity (agy)**（GCLI2API 依赖其认证状态）
2. 打开 **Web UI** → 顶部导航 → **商店**
3. 找到 **GCLI2API** 🌐，点击 **安装**
4. 安装完成后，在 **模块** 页面点击 **启动**
5. 访问 `http://localhost:7861` 确认服务运行

---

## 配置选项

在 **Web UI → 模块 → GCLI2API → 配置** 中可调整：

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `7861` | 服务监听端口 |
| `PASSWORD` | `pwd` | Authorization 访问密钥（客户端请求时需提供） |
| `HOST` | `0.0.0.0` | 监听地址（`127.0.0.1` 仅允许本机访问） |

---

## 安装过程说明

LexHub 安装时会自动：
1. 克隆 GCLI2API 仓库
2. 创建 Python 虚拟环境（`venv`）
3. 安装 Python 依赖：
   - Termux：优先使用 `requirements-termux.txt`（经过 Termux 兼容性优化）
   - 其他平台：使用标准 `requirements.txt`
   - 默认使用清华大学 PyPI 镜像加速

---

## 在 SillyTavern 中使用

1. SillyTavern → API 设置 → 选择 **Custom (OpenAI-compatible)**
2. API URL：`http://127.0.0.1:7861`
3. API Key：填写 `PASSWORD` 配置项的值（默认 `pwd`）

---

## 平台注意事项

- **Termux**：需要 `python3`（`pkg install python`），LexHub 不会自动安装 Python，请提前准备
- **Linux VPS**：需要 `python3`，大多数发行版已预装
- 首次启动需要 GeminiCLI/Antigravity 已完成登录并保存认证状态

---

## 常见问题

| 问题 | 解决方案 |
|---|---|
| `python3: command not found` | Termux：`pkg install python`；Linux：`apt install python3` |
| `venv` 未初始化 | 重新安装模块，安装步骤会自动创建虚拟环境 |
| 返回 401 Unauthorized | 检查客户端 API Key 是否与 `PASSWORD` 配置一致 |
| GeminiCLI 未登录 | 先运行 `gemini auth login` 或 `agy auth` 完成认证 |
| 依赖安装超时 | 已默认使用清华 PyPI 镜像；若仍超时，检查网络连接 |

→ [查看上游完整文档](https://github.com/su-kaka/gcli2api#readme)
