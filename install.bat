@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

:: ============================================================
::  草莓啵啵英语工厂 - 一键安装脚本 (Windows)
::  用法：双击运行，或在命令行中执行：
::    install.bat
:: ============================================================

echo.
echo 🍓🧋 草莓啵啵英语工厂 - 一键安装
echo ================================
echo.

:: ---------- 检查管理员权限（winget 需要安装软件）----------
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  需要管理员权限来安装 Node.js，正在自动提权...
    echo.
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:: ---------- 第1步：检查并安装 Node.js ----------
echo [1/4] 检查 Node.js...

set NEED_INSTALL_NODE=0

where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
    echo   ✅ 已安装 Node.js !NODE_VERSION!
    set NODE_VER_NUM=!NODE_VERSION:v=!
    for /f "tokens=1 delims=." %%a in ("!NODE_VER_NUM!") do set NODE_MAJOR=%%a
    if !NODE_MAJOR! lss 22 (
        echo   ⚠️  当前版本 !NODE_VERSION!，需要 v22 或更高版本，正在升级...
        set NEED_INSTALL_NODE=1
    )
) else (
    echo   ⚠️  未检测到 Node.js，正在安装...
    set NEED_INSTALL_NODE=1
)

if !NEED_INSTALL_NODE! equ 1 (
    :: 尝试用 winget 安装
    where winget >nul 2>&1
    if !errorlevel! equ 0 (
        echo   📦 正在通过 winget 安装 Node.js 22 LTS...
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        if !errorlevel! equ 0 (
            echo   ✅ Node.js 安装成功
            :: 刷新环境变量
            for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%b"
            for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%b"
            set "PATH=!SYS_PATH!;!USR_PATH!"
        ) else (
            echo   ❌ winget 安装失败，请手动安装：
            echo      1. 打开 https://nodejs.org/
            echo      2. 下载 LTS 版本的 .msi 安装包
            echo      3. 双击安装后重新运行此脚本
            pause
            exit /b 1
        )
    ) else (
        :: 没有 winget，尝试用 PowerShell 下载安装
        echo   📦 未检测到 winget，正在通过 PowerShell 下载安装...
        powershell -Command "^
            $progressPreference = 'SilentlyContinue';^
            Write-Host '  正在下载 Node.js 22 LTS...';^
            $url = 'https://nodejs.org/dist/v22.12.0/node-v22.12.0-x64.msi';^
            $out = '$env:TEMP\node-install.msi';^
            Invoke-WebRequest -Uri $url -OutFile $out;^
            Write-Host '  正在安装...';^
            Start-Process msiexec.exe -ArgumentList '/i', $out, '/quiet', '/norestart' -Wait;^
            Write-Host '  ✅ Node.js 安装完成';^
        "
        if !errorlevel! equ 0 (
            :: 刷新环境变量
            for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%b"
            set "PATH=!SYS_PATH!;!PATH!"
        ) else (
            echo   ❌ 自动安装失败，请手动安装：
            echo      1. 打开 https://nodejs.org/
            echo      2. 下载 LTS 版本的 .msi 安装包
            echo      3. 双击安装后重新运行此脚本
            pause
            exit /b 1
        )
    )
)

:: ---------- 第2步：检查并安装 Git ----------
echo.
echo [2/4] 检查 Git...

where git >nul 2>&1
if %errorlevel% equ 0 (
    echo   ✅ 已安装 Git
) else (
    echo   ⚠️  未检测到 Git，正在安装...
    where winget >nul 2>&1
    if !errorlevel! equ 0 (
        winget install Git.Git --accept-package-agreements --accept-source-agreements
        :: 刷新环境变量
        for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%b"
        set "PATH=!SYS_PATH!;!PATH!"
    ) else (
        echo   ⚠️  无法自动安装 Git，将跳过克隆步骤
        echo   如果你已经下载了项目 ZIP 并解压，可以忽略此提示
    )
)

:: ---------- 第3步：检查项目文件 ----------
echo.
echo [3/4] 检查项目文件...

if exist "package.json" (
    findstr /c:"english-learn" package.json >nul 2>&1
    if !errorlevel! equ 0 (
        echo   ✅ 已在项目目录中
        goto :install_deps
    )
)

echo   ⚠️  当前目录不是项目目录
if exist "%USERPROFILE%\Desktop\english-game\package.json" (
    echo   📁 发现桌面已有项目，进入该目录...
    cd /d "%USERPROFILE%\Desktop\english-game"
    where git >nul 2>&1
    if !errorlevel! equ 0 (
        git pull origin agent >nul 2>&1
    ) else (
        echo   (无法自动更新，继续使用现有版本)
    )
    goto :install_deps
) else (
    echo   正在下载项目到桌面...
    where git >nul 2>&1
    if !errorlevel! equ 0 (
        git clone https://github.com/snow111000106/english-game.git "%USERPROFILE%\Desktop\english-game"
        cd /d "%USERPROFILE%\Desktop\english-game"
        git checkout agent
        echo   ✅ 项目已克隆到桌面
    ) else (
        echo   📦 Git 不可用，正在通过 PowerShell 下载项目 ZIP 包...
        powershell -Command "^
            $progressPreference = 'SilentlyContinue';^
            $url = 'https://github.com/snow111000106/english-game/archive/refs/heads/agent.zip';^
            $out = '$env:TEMP\english-game.zip';^
            Write-Host '  正在下载...';^
            Invoke-WebRequest -Uri $url -OutFile $out;^
            Write-Host '  正在解压...';^
            Expand-Archive -Path $out -DestinationPath '$env:TEMP\english-game-extract' -Force;^
            if (Test-Path '$env:USERPROFILE\Desktop\english-game') { Remove-Item '$env:USERPROFILE\Desktop\english-game' -Recurse -Force; }^
            Move-Item '$env:TEMP\english-game-extract\english-game-agent' '$env:USERPROFILE\Desktop\english-game';^
            Write-Host '  ✅ 项目已下载到桌面';^
        "
        if !errorlevel! neq 0 (
            echo   ❌ 项目下载失败，请检查网络连接
            echo   或手动下载：https://github.com/snow111000106/english-game
            pause
            exit /b 1
        )
        cd /d "%USERPROFILE%\Desktop\english-game"
    )
)

:install_deps
:: ---------- 第4步：安装依赖 ----------
echo.
echo [4/4] 安装项目依赖...
echo   ⏳ 正在安装，可能需要 1-2 分钟，请耐心等待...
echo.

where npm >nul 2>&1
if !errorlevel! neq 0 (
    echo   ❌ npm 不可用，可能需要重新打开命令行窗口让环境变量生效
    echo   请关闭此窗口，重新打开命令行，进入项目目录运行：
    echo      cd /d "%CD%"
    echo      npm install
    pause
    exit /b 1
)

npm install
if !errorlevel! neq 0 (
    echo.
    echo   ❌ 依赖安装失败，请检查网络连接后重试
    pause
    exit /b 1
)

echo.
echo ================================
echo ✅ 安装完成！
echo ================================
echo.
echo 🚀 启动系统：
echo.
echo   双击 start.bat
echo.
echo 或在命令行运行：
echo   cd /d "%CD%"
echo   npm run dev:prod
echo.
echo 🌐 然后在浏览器打开：
echo   http://localhost:5173/
echo.
echo 📖 关闭系统：在命令行窗口按 Ctrl + C
