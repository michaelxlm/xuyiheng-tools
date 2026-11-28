/* ==========================================================================
 * sw-register.js · 离线 Service Worker 注册（构建期由 prerender 注入全站）
 * --------------------------------------------------------------------------
 * 刻意做得极薄：注册失败（隐私模式、禁用 SW、脚本被拦截、非安全上下文）静默吞掉，
 * 不提示、不重试、不影响页面任何既有行为——离线能力是增强项，不是运行前提。
 * 只在 load 之后注册，避免与首屏计算/埋点抢主线程与带宽。
 * ========================================================================== */
(function () {
  'use strict';

  var SW_URL = '/sw.js';
  var SW_SCOPE = '/';

  function isSecureOrigin() {
    var loc = window.location;
    if (loc.protocol === 'https:') return true;
    return loc.protocol === 'http:' && (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1');
  }

  function register() {
    if (!('serviceWorker' in navigator)) return;
    if (!isSecureOrigin()) return;
    // file:// 预览或代理改写路径时注册只会失败，提前跳过减少无谓报错
    if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return;
    navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }).catch(function () {
      /* 保持在线体验不变，静默降级 */
    });
  }

  function onReady() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true, passive: true });
  }

  onReady();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { register: register, isSecureOrigin: isSecureOrigin, SW_URL: SW_URL, SW_SCOPE: SW_SCOPE };
  }
})();
