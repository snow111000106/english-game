# Berry Boba English Factory · 草莓啵啵英语工厂

一个给 6 岁小朋友使用的草莓啵啵英语工厂养成游戏。课程参考 British Council LearnEnglish Kids 的听说读写活动分类，以及 Cambridge English 儿童 Pre-A1 / A1 分级思路，自建原创词库和原创卡通角色。

> 说明：星之卡比属于 Nintendo 的受版权保护角色。本项目不复制或下载官方图片，而是做"粉色、圆润、可爱、喝草莓啵啵"的原创伙伴与工厂玩法。如果你拥有某些图片授权，可放入 `public/partners/` 并在代码中配置使用。

---

## 🚀 快速部署（面向电脑小白）

### ✨ 零基础一键安装（推荐！不需要提前准备任何东西）

> 完全不会用电脑？没关系！只需要复制下面**一条命令**，粘贴到命令行里，按回车，剩下的全自动。

**Mac 用户** — 打开终端（按 `Command + 空格`，输入 `终端`，按回车），粘贴：

```bash
sh -c "$(curl -fsSL https://raw.githubusercontent.com/snow111000106/english-game/agent/setup.sh)"
```

**Windows 用户** — 打开 PowerShell（按 `Win + R`，输入 `powershell`，按回车），粘贴：

```powershell
irm https://raw.githubusercontent.com/snow111000106/english-game/agent/setup.bat | iex
```

> 这条命令会自动完成所有事情：下载项目代码 → 安装 Node.js → 安装依赖，全程不需要你做任何操作。
>
> **Windows 用户**：如果弹出管理员权限确认框，点"是"即可。如果用 PowerShell 方式运行不了，也可以用浏览器打开 https://github.com/snow111000106/english-game ，点击绿色 `Code` 按钮 → `Download ZIP`，解压后双击里面的 `setup.bat`。

---

### 已经有项目代码了？

如果你已经下载/克隆了项目代码，直接在项目目录中运行安装脚本即可：

#### Mac 用户

```bash
# 1️⃣ 一键安装（首次使用，自动安装 Node.js + Git + 项目依赖）
sh install.sh

# 2️⃣ 一键启动（以后每次使用只需这一条）
sh start.sh
```

> **怎么打开终端？** 按 `Command + 空格`，输入 `终端` 或 `Terminal`，按回车

#### Windows 用户

```cmd
:: 1️⃣ 一键安装（首次使用，自动安装 Node.js + Git + 项目依赖）
install.bat

:: 2️⃣ 一键启动（以后每次使用只需这一条）
start.bat
```

> **怎么打开命令行？** 按 `Win + R`，输入 `cmd`，按回车。也可以直接双击 `install.bat` / `start.bat` 文件

> **Windows 一键安装说明**：`install.bat` 会自动通过 `winget` 安装 Node.js 22 LTS 和 Git，全程无需手动操作。如果系统不支持 `winget`（Windows 10 较老版本），会自动改用 PowerShell 下载安装。安装 Node.js 时可能弹出管理员权限确认框，点"是"即可。

### 启动后

启动成功后，打开浏览器（推荐 **Chrome** 或 **Edge**），访问：

```
http://localhost:5173/
```

看到"草莓啵啵英语工厂"的登录页面，就说明部署成功了！输入账号和密码即可开始使用。

### 日常使用

- **每次使用**：打开终端 → 进入项目目录 → 运行 `sh start.sh`（Mac）或 `start.bat`（Windows）→ 浏览器打开 `http://localhost:5173/`
- **关闭系统**：在终端按 `Ctrl + C`（Windows/Mac 通用）
- **数据保存在哪里**：项目目录下的 `data/berry-english-prod.sqlite` 文件中，不会丢失
- **备份数据**：建议定期在"家长"面板点击"导出备份"，保存一份 JSON 文件到安全的地方

### 常见问题

