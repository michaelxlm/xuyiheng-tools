/* ==========================================================================
 * tool-state.js · 一珩工具站留存钩子（WO-133 工具站腿）
 * --------------------------------------------------------------------------
 * 与 cs调色盘 tool-state.js 同范式，但做成「零页面改造」的通用形态：
 *   1) 分享链接：把 #main 内带 id 的表单控件（输入/选择）当前值编码进 URL
 *      hash（#s=<urlencoded JSON>）；打开带 #s= 的链接时回填并派发 input/change，
 *      含 [type=submit] 的表单自动提交一次 → 同输入渲染同输出，零后端。
 *   2) 复制链接按钮：结果区下方注入「复制当前结果链接」，clipboard + 传统兜底。
 *   3) 首页最近使用：读取 utils.js 已在记录的 xt_recent（不重复记录），在首页
 *      渲染可见「最近使用」区块（中英无，纯中文站）。
 * 敏感页豁免（owner 2026-10-29 拍板「一律不编码其输入」）：密码/JWT/密语/IP/取名
 *   等页只保留最近使用记录，绝不把输入写进 URL。以 body[data-page] slug 黑名单判定。
 * 全部存储仅本地、不涉收款、不存 PII；任何 DOM/存储操作包 try/catch 静默降级。
 * ========================================================================== */
