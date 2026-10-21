/* ==========================================================================
   ad-slots.js · 自营广告位渲染 + 埋点（零依赖，纯静态可用）

   数据：ad-slots.json（改 JSON 就等于改全站广告，无需改 HTML）
   渲染：扫描页面上的 [data-ad-slot="<placement>"] 容器，按 weight 加权随机选一条填入

   埋点（复用统一埋点 SDK）：
     - 展示 ad_view：广告进入视口 ≥50% 且停留 1s 才计一次，同一广告同一会话只报一次
     - 点击 ad_click：直接挂在渲染出的 <a> 上，由 SDK 的 [data-track] 事件委托自动上报，
       props 携带 ad_id / slot / type / page，无需业务代码逐个绑定
     - SDK 缺失（未引入 pv.js / 被拦截）时全部降级为静默跳过，页面与广告照常工作

   静默失败：JSON 404 / 格式错 / 无匹配广告 / 无容器，都不报错，容器保持原样不占位

   可选配置（在引入本脚本前声明）：
     <script>window.AdSlotsConfig = { src: 'ad-slots.json', debug: true };</script>
   ========================================================================== */

(function (global) {
  'use strict';

  var CONFIG = {
    // 三站统一的广告 JSON：管理端「广告管理」一键生成并同步到 OSS
    src: 'https://antucao.oss-cn-beijing.aliyuncs.com/json/ad-slots.json',
    // 远程取不到时的本地兜底（保留站点内文件，避免 OSS 异常时整站无广告）
    fallbackSrc: 'ad-slots.json',
    // 本站在统一 JSON 中的分片 key（aiweb / color-tool / visitor / main-tool）
    site: 'main-tool',
    // 调试模式：控制台打印渲染与埋点过程
    debug: false,
    // 计入一次展示所需的可见比例
    viewRatio: 0.5,
    // 计入一次展示所需的连续可见时长（毫秒）
    viewDuration: 1000,
  };

  if (global.AdSlotsConfig && typeof global.AdSlotsConfig === 'object') {
    for (var key in global.AdSlotsConfig) {
      if (Object.prototype.hasOwnProperty.call(global.AdSlotsConfig, key)) {
        CONFIG[key] = global.AdSlotsConfig[key];
      }
    }
  }

  // WO-48（2026-10-05）：域名售卖退役，type=domain 不再是合法类型（见 main-api/scripts/check-static-ads.js）
  var DEFAULT_BADGE = {
    self: '广告',
    affiliate: '推广 · 含返利',
    coupon: '优惠券',
  };

  function log() {
    if (CONFIG.debug && global.console && global.console.log) {
      global.console.log.apply(global.console, [ '[AdSlots]' ].concat(Array.prototype.slice.call(arguments)));
    }
  }

  /* ------------------------------ 页面标识 ------------------------------ */
  /** 当前页标识：body[data-page-id] / body[data-page] 优先，否则由路径推导 */
  function pageId() {
    var body = global.document && global.document.body;
    if (body) {
      var id = body.getAttribute('data-page-id') || body.getAttribute('data-page');
      if (id) return id;
    }
    var path = '';
    try { path = global.location.pathname || '/'; } catch (e) { path = '/'; }
    var file = path.split('/').pop() || '';
    if (!file || file === '/' || file.indexOf('index') === 0) return 'home';
    return file.replace(/\.html?$/i, '') || 'home';
  }

  /* ------------------------------ 工具函数 ------------------------------ */
  /** 只放行 http(s)，杜绝 javascript: 等伪协议被写进 href */
  function safeUrl(url) {
    if (typeof url !== 'string') return '';
    var value = url.trim();
    return /^https?:\/\//i.test(value) ? value : '';
  }

  /** 页面匹配：pages 含 "*" 全匹配；excludePages 优先排除 */
  function matchPage(ad, page) {
    var exclude = ad.excludePages;
    if (exclude && exclude.length) {
      for (var i = 0; i < exclude.length; i++) {
        if (exclude[i] === '*' || exclude[i] === page) return false;
      }
    }
    var pages = ad.pages;
    if (!pages || !pages.length) return true; // 未声明视为全站
    for (var j = 0; j < pages.length; j++) {
      if (pages[j] === '*' || pages[j] === page) return true;
    }
    return false;
  }

  /** 位置匹配：placements 含容器 placement 才投放 */
  function matchPlacement(ad, placement) {
    var list = ad.placements;
    if (!list || !list.length) return true; // 未声明视为不限制
    for (var i = 0; i < list.length; i++) {
      if (list[i] === placement) return true;
    }
    return false;
  }

  /** 投放期校验：startAt / endAt 为空表示不限（按 YYYY-MM-DD 字符串比较） */
  function inPeriod(ad) {
    var now = new Date();
    var today = now.getFullYear() + '-' +
      ('0' + (now.getMonth() + 1)).slice(-2) + '-' +
      ('0' + now.getDate()).slice(-2);
    if (ad.startAt && typeof ad.startAt === 'string' && today < ad.startAt) return false;
    if (ad.endAt && typeof ad.endAt === 'string' && today > ad.endAt) return false;
    return true;
  }

  /** 按 weight 加权随机取一条（weight 缺省或非法按 1 计） */
  function pickOne(list) {
    var total = 0;
    var i;
    for (i = 0; i < list.length; i++) {
      total += (typeof list[i].weight === 'number' && list[i].weight > 0) ? list[i].weight : 1;
    }
    var hit = Math.random() * total;
    for (i = 0; i < list.length; i++) {
      hit -= (typeof list[i].weight === 'number' && list[i].weight > 0) ? list[i].weight : 1;
      if (hit <= 0) return list[i];
    }
    return list[0];
  }

  /* ------------------------------ 埋点 ------------------------------ */
  /** 上报一次广告事件；SDK 不存在时静默跳过 */
  function track(event, props) {
    try {
      if (global.Tracker && typeof global.Tracker.track === 'function') {
        global.Tracker.track(event, props);
        log(event, props);
      }
    } catch (e) { /* 埋点失败绝不影响广告与页面 */ }
  }

  /** 展示去重：同一广告同一会话只上报一次 ad_view */
  function viewKey(ad, placement) {
    return '__ad_view_' + (ad.id || 'unknown') + '_' + placement;
  }

  function alreadyViewed(key) {
    try { return global.sessionStorage.getItem(key) === '1'; } catch (e) { return false; }
  }

  function markViewed(key) {
    try { global.sessionStorage.setItem(key, '1'); } catch (e) { /* 隐私模式忽略 */ }
  }

  /** 可见性监听：进入视口并停留 viewDuration 后计一次展示 */
  function observeView(el, ad, placement) {
    var props = {
      ad_id: ad.id || '',
      slot: placement,
      type: ad.type || 'self',
      page: pageId(),
    };

    var report = function () {
      var key = viewKey(ad, placement);
      if (alreadyViewed(key)) return;
      markViewed(key);
      track('ad_view', props);
    };

    if (!global.IntersectionObserver) {
      report(); // 不支持可见性监听时按「已渲染即展示」兜底
      return;
    }

    var timer = null;
    var io = new global.IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.intersectionRatio >= CONFIG.viewRatio) {
          if (!timer) {
            timer = global.setTimeout(function () {
              report();
              io.disconnect();
            }, CONFIG.viewDuration);
          }
        } else if (timer) {
          global.clearTimeout(timer);
          timer = null;
        }
      }
    }, { threshold: [ 0, CONFIG.viewRatio, 1 ] });

    io.observe(el);
  }

  /* ------------------------------ 渲染 ------------------------------ */
  function appendText(parent, className, text) {
    if (!text) return;
    var span = global.document.createElement('span');
    span.className = className;
    span.textContent = text; // 一律走 textContent，杜绝 HTML 注入
    parent.appendChild(span);
  }

  /** 插入广告图（可选字段）；地址同样只放行 http(s)，加载失败自动隐藏避免破图占位 */
  function appendImage(parent, src, alt) {
    if (!safeUrl(src)) return;
    var img = global.document.createElement('img');
    img.className = 'ad-image';
    img.alt = alt || '';
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
    img.setAttribute('referrerpolicy', 'no-referrer');
    img.onload = function () {
      img.setAttribute('data-loaded', '1');
      // 按宽高比区分展示：宽横幅铺满裁切，方图/竖图完整居中展示不裁切
      var w = img.naturalWidth || 0;
      var h = img.naturalHeight || 0;
      img.setAttribute('data-shape', (h > 0 && w / h >= 2) ? 'wide' : 'square');
    };
    img.onerror = function () { img.style.display = 'none'; };
    img.src = src;
    parent.appendChild(img);
  }

  /** 渲染单条广告到容器；返回是否成功 */
  function render(host, ad, placement) {
    var url = safeUrl(ad.url);
    if (!url) {
      log('skip: invalid url', ad.id);
      return false;
    }

    var doc = global.document;
    var a = doc.createElement('a');
    a.className = 'ad-card' + (ad.type ? ' ad-card--' + ad.type : '');
    a.href = url;
    a.target = ad.target || '_blank';
    a.setAttribute('rel', ad.rel || 'sponsored noopener');
    // 点击埋点交给统一 SDK 的 [data-track] 委托，动态插入的元素同样生效
    a.setAttribute('data-track', 'ad_click');
    a.setAttribute('data-track-props', JSON.stringify({
      ad_id: ad.id || '',
      slot: placement,
      type: ad.type || 'self',
      page: pageId(),
    }));
    if (ad.title) a.setAttribute('aria-label', ad.title);

    // 角标 + 眉标放同一行（两端对齐），避免绝对定位角标与长眉标重叠
    var head = doc.createElement('div');
    head.className = 'ad-head';
    appendText(head, 'ad-eyebrow', ad.eyebrow);
    appendText(head, 'ad-badge', ad.badge || DEFAULT_BADGE[ad.type || 'self'] || '广告');
    if (head.firstChild) a.appendChild(head);

    appendImage(a, ad.image, ad.title);
    appendText(a, 'ad-title', ad.title);
    appendText(a, 'ad-desc', ad.desc);
    appendText(a, 'ad-cta', ad.cta);

    host.innerHTML = '';
    host.appendChild(a);
    observeView(a, ad, placement);
    log('render', ad.id, '→', placement);
    return true;
  }

  /* ------------------------------ 数据加载 ------------------------------ */
  function fail(err) {
    log('load failed:', err && err.message ? err.message : err);
  }

  function loadJson(src, done) {
    var settled = false;
    var finish = function (data) {
      if (settled) return;
      settled = true;
      done(data);
    };

    try {
      if (global.fetch) {
        global.fetch(src, { cache: 'no-cache' }).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        }).then(finish).catch(function (err) {
          fail(err);
          finish(null); // 失败也要回调，交由调用方走本地兜底
        });
        return;
      }
    } catch (e) { /* 继续走 XHR 兜底 */ }

    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', src, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          try { finish(JSON.parse(xhr.responseText)); } catch (e) { fail(e); }
        } else {
          fail(new Error('HTTP ' + xhr.status));
          finish(null);
        }
      };
      xhr.onerror = function () { fail(new Error('network error')); finish(null); };
      xhr.send(null);
    } catch (e) { fail(e); finish(null); }
  }

  /** 从统一 JSON 中取本站分片；兼容旧结构（根节点直接是本站数据） */
  function pickSite(data) {
    if (!data || !data.sites || typeof data.sites !== 'object') return null;
    var hit = data.sites[CONFIG.site];
    return (hit && Array.isArray(hit.slots)) ? hit : null;
  }

  /* ------------------------------ 主流程 ------------------------------ */
  function apply(data, hosts) {
    var site = pickSite(data); // 统一 JSON 按站点分片；旧结构直接取根节点
    var settings = (site && site.settings) || (data && data.settings) || {};
    if (settings.enabled === false) {
      log('disabled by settings');
      return;
    }
    var all = (site && site.slots) || (data && data.slots) || [];
    var page = pageId();
    var max = typeof settings.maxPerSlot === 'number' && settings.maxPerSlot > 0 ? settings.maxPerSlot : 1;

    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      var placement = host.getAttribute('data-ad-slot') || 'footer';
      var candidates = [];

      for (var j = 0; j < all.length; j++) {
        var ad = all[j];
        if (!ad || ad.enabled === false) continue;
        if (!matchPlacement(ad, placement)) continue;
        if (!matchPage(ad, page)) continue;
        if (!inPeriod(ad)) continue;
        candidates.push(ad);
      }

      if (!candidates.length) {
        host.setAttribute('data-ad-empty', '1');
        log('empty:', placement, '@', page);
        continue;
      }

      var used = {};
      var filled = 0;
      while (filled < max && Object.keys(used).length < candidates.length) {
        var picked = pickOne(candidates);
        if (used[picked.id || '']) continue;
        used[picked.id || ''] = 1;
        if (render(host, picked, placement)) filled++;
      }
      if (filled) host.setAttribute('data-ad-filled', '1');
    }
  }

  function boot() {
    var doc = global.document;
    if (!doc) return;
    var hosts = doc.querySelectorAll('[data-ad-slot]');
    if (!hosts.length) return; // 页面没放容器，直接结束（零开销）
    loadJson(CONFIG.src, function (data) {
      if (data) {
        apply(data, hosts);
        return;
      }
      // 远程（OSS）取不到时回退本地文件，保证站点始终有广告可投
      if (CONFIG.fallbackSrc && CONFIG.fallbackSrc !== CONFIG.src) {
        log('fallback to local:', CONFIG.fallbackSrc);
        loadJson(CONFIG.fallbackSrc, function (local) {
          if (local) apply(local, hosts);
        });
      }
    });
  }

  if (global.document && global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.AdSlots = { render: render, pageId: pageId, config: CONFIG };
})(window);
