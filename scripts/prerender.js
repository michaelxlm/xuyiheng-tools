'use strict';
/* ==========================================================================
   prerender.js · 构建期预渲染引擎（零依赖纯 Node）
   --------------------------------------------------------------------------
   为 data/pages.json 的每个路由生成完整静态 HTML：
     - head：charset/viewport/title/desc/keywords/canonical/OG/robots/favicon
     - FOUC 防护内联脚本（读 localStorage/prefers-color-scheme 落 data-theme）
     - body 壳：skip-link + header + site-body(sidebar + main[breadcrumb + 内容 + 广告/券位]) + bottom-nav + footer
     - JSON-LD（站点级 / 工具级 WebApplication / 面包屑）
     - 公共脚本按序：tracker → ad-slots → coupon-slot（页面脚本由各页模板自带）
   页面正文来自 templates/pages/<slug>.html；缺省用占位提示（迁移前占位）。
   URL 口径：首页 /，其余为显式 .html（如 /calculator/tax.html），与磁盘产物一一对应。

   由 build.js 调用：renderRoute(site, route, ctx) → HTML 字符串
   ctx = { manifest, nowIso }
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const P = require('./shared-partials');
const I = require('./icons');

const ROOT = path.resolve(__dirname, '..');
const TPL_DIR = path.join(ROOT, 'templates', 'pages');

/** 品牌图标（apple-touch-icon / manifest 共用，字体无关的内联 SVG） */
const BRAND_ICON_URI = 'data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20512%20512%27%3E%3Crect%20width%3D%27512%27%20height%3D%27512%27%20rx%3D%2796%27%20fill%3D%27%232563eb%27%2F%3E%3Crect%20x%3D%27120%27%20y%3D%27120%27%20width%3D%27112%27%20height%3D%27112%27%20rx%3D%2724%27%20fill%3D%27%23fff%27%2F%3E%3Crect%20x%3D%27280%27%20y%3D%27120%27%20width%3D%27112%27%20height%3D%27112%27%20rx%3D%2724%27%20fill%3D%27%23bcd0ff%27%2F%3E%3Crect%20x%3D%27120%27%20y%3D%27280%27%20width%3D%27112%27%20height%3D%27112%27%20rx%3D%2724%27%20fill%3D%27%23bcd0ff%27%2F%3E%3Crect%20x%3D%27280%27%20y%3D%27280%27%20width%3D%27112%27%20height%3D%27112%27%20rx%3D%2724%27%20fill%3D%27%23fff%27%2F%3E%3C%2Fsvg%3E';

