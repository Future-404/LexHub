@echo off
:: ═══════════════════════════════════════════════════════════════════
::  LexHub — Windows CMD Bootstrap Script
::  Usage: lh.bat [command] [args...]
:: ═══════════════════════════════════════════════════════════════════

setlocal EnableDelayedExpansion

set "LEXHUB_DIR=%~dp0"
set "CORE_DIR=%LEXHUB_DIR%core"
set "DIST_ENTRY=%CORE_DIR%\dist\index.js"

echo.
echo   ██╗     ███████╗██╗  ██╗██╗  ██╗██╗   ██╗██████╗
echo   ██║     ██╔════╝╚██╗██╔╝██║  ██║██║   ██║██╔══██╗
echo   ██║     █████╗   ╚███╔╝ ███████║██║   ██║██████╔╝
echo   ██║     ██╔══╝   ██╔██╗ ██╔══██║██║   ██║██╔══██╗
echo   ███████╗███████╗██╔╝ ██╗██║  ██║╚██████╔╝██████╔╝
echo   ╚══════╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝
echo              AI 应用管理器 v2.0
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [LexHub] 未检测到 Node.js，请前往 https://nodejs.org 下载安装后重试。
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo [LexHub] Node.js 已就绪: %NODE_VER%

:: Install deps if needed
if not exist "%CORE_DIR%\node_modules" (
    echo [LexHub] 正在安装依赖...
    pushd "%CORE_DIR%"
    call npm.cmd install --prefer-offline
    popd
)

:: Run
if exist "%DIST_ENTRY%" (
    node "%DIST_ENTRY%" %*
) else (
    echo [LexHub] 未找到编译产物，尝试使用 tsx 运行...
    pushd "%CORE_DIR%"
    call npx.cmd tsx src/index.ts %*
    popd
)
