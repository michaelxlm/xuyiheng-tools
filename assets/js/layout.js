'use strict';
/* ==========================================================================
   layout.js · 全站布局交互增强（纯增量，零依赖，不抢其它脚本的点击处理器）
   - 头部滚动阴影
   - 首页分类 chips 滚动联动高亮（scroll-spy，IntersectionObserver）
   - 浮动「回到顶部」（滚动后浮现，平滑回顶）
   - 卡片 / 区块入场淡入（尊重 prefers-reduced-motion，无 JS 时全部可见）
   - 主题切换平滑过渡（MutationObserver 监听 data-theme，不与 utils 冲突）
   ========================================================================== */
(function () {
  var doc = document;
  var html = doc.documentElement;
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var hasIO = 'IntersectionObserver' in window;

  /* 1. 头部滚动阴影 */
  var header = doc.querySelector('.site-header');
  if (header) {
    var onScrollHeader = function () {
      if (window.scrollY > 8) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    };
    window.addEventListener('scroll', onScrollHeader, { passive: true });
    onScrollHeader();
  }

  /* 2. 首页分类 chips 滚动联动高亮 */
  var chips = Array.prototype.slice.call(doc.querySelectorAll('.hero-chips a[href^="#cat-"]'));
  if (chips.length && hasIO) {
    var byId = {};
    chips.forEach(function (a) {
      var id = (a.getAttribute('href') || '').slice(1);
      if (id) byId[id] = a;
    });
    var spySections = Object.keys(byId)
      .map(function (id) { return doc.getElementById(id); })
      .filter(Boolean);
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        chips.forEach(function (c) { c.classList.remove('active'); });
        var a = byId[e.target.id];
        if (a) a.classList.add('active');
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    spySections.forEach(function (s) { spy.observe(s); });
  }

  /* 3. 浮动「回到顶部」 */
  var btt = doc.createElement('button');
  btt.type = 'button';
  btt.className = 'back-to-top';
  btt.setAttribute('aria-label', '回到顶部');
  btt.innerHTML = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path></svg>';
  btt.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });
  doc.body.appendChild(btt);
  var onScrollBtt = function () {
    if (window.scrollY > 480) btt.classList.add('show');
    else btt.classList.remove('show');
  };
  window.addEventListener('scroll', onScrollBtt, { passive: true });
  onScrollBtt();

  /* 4. 入场动画（无 JS / 减弱动效时内容完整可见） */
  if (!reduceMotion && hasIO) {
    html.classList.add('reveal-on');
    var targets = doc.querySelectorAll('.tool-card, .home-section, .card, .info-box, .tool-info');
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          obs.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.04 });
    var idx = 0;
    Array.prototype.forEach.call(targets, function (el) {
      el.classList.add('reveal', 'd' + ((idx % 3) + 1));
      io.observe(el);
      idx++;
    });
    /* 兜底：极端情况下未触发时全部显示 */
    window.setTimeout(function () {
      Array.prototype.forEach.call(targets, function (el) { el.classList.add('is-visible'); });
    }, 1400);
  }

  /* 5. 主题切换平滑过渡（仅监听 data-theme 变化，不加自己的点击处理） */
  if ('MutationObserver' in window) {
    var mo = new MutationObserver(function () {
      html.classList.add('theme-fade');
      window.clearTimeout(html._themeFadeT);
      html._themeFadeT = window.setTimeout(function () {
        html.classList.remove('theme-fade');
      }, 380);
    });
    mo.observe(html, { attributes: true, attributeFilter: ['data-theme'] });
  }
})();