/** 路由 → 语义 slug（模板/页面资源文件名） */
function slugOf(route) {
  const o = String(route.output || '')
    .replace(/\/index\.html$/, '')
    .replace(/\.html$/, '');
  if (o === 'index' || o === '') return 'home';
  return o.replace(/\//g, '-');
}

/** 路由 → 站点绝对路径（显式 .html，首页为 /） */
function urlPathOf(route) {
  const p = String(route.path || '');
  if (!p || p === 'index') return '/';
  return '/' + p.replace(/^\/+|\/+$/g, '') + '.html';
}

/** 资源引用：绝对路径 + fingerprint 版本 token（若有） */
function assetUrl(rel, manifest) {
  const clean = rel.replace(/^\/+/, '');
  const href = '/' + clean;
  const token = manifest && manifest['/' + clean];
  return token ? href + '?v=' + token : href;
}

/* ---------------------------- JSON-LD ---------------------------- */
function buildJsonLd(site, route) {
  const origin = site.url.replace(/\/+$/, '');
  const pageUrl = origin + urlPathOf(route);
  const graph = [];

  if (route.path === 'index') {
    graph.push({
      '@type': 'WebSite',
      '@id': origin + '/#website',
      url: origin + '/',
      name: site.site_name,
      description: site.description,
      inLanguage: 'zh-CN',
      publisher: { '@id': origin + '/#organization' },
    });
    graph.push({
      '@type': 'Organization',
      '@id': origin + '/#organization',
      url: origin + '/',
      name: site.site_name,
      description: site.description,
      logo: origin + (site.logo || '/assets/img/logo.svg'),
    });
  }

  if (route.type === 'tool') {
    graph.push({
      '@type': 'WebApplication',
      name: route.title,
      url: pageUrl,
      description: route.description,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any',
      inLanguage: 'zh-CN',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'CNY' },
    });
  } else {
    graph.push({
      '@type': 'WebPage',
      name: route.title,
      url: pageUrl,
      description: route.description,
      inLanguage: 'zh-CN',
      isPartOf: { '@id': origin + '/#website' },
    });
  }

  // 面包屑
  const crumbs = [{ name: '首页', item: origin + '/' }];
  if (route.path !== 'index') {
    crumbs.push({ name: route.title.split(' - ')[0], item: pageUrl });
  }
  graph.push({
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  });

  // FAQPage：与正文模板里的可见「常见问题」同源（route.faq 由 data/pages.json 提供）
  if (route.indexable !== false && Array.isArray(route.faq) && route.faq.length) {
    graph.push({
      '@type': 'FAQPage',
      inLanguage: 'zh-CN',
      mainEntity: route.faq
        .filter(function (f) { return f && f.q && f.a; })
        .map(function (f) {
          return { '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } };
        }),
    });
  }

  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

/* ---------------------------- 面包屑 HTML ---------------------------- */
function renderBreadcrumb(route) {
  if (route.path === 'index') return '';
  const parts = ['<a href="/">首页</a>'];
  parts.push('<span class="breadcrumb-sep" aria-hidden="true">/</span>');
  parts.push('<span>' + P.escapeHtml(route.title.split(' - ')[0]) + '</span>');
  return '        <nav class="breadcrumb" aria-label="面包屑">' + parts.join('') + '</nav>\n';
}

/* ---------------------------- 页级资源检测 ---------------------------- */
function hasPageAsset(kind, slug, ext) {
  // kind: 'css' | 'js' → assets/<kind>/pages/<slug>.<ext>
  return fs.existsSync(path.join(ROOT, 'assets', kind, 'pages', slug + '.' + ext));
}

/* ---------------------------- 读页面正文模板 ---------------------------- */
function loadContent(route, site) {
  if (route.path === 'index') return buildHomeContent(site);
  const slug = slugOf(route);
  const file = path.join(TPL_DIR, slug + '.html');
  if (fs.existsSync(file)) {
    return fs.readFileSync(file, 'utf8').trim();
  }
  // 未迁移页占位
  return [
    '        <section class="page-heading">',
    '          <h1>' + P.escapeHtml(route.title.split(' - ')[0]) + '</h1>',
    '          <p>' + P.escapeHtml(route.description || '') + '</p>',
    '        </section>',
    '        <div class="card"><p class="text-muted">该工具正在迁移中，敬请期待。</p></div>',
  ].join('\n');
}

/* ---------------------------- 首页正文（从 site.json 分类自动生成） ---------------------------- */
let _routesIndex = null;
function routesIndex() {
  if (_routesIndex) return _routesIndex;
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pages.json'), 'utf8'));
  _routesIndex = {};
  (data.routes || []).forEach((r) => { _routesIndex[urlPathOf(r)] = r; });
  return _routesIndex;
}

const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.2-3.2"></path></svg>';
const FEATURED = ['/calculator/tax.html', '/calendar.html', '/calculator/prepay.html', '/combo/health-check.html', '/combo/buy-house.html', '/combo/color-lab.html'];

function toolCardHtml(item, catLabel, idx, wide) {
  const r = idx[item.url] || {};
  const iconMarkup = I.iconRef(item.icon);
  const key = P.catKey(catLabel);
  return '          <a class="tool-card' + (wide ? ' is-wide' : '') + '"' + (key ? ' data-cat="' + key + '"' : '') + ' href="' + P.escapeHtml(item.url) + '">' +
    '<span class="tool-card-icon">' + iconMarkup + '</span>' +
    '<span class="tool-card-title">' + P.escapeHtml(item.label) + '</span>' +
    '<span class="tool-card-desc">' + P.escapeHtml((r.description || '').slice(0, 60)) + '</span></a>';
}

function buildHomeContent(site) {
  const idx = routesIndex();
  const cats = site.sidebar_categories || [];
  const flat = {};
  cats.forEach((cat) => (cat.items || []).forEach((it) => { flat[it.url] = { label: it.label, cat: cat.label, icon: it.icon }; }));
  const total = Object.keys(flat).length;

  const chips = cats.map((cat) => {
    const key = P.catKey(cat.label);
    return '<a href="#cat-' + P.escapeHtml(key) + '"' + (key ? ' data-cat="' + key + '"' : '') + '><span class="dot" aria-hidden="true"></span>' + P.escapeHtml(cat.label) + '</a>';
  }).join('');

  const hero = [
    '        <section class="hero">',
    '          <span class="hero-badge">✦ ' + total + ' 个免费在线工具 · 纯本地运行</span>',
    '          <h1>' + P.escapeHtml(site.site_name) + '</h1>',
    '          <p class="hero-sub">' + P.escapeHtml(site.description) + '</p>',
    '          <form class="hero-search" action="/search.html" method="get" role="search">',
    '            ' + SEARCH_ICON,
    '            <input type="search" name="q" placeholder="搜索：个税、房贷、万年历、BMI…" aria-label="搜索工具" autocomplete="off">',
    '            <button class="btn btn-primary" type="submit">搜索</button>',
    '          </form>',
    '          <div class="hero-chips">' + chips + '</div>',
    '        </section>',
  ].join('\n');

  const featCards = FEATURED.filter((u) => flat[u]).map((u, i) =>
    toolCardHtml({ url: u, label: flat[u].label, icon: flat[u].icon }, flat[u].cat, idx, i === 0)
  ).join('\n');
  const featured = [
    '        <section class="home-section" id="featured">',
    '          <h2 class="section-title"><span class="dot" aria-hidden="true"></span>热门工具</h2>',
    '          <div class="tool-grid">',
    featCards,
    '          </div>',
    '        </section>',
  ].join('\n');

  const sections = cats.map((cat) => {
    const key = P.catKey(cat.label);
    const cards = (cat.items || []).map((item) => toolCardHtml(item, cat.label, idx, false)).join('\n');
    return '        <section class="home-section" id="cat-' + P.escapeHtml(key) + '"' + (key ? ' data-cat="' + key + '"' : '') + '>\n' +
      '          <h2 class="section-title"><span class="dot" aria-hidden="true"></span>' + P.escapeHtml(cat.label) + '<span class="count">' + (cat.items || []).length + '</span></h2>\n' +
      '          <div class="tool-grid">\n' + cards + '\n          </div>\n' +
      '        </section>';
  }).join('\n');

  return hero + '\n' + featured + '\n' + sections;
}

/* ---------------------------- 主渲染 ---------------------------- */
function renderRoute(site, route, ctx) {
  ctx = ctx || {};
  const manifest = ctx.manifest || {};
  const slug = slugOf(route);
  const urlPath = urlPathOf(route);
  const origin = site.url.replace(/\/+$/, '');
  const canonical = origin + urlPath;
  const ogImage = site.og_image || (origin + '/og-cover.png');
  const indexable = route.indexable !== false;

  // head 资源
  const cssLinks = [
    '    <link rel="stylesheet" href="' + assetUrl('assets/css/tokens.min.css', manifest) + '">',
    '    <link rel="stylesheet" href="' + assetUrl('assets/css/theme.min.css', manifest) + '">',
  ];
  if (hasPageAsset('css', slug, 'css')) {
    cssLinks.push('    <link rel="stylesheet" href="' + assetUrl('assets/css/pages/' + slug + '.min.css', manifest) + '">');
  }

  const scriptTags = [
    // 本站复用 main-tool 分片 key（见 README）；ad-slots.js 默认 site 为 aiweb，必须显式声明，
    // 否则会取错分片。本地兜底用绝对路径（深层路由 /calculator/xxx/ 下相对路径会 404）。
    '    <script>window.AdSlotsConfig={site:"main-tool",fallbackSrc:"/assets/js/ad-slots.json"};</script>',
    '    <script src="' + assetUrl('assets/js/tracker.min.js', manifest) + '" defer></script>',
    '    <script src="' + assetUrl('assets/js/ad-slots.min.js', manifest) + '" defer></script>',
    '    <script src="' + assetUrl('assets/js/coupon-slot.min.js', manifest) + '" defer></script>',
    '    <script src="' + assetUrl('assets/js/utils.min.js', manifest) + '" defer></script>',
    '    <script src="' + assetUrl('assets/js/http-api.min.js', manifest) + '" defer></script>',
  ];
  if (hasPageAsset('js', slug, 'js')) {
    scriptTags.push('    <script src="' + assetUrl('assets/js/pages/' + slug + '.min.js', manifest) + '" defer></script>');
  }

  const robots = indexable ? 'index, follow' : 'noindex, nofollow';
  const ldJson = buildJsonLd(site, route);

  // E-E-A-T 作者实体（Michaelxlm）：与全站 about 页统一，sameAs 归一化到已落地的三站作者实体
  const authorLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': origin + '/about.html#author',
    name: 'Michaelxlm',
    url: origin + '/about.html',
    jobTitle: '独立开发者',
    description: 'Michaelxlm，独立开发者，主理明先生日常、cs调色盘、访客小站、小满券仓、小满美图、实测手记、年表拾遗、一珩成长笔记等多个站点，倡导隐私优先、开放标准与免费可达的 Web 体验。',
    sameAs: [ 'https://2002cs.com/about.html#author', 'https://xuliming.com/#author', 'https://antucao.com' ],
  });

  const head = [
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '  <title>' + P.escapeHtml(route.title) + '</title>',
    '  <meta name="description" content="' + P.escapeHtml(route.description || '') + '">',
    '  <meta name="author" content="Michaelxlm">',
    route.keywords ? '  <meta name="keywords" content="' + P.escapeHtml(route.keywords) + '">' : '',
    '  <link rel="canonical" href="' + P.escapeHtml(canonical) + '">',
    '  <meta name="robots" content="' + robots + '">',
    '  <meta property="og:type" content="website">',
    '  <meta property="og:title" content="' + P.escapeHtml(route.title) + '">',
    '  <meta property="og:description" content="' + P.escapeHtml(route.description || '') + '">',
    '  <meta property="og:url" content="' + P.escapeHtml(canonical) + '">',
    '  <meta property="og:site_name" content="' + P.escapeHtml(site.site_name) + '">',
    '  <meta property="og:locale" content="zh_CN">',
    '  <meta property="og:image" content="' + P.escapeHtml(ogImage) + '">',
    '  <meta property="og:image:type" content="image/png">',
    '  <meta property="og:image:width" content="1200">',
    '  <meta property="og:image:height" content="630">',
    '  <meta name="twitter:card" content="summary_large_image">',
    '  <meta name="twitter:title" content="' + P.escapeHtml(route.title) + '">',
    '  <meta name="twitter:description" content="' + P.escapeHtml(route.description || '') + '">',
    '  <meta name="twitter:image" content="' + P.escapeHtml(ogImage) + '">',
    '  <meta name="theme-color" content="#2563eb" media="(prefers-color-scheme: light)">',
    '  <meta name="theme-color" content="#0b1220" media="(prefers-color-scheme: dark)">',
    '  <link rel="icon" href="' + (site.favicon || '/assets/img/favicon.svg') + '">',
    '  <link rel="apple-touch-icon" href="' + BRAND_ICON_URI + '">',
    '  <link rel="manifest" href="/site.webmanifest">',
    '  <script>(function(){var t=localStorage.getItem("theme");if(!t)t=matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light";document.documentElement.dataset.theme=t;})();</script>',
    cssLinks.join('\n'),
    '  <script type="application/ld+json">' + ldJson + '</script>',
    '  <script type="application/ld+json">' + authorLd + '</script>',
  ].filter(Boolean).join('\n');

  // body 内容
  const content = loadContent(route, site);
  const header = P.renderHeader(site, route);
  const sidebar = P.renderSidebar(site, route);
  const bottomNav = P.renderBottomNav(site, route);
  const footer = P.renderFooter(site);
  const breadcrumb = renderBreadcrumb(route);

  // 全站统一的广告位 / 券位（运行期由 ad-slots.js / coupon-slot.js 扫描填充）
  const slots = [
    '        <div class="ad-slot" data-ad-slot="inline"></div>',
    '        <div class="coupon-slot" data-coupon-slot="strip"></div>',
  ].join('\n');

  const body = [
    '<body data-page="' + P.escapeHtml(slug) + '" data-page-id="' + P.escapeHtml(slug) + '">',
    I.fullSprite(),
    '<a class="skip-link" href="#main">跳至内容</a>',
    header,
    '<div class="site-body">',
    sidebar,
    '  <main class="site-main" id="main">',
    '    <div class="main-inner">',
    breadcrumb + content + '\n' + slots,
    '    </div>',
    '  </main>',
    '</div>',
    bottomNav,
    footer,
    scriptTags.join('\n'),
    '</body>',
  ].join('\n');

  return '<!doctype html>\n<html lang="' + (site.lang || 'zh-CN') + '">\n<head>\n' + head + '\n</head>\n' + body + '\n';
}

module.exports = { renderRoute, slugOf, urlPathOf, assetUrl };
