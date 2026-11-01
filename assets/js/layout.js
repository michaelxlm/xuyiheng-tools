'use strict';
/* ==========================================================================
   layout.js · 全站布局交互增强（纯增量，零依赖，不抢其它脚本的点击处理器）
   - 头部滚动阴影
   - 首页分类 chips 筛选 + 滚动联动高亮（scroll-spy）
   - 首页「最近使用」：依据 utils.js 记录的 localStorage['xt_recent'] 动态拼卡
   - 工具页「相关工具」：同分类推荐（来自 window.__TOOLS__ 注册表）
   - 浮动「回到顶部」
   - 卡片 / 区块入场淡入（尊重 reduced-motion，无 JS 时全部可见）
   - 主题切换平滑过渡（MutationObserver 监听 data-theme，不与 utils 冲突）
   ========================================================================== */
(function () {
  var doc = document;
  var html = doc.documentElement;
  var win = window;
  var reduceMotion = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var hasIO = 'IntersectionObserver' in win;

  /* ---------- 入场动画基础设施（无 JS / 减弱动效时内容完整可见） ---------- */
  var io = null;
  if (!reduceMotion && hasIO) {
    html.classList.add('reveal-on');
    io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); obs.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
  }
  function reveal(el, d) {
    if (!io) { el.classList.add('is-visible'); return; }
    el.classList.add('reveal', 'd' + (d || 1));
    io.observe(el);
  }
  function ensureVisible(elm) {
    elm.classList.add('is-visible');
    var rs = elm.querySelectorAll('.reveal');
    Array.prototype.forEach.call(rs, function (r) { r.classList.add('is-visible'); });
  }

  /* ---------- 工具卡 HTML（与 prerender 服务端标记对齐） ---------- */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function cardHtml(t) {
    var ent = (win.__ENT__ || []).indexOf(t.url) >= 0 ? '<span class="ent-badge">娱乐</span>' : '';
    return '<a class="tool-card" data-cat="' + (t.key || '') + '" href="' + t.url + '">' +
      '<span class="tool-card-icon"><svg class="ico" aria-hidden="true"><use href="#i-' + (t.icon || '') + '"></use></svg></span>' +
      '<span class="tool-card-title">' + escapeHtml(t.label) + ent + '</span>' +
      '<span class="tool-card-desc">' + escapeHtml(t.desc || '') + '</span></a>';
  }

  /* ---------- 1. 头部滚动阴影 ---------- */
  var header = doc.querySelector('.site-header');
  if (header) {
    var onScrollHeader = function () {
      if (win.scrollY > 8) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    };
    win.addEventListener('scroll', onScrollHeader, { passive: true });
    onScrollHeader();
  }

  /* ---------- 2. 浮动「回到顶部」 ---------- */
  var btt = doc.createElement('button');
  btt.type = 'button';
  btt.className = 'back-to-top';
  btt.setAttribute('aria-label', '回到顶部');
  btt.innerHTML = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path></svg>';
  btt.addEventListener('click', function () { win.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); });
  doc.body.appendChild(btt);
  var onScrollBtt = function () {
    if (win.scrollY > 480) btt.classList.add('show');
    else btt.classList.remove('show');
  };
  win.addEventListener('scroll', onScrollBtt, { passive: true });
  onScrollBtt();

  /* ---------- 3. 首页「最近使用」 ---------- */
  var recentSection = doc.getElementById('recent');
  var recentGrid = doc.getElementById('recent-grid');
  if (recentSection && recentGrid && win.__TOOLS__) {
    var byUrl = {};
    win.__TOOLS__.forEach(function (t) { byUrl[t.url] = t; });
    var rec = [];
    try { rec = JSON.parse(win.localStorage.getItem('xt_recent') || '[]'); } catch (e) { rec = []; }
    rec = rec.filter(function (p) { return p && p !== '/' && byUrl[p]; });
    if (rec.length) {
      recentSection.hidden = false;
      recentGrid.innerHTML = rec.map(function (p) { return cardHtml(byUrl[p]); }).join('');
      var clearBtn = recentSection.querySelector('.recent-clear');
      if (clearBtn) clearBtn.addEventListener('click', function (e) {
        e.preventDefault();
        try { win.localStorage.removeItem('xt_recent'); } catch (_) { /* 隐私模式忽略 */ }
        recentSection.hidden = true;
      });
    } else {
      recentSection.hidden = true;
    }
  }

  /* ---------- 4. 分类筛选 + 滚动联动 ---------- */
  var homeChips = Array.prototype.slice.call(doc.querySelectorAll('.hero-chips a[data-filter]'));
  var currentFilter = 'all';
  if (homeChips.length) {
    var sections = Array.prototype.slice.call(doc.querySelectorAll('.home-section'));
    function setActiveChip(f) {
      Array.prototype.forEach.call(homeChips, function (c) {
        c.classList.toggle('active', c.getAttribute('data-filter') === f);
      });
    }
    function applyFilter(f) {
      currentFilter = f;
      sections.forEach(function (s) {
        if (s.id === 'recent') return; // 最近使用常驻
        if (f === 'all' || s.id === 'cat-' + f) { s.classList.remove('is-filtered-out'); ensureVisible(s); }
        else { s.classList.add('is-filtered-out'); }
      });
    }
    Array.prototype.forEach.call(homeChips, function (a) {
      var f = a.getAttribute('data-filter');
      if (!f) return;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        if (a.classList.contains('active') && f !== 'all') f = 'all'; // 再次点击当前分类 → 复位
        setActiveChip(f);
        applyFilter(f);
        if (f !== 'all') {
          var target = doc.getElementById('cat-' + f);
          if (target) target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        }
      });
    });
    // 滚动联动：仅在「全部」态下更新高亮（避免与筛选选择互相打架）
    if (hasIO) {
      var spyMap = {};
      Array.prototype.forEach.call(homeChips, function (a) {
        var f = a.getAttribute('data-filter');
        if (f && f !== 'all') spyMap['cat-' + f] = a;
      });
      var spySections = Object.keys(spyMap).map(function (id) { return doc.getElementById(id); }).filter(Boolean);
      var spy = new IntersectionObserver(function (entries) {
        if (currentFilter !== 'all') return;
        entries.forEach(function (e) {
          if (e.isIntersecting) setActiveChip(e.target.id.replace('cat-', ''));
        });
      }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
      spySections.forEach(function (s) { spy.observe(s); });
    }
  }

  /* ---------- 5. 工具页「相关工具」（同分类推荐） ---------- */
  var isHome = doc.body.getAttribute('data-page') === 'home';
  if (!isHome && win.__TOOLS__) {
    var path = win.location.pathname;
    var norm = path.replace(/\/+$/, '') || '/';
    var me = null;
    win.__TOOLS__.forEach(function (t) { if (t.url === norm || t.url === path) me = t; });
    if (me && me.key) {
      var siblings = win.__TOOLS__.filter(function (t) {
        return t.key === me.key && t.url !== norm && t.url !== path;
      }).slice(0, 6);
      if (siblings.length && !doc.getElementById('related')) {
        var sec = doc.createElement('section');
        sec.className = 'home-section';
        sec.id = 'related';
        sec.innerHTML = '<h2 class="section-title"><span class="dot" aria-hidden="true"></span>相关工具</h2>' +
          '<div class="tool-grid">' + siblings.map(cardHtml).join('') + '</div>';
        var main = doc.querySelector('.main-inner');
        var ad = doc.querySelector('.ad-slot');
        if (main) main.insertBefore(sec, ad);
        reveal(sec, 1);
      }
    }
  }

  /* ---------- 6. 主题切换平滑过渡（仅监听 data-theme，不加自己的点击处理） ---------- */
  if ('MutationObserver' in win) {
    var mo = new MutationObserver(function () {
      html.classList.add('theme-fade');
      win.clearTimeout(html._themeFadeT);
      html._themeFadeT = win.setTimeout(function () { html.classList.remove('theme-fade'); }, 380);
    });
    mo.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* ---------- 入场：静态目标 ---------- */
  if (io) {
    var targets = doc.querySelectorAll('.tool-card, .home-section, .card, .info-box, .tool-info');
    var i = 0;
    Array.prototype.forEach.call(targets, function (el) { reveal(el, (i % 3) + 1); i++; });
    /* 兜底：极端情况下未触发时全部显示 */
    win.setTimeout(function () {
      Array.prototype.forEach.call(targets, function (el) { el.classList.add('is-visible'); });
    }, 1400);
  }
})();
