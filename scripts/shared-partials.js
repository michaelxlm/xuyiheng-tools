'use strict';
/* ==========================================================================
   shared-partials.js · 公共 HTML 片段单一事实源
   构建期由各页 prerender 调用，生成 header / sidebar / footer / ad-slot 等片段。
   对齐六站 shared-partials 范式（零依赖纯 Node）。
   ========================================================================== */

function escapeHtml(input) {
  return String(input == null ? '' : input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const I = require('./icons');

/* 分类 → 色相键（与 theme.css 的 [data-cat] 规则对应） */
const CAT_KEY = { '计算器': 'calc', '日历工具': 'cal', '场景组合': 'combo', '其他工具': 'other' };
function catKey(label) { return CAT_KEY[label] || ''; }

/* 内联 SVG 图标（stroke=currentColor，随主题变色） */
const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.2-3.2"></path></svg>';
const ICON_SUN = '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>';
const ICON_MOON = '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"></path></svg>';

/**
 * 渲染站点头部（sticky header）
 * @param {Object} site - site.json 配置
 * @param {Object} page - 当前页信息 { path, title }
 */
function renderHeader(site, page) {
  const navLinks = (site.nav || []).map(n => {
    const isActive = page.path === '' && n.url === '/' ||
      (page.path && n.url === '/' + page.path + '.html');
    const cls = isActive ? ' class="active" aria-current="page"' : '';
    return `<a href="${escapeHtml(n.url)}"${cls}>${escapeHtml(n.label)}</a>`;
  }).join('\n        ');

  return `<header class="site-header" id="top">
  <div class="header-inner">
    <a class="brand" href="/">
      <span class="brand-icon" aria-hidden="true">Y</span>
      ${escapeHtml(site.short_name || site.site_name)}
    </a>
    <nav class="site-nav" aria-label="主导航">
        ${navLinks}
    </nav>
    <form class="header-search" action="/search.html" method="get" role="search">
      ${ICON_SEARCH}
      <input type="search" name="q" placeholder="搜索工具…" aria-label="搜索工具" autocomplete="off">
    </form>
    <div class="header-actions">
      <a href="/search.html" class="search-toggle" aria-label="搜索工具">${ICON_SEARCH}</a>
      <button type="button" class="theme-toggle" id="themeToggle" aria-label="切换主题">${ICON_SUN}${ICON_MOON}</button>
    </div>
  </div>
</header>`;
}

/**
 * 渲染侧栏导航（仅 PC 显示）
 * @param {Object} site - site.json 配置
 * @param {Object} page - 当前页信息
 */
function renderSidebar(site, page) {
  const categories = (site.sidebar_categories || []).map(cat => {
    const items = (cat.items || []).map(item => {
      const isActive = page.path && item.url === '/' + page.path + '.html';
      const cls = isActive ? ' class="active"' : '';
      return `      <a href="${escapeHtml(item.url)}"${cls}>${escapeHtml(item.label)}</a>`;
    }).join('\n');
    return `    <div class="sidebar-group"${catKey(cat.label) ? ' data-cat="' + catKey(cat.label) + '"' : ''}>
    <div class="sidebar-title"><span class="dot" aria-hidden="true"></span>${escapeHtml(cat.label)}</div>
    <nav class="sidebar-nav">
${items}
    </nav>
  </div>`;
  }).join('\n  ');

  return `<aside class="site-sidebar" aria-label="工具分类">
  ${categories}
</aside>`;
}

/**
 * 渲染底部导航栏（仅移动端显示）
 * @param {Object} site - site.json 配置
 * @param {Object} page - 当前页信息
 */
function renderBottomNav(site, page) {
  const tabs = [
    { label: '首页', url: '/', icon: 'home' },
    { label: '发现', url: '/discover.html', icon: 'compass' },
    { label: '搜索', url: '/search.html', icon: 'search' }
  ];
  const links = tabs.map(t => {
    const isActive = (t.url === '/' && !page.path) ||
      (page.path && t.url === '/' + page.path + '.html');
    const cls = isActive ? ' class="active"' : '';
    return `    <a href="${escapeHtml(t.url)}"${cls}><span class="bottom-nav-ico">${I.iconRef(t.icon)}</span>${escapeHtml(t.label)}</a>`;
  }).join('\n');

  return `<nav class="bottom-nav" aria-label="底部导航">
${links}
</nav>`;
}

/**
 * 渲染页脚
 * @param {Object} site - site.json 配置
 */
function renderFooter(site) {
  const footer = site.footer || {};
  const sections = (footer.sections || []).map(sec => {
    const links = (sec.links || []).map(l =>
      `      <a href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a>`
    ).join('\n');
    return `    <div class="footer-section">
    <h3>${escapeHtml(sec.title)}</h3>
${links}
  </div>`;
  }).join('\n');

  // 更多站点（兄弟站互推，外链）
  const sister = (footer.sister_sites || []);
  let sisterSection = '';
  if (sister.length) {
    const sLinks = sister.map(l =>
      `      <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label)}</a>`
    ).join('\n');
    sisterSection = `\n    <div class="footer-section footer-sister">
    <h3>更多站点</h3>
${sLinks}
  </div>`;
  }

  // 备案号（合规文本，链工信部）
  const beian = footer.icp
    ? `    <a class="site-beian" href="${escapeHtml(footer.icp_url || 'https://beian.miit.gov.cn/')}" target="_blank" rel="noopener noreferrer">${escapeHtml(footer.icp)}</a>`
    : '';

  return `<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <a class="brand" href="/"><span class="brand-icon" aria-hidden="true">Y</span>${escapeHtml(site.short_name || site.site_name)}</a>
      <p class="footer-blurb">${escapeHtml(site.description || '')}</p>
    </div>
${sections}${sisterSection}
  </div>
  <div class="footer-bottom">
    <span>${escapeHtml(footer.copyright || '')}</span>
    <div class="footer-legal">
${beian ? beian + '\n' : ''}      <a href="#top">回到顶部 ↑</a>
    </div>
  </div>
</footer>`;
}

/**
 * 渲染广告位容器标记
 * @param {String} scene - 广告场景（carousel/inline/sidebar）
 */
function renderAdSlot(scene) {
  return `  <div class="ad-slot" data-ad-slot="${escapeHtml(scene)}"></div>`;
}

/**
 * 渲染优惠券位容器标记
 * @param {String} placement - 券位位置（strip/inline）
 */
function renderCouponSlot(placement) {
  return `  <div class="coupon-slot" data-coupon-slot="${escapeHtml(placement || 'strip')}"></div>`;
}

module.exports = {
  escapeHtml,
  catKey,
  renderHeader,
  renderSidebar,
  renderBottomNav,
  renderFooter,
  renderAdSlot,
  renderCouponSlot,
};
