// combo-popularity.js · 场景联盟位（localStorage 本地热度排序，避开六站共用 ad-slots.js）
// 职责：① 拦截 calc_click 事件记录本地热度；② 在 combo 决策页的
//       .ad-slot[data-ad-slot="next"] 渲染「自营 next + 场景库存」择优推荐。
// WO-191：next 位总展示条数严格受 site-shell-registry.js 的 next 配额约束
//       （window.__NEXT_QUOTA__，本站为 1）；配额为 1 时只展示本地点击热度
//       最高的 1 条。热度来自用户自己设备的 localStorage，非全站 PV。
(function () {
  'use strict';
  var KEY = 'xt_combo_clicks';

  // ---------- 热度记录 ----------
  function record(tool) {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || '{}');
      d[tool] = (d[tool] || 0) + 1;
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch (e) { /* 隐私模式静默 */ }
  }

  function getAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch (e) { return {}; }
  }

  // ---------- 捕获 calc_click ----------
  // WO-191 修正：全站 calc_click 由 tracker.js 的 [data-track] 事件委托直接调内部
  // track() 上报，不经 window.U.track / window.Tracker.track，旧钩子恒不触发。
  // 主路径改为在 document 捕获阶段监听 data-track="calc_click" 的点击，从
  // data-track-props 取 tool 短名；同时保留对两个公开 track 的钩子，兼容手动调用。
  function toolFromProps(raw) {
    if (!raw) return '';
    try {
      var p = JSON.parse(raw);
      return p && typeof p.tool === 'string' ? p.tool : '';
    } catch (e) { return ''; }
  }

  function hookDataTrack() {
    if (!document.addEventListener) return;
    document.addEventListener('click', function (e) {
      var el = e.target;
      for (var i = 0; el && i < 5; i++) {
        if (el.getAttribute && el.getAttribute('data-track') === 'calc_click') {
          var tool = toolFromProps(el.getAttribute('data-track-props'));
          if (tool) record(tool);
          return;
        }
        el = el.parentNode;
      }
    }, true); // 捕获阶段，先于 tracker.js 冒泡委托
  }

  function hookTracker() {
    [ window.U, window.Tracker ].forEach(function (obj) {
      if (!obj || typeof obj.track !== 'function' || obj.__wo191Hooked) return;
      var orig = obj.track;
      obj.__wo191Hooked = true;
      obj.track = function () {
        if (arguments[0] === 'calc_click') {
          var p = arguments[1] || {};
          if (p && p.tool) record(p.tool);
        }
        return orig.apply(this, arguments);
      };
    });
  }

  // ---------- 决策页 next 位 ----------
  function currentScene() {
    var m = location.pathname.match(/\/combo\/([^/]+?)(?:\.html)?\/?$/);
    return m ? m[1] : '';
  }

  // tool 短名作为 URL 子串匹配，累加本地点击数
  function heatOf(url, clicks) {
    var n = 0;
    for (var k in clicks) {
      if (!Object.prototype.hasOwnProperty.call(clicks, k) || !k) continue;
      if (url && url.indexOf(k) >= 0) n += Number(clicks[k]) || 0;
    }
    return n;
  }

  // 仅接受站内绝对路径或 http(s) 外链；拒绝 javascript:/data: 等危险协议
  function safeUrl(u) {
    if (typeof u !== 'string') return false;
    return u.charAt(0) === '/' || /^https?:\/\//i.test(u);
  }

  // 候选池：① 自营 next（__TOOLS__ 里其它 combo 决策页）；
  //         ② 场景库存（__AFFILIATE_INVENTORY__ 里当前 scene 条目，含可选的外部联盟位）。
  // WO-191：库存条目可带 type:'affiliate' + http(s) 外链（渠道由 owner 拍板后填入），
  //         渲染时按广告合规加 rel="sponsored noopener" + 「广告」角标；无外部数据时
  //         全是站内自营，行为与旧版一致。两类合并按本地热度择优，由 next 配额裁剪。
  function buildCandidates(clicks) {
    var tools = window.__TOOLS__ || [];
    var inv = window.__AFFILIATE_INVENTORY__ || [];
    var scene = currentScene();
    var cur = location.pathname.replace(/\/+$/, '');
    var list = [];

    tools.forEach(function (t, i) {
      if (!t || t.key !== 'combo' || !t.url) return;
      if (t.url === cur || t.url === cur + '/') return;
      list.push({
        url: t.url, label: t.label, desc: (t.desc || '').slice(0, 36),
        heat: heatOf(t.url, clicks), rank: 1, order: i
      });
    });

    inv.forEach(function (it, i) {
      if (!it || it.scene !== scene || !safeUrl(it.url) || it.url === cur) return;
      var aff = it.type === 'affiliate';
      // 外部联盟位必须有 label；站外链接一律视为广告条目（即便未显式标 type）
      var external = /^https?:\/\//i.test(it.url);
      var isAff = aff || external;
      var heat = heatOf(it.url, clicks);
      // WO-191：联盟位 URL 不含工具短名，本地 heat 恒 0；若不与站内同权，next=1 时
      // 站内自营（order 更小）会永远压过联盟位。给联盟位一个基础热度 1：
      // 用户本机点过某工具（heat>0）时仍按真实偏好优先；无记录时联盟位可展示变现。
      list.push({
        url: it.url, label: it.label, desc: (it.desc || '').slice(0, 36),
        heat: isAff && !heat ? 1 : heat, rank: 0, order: i,
        affiliate: isAff, external: external
      });
    });

    // 本地点击热度降序 → 同热度时场景库存（人工编排）优先 → 原始次序稳定
    list.sort(function (a, b) {
      return (b.heat - a.heat) || (a.rank - b.rank) || (a.order - b.order);
    });
    return list;
  }

  function injectStyle() {
    if (document.getElementById('combo-related-style')) return;
    var s = document.createElement('style');
    s.id = 'combo-related-style';
    s.textContent = '.combo-related{margin:2rem 0;padding:1.5rem;border:1px solid var(--border,#e5e7eb);border-radius:12px;background:var(--surface-alt,#f9fafb)}'
      + '.combo-related h3{margin:0 0 .35rem;font-size:1.1rem}'
      + '.combo-related .crc-note{margin:0 0 1rem;font-size:.75rem;opacity:.6;line-height:1.4}'
      + '.combo-related-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.75rem}'
      + '.combo-related-card{display:flex;flex-direction:column;gap:4px;padding:.75rem 1rem;border-radius:8px;border:1px solid var(--border,#e5e7eb);text-decoration:none;color:inherit;background:var(--surface,#fff);transition:border-color .15s}'
      + '.combo-related-card:hover{border-color:var(--accent,#2563eb)}'
      + '.crc-label{font-weight:600;font-size:.95rem}'
      + '.crc-desc{font-size:.8rem;opacity:.65;line-height:1.3}'
      + '.crc-ad{font-size:.7rem;padding:1px 5px;margin-left:5px;border:1px solid var(--border,#e5e7eb);border-radius:4px;opacity:.65}';
    document.head.appendChild(s);
  }

  function renderRelated() {
    var slot = document.querySelector('.ad-slot[data-ad-slot="next"]');
    if (!slot) return;

    // 硬配额来自 site-shell-registry.js（经 prerender.js 注入），缺省 1，绝不超配
    var quota = Number(window.__NEXT_QUOTA__) || 1;
    if (quota < 1) return;

    var chosen = buildCandidates(getAll()).slice(0, quota);
    if (!chosen.length) return;

    injectStyle();

    // 用安全 DOM API 构建，避免 innerHTML XSS
    var section = document.createElement('section');
    section.className = 'combo-related';
    var h3 = document.createElement('h3');
    var isAd = chosen.some(function (t) { return t.affiliate; });
    h3.textContent = isAd ? '相关推荐 · 合作推广' : (quota === 1 ? '继续逛 · 你最常点' : '相关场景工具');
    section.appendChild(h3);
    var note = document.createElement('p');
    note.className = 'crc-note';
    note.textContent = isAd
      ? '含合作推广内容（标注「广告」）；其余按你本机点击记录择优，非全站热度排名。'
      : '仅依据你本机的点击记录择优，非全站热度排名；展示条数受 next 配额限制。';
    section.appendChild(note);

    var grid = document.createElement('div');
    grid.className = 'combo-related-grid';
    chosen.forEach(function (t) {
      var a = document.createElement('a');
      a.className = 'combo-related-card';
      a.href = t.url;
      if (t.external) {
        a.target = '_blank';
        a.rel = 'sponsored noopener'; // 广告合规：外链一律 noopener + sponsored
      }
      var lbl = document.createElement('span');
      lbl.className = 'crc-label';
      lbl.textContent = t.label;
      if (t.affiliate) {
        var ad = document.createElement('span');
        ad.className = 'crc-ad';
        ad.textContent = '广告';
        lbl.appendChild(ad);
      }
      var desc = document.createElement('span');
      desc.className = 'crc-desc';
      desc.textContent = t.desc;
      a.appendChild(lbl);
      a.appendChild(desc);
      grid.appendChild(a);
    });
    section.appendChild(grid);
    slot.parentNode.replaceChild(section, slot);
  }

  // ---------- 启动 ----------
  hookDataTrack();
  hookTracker();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderRelated);
  } else {
    renderRelated();
  }
})();
