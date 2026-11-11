// home.js · 首页「热门工具」本地信号重排（WO-191）
// ---------------------------------------------------------------------------
// 仅在用户自己设备上生效：读取 combo-popularity.js 记录的 localStorage
// 'xt_combo_clicks'（calc_click 的 p.tool 计数），按本地点击热度重排
// #featured .tool-grid 里的工具卡。**本地信号，非全站 PV**：不上传、不参与
// 任何跨用户排名。没有任何本地点击时保持构建期（prerender.js）的硬编码顺序，
// 不擅自打乱、不编造热度。
// 注：本文件只由首页挂载（prerender.js 的 hasPageAsset('js','home','js')），
// 产物为 assets/js/pages/home.min.js。
(function () {
  'use strict';
  var KEY = 'xt_combo_clicks';

  function getClicks() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch (e) { return {}; }
  }

  // tool 短名（如 tax / prepay / buy-house）作为 URL 的子串参与匹配
  function heatOf(href, clicks) {
    var n = 0;
    for (var k in clicks) {
      if (!Object.prototype.hasOwnProperty.call(clicks, k) || !k) continue;
      if (href.indexOf(k) >= 0) n += Number(clicks[k]) || 0;
    }
    return n;
  }

  // 「热门」徽标与 is-wide 是构建期给首卡的样式，重排后同步到新的首卡
  function moveBadge(cards, first) {
    cards.forEach(function (c) {
      c.classList.remove('is-wide');
      var b = c.querySelector('.tool-badge');
      if (b && b.parentNode) b.parentNode.removeChild(b);
    });
    first.classList.add('is-wide');
    var title = first.querySelector('.tool-card-title');
    if (title) {
      var badge = document.createElement('span');
      badge.className = 'tool-badge';
      badge.textContent = '热门';
      title.appendChild(badge);
    }
  }

  function reorder() {
    var grid = document.querySelector('#featured .tool-grid');
    if (!grid) return;
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.tool-card'));
    if (cards.length < 2) return;

    var clicks = getClicks();
    var scored = cards.map(function (c, i) {
      return { el: c, order: i, heat: heatOf(c.getAttribute('href') || '', clicks) };
    });
    var any = scored.some(function (s) { return s.heat > 0; });
    if (!any) return; // 无本地信号 → 诚实保持构建期顺序

    // 稳定排序：热度降序，同热度保持原顺序
    scored.sort(function (a, b) { return (b.heat - a.heat) || (a.order - b.order); });
    scored.forEach(function (s) { grid.appendChild(s.el); });
    moveBadge(cards, scored[0].el);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reorder);
  } else {
    reorder();
  }
})();
