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

   由 build.js 调用：renderRoute(site, route, ctx) → HTML 字符串
   ctx = { manifest, nowIso }
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const P = require('./shared-partials');

const ROOT = path.resolve(__dirname, '..');
const TPL_DIR = path.join(ROOT, 'templates', 'pages');

/** 路由 → 语义 slug（模板/页面资源文件名） */
function slugOf(route) {
  const o = String(route.output || '')
    .replace(/\/index\.html$/, '')
    .replace(/\.html$/, '');
  if (o === 'index' || o === '') return 'home';
  return o.replace(/\//g, '-');
}

/** 路由 → 站点绝对路径（URL path，带首尾斜杠） */
function urlPathOf(route) {
  const p = String(route.path || '');
  if (!p || p === 'index') return '/';
  return '/' + p.replace(/^\/+|\/+$/g, '') + '/';
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

const CATEGORY_ICON = { '计算器': '🧮', '日历工具': '📅', '场景组合': '🧩', '其他工具': '🛠️' };

function buildHomeContent(site) {
  const idx = routesIndex();
  const sections = (site.sidebar_categories || []).map((cat) => {
    const cards = (cat.items || []).map((item) => {
      const r = idx[item.url] || {};
      const icon = CATEGORY_ICON[cat.label] || '🔧';
      return '          <a class="tool-card" href="' + P.escapeHtml(item.url) + '">' +
        '<span class="tool-card-icon" aria-hidden="true">' + icon + '</span>' +
        '<span class="tool-card-title">' + P.escapeHtml(item.label) + '</span>' +
        '<span class="tool-card-desc">' + P.escapeHtml((r.description || '').slice(0, 60)) + '</span></a>';
    }).join('\n');
    return '        <section class="home-section">\n' +
      '          <h2 class="section-title">' + P.escapeHtml(cat.label) + '</h2>\n' +
      '          <div class="tool-grid">\n' + cards + '\n          </div>\n' +
      '        </section>';
  }).join('\n');

  return '        <section class="page-heading">\n' +
    '          <h1>' + P.escapeHtml(site.site_name) + '</h1>\n' +
    '          <p>' + P.escapeHtml(site.description) + '</p>\n' +
    '        </section>\n' + sections;
}

/* ---------------------------- 主渲染 ---------------------------- */
function renderRoute(site, route, ctx) {
  ctx = ctx || {};
  const manifest = ctx.manifest || {};
  const slug = slugOf(route);
  const urlPath = urlPathOf(route);
  const origin = site.url.replace(/\/+$/, '');
  const canonical = origin + urlPath;
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

  const head = [
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '  <title>' + P.escapeHtml(route.title) + '</title>',
    '  <meta name="description" content="' + P.escapeHtml(route.description || '') + '">',
    route.keywords ? '  <meta name="keywords" content="' + P.escapeHtml(route.keywords) + '">' : '',
    '  <link rel="canonical" href="' + P.escapeHtml(canonical) + '">',
    '  <meta name="robots" content="' + robots + '">',
    '  <meta property="og:type" content="website">',
    '  <meta property="og:title" content="' + P.escapeHtml(route.title) + '">',
    '  <meta property="og:description" content="' + P.escapeHtml(route.description || '') + '">',
    '  <meta property="og:url" content="' + P.escapeHtml(canonical) + '">',
    '  <meta property="og:site_name" content="' + P.escapeHtml(site.site_name) + '">',
    '  <meta property="og:locale" content="zh_CN">',
    '  <meta name="theme-color" content="#2563eb">',
    '  <link rel="icon" href="' + (site.favicon || '/assets/img/favicon.svg') + '">',
    '  <script>(function(){var t=localStorage.getItem("theme");if(!t)t=matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light";document.documentElement.dataset.theme=t;})();</script>',
    cssLinks.join('\n'),
    '  <script type="application/ld+json">' + ldJson + '</script>',
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
