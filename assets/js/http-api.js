/* ==========================================================================
   http-api.js · 中台接口 fetch 封装（零依赖，替代 uni.request）
   --------------------------------------------------------------------------
   直连 main 中台：https://api.xuyiheng.com
   antucao 专属前缀：/api/v1/front/antucao（tianapi/jisuapi/exchange/ip/notice）
   优惠券：/api/v1/front/coupon/**
   CORS 已在 main 侧放开，同域/跨域均可直接 fetch，无需 token（无登录态）。

   使用：
     API.get(API.endpoints.ip, { ip: '8.8.8.8' }).then(...)
     API.post(API.endpoints.tianapi, { ... })
   静默失败：网络异常时 reject，调用方自行 catch 降级。
   ========================================================================== */

(function (global) {
  'use strict';

  var BASE_URL = 'https://api.xuyiheng.com';
  var P = '/api/v1/front/antucao';

  var endpoints = {
    init: P + '/init',
    tianapi: P + '/tianapi',   // 农历/节假日/星座
    jisuapi: P + '/jisuapi',   // 运势/每日一签
    exchange: P + '/exchange', // 汇率
    ip: P + '/ip',             // IP 归属地
    noticeList: P + '/notice/list',
    couponPaging: '/api/v1/front/coupon/jd/paging',
    couponHotwords: '/api/v1/front/coupon/jd/hotwords'
  };

  /** 拼完整 URL，params 转 query string（GET 用） */
  function buildUrl(path, params) {
    var url = /^https?:\/\//.test(path) ? path : BASE_URL + path;
    if (params && typeof params === 'object') {
      var qs = Object.keys(params)
        .filter(function (k) {
          var v = params[k];
          return v !== undefined && v !== null && v !== '';
        })
        .map(function (k) {
          var v = params[k];
          var encoded = (typeof v === 'object') ? JSON.stringify(v) : v;
          return encodeURIComponent(k) + '=' + encodeURIComponent(encoded);
        })
        .join('&');
      if (qs) url += (url.indexOf('?') >= 0 ? '&' : '?') + qs;
    }
    return url;
  }

  /**
   * GET 请求，返回解析后的 JSON（约定 { code, data, msg }，直接透出整体）
   * @param {String} path - 接口相对路径或完整地址
   * @param {Object} [params] - 查询参数
   * @return {Promise<Object>}
   */
  function get(path, params) {
    return fetch(buildUrl(path, params), {
      method: 'GET',
      headers: { 'X-Source-Guard': global.location ? global.location.hostname : '' }
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  /**
   * POST 请求（JSON body）
   * @param {String} path
   * @param {Object} [body]
   * @return {Promise<Object>}
   */
  function post(path, body) {
    return fetch(buildUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Source-Guard': global.location ? global.location.hostname : ''
      },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  global.API = {
    baseURL: BASE_URL,
    endpoints: endpoints,
    buildUrl: buildUrl,
    get: get,
    post: post
  };
})(window);
