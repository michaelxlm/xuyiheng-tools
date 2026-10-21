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

/**
 * 渲染站点头部（sticky header）
 * @param {Object} site - site.json 配置
 * @param {Object} page - 当前页信息 { path, title }
 */
function renderHeader(site, page) {
  const navLinks = (site.nav || []).map(n => {
    const isActive = page.path === '' && n.url === '/' ||
      (page.path && n.url === '/' + page.path + '/');
    const cls = isActive ? ' class="active" aria-current="page"' : '';
    return `<a href="${escapeHtml(n.url)}"${cls}>${escapeHtml(n.label)}</a>`;
  }).join('\n        ');

  return `<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="/">
      <span class="brand-icon" aria-hidden="true">Y</span>
      ${escapeHtml(site.short_name || site.site_name)}
    </a>
    <nav class="site-nav" aria-label="主导航">
        ${navLinks}
    </nav>
    <div class="header-actions">
      <button type="button" class="theme-toggle" id="themeToggle" aria-label="切换主题">☀</button>
      <a href="/search/" class="search-toggle" aria-label="搜索工具">🔍</a>
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
      const isActive = page.path && item.url === '/' + page.path + '/';
      const cls = isActive ? ' class="active"' : '';
      return `      <a href="${escapeHtml(item.url)}"${cls}>${escapeHtml(item.label)}</a>`;
    }).join('\n');
    return `    <div class="sidebar-group">
    <div class="sidebar-title">${escapeHtml(cat.label)}</div>
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
    { label: '首页', url: '/', icon: '🏠' },
    { label: '发现', url: '/discover/', icon: '🧭' },
    { label: '搜索', url: '/search/', icon: '🔍' }
  ];
  const links = tabs.map(t => {
    const isActive = (t.url === '/' && !page.path) ||
      (page.path && t.url === '/' + page.path + '/');
    const cls = isActive ? ' class="active"' : '';
    return `    <a href="${escapeHtml(t.url)}"${cls}><span class="bottom-nav-icon">${t.icon}</span>${escapeHtml(t.label)}</a>`;
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

  return `<footer class="site-footer">
  <div class="footer-inner">
${sections}
  </div>
  <div class="footer-bottom">
    ${escapeHtml(footer.copyright || '')}
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
  renderHeader,
  renderSidebar,
  renderBottomNav,
  renderFooter,
  renderAdSlot,
  renderCouponSlot,
};