(function (global) {
  'use strict';
  var doc = global.document;
  var U = global.U || {};
  function qs(sel, root) { return (root || doc).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }

  /* 敏感页黑名单（body[data-page]）：这些页不编码输入、不注入分享按钮 */
  var SENSITIVE = {
    'calculator-secret-message': 1,
    'calculator-ip-query': 1,
    'calculator-baby-name': 1
  };

  function pageSlug() { return (doc.body && doc.body.getAttribute('data-page')) || ''; }
  function isHome() { var p = global.location.pathname; return p === '/' || /\/index\.html$/.test(p); }
  function isSensitive() { return !!SENSITIVE[pageSlug()]; }

  var SKIP_TYPE = { file: 1, password: 1, submit: 1, button: 1, reset: 1, image: 1, hidden: 1 };

  function fieldEls() {
    return qsa('#main input, #main select, #main textarea').filter(function (el) {
      if (!el.id) return false;
      if (SKIP_TYPE[(el.type || '').toLowerCase()]) return false;
      if (el.disabled || el.readOnly) return false;
      if (el.closest && el.closest('.xt-share')) return false;
      return true;
    });
  }

  function collect() {
    var o = {};
    fieldEls().forEach(function (el) {
      var type = (el.type || '').toLowerCase();
      if (type === 'checkbox' || type === 'radio') {
        if (el.checked) o[el.id] = '1';
      } else {
        var v = String(el.value == null ? '' : el.value).trim();
        if (v !== '') o[el.id] = v;
      }
    });
    return o;
  }

  function writeState(obj) {
    if (isSensitive()) return;
    var n = Object.keys(obj).length;
    var base = global.location.pathname + global.location.search;
    if (!n) {
      if (global.location.hash) { try { global.history.replaceState(null, '', base); } catch (e) {} }
      return;
    }
    var enc = '';
    try { enc = encodeURIComponent(JSON.stringify(obj)); } catch (e) { return; }
    if (enc.length > 2000) return; // 超长文本类输入不写 URL，避免损坏链接
    var newHash = '#s=' + enc;
    if (String(global.location.hash || '') !== newHash) {
      try { global.history.replaceState(null, '', base + newHash); } catch (e) {}
    }
  }

  function restoreState() {
    if (isSensitive()) return;
    var h = String(global.location.hash || '');
    if (h.indexOf('#s=') !== 0) return;
    var obj;
    try { obj = JSON.parse(decodeURIComponent(h.slice(3))); } catch (e) { return; }
    if (!obj || typeof obj !== 'object') return;
    var forms = {};
    Object.keys(obj).forEach(function (id) {
      var el = doc.getElementById(id);
      if (!el || (el.closest && !el.closest('#main'))) return;
      var type = (el.type || '').toLowerCase();
      if (type === 'checkbox' || type === 'radio') { el.checked = obj[id] === '1'; }
      else { el.value = obj[id]; }
      try {
        el.dispatchEvent(new global.Event('input', { bubbles: true }));
        el.dispatchEvent(new global.Event('change', { bubbles: true }));
      } catch (e) {}
      var f = el.form;
      if (f) forms[Object.keys(forms).length] = f;
    });
    Object.keys(forms).forEach(function (k) {
      var f = forms[k];
      var sub = f.querySelector('[type=submit]');
      if (!sub) return;
      try { if (f.requestSubmit) f.requestSubmit(sub); else sub.click(); } catch (e) {}
    });
  }

  /* ---------------- 复制链接按钮（注入结果区之后） ---------------- */
  function injectStyle() {
    if (doc.getElementById('xt-share-style')) return;
    var st = doc.createElement('style');
    st.id = 'xt-share-style';
    st.textContent = [
      '.xt-share{margin:1rem 0 .25rem;display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}',
      '.xt-share-btn{display:inline-flex;align-items:center;gap:.35rem;font:inherit;font-size:.86rem;padding:.45rem .8rem;border:1px solid var(--border,#8884);border-radius:8px;background:transparent;color:inherit;cursor:pointer}',
      '.xt-share-btn:hover,.xt-share-btn:focus-visible{outline:2px solid var(--accent,#3b82f6)}',
      '.xt-share-tip{font-size:.78rem;opacity:.7}',
      '.xt-recent-home{margin:1.25rem 0}',
      '.xt-recent-home h2{font-size:1.05rem;margin:0 0 .6rem}',
      '.xt-recent-home .xt-recent-list{display:flex;flex-wrap:wrap;gap:.5rem}',
      '.xt-recent-home .xt-recent-list a{display:inline-block;padding:.4rem .7rem;border:1px solid var(--border,#8884);border-radius:8px;text-decoration:none;font-size:.85rem}',
      '.xt-recent-note{font-size:.75rem;opacity:.6;margin-top:.5rem}'
    ].join('');
    doc.head.appendChild(st);
  }

  function copyText(text) {
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      return global.navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    return new global.Promise(function (resolve) {
      var ta = doc.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      doc.body.appendChild(ta); ta.select();
      var ok = false; try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
      doc.body.removeChild(ta); resolve(ok);
    });
  }

  function addShareButton() {
    if (isSensitive()) return;
    if (qs('.xt-share')) return;
    if (!fieldEls().length) return;
    injectStyle();
    var mainInner = qs('#main .main-inner') || qs('#main');
    if (!mainInner) return;
    var box = doc.createElement('div');
    box.className = 'xt-share';
    box.innerHTML = '<button type="button" class="xt-share-btn" data-track="share_click" title="链接含你当前填入的参数，仅本地生成">\uD83D\uDD17 复制结果链接</button>' +
      '<span class="xt-share-tip" hidden>已复制，去粘贴分享吧</span>';
    var ad = qs('#main .ad-slot', mainInner);
    if (ad && ad.parentNode === mainInner) mainInner.insertBefore(box, ad);
    else mainInner.appendChild(box);
    var btn = qs('.xt-share-btn', box);
    var tip = qs('.xt-share-tip', box);
    btn.addEventListener('click', function () {
      writeState(collect()); // 确保链接已含当前输入
      copyText(global.location.href).then(function (ok) {
        if (ok) { tip.hidden = false; setTimeout(function () { tip.hidden = true; }, 1800); }
      });
    });
  }

  function bindSave() {
    if (isSensitive()) return;
    if (!fieldEls().length) return;
    var deb = (U.debounce || function (fn) { return fn; })(function () { writeState(collect()); }, 250);
    function handle(e) {
      var t = e.target;
      if (t && t.closest && t.closest('#main') && !(t.closest && t.closest('.xt-share'))) deb();
    }
    doc.addEventListener('input', handle, true);
    doc.addEventListener('change', handle, true);
  }

  /* ---------------- 首页「最近使用」区块（读 utils 的 xt_recent） ---------------- */
  function renderRecentOnHome() {
    if (!isHome()) return;
    var recent;
    try { recent = JSON.parse(global.localStorage.getItem('xt_recent')) || []; } catch (e) { return; }
    recent = recent.filter(function (p) { return p && p !== '/' && !/search\.html$/.test(p); }).slice(0, 8);
    if (recent.length < 2) return;
    var mainInner = qs('#main .main-inner') || qs('#main');
    if (!mainInner) return;
    var links = recent.map(function (p) {
      var a = qs('a[href="' + p + '"]');
      var label = a ? (a.textContent || '').trim() : p;
      var ep = String(p).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      var el = String(label || p).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      return '<a href="' + ep + '">' + el + '</a>';
    }).join('');
    var sec = doc.createElement('section');
    sec.className = 'xt-recent-home';
    sec.innerHTML = '<h2>最近使用</h2><div class="xt-recent-list">' + links + '</div>' +
      '<p class="xt-recent-note">仅保存在本浏览器，清除站点数据即可移除。</p>';
    var hero = qs('.hero', mainInner);
    var featured = qs('#featured', mainInner);
    if (featured && featured.parentNode === mainInner) mainInner.insertBefore(sec, featured.nextSibling);
    else if (hero && hero.parentNode === mainInner) mainInner.insertBefore(sec, hero.nextSibling);
    else mainInner.insertBefore(sec, mainInner.firstChild);
  }

  function init() {
    renderRecentOnHome();
    if (isSensitive()) return;
    restoreState();
    bindSave();
    addShareButton();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
