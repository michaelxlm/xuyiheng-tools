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
  const CAT_ICONS = {
    calc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="16" height="20" x="4" y="2" rx="2"></rect><line x1="8" x2="16" y1="6" y2="6"></line><circle cx="8" cy="10" r="1.2"></circle><circle cx="12" cy="10" r="1.2"></circle><circle cx="16" cy="10" r="1.2"></circle><circle cx="8" cy="14" r="1.2"></circle><circle cx="12" cy="14" r="1.2"></circle><circle cx="16" cy="14" r="1.2"></circle><circle cx="8" cy="18" r="1.2"></circle><circle cx="12" cy="18" r="1.2"></circle><circle cx="16" cy="18" r="1.2"></circle></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="4" rx="2"></rect><line x1="16" x2="16" y1="2" y2="6"></line><line x1="8" x2="8" y1="2" y2="6"></line><line x1="3" x2="21" y1="10" y2="10"></line></svg>',
    combo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>',
    other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="7" height="7" x="3" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="14" rx="1"></rect><rect width="7" height="7" x="3" y="14" rx="1"></rect></svg>'
  };
  const cats = (function () {
    const tiles = (site.sidebar_categories || []).map(function (cat) {
      const key = catKey(cat.label);
      const count = (cat.items || []).length;
      const ico = (key && CAT_ICONS[key]) ? CAT_ICONS[key] : CAT_ICONS.other;
      return '          <a class="cat-tile"' + (key ? ' data-cat="' + key + '"' : '') + ' href="/#' + (key ? 'cat-' + key : '') + '">\n' +
        '            <span class="cat-tile-ico" aria-hidden="true">' + ico + '</span>\n' +
        '            <span class="cat-tile-name">' + escapeHtml(cat.label) + '</span>\n' +
        '            <span class="cat-tile-count">' + count + ' 个工具</span>\n' +
        '          </a>';
    }).join('\n');
    return '          <div class="cat-grid">\n' + tiles + '\n          </div>';
  })();

  return `<header class="site-header" id="top">
  <div class="header-inner">
    <a class="brand" href="/">
      <span class="brand-icon" aria-hidden="true">Y</span>
      ${escapeHtml(site.short_name || site.site_name)}
    </a>
    <div class="header-right">
      <form class="header-search" action="/search.html" method="get" role="search">
        ${ICON_SEARCH}
        <input type="search" name="q" placeholder="搜索工具…" aria-label="搜索工具" autocomplete="off">
      </form>
      <details class="cat-mega">
        <summary>分类</summary>
        <div class="cat-mega-panel" role="menu">
${cats}
          <a class="cat-mega-all" href="/tools.html">查看全部工具 →</a>
        </div>
      </details>
      <div class="header-actions">
        <button type="button" class="theme-toggle" id="themeToggle" aria-label="切换主题">${ICON_SUN}${ICON_MOON}</button>
      </div>
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

  const allActive = page.path === 'tools' ? ' class="active"' : '';
  const allLink = '    <a class="sidebar-summary"' + allActive + ' href="/tools.html">全部工具</a>';
  return `<aside class="site-sidebar" aria-label="工具分类">
  ${allLink}
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
    { label: '工具', url: '/tools.html', icon: 'grid' },
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

/**
 * 渲染 sticky 分类导航条（分类锚点 + 全部工具入口）。
 * opts.absolute=true 时链接为 "/#cat-xxx"（跨页跳回首页对应分类区），
 * 否则为相对 "#cat-xxx"（首页内锚点，配合滚动高亮）。
 */
function renderCatBar(site, opts) {
  opts = opts || {};
  const prefix = opts.absolute ? '/#' : '#';
  const links = (site.sidebar_categories || []).map((cat) => {
    const key = catKey(cat.label);
    return '<a href="' + prefix + 'cat-' + escapeHtml(key) + '" data-cat="' + escapeHtml(key) + '">' + escapeHtml(cat.label) + '</a>';
  }).join('');
  return '<nav class="cat-bar" aria-label="分类导航">' + links + '<a href="/tools.html" class="cat-bar-all">全部工具</a></nav>';
}

module.exports = {
  escapeHtml,
  catKey,
  renderHeader,
  renderSidebar,
  renderBottomNav,
  renderFooter,
  renderCatBar,
  renderAdSlot,
  renderCouponSlot,
};
