# 一键部署指南

本项目是 Vite + React 静态前端应用，构建产物位于 `dist/`，可部署到任意静态网站托管平台。

## 本地构建检查

部署前建议先在本地确认可以正常构建：

```bash
npm install
npm run build
npm run preview
```

默认构建命令：

- 安装依赖：`npm install`
- 构建命令：`npm run build`
- 输出目录：`dist`

## 方案一：Vercel 一键部署

点击按钮后，按页面提示导入当前 GitHub 仓库即可。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone)

Vercel 配置：

- Framework Preset：`Vite`
- Build Command：`npm run build`
- Output Directory：`dist`
- Install Command：`npm install`

部署完成后，Vercel 会自动生成访问地址。后续推送到仓库默认分支会自动重新部署。

## 方案二：Netlify 一键部署

点击按钮后，按页面提示连接 GitHub 仓库即可。

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start)

Netlify 配置：

- Build command：`npm run build`
- Publish directory：`dist`
- Node version：建议使用 `20` 或更高版本

如果需要写入配置文件，可在仓库根目录创建 `netlify.toml`：

```toml
[build]
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"
```

## 方案三：Cloudflare Pages 一键部署

打开 Cloudflare Pages 后选择“连接到 Git”，导入当前仓库。

Cloudflare Pages 配置：

- Framework preset：`Vite`
- Build command：`npm run build`
- Build output directory：`dist`
- Root directory：仓库根目录
- Node.js version：建议使用 `20` 或更高版本

## 方案四：GitHub Pages 自动部署

适合直接托管在 GitHub 仓库。需要在仓库中启用 GitHub Pages，并选择 `GitHub Actions` 作为部署来源。

建议新增 `.github/workflows/deploy.yml`：

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main, master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm install

      - name: Build
        run: npm run build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

> 如果仓库不是部署到域名根路径，而是部署到 `https://用户名.github.io/仓库名/`，需要在 `vite.config.ts` 中设置 `base: '/仓库名/'`。

## 部署后检查清单

- 页面可以正常打开。
- 静态资源、图片和图标可以正常加载。
- 听力朗读功能在目标浏览器可用。
- 口语识别建议使用 Chrome 或 Edge 测试。
- 家长面板导出/导入备份功能可用。

## 常见问题

### 刷新页面后 404

当前项目主要是单页前端应用。如果后续加入前端路由，需要给平台配置 SPA fallback，将所有路径回退到 `index.html`。

### 图片不显示

确认图片位于 `public/` 下，并使用以 `/` 开头的绝对路径引用，例如 `/partners/round-hero.svg`。

### 口语识别不可用

Web Speech API 在不同浏览器支持不同。推荐使用 Chrome 或 Edge，并确保页面使用 `https://` 访问。