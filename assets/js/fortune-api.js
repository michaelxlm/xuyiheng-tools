/* ==========================================================================
   fortune-api.js · 命理测算中台适配层（浏览器端零计算逻辑）
   --------------------------------------------------------------------------
   六款命理工具的计算内核统一放在 main-api：app/lib/fortune-engine.js。
   本文件只做三件事：提供展示用静态字表、发请求、管理按钮 loading 态。
   每次测算都会在中台 fortune_readings 留痕，可在管理端「命理测算记录」查看。

   依赖：http-api.min.js（window.API），由 prerender 先行注入。
   ========================================================================== */

(function (global) {
  'use strict';

  var GAN = [ '甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸' ];
  var ZHI = [ '子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥' ];
  var WUXING = [ '金', '木', '水', '火', '土' ];
  var SIGNS = [ '白羊', '金牛', '双子', '巨蟹', '狮子', '处女', '天秤', '天蝎', '射手', '摩羯', '水瓶', '双鱼' ];
  var ANIMALS = [ '鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪' ];

  /** 今日日期 YYYY-MM-DD（仅用于表单预填，不参与命理计算） */
  function today() {
    var t = new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  }

  /** 把日期输入框预填为今天 */
  function fillToday(input) { if (input) input.value = today(); }

  /**
   * 生肖快捷选择对应的最近年份（仅做公历年份映射，命理关系仍由中台计算）。
   * @param {String} animal - 十二生肖中文名
   * @return {Number} 不晚于今年的最近同名生肖年份
   */
  function recentYear(animal) {
    var idx = ANIMALS.indexOf(animal);
    if (idx < 0) return new Date().getFullYear();
    var y = new Date().getFullYear();
    while ((((y - 4) % 12) + 12) % 12 !== idx) y--;
    return Math.max(1900, y);
  }

  /**
   * 调用中台测算。
   * @param {String} tool - bazi / ziwei / natal / horoscope / zodiacMatch / tarot
   * @param {Object} input - 该工具参数
   * @return {Promise<Object>} 服务端信封的 data（含 id / tool / input / result / summary / generatedAt）
   */
  function calculate(tool, input) {
    var API = global.API;
    if (!API || typeof API.post !== 'function') {
      return Promise.reject(new Error('接口组件未加载，请稍后重试'));
    }
    return API.post(API.endpoints.fortuneCalculate, { tool: tool, input: input || {} }).then(function (res) {
      if (!res || String(res.code) !== '0') {
        throw new Error((res && (res.msg || res.message)) || '测算失败，请稍后重试');
      }
      return res.data || {};
    });
  }

  /**
   * 带按钮 loading 的测算（页面 submit 统一走这里）。
   * @param {HTMLElement} btn - 触发按钮，可为 null
   * @param {String} tool - 工具标识
   * @param {Object} input - 参数
   * @return {Promise<Object>} result 对象（服务端 result 字段）
   */
  function run(btn, tool, input) {
    var label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '计算中…'; }
    function restore() {
      if (btn) { btn.disabled = false; btn.textContent = label; }
    }
    return calculate(tool, input).then(function (payload) {
      restore();
      return payload.result || payload;
    }, function (err) {
      restore();
      throw err;
    });
  }

  global.FortuneAPI = {
    calculate: calculate,
    run: run,
    GAN: GAN,
    ZHI: ZHI,
    WUXING: WUXING,
    SIGNS: SIGNS,
    ANIMALS: ANIMALS,
    today: today,
    fillToday: fillToday,
    recentYear: recentYear,
    bazi: function (input) { return calculate('bazi', input); },
    ziwei: function (input) { return calculate('ziwei', input); },
    natal: function (input) { return calculate('natal', input); },
    horoscope: function (input) { return calculate('horoscope', input); },
    zodiacMatch: function (input) { return calculate('zodiacMatch', input); },
    tarot: function (input) { return calculate('tarot', input); }
  };
})(window);
