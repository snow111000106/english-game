@echo off
chcp 65001 >nul 2>&1
setlocal

:: ============================================================
::  草莓啵啵英语工厂 - 一键启动脚本 (Windows)
::  用法：双击运行，或在命令行中执行：
::    start.bat
:: ============================================================

:: 切换到脚本所在目录
cd /d "%~dp0"

:: 检查是否已安装依赖
if not exist "node_modules" (
    echo.
    echo ❌ 还没安装项目依赖，正在自动安装...
    echo.
    npm install
)

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 未检测到 Node.js，请先运行 install.bat 安装
    pause
    exit /b 1
)

:: 检查 Node.js 版本
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
set NODE_VER_NUM=!NODE_VERSION:v=!
for /f "tokens=1 delims=." %%a in ("!NODE_VER_NUM!") do set NODE_MAJOR=%%a
if !NODE_MAJOR! lss 22 (
    echo.
    echo ❌ Node.js 版本过低（当前 !NODE_VERSION!），需要 v22 或更高版本
    echo    请访问 https://nodejs.org/ 更新
    pause
    exit /b 1
)

echo.
echo 🍓🧋 正在启动草莓啵啵英语工厂...
echo.

:: 启动系统
npm run dev:prod
