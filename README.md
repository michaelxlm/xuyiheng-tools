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

## 页脚与站点公共内容（对齐全站）

页脚由 `scripts/shared-partials.js` 的 `renderFooter` 统一生成，数据源为 `data/site.json` 的 `footer`，与八站页脚范式保持一致：

- **结构**：品牌栏（`footer-brand` + 简介 `footer-blurb`）→ 导航分区（热门工具 / 生活工具 / 关于）→ **更多站点** → 底栏（版权 + 备案号 + 回到顶部）。≥768px 为 brand 满宽一行 + 4 等分列。
- **更多站点（兄弟站互推）**：`footer.sister_sites`，取自 fleet 单一事实源 `main-api/shared/partials` 的 `SISTER_SITES` 并**排除本站域名**，共 9 个外链（明先生日常 / cs调色盘 / 访客小站 / 小满美图 / 小满手记 / 实测手记 / 年表拾遗 / 小满券仓 / 东北电动车汇），格式「名称 · 域名」，`target="_blank" rel="noopener"`。
- **备案号**：`footer.icp` = **`京ICP备18062653号-13`**，链向 `https://beian.miit.gov.cn/`。该号为权威值——来源生产库 `main.projects` 集合中 `url=xuyiheng.com` 记录的 `beian` 字段（与旧 `main-tool` H5 页脚读取 `project.beian` 同源）。⚠️ 同一主体号 `京ICP备18062653号` 下各站后缀不同，改动须查库或核对兄弟站，**禁止臆造**。
- **head 公共 meta**：`prerender.js` 为每页写入 `og:image`（`/og-cover.png` 1200×630）+ `twitter:card/…`、双 `theme-color`、`apple-touch-icon`、`manifest`（`/site.webmanifest`）。

## 视觉与布局

对标一线工具站的极简克制风：毛玻璃吸顶头部 + 顶栏搜索、首页 Hero 搜索 + 热门 Bento 卡墙 + 分类色相系统（`data-cat` 驱动图标/圆点着色）、靛紫主色 `#4f46e5` + 青绿点缀 `#0d9488`、完整深色模式与 `reduced-motion` 适配。品牌/布局令牌 override 全放 `assets/css/theme.css`，`tokens.css` 保持六站共享不动；改版严格保留 42 页依赖的类名契约，故工具页零改动即刷新观感。
