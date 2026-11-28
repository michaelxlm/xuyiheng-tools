'use strict';

/* ==========================================================================
 * sw.js · 一珩成长笔记（xuyiheng-tools）离线 Service Worker —— 模板（源文件）
 * --------------------------------------------------------------------------
 * ⚠ 本文件不是站点产物：站点根级 sw.js 由 scripts/build-offline-manifest.js
 *   用本模板 + data/offline-manifest.json 生成。改离线逻辑改这里，
 *   改离线范围改 data/tool-registry.json 的 offlineEligible，不要手改产物 sw.js。
 *   下方三个 CACHE_NAME / PRECACHE_URLS / OFFLINE_PAGES 赋值行是构建期注入点，
 *   变量名与赋值形式不可改（build-offline-manifest 按整行匹配，缺失即报错）。
 *
 * 离线范围口径（唯一事实源 = 工具注册表的 offlineEligible）
 *   offlineEligible = computationMode === 'local' && sensitiveFields.length === 0
 *   即只有「纯本地计算、且输入不含敏感字段」的工具页进清单。API / HYBRID 页
 *   离线算不出结果，缓存它们等于把不可用的页面伪装成可离线；含薪资、出生信息、
 *   健康数据等敏感字段的页面即使本地可算，也不把副本落到设备共享缓存里。
 *
 * 拦截边界（宁可不接管，也不错缓存）
 *   - 跨域请求全部透传：api.xuyiheng.com 接口、/public/ai-widget.js、广告券位；
 *   - 同源 /api/ 前缀一律透传（当前站内没有同源接口，留作前向保护）；
 *   - /assets/ 且带 ?v=<内容哈希> 的资源不可变 → cache-first；不带 ?v= 不缓存；
 *   - 文档与导航请求网络优先：在线永远拿最新，断网才回落预缓存副本；
 *     白名单之外不用首页副本冒充成功，把真实网络错误交回浏览器。
 * ========================================================================== */

var CACHE_NAME = "xuyiheng-tools-290bc5775b";
var CACHE_PREFIX = 'xuyiheng-tools-';
var PRECACHE_URLS = [
  "/",
  "/index.html",
  "/calculator/unit.html",
  "/calculator/pension.html",
  "/calculator/decoration.html",
  "/calculator/size.html",
  "/calculator/scientific.html",
  "/calculator/discount.html",
  "/calculator/date-calc.html",
  "/calculator/due-date.html",
  "/calculator/pace.html",
  "/calculator/pet-age.html",
  "/calculator/percentage.html",
  "/calculator/overtime.html",
  "/calculator/height-predict.html",
  "/calculator/fuel-cost.html",
  "/probability.html",
  "/random.html",
  "/vision.html",
  "/lotto.html",
  "/assets/css/site-shell.css?v=fd06aea34c",
  "/assets/css/theme.min.css?v=ffd746ec5f",
  "/assets/css/tokens.min.css?v=d6bc9597a1",
  "/assets/img/favicon.svg",
  "/assets/js/combo-popularity.js?v=be0f004a85",
  "/assets/js/core/result-view.min.js?v=a07e4fb158",
  "/assets/js/core/result.min.js?v=88accc47bc",
  "/assets/js/http-api.min.js?v=a380445ac8",
  "/assets/js/layout.min.js?v=a2a0701b4d",
  "/assets/js/pages/calculator-discount.min.js?v=a6ec41dfe2",
  "/assets/js/pages/calculator-percentage.min.js?v=ab6c701bc3",
  "/assets/js/pages/calculator-scientific.min.js?v=c5780bc3db",
  "/assets/js/pages/calculator-unit.min.js?v=83642a11fe",
  "/assets/js/pages/home.min.js?v=e3028512cc",
  "/assets/js/pages/random.min.js?v=17d5fd2f2c",
  "/assets/js/pages/vision.min.js?v=6928222152",
  "/assets/js/site-shell.js?v=fd06aea34c",
  "/assets/js/slot-loader.js?v=fb0c14eec5",
  "/assets/js/sw-register.min.js?v=ceca254e6e",
  "/assets/js/tool-core.min.js?v=ad51a822f6",
  "/assets/js/tool-state.min.js?v=9688bfe2ef",
  "/assets/js/tools/percentage.min.js?v=1fc616b020",
  "/assets/js/tools/random.min.js?v=cc11d77146",
  "/assets/js/tools/scientific.min.js?v=1d10b05c3e",
  "/assets/js/tools/vision.min.js?v=23f7462aff",
  "/assets/js/tracker.min.js?v=e95c38c13d",
  "/assets/js/utils.min.js?v=32de2d2bf0",
  "/site.webmanifest"
];
var OFFLINE_PAGES = [
  "/",
  "/index.html",
  "/calculator/unit.html",
  "/calculator/pension.html",
  "/calculator/decoration.html",
  "/calculator/size.html",
  "/calculator/scientific.html",
  "/calculator/discount.html",
  "/calculator/date-calc.html",
  "/calculator/due-date.html",
  "/calculator/pace.html",
  "/calculator/pet-age.html",
  "/calculator/percentage.html",
  "/calculator/overtime.html",
  "/calculator/height-predict.html",
  "/calculator/fuel-cost.html",
  "/probability.html",
  "/random.html",
  "/vision.html",
  "/lotto.html"
];

/* 预缓存逐条写入而非 addAll：单个资源 404 不应让整次安装失败（安装失败会让
   离线能力整体归零，而缺一项只影响那一项的离线可用）。 */
self.addEventListener('install', function (event) {
  event.waitUntil(PRECACHE_URLS.reduce(function (chain, url) {
    return chain.then(function () {
      return caches.open(CACHE_NAME).then(function (cache) {
        return cache.add(new Request(url, { cache: 'reload' }));
      });
    });
  }, Promise.resolve()).catch(function (error) {
    console.warn('[sw] 预缓存未完成：' + (error && error.message ? error.message : error));
  }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) {
      return key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME;
    }).map(function (key) {
      return caches.delete(key);
    }));
  }).then(function () {
    return self.clients.claim();
  }));
});

function isOfflinePage(pathname) {
  if (OFFLINE_PAGES.indexOf(pathname) === -1) return false;
  return true;
}

/* 文档 / 工具页：网络优先，失败回落副本。命中网络时顺手刷新副本，
   使「在线用过一次」的页面在下次断网时仍可用。 */
function handlePage(request, pathname) {
  return fetch(request).then(function (response) {
    if (response && response.ok && isOfflinePage(pathname)) {
      var copy = response.clone();
      caches.open(CACHE_NAME).then(function (cache) {
        cache.put(request, copy);
      });
    }
    return response;
  }).catch(function (networkError) {
    return caches.match(request).then(function (cached) {
      if (cached) return cached;
      throw networkError;
    });
  });
}

/* 版本化静态资源：cache-first（URL 已含内容哈希令牌，同名即同内容，不会陈旧）。 */
function handleAsset(request, url) {
  return caches.match(request).then(function (cached) {
    if (cached) return cached;
    return fetch(request).then(function (response) {
      if (response && response.ok && url.searchParams.get('v')) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(request, copy);
        });
      }
      return response;
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') === 0) return;

  if (url.pathname.indexOf('/assets/') === 0) {
    event.respondWith(handleAsset(request, url));
    return;
  }

  /* 只接管已知页面与站点入口；其余（图片上传、数据导出、未列入清单的路由、
     /data/ 与 /reports/ 等源目录）交回浏览器默认行为，不引入任何缓存语义。 */
  if (isOfflinePage(url.pathname)) {
    event.respondWith(handlePage(request, url.pathname));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request));
  }
});
