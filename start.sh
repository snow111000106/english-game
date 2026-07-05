#!/bin/bash

# ============================================================
#  草莓啵啵英语工厂 - 一键启动脚本 (macOS)
#  用法：打开终端，进入项目目录，运行：
#    sh start.sh
# ============================================================

# 获取脚本所在目录（支持从任意位置运行）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# 检查是否已安装依赖
if [ ! -d "node_modules" ]; then
    echo ""
    echo "❌ 还没安装项目依赖，正在自动安装..."
    echo ""
    npm install
fi

# 检查 Node.js 版本
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | sed 's/v//')
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1)
    if [ "$NODE_MAJOR" -lt 22 ]; then
        echo ""
        echo "❌ Node.js 版本过低（当前 v$NODE_VERSION），需要 v22 或更高版本"
        echo "   请访问 https://nodejs.org/ 更新"
        exit 1
    fi
else
    echo "❌ 未检测到 Node.js，请先运行 sh install.sh 安装"
    exit 1
fi

echo ""
echo "🍓🧋 正在启动草莓啵啵英语工厂..."
echo ""

# 启动系统
npm run dev:prod
