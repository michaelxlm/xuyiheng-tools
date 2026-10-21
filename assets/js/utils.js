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
    doc.addEventListener('DOMContentLoaded', bindThemeToggle);
  } else {
    bindThemeToggle();
  }
})(window);
