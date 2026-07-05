#!/bin/bash

# ============================================================
#  草莓啵啵英语工厂 - 远程一键引导脚本 (macOS)
#  零基础用户只需复制粘贴以下命令到终端即可：
#    sh -c "$(curl -fsSL https://raw.githubusercontent.com/snow111000106/english-game/agent/setup.sh)"
# ============================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "🍓🧋 草莓啵啵英语工厂 - 远程一键安装"
echo "================================"
echo ""

INSTALL_DIR="$HOME/Desktop/english-game"

# ---------- 下载项目 ----------
echo -e "${BLUE}[1/3] 下载项目...${NC}"

if [ -d "$INSTALL_DIR/.git" ]; then
    echo "  📁 发现已有项目，正在更新..."
    cd "$INSTALL_DIR"
    git pull origin agent 2>/dev/null || echo "  (已是最新，继续)"
elif [ -d "$INSTALL_DIR" ]; then
    echo "  📁 发现已有目录，重新下载..."
    rm -rf "$INSTALL_DIR"
    git clone https://github.com/snow111000106/english-game.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    git checkout agent
else
    # 检查 git 是否可用
    if command -v git &> /dev/null; then
        git clone https://github.com/snow111000106/english-game.git "$INSTALL_DIR"
        cd "$INSTALL_DIR"
        git checkout agent
    else
        # 没有 git，用 curl 下载 ZIP
        echo -e "  ${YELLOW}  Git 不可用，正在下载 ZIP 包...${NC}"
        ZIP_URL="https://github.com/snow111000106/english-game/archive/refs/heads/agent.zip"
        TMP_ZIP="/tmp/english-game-setup.zip"
        TMP_EXTRACT="/tmp/english-game-setup-extract"

        # 尝试 curl
        if command -v curl &> /dev/null; then
            curl -fsSL "$ZIP_URL" -o "$TMP_ZIP"
        # 回退到 wget
        elif command -v wget &> /dev/null; then
            wget -q "$ZIP_URL" -O "$TMP_ZIP"
        else
            echo -e "  ${RED}❌ 需要 curl 或 wget 来下载项目${NC}"
            echo -e "  ${RED}   请安装 Git：${NC}"
            if command -v brew &> /dev/null; then
                echo -e "  ${RED}   运行：brew install git${NC}"
            else
                echo -e "  ${RED}   从 https://git-scm.com/download/mac 下载安装${NC}"
            fi
            exit 1
        fi

        # 解压
        rm -rf "$TMP_EXTRACT"
        mkdir -p "$TMP_EXTRACT"
        if command -v unzip &> /dev/null; then
            unzip -q "$TMP_ZIP" -d "$TMP_EXTRACT"
        else
            echo -e "  ${RED}❌ 需要 unzip 来解压项目${NC}"
            exit 1
        fi

        # 移动到目标目录
        mv "$TMP_EXTRACT/english-game-agent" "$INSTALL_DIR"
        rm -rf "$TMP_ZIP" "$TMP_EXTRACT"
        cd "$INSTALL_DIR"
    fi
fi
echo -e "  ${GREEN}✅ 项目已准备好${NC}"

# ---------- 安装 Node.js ----------
echo ""
echo -e "${BLUE}[2/3] 检查 Node.js...${NC}"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | sed 's/v//')
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1)
    echo "  ✅ 已安装 Node.js v$NODE_VERSION"
    if [ "$NODE_MAJOR" -lt 22 ]; then
        echo -e "  ${YELLOW}⚠️  当前版本 v$NODE_VERSION，需要 v22+，正在升级...${NC}"
        if ! command -v brew &> /dev/null; then
            echo -e "  ${YELLOW}  正在安装 Homebrew...${NC}"
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi
        brew install node@22
        brew link node@22 --force --overwrite
        echo -e "  ${GREEN}✅ Node.js 已更新$(node -v)${NC}"
    fi
else
    echo -e "  ${YELLOW}  未检测到 Node.js，正在安装...${NC}"
    if command -v brew &> /dev/null; then
        brew install node@22
        brew link node@22 --force --overwrite
    else
        echo -e "  ${YELLOW}  正在安装 Homebrew...${NC}"
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        brew install node@22
        brew link node@22 --force --overwrite
    fi
    echo -e "  ${GREEN}✅ Node.js 已安装$(node -v)${NC}"
fi

# ---------- 安装依赖 ----------
echo ""
echo -e "${BLUE}[3/3] 安装项目依赖...${NC}"
echo "  ⏳ 正在安装，可能需要 1-2 分钟，请耐心等待..."
echo ""

npm install

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}✅ 安装完成！${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "🚀 启动系统："
echo ""
echo -e "  ${YELLOW}cd $INSTALL_DIR${NC}"
echo -e "  ${YELLOW}sh start.sh${NC}"
echo ""
echo "🌐 然后在浏览器打开："
echo -e "  ${BLUE}http://localhost:5173/${NC}"
echo ""
echo "📖 关闭系统：在终端按 Ctrl + C"
echo ""
