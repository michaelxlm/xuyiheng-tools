/* ==========================================================================
   tarot.js · 塔罗请求契约、安全随机/复现边界与结果解释
   默认不留痕时问题不提交中台；仅在显式同意留痕后才随请求发送。
   ========================================================================== */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../core/result'));
  } else {
    root.Tools = root.Tools || {};
    root.Tools.tarot = factory(root.ToolCore.Result);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Result) {
  'use strict';

  var SOURCE = {
    name: '完整 78 张韦特牌池与 SHA-256 确定性洗牌',
    standard: '服务端 crypto 生成 256 位种子；同一种子与牌阵必得同一组牌',
    version: '2026.11-tarot-p0',
    verifiedAt: '2026-11-28',
    limitations: [
      '塔罗无科学依据，仅供文化娱乐与自我反思',
      '抽牌不读取他人想法，也不构成未来预测',
    ],
  };

  var SPREADS = [ 1, 3 ];
  var SEED_PATTERN = /^[A-Za-z0-9_-]{43}$/;

  function isObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }

  function newRequestId() {
    var cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (!cryptoApi) return '';
    if (cryptoApi.randomUUID) return cryptoApi.randomUUID();
    var bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes).map(function (value) { return value.toString(16).padStart(2, '0'); }).join('');
  }

  function questionValue(value) {
    var text = String(value == null ? '' : value).trim();
    if (/\p{Cc}/u.test(text)) return null;
    var chars = Array.from(text);
    return chars.slice(0, 60).join('');
  }

  function normalize(input) {
    var o = input || {};
    var errors = [];
    var value = {
      spread: Number(o.spread),
      mode: String(o.mode || 'new'),
      question: questionValue(o.question),
    };
    if (SPREADS.indexOf(value.spread) < 0) errors.push('牌阵只支持 1 张或 3 张');
    if ([ 'new', 'reproduce' ].indexOf(value.mode) < 0) errors.push('抽牌模式需为 new 或 reproduce');
    if (value.question === null) errors.push('问题不能包含换行或控制字符');
    if (value.mode === 'reproduce') {
      value.seed = String(o.seed || '');
      if (!SEED_PATTERN.test(value.seed)) errors.push('复现种子需为 256 位 base64url');
    }
    return { ok: errors.length === 0, errors: errors, value: value };
  }

  function requestBody(input, retain) {
    var normalized = normalize(input);
    if (!normalized.ok) return normalized;
    var keepQuestion = retain === true;
    var payload = { spread: normalized.value.spread, mode: normalized.value.mode };
    if (keepQuestion) payload.question = normalized.value.question || '今日指引';
    if (normalized.value.mode === 'reproduce') payload.seed = normalized.value.seed;
    var body = { tool: 'tarot', input: payload, retain: keepQuestion };
    if (body.retain) body.requestId = newRequestId();
    return { ok: true, value: body };
  }

  function completeCard(card) {
    if (!isObject(card)) return false;
    if (typeof card.numeral !== 'string' || typeof card.name !== 'string' || typeof card.position !== 'string') return false;
    if (typeof card.reversed !== 'boolean' || typeof card.meaning !== 'string' || typeof card.core !== 'string') return false;
    if (typeof card.advice !== 'string' || typeof card.element !== 'string') return false;
    if (typeof card.arcana !== 'string' && typeof card.arcana !== 'number') return false;
    if (!Array.isArray(card.keywords) || !card.keywords.length || !card.keywords.every(function (item) { return typeof item === 'string'; })) return false;
    if (card.major === true && typeof card.suit === 'string' && card.suit) return false;
    return true;
  }

  function completeResult(data) {
    if (!isObject(data)) return false;
    if (SPREADS.indexOf(data.spread) < 0) return false;
    if (typeof data.question !== 'string' || Array.from(data.question).length > 60) return false;
    if (!Array.isArray(data.cards) || data.cards.length !== data.spread) return false;
    if (!data.cards.every(completeCard)) return false;
    if (typeof data.reading !== 'string' || typeof data.summary !== 'string') return false;
    if (!Array.isArray(data.readingList) || !Array.isArray(data.actionSteps) || !Array.isArray(data.spreadGuide)) return false;
    if (data.deckSize !== 78 || data.algorithmVersion !== 'tarot-v2') return false;
    if (!isObject(data.draw) || !SEED_PATTERN.test(String(data.draw.seed || ''))) return false;
    if ([ 'new', 'reproduce' ].indexOf(data.draw.mode) < 0 || data.draw.reproducible !== true) return false;
    return true;
  }

  function completeSharedResult(data) {
    if (!isObject(data)) return false;
    if (SPREADS.indexOf(data.spread) < 0 || typeof data.question !== 'string') return false;
    if (!Array.isArray(data.cards) || data.cards.length !== data.spread) return false;
    if (!data.cards.every(completeCard)) return false;
    if (typeof data.reading !== 'string' || typeof data.summary !== 'string') return false;
    if (!Array.isArray(data.readingList) || !Array.isArray(data.actionSteps) || !Array.isArray(data.spreadGuide)) return false;
    if (data.deckSize !== 78 || data.algorithmVersion !== 'tarot-v2') return false;
    if (!isObject(data.draw)) return false;
    return data.draw.reproducible === true && data.draw.seed === undefined;
  }

  function responsePayload(response, expected) {
    if (!response || String(response.code) !== '0' || !response.data || !completeResult(response.data.result)) return null;
    var result = response.data.result;
    if (!expected) return response.data;
    var normalized = normalize(expected);
    if (!normalized.ok) return null;
    if (result.spread !== normalized.value.spread) return null;
    if (result.draw.mode !== normalized.value.mode) return null;
    if (normalized.value.mode === 'reproduce' && result.draw.seed !== normalized.value.seed) return null;
    if (expected.retain === true) {
      var question = normalized.value.question || '今日指引';
      if (result.question !== question) return null;
    }
    return response.data;
  }

  function sharePayload(response) {
    if (!response || String(response.code) !== '0' || !response.data) return null;
    var data = response.data;
    if (!SEED_PATTERN.test(String(data.shareId || ''))) return null;
    if (!completeSharedResult(data.result)) return null;
    return data;
  }

  function shareUrl(shareId) {
    var id = String(shareId || '');
    if (!SEED_PATTERN.test(id)) return '';
    return '/fortune/tarot.html?share=' + encodeURIComponent(id);
  }

  function wrapShareResult(payload) {
    var data = payload && payload.result ? payload.result : payload;
    if (!completeSharedResult(data)) {
      return Result.create('tarot', {
        status: 'error',
        errors: ['分享数据不完整或已过期'],
        source: SOURCE,
        limitations: ['未展示不完整结果'],
      });
    }
    return Result.create('tarot', {
      metrics: {
        spread: data.spread,
        mode: 'shared',
        deckSize: data.deckSize,
        retained: true,
      },
      details: [
        Result.detail('牌阵', data.spread === 1 ? '单张指引' : '过去 · 现在 · 未来'),
        Result.detail('问题', '已隐藏（分享视图）'),
        Result.detail('抽取模式', '已留痕的分享快照'),
        Result.detail('算法版本', data.algorithmVersion),
        Result.detail('结果生成时间', payload && payload.generatedAt ? payload.generatedAt : '未提供'),
        Result.detail('分享有效期', payload && payload.expiresAt ? payload.expiresAt : '未提供'),
      ],
      formula: '分享视图读取服务端已存的塔罗快照，不重新洗牌、不重新计算；问题文字与复现种子在分享快照中已隐藏。',
      assumptions: [
        '分享快照由留痕记录生成，最长保留 24 小时',
        '分享视图不包含问题文字与种子，无法据此复现',
      ],
      source: SOURCE,
      precision: { draw: 'stored-snapshot', deckSize: data.deckSize },
      limitations: [
        '塔罗无科学依据，牌面只用于整理思绪，不构成预测或重大决定依据。',
        '分享视图隐藏了提问内容，牌义仍需结合你自己的语境理解。',
      ].concat(SOURCE.limitations),
    });
  }

  function wrapResult(payload) {
    var data = payload && payload.result ? payload.result : payload;
    if (!completeResult(data)) {
      return Result.create('tarot', {
        status: 'error',
        errors: ['服务端返回的抽牌数据不完整'],
        source: SOURCE,
        limitations: ['未展示不完整结果'],
      });
    }
    var limitations = [
      '塔罗无科学依据，牌面只用于整理思绪，不构成预测或重大决定依据。',
      '正逆位与关键词是文化解释，不代表吉凶，也不能读取他人想法。',
    ];
    if (data.draw.mode === 'reproduce') limitations.push('本次为按种子复现，牌面与首次抽取一致，不代表重复占卜获得了新答案。');
    if (!(payload && payload.retained)) limitations.push('本次未留痕：问题未提交中台，页面关闭后无法复现同一组牌。');
    return Result.create('tarot', {
      metrics: {
        spread: data.spread,
        mode: data.draw.mode,
        deckSize: data.deckSize,
        retained: !!(payload && payload.retained),
      },
      details: [
        Result.detail('牌阵', data.spread === 1 ? '单张指引' : '过去 · 现在 · 未来'),
        Result.detail('问题', data.question),
        Result.detail('抽取模式', data.draw.mode === 'reproduce' ? '按种子复现' : '安全随机新抽'),
        Result.detail('复现种子', data.draw.seed),
        Result.detail('算法版本', data.algorithmVersion),
        Result.detail('结果生成时间', payload && payload.generatedAt ? payload.generatedAt : '未提供'),
      ],
      formula: '服务端以 crypto 生成 256 位种子；以 SHA-256 计数流对完整 78 张牌池执行 Fisher–Yates 洗牌，再按牌阵抽取前 N 张并判定正逆位。同一种子、牌阵与算法版本必得同一结果。',
      assumptions: [
        '默认不留痕时不提交问题文字，仅在浏览器内展示',
        '显式同意留痕后问题随请求提交，并在服务端最长保留 24 小时',
        '复现依赖服务端返回的种子，页面不把种子写入 URL 或存储',
      ],
      source: SOURCE,
      precision: { draw: 'cryptographic', deckSize: data.deckSize },
      limitations: limitations.concat(SOURCE.limitations),
    });
  }

  return {
    source: SOURCE,
    spreads: SPREADS.slice(),
    shareUrl: shareUrl,
    normalize: normalize,
    requestBody: requestBody,
    completeResult: completeResult,
    completeSharedResult: completeSharedResult,
    responsePayload: responsePayload,
    sharePayload: sharePayload,
    wrapResult: wrapResult,
    wrapShareResult: wrapShareResult,
  };
});