# xuyiheng-tools · 一珩成长笔记

纯静态、**零运行时依赖**的在线实用工具站（域名 `xuyiheng.com`）。由 WO-127 + WO-128 从 uni-app 工程 `main-tool` 的 H5 Web 承载平移拆分而来，独立仓库、独立部署，接入八站共用基础设施。

## 定位

- 42 个静态页面：计算器 / 日历工具 / 场景组合 / 其他工具（个税、房贷、单位换算、万年历老黄历、买房买车攻略、概率、随机数、视力测试等）。
- 构建期预渲染为完整 HTML，运行时不依赖任何框架；页面脚本为原生 JS。
- 复用旧 `main-tool` 的同域与站点键（`ad_site_key` / `tracker_project` = `main-tool`），因此广告、券位、埋点、sourceGuard 白名单等后端登记无需新增。

## 技术栈

零依赖纯 Node（`>=18`）构建管线 + 原生静态产物。无 npm 运行时依赖。

## 目录结构

```
data/            站点与路由配置（site.json / pages.json）+ 开放数据集镜像（llms-api.json）
templates/pages/ 各页正文模板（构建期注入外壳）
assets/          css / js / img 源资源（构建期压缩 + fingerprint）
scripts/         构建与门禁脚本（见下）
.github/workflows/  deploy.yml 部署流水线
<路由目录>/        构建产物 index.html（提交进仓库，非 pages/ 子目录）
robots.txt / llms.txt / sitemap.xml / site.webmanifest / og-cover.png  根级公共产物
```

## 构建管线（`scripts/build.js` 串起全流程）

1. `minify.js` — 压缩 CSS/JS
2. `fingerprint.js` — 资源内容哈希版本化，产出 manifest
3. `prerender.js` — 逐路由生成 HTML（head SEO/OG/Twitter/canonical/JSON-LD、header/sidebar/footer/广告券位、FOUC 防护）
4. `build-sitemap.js` / `build-llms.js` — 生成 sitemap.xml / llms.txt（llms.txt 含 `## Datasets` 开放数据 API 区块，读 `data/llms-api.json`，WO-124 DaaS 免费曝光腿）
5. `inject-scripts.js` — 公共脚本注入守卫
6. `check-links.js` — 站内死链门禁（缺目标页则构建失败）

## 常用命令

```bash
npm run dev            # 本地静态预览
npm run build          # 全量构建（含死链门禁）
npm run check:encoding # UTF-8 编码门禁（禁 GBK/双重乱码/BOM）
```

## 门禁

- **编码门禁** `check-encoding.js`：所有文本文件必须为无 BOM 的 UTF-8，杜绝 Windows 侧 GBK/双重乱码。
- **死链门禁** `check-links.js`：产物 HTML 的站内绝对链接逐条校验目标文件存在。
- 换行符由 `.gitattributes` 统一为 LF。

## 部署

`.github/workflows/deploy.yml`（`push` 到 `main` 或手动触发）在**仓库级 self-hosted runner**（标签 `self-hosted,linux,x64,static-deploy`）上执行：编码门禁 → 构建 → 死链门禁 → `tar` 同步产物到 `39.107.225.222:/www/wwwroot/uni-web/`。

> 新克隆本仓库需先在生产机注册对应仓库的 runner，否则 run 会永久 `queued`。

## 共用基础设施

| 能力 | 接入方式 |
| --- | --- |
| 埋点 | `assets/js/tracker.min.js`，`tracker_project = main-tool` |
| 广告 | `assets/js/ad-slots.min.js` + `data-ad-slot` 标记，`ad_site_key = main-tool` |
| 优惠券位 | `assets/js/coupon-slot.min.js` + `data-coupon-slot` 标记 |
| 后端 API | `assets/js/http-api.js` → `https://api.xuyiheng.com`，带 `X-Source-Guard` 头 |
| 开放数据集（DaaS） | `llms.txt` 的 `## Datasets` 区块由 `scripts/build-llms.js` 读 `data/llms-api.json` 生成（事实源 = main-api `config.apiGateway.match` + `config.mcp.datasets`，本期免费接入、不含单价 · WO-124）；Key 申请走 `https://api.xuyiheng.com/developer.html` |
| 结构化数据 | 构建期写入 JSON-LD（WebSite/Organization/WebApplication/BreadcrumbList） |
