#!/bin/bash

# ============================================================
#  草莓啵啵英语工厂 - 一键安装脚本 (macOS)
#  用法：打开终端，进入项目目录，运行：
#    sh install.sh
# ============================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "🍓🧋 草莓啵啵英语工厂 - 一键安装"
echo "================================"
echo ""

# ---------- 第1步：检查 Node.js ----------
echo -e "${BLUE}[1/4] 检查 Node.js...${NC}"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v | sed 's/v//')
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d. -f1)
    echo "  ✅ 已安装 Node.js v$NODE_VERSION"
    if [ "$NODE_MAJOR" -lt 22 ]; then
        echo -e "  ${YELLOW}⚠️  当前版本 v$NODE_VERSION，项目需要 v22 或更高版本${NC}"
        echo -e "  ${YELLOW}   正在通过 Homebrew 安装最新版...${NC}"
        if ! command -v brew &> /dev/null; then
            echo -e "  ${RED}❌ 未检测到 Homebrew，请手动安装 Node.js v22+：${NC}"
            echo -e "  ${RED}   https://nodejs.org/${NC}"
            exit 1
        fi
        brew install node@22
        brew link node@22 --force --overwrite
        echo -e "  ${GREEN}✅ Node.js 已更新${NC}"
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
    fi
    echo -e "  ${GREEN}✅ Node.js 已安装$(node -v)${NC}"
fi

# ---------- 第2步：检查 Git ----------
echo ""
echo -e "${BLUE}[2/4] 检查 Git...${NC}"

if command -v git &> /dev/null; then
    echo "  ✅ 已安装 Git $(git --version | awk '{print $3}')"
else
    echo -e "  ${YELLOW}  未检测到 Git，正在安装...${NC}"
    if command -v brew &> /dev/null; then
        brew install git
    else
        echo -e "  ${RED}❌ 请手动安装 Git：brew install git${NC}"
        exit 1
    fi
    echo -e "  ${GREEN}✅ Git 已安装${NC}"
fi

# ---------- 第3步：克隆项目（如果不在项目目录中）----------
echo ""
echo -e "${BLUE}[3/4] 检查项目文件...${NC}"

# 判断当前目录是否已经是项目目录
if [ -f "package.json" ] && grep -q "english-learn" package.json 2>/dev/null; then
    echo "  ✅ 已在项目目录中"
else
    INSTALL_DIR="$HOME/Desktop/english-game"
    echo -e "  ${YELLOW}  当前目录不是项目目录，将克隆到桌面...${NC}"

    if [ -d "$INSTALL_DIR" ]; then
        echo "  📁 发现已有目录 $INSTALL_DIR"
        cd "$INSTALL_DIR"
        git pull origin agent 2>/dev/null || echo "  (已是最新或无法拉取，继续)"
    else
        git clone https://github.com/snow111000106/english-game.git "$INSTALL_DIR"
        cd "$INSTALL_DIR"
        git checkout agent
    fi
    echo -e "  ${GREEN}✅ 项目已准备好${NC}"
fi

# ---------- 第4步：安装依赖 ----------
echo ""
echo -e "${BLUE}[4/4] 安装项目依赖...${NC}"
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
echo -e "  ${YELLOW}cd $(pwd)${NC}"
echo -e "  ${YELLOW}npm run dev:prod${NC}"
echo ""
echo "🌐 然后在浏览器打开："
echo -e "  ${BLUE}http://localhost:5173/${NC}"
echo ""
echo "📖 关闭系统：在终端按 Ctrl + C"
echo ""
echo "💡 提示：以后每次使用，只需运行以上两条命令即可"
echo ""
