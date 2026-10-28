/* ==========================================================================
   utils.js · 全站通用工具（零依赖）
   --------------------------------------------------------------------------
   - 主题切换（亮/暗，localStorage 持久化 + data-theme）
   - 数字/金额格式化、防抖、DOM 简写
   - 各页 JS 复用；构建期注入到每页（在页面脚本之前）
   ========================================================================== */

(function (global) {
  'use strict';

  var doc = global.document;

  /* ------------------------------ 主题 ------------------------------ */
  var THEME_KEY = 'theme';

  function currentTheme() {
    return (doc.documentElement.getAttribute('data-theme')) || 'light';
  }

  function applyTheme(theme) {
    doc.documentElement.setAttribute('data-theme', theme);
    try { global.localStorage.setItem(THEME_KEY, theme); } catch (e) { /* 隐私模式忽略 */ }
    // 通知已挂载组件（如 coupon-slot 的 MutationObserver 已自动处理，这里供页面自定义响应）
    try { doc.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme } })); } catch (e) { /* ignore */ }
  }

  function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  }

  /** 绑定 #themeToggle 按钮（各页 header 统一 id） */
  function bindThemeToggle() {
    var btn = doc.getElementById('themeToggle');
    if (btn && !btn.__bound) {
      btn.__bound = true;
      btn.addEventListener('click', toggleTheme);
    }
  }

  /* ------------------------------ 数字/金额 ------------------------------ */
  /** 保留 n 位小数并去尾零（默认 2 位） */
  function round(value, digits) {
    var d = digits == null ? 2 : digits;
    var p = Math.pow(10, d);
    return Math.round((Number(value) || 0) * p) / p;
  }

  /** 千分位金额格式化（¥ 前缀，默认 2 位小数） */
  function money(value, digits) {
    var n = round(value, digits == null ? 2 : digits);
    var parts = String(n).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return '¥' + parts.join('.');
  }

  /** 数字千分位（不带货币符号） */
  function thousands(value) {
    var parts = String(value).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  /* ------------------------------ DOM 简写 ------------------------------ */
  function qs(sel, root) { return (root || doc).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }

  function on(el, type, fn) { if (el) el.addEventListener(type, fn); }

  /** 安全读取数值型 input，非法返回 NaN */
  function numInput(el) {
    if (!el) return NaN;
    var v = String(el.value).trim();
    return v === '' ? NaN : Number(v);
  }

  /* ------------------------------ 其他 ------------------------------ */
  function debounce(fn, wait) {
    var t = null;
    return function () {
      var ctx = this, args = arguments;
      if (t) global.clearTimeout(t);
      t = global.setTimeout(function () { fn.apply(ctx, args); }, wait || 200);
    };
  }

  /** 简易 localStorage 读写（JSON 安全） */
  function store(key, value) {
    try {
      if (arguments.length === 1) {
        var raw = global.localStorage.getItem(key);
        return raw == null ? null : JSON.parse(raw);
      }
      global.localStorage.setItem(key, JSON.stringify(value));
      return value;
    } catch (e) { return null; }
  }

  /** 埋点便捷封装（window.Tracker 缺失时静默） */
  function track(event, props) {
    try { if (global.Tracker && global.Tracker.track) global.Tracker.track(event, props); } catch (e) { /* ignore */ }
  }

  /* ------------------------------ 最近使用（C6） ------------------------------
     记录访问过的工具页路径（去重、上限 12），命令面板空查询时置顶展示。 */
  var XT_RECENT_KEY = 'xt_recent';
  function xtGetRecent() {
    try { var a = JSON.parse(global.localStorage.getItem(XT_RECENT_KEY)); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function xtRecordRecent() {
    var p = global.location.pathname;
    if (!p || p === '/' || /search\.html$/.test(p)) return;
    try {
      var arr = xtGetRecent().filter(function (x) { return x !== p; });
      arr.unshift(p);
      global.localStorage.setItem(XT_RECENT_KEY, JSON.stringify(arr.slice(0, 12)));
    } catch (e) { /* 隐私模式 / 容量超限静默 */ }
  }

  /* ------------------------------ ⌘K 命令面板（全局工具快捷跳转） ------------------------------
     Ctrl/⌘+K 或 / 唤出；命令源为侧栏/主导航/页脚已渲染的站内链接（自动去重、零数据接线）；
     模糊匹配 + ↑↓ 选择 / Enter 打开 / Esc 关闭；含“切换主题”“搜索全部工具”命令。 */
  function initPalette() {
    if (qs('#xt-cmdk-style') && doc.__xtPaletteBound) return;
    if (!doc.getElementById('xt-cmdk-style')) {
      var st = doc.createElement('style');
      st.id = 'xt-cmdk-style';
      st.textContent = [
        '.xt-cmdk-trigger{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 10px;border:1px solid var(--border,#8884);border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:.75rem;cursor:pointer;opacity:.82}',
        '.xt-cmdk-trigger:hover,.xt-cmdk-trigger:focus-visible{opacity:1;outline:2px solid var(--accent,#3b82f6)}',
        '.xt-cmdk-trigger kbd{border:1px solid var(--border,#8884);border-radius:4px;padding:0 4px;font:inherit;font-size:.68rem;opacity:.8}',
        '.xt-cmdk-mask{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;padding-top:14vh}',
        '.xt-cmdk-box{width:min(560px,92vw);max-height:70vh;display:flex;flex-direction:column;border-radius:12px;overflow:hidden;background:var(--card,#fff);color:var(--text,#111);box-shadow:0 20px 60px rgba(0,0,0,.35)}',
        '.xt-cmdk-input{width:100%;border:0;padding:14px 16px;font:inherit;font-size:1rem;outline:0;background:transparent;color:inherit}',
        '.xt-cmdk-list{overflow:auto;padding:6px}',
        '.xt-cmdk-item{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:9px 12px;border-radius:8px;cursor:pointer;font-size:.92rem}',
        '.xt-cmdk-item .xt-cmdk-path{opacity:.5;font-size:.75rem}',
        '.xt-cmdk-item.is-active,.xt-cmdk-item:hover{background:var(--accent,#3b82f6);color:#fff}',
        '.xt-cmdk-item.is-active .xt-cmdk-path{color:#fff;opacity:.85}',
        '.xt-cmdk-empty{padding:18px;text-align:center;opacity:.6;font-size:.9rem}',
        '.xt-cmdk-foot{border-top:1px solid var(--border,#8883);padding:8px 14px;display:flex;gap:16px;font-size:.72rem;opacity:.6}'
      ].join('');
      doc.head.appendChild(st);
    }
    // 页头触发按钮（自注入）
    var actions = qs('.header-actions');
    if (actions) {
      var trig = doc.createElement('button');
      trig.type = 'button';
      trig.className = 'xt-cmdk-trigger';
      trig.setAttribute('aria-label', '命令面板');
      trig.innerHTML = '<kbd>Ctrl</kbd><kbd>K</kbd>';
      actions.insertBefore(trig, actions.firstChild);
      on(trig, 'click', open);
    }

    // 命令源：抓取站内绝对路径链接，去重（侧栏为主，含全量工具）
    var commands = (function buildCommands() {
      var seen = {}, arr = [];
      qsa('.site-sidebar a[href], .site-nav a[href], .footer-section a[href]').forEach(function (a) {
        var href = a.getAttribute('href') || '';
        if (href.charAt(0) !== '/' || /search\.html/.test(href)) return; // 仅站内；搜索页单独一条
        if (seen[href]) return; seen[href] = 1;
        var label = (a.textContent || '').trim();
        if (label) arr.push({ label: label, href: href });
      });
      arr.push({ label: '搜索全部工具', href: '/search.html' });
      arr.push({ label: '切换深色 / 浅色主题', href: '', action: toggleTheme });
      return arr;
    })();

    var mask = null, input = null, listEl = null, items = commands.slice(), active = 0;
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function render() {
      if (!items.length) { listEl.innerHTML = '<div class="xt-cmdk-empty">没有匹配的工具</div>'; return; }
      if (active >= items.length) active = 0;
      listEl.innerHTML = items.map(function (it, i) {
        return '<div class="xt-cmdk-item' + (i === active ? ' is-active' : '') + '" role="option" data-idx="' + i + '"><span>' + esc(it.label) + '</span><span class="xt-cmdk-path">' + esc(it.recent ? '最近使用' : (it.href || '操作')) + '</span></div>';
      }).join('');
    }
    function filter(q) {
      q = (q || '').trim().toLowerCase();
      var rec = xtGetRecent();
      var list = commands.filter(function (c) { return !q || (c.label + ' ' + c.href).toLowerCase().indexOf(q) >= 0; });
      if (!q) list = list.slice().sort(function (a, b) {
        var ia = rec.indexOf(a.href), ib = rec.indexOf(b.href);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });
      items = list.map(function (c) { var o = { label: c.label, href: c.href, action: c.action }; o.recent = !q && !!c.href && rec.indexOf(c.href) >= 0; return o; });
      active = 0; render();
    }
    function highlight() {
      qsa('.xt-cmdk-item', listEl).forEach(function (x) { x.classList.toggle('is-active', +x.getAttribute('data-idx') === active); });
    }
    function go(i) {
      var it = items[i]; if (!it) return;
      if (it.action) { close(); it.action(); return; }
      if (it.href) global.location.href = it.href;
    }
    function open() {
      if (mask) return;
      mask = doc.createElement('div');
      mask.className = 'xt-cmdk-mask';
      mask.setAttribute('role', 'dialog');
      mask.setAttribute('aria-modal', 'true');
      mask.innerHTML = '<div class="xt-cmdk-box"><input class="xt-cmdk-input" type="text" placeholder="搜索工具…" aria-label="搜索工具" autocomplete="off" /><div class="xt-cmdk-list" role="listbox"></div><div class="xt-cmdk-foot"><span>\u2191\u2193 选择</span><span>Enter 打开</span><span>Esc 关闭</span></div></div>';
      doc.body.appendChild(mask);
      input = qs('.xt-cmdk-input', mask);
      listEl = qs('.xt-cmdk-list', mask);
      filter('');
      on(mask, 'click', function (e) { if (e.target === mask) close(); });
      on(input, 'input', function () { filter(input.value); });
      on(input, 'keydown', onKey);
      on(listEl, 'click', function (e) { var el = e.target.closest('.xt-cmdk-item'); if (el) go(+el.getAttribute('data-idx')); });
      input.focus();
    }
    function close() { if (mask) { mask.parentNode && mask.parentNode.removeChild(mask); mask = null; input = null; listEl = null; } }
    function onKey(e) {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); highlight(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); highlight(); return; }
      if (e.key === 'Enter') { e.preventDefault(); go(active); }
    }
    doc.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (mask) close(); else open(); return; }
      if (e.key === '/' && !mask && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) { e.preventDefault(); open(); }
    });
    doc.__xtPaletteBound = true;
  }

  global.U = {
    currentTheme: currentTheme,
    applyTheme: applyTheme,
    toggleTheme: toggleTheme,
    bindThemeToggle: bindThemeToggle,
    round: round,
    money: money,
    thousands: thousands,
    qs: qs,
    qsa: qsa,
    on: on,
    numInput: numInput,
    debounce: debounce,
    store: store,
    track: track
  };

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', function () { bindThemeToggle(); xtRecordRecent(); initPalette(); });
  } else {
    bindThemeToggle();
    xtRecordRecent();
    initPalette();
  }
})(window);
