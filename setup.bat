@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

:: ============================================================
::  草莓啵啵英语工厂 - 远程一键引导脚本 (Windows)
::  零基础用户只需复制粘贴以下命令到命令行即可：
::    powershell -Command "irm https://raw.githubusercontent.com/snow111000106/english-game/agent/setup.bat | iex"
::  或直接在 PowerShell 中运行：
::    irm https://raw.githubusercontent.com/snow111000106/english-game/agent/setup.bat | iex
:: ============================================================

echo.
echo 🍓🧋 草莓啵啵英语工厂 - 远程一键安装
echo ================================
echo.

set INSTALL_DIR=%USERPROFILE%\Desktop\english-game

:: ---------- 检查管理员权限 ----------
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  需要管理员权限来安装 Node.js，正在自动提权...
    echo.
    powershell -Command "Start-Process cmd -ArgumentList '/c %~f0' -Verb RunAs"
    exit /b
)

:: ---------- 第1步：下载项目 ----------
echo [1/3] 下载项目...

if exist "%INSTALL_DIR%\.git" (
    echo   📁 发现已有项目，正在更新...
    cd /d "%INSTALL_DIR%"
    where git >nul 2>&1
    if !errorlevel! equ 0 (
        git pull origin agent >nul 2>&1
    ) else (
        echo   (无法自动更新，继续使用现有版本)
    )
) else if exist "%INSTALL_DIR%\package.json" (
    echo   📁 发现已有目录，重新下载...
    rmdir /s /q "%INSTALL_DIR%"
    goto :download_project
) else (
    goto :download_project
)
goto :check_node

:download_project
:: 优先用 git clone
where git >nul 2>&1
if !errorlevel! equ 0 (
    echo   正在通过 Git 克隆项目...
    git clone https://github.com/snow111000106/english-game.git "%INSTALL_DIR%"
    cd /d "%INSTALL_DIR%"
    git checkout agent
    echo   ✅ 项目已克隆到桌面
) else (
    :: 没有 git，用 PowerShell 下载 ZIP
    echo   📦 Git 不可用，正在通过 PowerShell 下载 ZIP 包...
    powershell -Command "^
        $progressPreference = 'SilentlyContinue';^
        $url = 'https://github.com/snow111000106/english-game/archive/refs/heads/agent.zip';^
        $out = '$env:TEMP\english-game.zip';^
        Write-Host '  正在下载...';^
        Invoke-WebRequest -Uri $url -OutFile $out;^
        Write-Host '  正在解压...';^
        if (Test-Path '$env:TEMP\english-game-extract') { Remove-Item '$env:TEMP\english-game-extract' -Recurse -Force; }^
        Expand-Archive -Path $out -DestinationPath '$env:TEMP\english-game-extract' -Force;^
        if (Test-Path '%INSTALL_DIR%') { Remove-Item '%INSTALL_DIR%' -Recurse - Force; }^
        Move-Item '$env:TEMP\english-game-extract\english-game-agent' '%INSTALL_DIR%';^
        Write-Host '  ✅ 项目已下载到桌面';^
    "
    if !errorlevel! neq 0 (
        echo   ❌ 项目下载失败，请检查网络连接
        echo   或手动下载：https://github.com/snow111000106/english-game
        pause
        exit /b 1
    )
    cd /d "%INSTALL_DIR%"
)

:check_node
:: ---------- 第2步：安装 Node.js ----------
echo.
echo [2/3] 检查 Node.js...

set NEED_INSTALL_NODE=0

where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
    echo   ✅ 已安装 Node.js !NODE_VERSION!
    set NODE_VER_NUM=!NODE_VERSION:v=!
    for /f "tokens=1 delims=." %%a in ("!NODE_VER_NUM!") do set NODE_MAJOR=%%a
    if !NODE_MAJOR! lss 22 (
        echo   ⚠️  当前版本 !NODE_VERSION!，需要 v22+，正在升级...
        set NEED_INSTALL_NODE=1
    )
) else (
    echo   ⚠️  未检测到 Node.js，正在安装...
    set NEED_INSTALL_NODE=1
)

if !NEED_INSTALL_NODE! equ 1 (
    where winget >nul 2>&1
    if !errorlevel! equ 0 (
        echo   📦 正在通过 winget 安装 Node.js 22 LTS...
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        if !errorlevel! equ 0 (
            echo   ✅ Node.js 安装成功
            for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%b"
            for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%b"
            set "PATH=!SYS_PATH!;!USR_PATH!"
        ) else (
            echo   ❌ winget 安装失败，请手动安装：https://nodejs.org/
            pause
            exit /b 1
        )
    ) else (
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
            for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do set "SYS_PATH=%%b"
            set "PATH=!SYS_PATH!;!PATH!"
        ) else (
            echo   ❌ 自动安装失败，请手动安装：https://nodejs.org/
            pause
            exit /b 1
        )
    )
)

:: ---------- 第3步：安装依赖 ----------
echo.
echo [3/3] 安装项目依赖...
echo   ⏳ 正在安装，可能需要 1-2 分钟，请耐心等待...
echo.

where npm >nul 2>&1
if !errorlevel! neq 0 (
    echo   ❌ npm 不可用，可能需要重新打开命令行窗口让环境变量生效
    echo   请关闭此窗口，重新打开命令行，运行：
    echo      cd /d "%INSTALL_DIR%"
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
echo   双击桌面 english-game 文件夹中的 start.bat
echo.
echo 或在命令行运行：
echo   cd /d "%INSTALL_DIR%"
echo   start.bat
echo.
echo 🌐 然后在浏览器打开：
echo   http://localhost:5173/
echo.
echo 📖 关闭系统：在命令行窗口按 Ctrl + C
