/* ==========================================================================
   bazi.js · 八字请求契约、输入边界与结果解释（计算由 main-api 内核负责）
   ========================================================================== */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../core/result'));
  } else {
    root.Tools = root.Tools || {};
    root.Tools.bazi = factory(root.ToolCore.Result);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Result) {
  'use strict';

  var SOURCE = {
    name: '传统四柱八字规则与寿星万年历交节表',
    standard: 'lunar-javascript 1.7.3；1900–2050；北京时间交节，真太阳时为经度近似',
    version: '2026.11-bazi-p0',
    verifiedAt: '2026-11-28',
    sources: [
      { title: 'lunar-javascript', url: 'https://github.com/6tail/lunar-javascript' },
      { title: '寿星万年历', url: 'https://www.8s8s.com/' },
    ],
  };

  function realDate(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    var y = Number(match[1]); var m = Number(match[2]); var d = Number(match[3]);
    var date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    return { y: y, m: m, d: d };
  }

  function numberValue(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return NaN;
  }

  function newRequestId() {
    var cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (!cryptoApi) return '';
    if (cryptoApi.randomUUID) return cryptoApi.randomUUID();
    var bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes).map(function (value) { return value.toString(16).padStart(2, '0'); }).join('');
  }

  function normalize(input) {
    var o = input || {};
    var errors = [];
    var value = {
      date: String(o.date || '').trim(),
      timePrecision: String(o.timePrecision || 'exact'),
      timeBasis: String(o.timeBasis || 'beijing'),
      lateZi: String(o.lateZi || 'same-day'),
      gender: String(o.gender || 'unknown'),
      asOfDate: String(o.asOfDate || '').trim(),
    };
    var birth = realDate(value.date);
    if (!birth || birth.y < 1900 || birth.y > 2050) errors.push('请选择 1900–2050 年之间的有效出生日期');
    if ([ 'exact', 'approximate', 'unknown' ].indexOf(value.timePrecision) < 0) errors.push('请选择有效的时间精确度');
    if ([ 'beijing', 'true-solar' ].indexOf(value.timeBasis) < 0) errors.push('请选择有效的时间口径');
    if ([ 'same-day', 'next-day' ].indexOf(value.lateZi) < 0) errors.push('请选择有效的晚子时规则');
    if ([ 'male', 'female', 'unknown' ].indexOf(value.gender) < 0) errors.push('请选择有效的性别选项');
    if (value.timePrecision !== 'unknown') {
      value.hour = numberValue(o.hour);
      value.minute = numberValue(o.minute);
      if (!Number.isInteger(value.hour) || value.hour < 0 || value.hour > 23) errors.push('出生小时需在 0–23 之间');
      if (!Number.isInteger(value.minute) || value.minute < 0 || value.minute > 59) errors.push('出生分钟需在 0–59 之间');
    } else {
      delete value.hour;
      delete value.minute;
    }
    if (value.timeBasis === 'true-solar') {
      if (value.timePrecision === 'unknown') {
        errors.push('时辰未知时不支持真太阳时，请选择北京时间');
      } else {
        value.longitude = numberValue(o.longitude);
        if (!Number.isFinite(value.longitude) || value.longitude < -180 || value.longitude > 180) errors.push('真太阳时需要 -180–180 之间的出生地经度');
      }
    } else {
      delete value.longitude;
    }
    if (!realDate(value.asOfDate)) errors.push('请选择有效的对照日期');
    return { ok: errors.length === 0, errors: errors, value: value };
  }

  function requestBody(input, retain) {
    var normalized = normalize(input);
    if (!normalized.ok) return normalized;
    var body = { tool: 'bazi', input: normalized.value, retain: retain === true };
    if (body.retain) body.requestId = newRequestId();
    return { ok: true, value: body };
  }

  function isObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }

  function completeResult(data) {
    if (!isObject(data) || !Array.isArray(data.pillars) || (data.pillars.length !== 3 && data.pillars.length !== 4)) return false;
    if (typeof data.dayMaster !== 'string' || typeof data.dayElement !== 'string' || typeof data.tendency !== 'string' || !Number.isFinite(data.strengthIndex)) return false;
    if (!isObject(data.timePillar) || !isObject(data.calendar) || !isObject(data.pattern) || !isObject(data.yongshen) || !isObject(data.jishen)) return false;
    if (!isObject(data.wuxingFlow) || !isObject(data.dayun) || !isObject(data.liuNian) || !isObject(data.preferences) || !isObject(data.jie)) return false;
    if (!isObject(data.gods) || !isObject(data.hiddenGods) || !isObject(data.godBriefs)) return false;
    if (!Array.isArray(data.weighted) || data.weighted.length !== 5 || !data.weighted.every(Number.isFinite)) return false;
    if (!Array.isArray(data.count) || data.count.length !== 5 || !data.count.every(Number.isFinite)) return false;
    if (!Array.isArray(data.candidates) || !Array.isArray(data.shenSha) || !Array.isArray(data.branchRels) || !Array.isArray(data.pillarNotes)) return false;
    if (!Array.isArray(data.reading) || !Array.isArray(data.liuNianList) || !Array.isArray(data.dayun.items)) return false;
    if (!Array.isArray(data.preferences.fields) || typeof data.preferences.trait !== 'string' || typeof data.preferences.color !== 'string' || typeof data.preferences.direction !== 'string') return false;
    if (typeof data.dayun.enabled !== 'boolean' || typeof data.dayun.direction !== 'string' || typeof data.tendencyText !== 'string') return false;
    if (typeof data.pattern.name !== 'string' || typeof data.pattern.text !== 'string' || !data.yongshen.label || !data.yongshen.element || !data.jishen.label || !data.jishen.element) return false;
    if (!data.wuxingFlow.top || !data.wuxingFlow.low || !data.jie.name || !Number.isFinite(data.jie.day) || !data.jie.time) return false;
    if (!Number.isFinite(data.liuNian.year) || !data.liuNian.ganzhi || !data.liuNian.god || typeof data.zodiac !== 'string') return false;
    if (!Object.values(data.gods).every(Number.isFinite) || !Object.values(data.hiddenGods).every(Number.isFinite)) return false;
    return data.pillars.every(function (pillar) {
      return isObject(pillar) && pillar.name && (pillar.unknown || (pillar.ganzhi && Array.isArray(pillar.hidden) && pillar.nayin && pillar.chengSheng && pillar.god));
    });
  }

  function wrapResult(payload) {
    var data = payload && payload.result ? payload.result : payload;
    if (!completeResult(data)) {
      return Result.create('bazi', {
        status: 'error',
        errors: ['服务端返回的排盘数据不完整'],
        source: SOURCE,
        limitations: ['未展示不完整结果'],
      });
    }
    var calendar = data.calendar || {};
    var limitations = [
      '传统命理无科学依据，仅供传统文化娱乐与自我观察，不用于重大决定。',
      calendar.note || '交节与出生时间按服务端声明口径处理。',
    ];
    if (data.certainty === 'ambiguous') limitations.push('出生时间范围跨越交节时刻，年柱或月柱存在候选，不宣称唯一。');
    if (data.timePillar && data.timePillar.unknown) limitations.push('出生时辰未知，本次不生成精确时柱，五行统计仅含年、月、日三柱；格局与用神不唯一判定。');
    if (data.dayun && !data.dayun.enabled) limitations.push('本次不排大运：' + (data.dayun.reason || '输入信息不足') + '。');
    return Result.create('bazi', {
      metrics: {
        dayMaster: data.dayMaster,
        dayElement: data.dayElement,
        tendency: data.tendency,
        strengthIndex: data.strengthIndex,
        certainty: data.certainty,
        retained: !!(payload && payload.retained),
      },
      details: [
        Result.detail('历法版本', calendar.version),
        Result.detail('时间口径', calendar.timeBasis === 'true-solar' ? '真太阳时（经度近似）' : '北京时间'),
        Result.detail('校时结果', calendar.adjustedDateTime || '未知'),
        Result.detail('晚子时规则', calendar.lateZiRule === 'next-day' ? '23:00 换日' : '23:00 不换日'),
        Result.detail('对照日期', calendar.asOfDate),
      ],
      formula: '年柱以立春交节时刻换年；月柱以十二节交节时刻换月；日柱按儒略日序；时柱按五鼠遁。未知时辰不生成时柱。真太阳时用于日、时柱，年月柱仍按北京时间交节判定。',
      assumptions: ['输入时间按 Asia/Shanghai 解释', '真太阳时仅作经度修正，不含均时差', '交节表版本在结果中固定披露'],
      source: SOURCE,
      precision: { time: calendar.inputTimeKnown === false ? 'unknown' : 'minute', jieqi: 'second' },
      limitations: limitations,
    });
  }

  return {
    source: SOURCE,
    realDate: realDate,
    normalize: normalize,
    requestBody: requestBody,
    wrapResult: wrapResult,
  };
});
