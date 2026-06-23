# ═══════════════════════════════════════════════════════════════════
#  LexHub — Windows PowerShell Bootstrap Script
#  Usage: .\lh.ps1 [command] [args...]
# ═══════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

$LEXHUB_DIR = Split-Path -Parent $MyInvocation.MyCommand.Definition
$CORE_DIR = Join-Path $LEXHUB_DIR "core"
$DIST_ENTRY = Join-Path $CORE_DIR "dist\index.js"

Write-Host ""
Write-Host "  ██╗     ███████╗██╗  ██╗██╗  ██╗██╗   ██╗██████╗ " -ForegroundColor Cyan
Write-Host "  ██║     ██╔════╝╚██╗██╔╝██║  ██║██║   ██║██╔══██╗" -ForegroundColor Cyan
Write-Host "  ██║     █████╗   ╚███╔╝ ███████║██║   ██║██████╔╝" -ForegroundColor Cyan
Write-Host "  ██║     ██╔══╝   ██╔██╗ ██╔══██║██║   ██║██╔══██╗" -ForegroundColor Cyan
Write-Host "  ███████╗███████╗██╔╝ ██╗██║  ██║╚██████╔╝██████╔╝" -ForegroundColor Cyan
Write-Host "  ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ " -ForegroundColor Cyan
Write-Host "             AI 应用管理器 v2.0" -ForegroundColor Yellow
Write-Host ""

# Check Node.js
try {
    $nodeVersion = & node --version 2>&1
    Write-Host "[LexHub] Node.js 已就绪: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "[LexHub] 未检测到 Node.js，请前往 https://nodejs.org 下载安装后重试。" -ForegroundColor Red
    exit 1
}

# Install deps if needed
$nodeModules = Join-Path $CORE_DIR "node_modules"
if (-not (Test-Path $nodeModules)) {
    Write-Host "[LexHub] 正在安装依赖..." -ForegroundColor Yellow
    Push-Location $CORE_DIR
    & npm install --prefer-offline
    Pop-Location
}

# Run
if (Test-Path $DIST_ENTRY) {
    & node $DIST_ENTRY @args
} else {
    Write-Host "[LexHub] 未找到编译产物，尝试使用 tsx 运行..." -ForegroundColor Yellow
    Push-Location $CORE_DIR
    & npx tsx src/index.ts @args
    Pop-Location
}