| 问题 | 解决方法 |
| --- | --- |
| `npm install` 报错 | 重新运行 `install.bat`（Mac 运行 `sh install.sh`）即可自动修复，或手动确认 `node -v` 版本 ≥ 22 |
| 端口被占用 | 项目会自动释放端口，如果还是不行，重启电脑后再试 |
| 浏览器打不开页面 | 确认终端里显示了 `http://localhost:5173/`，且终端窗口没关闭 |
| 页面打开了但功能不正常 | 确认用的是 **Chrome** 或 **Edge** 浏览器，Safari 和 Firefox 对语音识别支持不好 |
| 关闭终端后页面打不开了 | 正常现象，系统需要终端保持运行。重新运行 `npm run dev:prod` 即可 |

---

## 功能

- 每天自动生成 10 个口语学习任务
- 根据历史记录优先复习不熟练、昨天未完成、长期未练的内容
- 听力练习：使用浏览器 `speechSynthesis` 播放英文单词/短句
- 口语练习：使用浏览器 Web Speech API 识别小朋友说的英文
- 星级评分：识别文本越接近目标词句，星星越多，每题最高 3 颗星，每天最多 30 颗星
- 每日抽奖：完成当天 10 个任务后，可打开礼盒，掉落草莓种子、小麦种子、阳光、雨露、小鸡、牛奶等
- 星星商店：星星兑换阳光、雨露、鸡食料和种子，用于照顾花园
- 花园农场：草莓和小麦需要阳光 + 雨露成长，小鸡吃鸡食料后生鸡蛋；还有茶叶和小麦地块
- 工厂制作：小麦可磨成面粉；草莓啵啵和蛋挞可由仓库材料制作
- 角色解锁：制作草莓啵啵/蛋挞获得招待点数，逐步解锁伙伴
- 词库：内置 100+ 个 Pre-A1/A1 起步词和短句，点击进入详情可试听和自由练习（不加星星）
- 家长面板：查看学习次数、星星、薄弱词、每日快照，支持导出/导入备份
- 本地数据库：使用 SQLite 持久化保存所有学习记录和游戏数据

## 技术架构

| 部分 | 技术 | 说明 |
| --- | --- | --- |
| 前端 | React 19 + Vite 8 + TypeScript | 页面和交互 |
| 后端 | Node.js 内置 `node:sqlite` | 本地 SQLite API 服务器 |
| 数据存储 | SQLite 数据库文件 | `data/berry-english-prod.sqlite` |
| 语音识别 | Web Speech API | 浏览器原生支持，无需额外服务 |

### 运行命令一览

| 命令 | 用途 |
| --- | --- |
| `npm run dev:prod` | 启动正式环境（前端 5173 + API 6173） |
| `npm run dev:test` | 启动测试环境（前端 5174 + API 6174） |
| `npm run build` | 构建生产版本到 `dist/` |
| `npm run preview` | 预览构建产物 |

### 环境说明

- **正式环境（prod）**：前端端口 5173，API 端口 6173，数据库 `data/berry-english-prod.sqlite`
- **测试环境（test）**：前端端口 5174，API 端口 6174，数据库 `data/berry-english-test.sqlite`
- 两个环境数据完全独立，互不影响

## 浏览器建议

- ✅ **推荐 Chrome 或 Edge**：听力朗读和口语识别都能正常工作
- ⚠️ Safari / Firefox：听力可以，但口语识别可能不完整
- 语音识别需要页面通过 `http://` 或 `https://` 访问，本地 `localhost` 即可

## 数据保存和备份

- 学习记录保存在本地 SQLite 数据库文件中，关闭浏览器或重启电脑不会丢失
- **每日快照**：系统每天自动保存一份完整状态快照（保留 90 天），可在家长面板查看
- **手动备份**：建议定期在"家长"页面点击"导出备份"，保存 JSON 文件到安全位置
- **更换电脑**：复制 `data/` 目录到新电脑相同位置即可恢复全部数据

## 伙伴图片替换

当前默认使用 `public/partners/` 下的原创图片。如需替换，请仅使用自己创作、已购买授权或确认可商用/可个人使用的图片，避免使用未授权官方角色素材。

## 后续可扩展

- 接入专业发音评分服务，例如 Azure Speech Pronunciation Assessment
- 增加云同步功能
- 扩展 A1 词库，让孩子明年逐步进入 7 岁阶段词汇
- 继续扩展生产链，例如茶树、奶牛、更多甜品和更多花园装饰
