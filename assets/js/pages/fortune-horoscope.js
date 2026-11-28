/* fortune-horoscope.js · 星座运势薄控制器：最新请求保护、内存缓存与安全文本渲染 */
(function () {
  'use strict';

  function boot() {
    var Tools = window.Tools || {};
    var RV = window.ToolCore && window.ToolCore.ResultView;
    var API = window.API;
    var form = document.getElementById('hoForm');
    if (!form || !Tools.horoscope || !RV || !API) return;
    var $ = function (id) { return document.getElementById(id); };
    var sequence = 0;
    var currentController = null;
    var selectedSign = '';
    var cache = new Map();

    function node(tag, className, text) {
      var el = document.createElement(tag);
      if (className) el.className = className;
      if (text != null) el.textContent = String(text);
      return el;
    }

    function status(message, isError) {
      $('ho-status').textContent = message || '';
      $('ho-status').hidden = !message;
      $('ho-status').classList.toggle('is-error', !!isError);
    }

    function clear(host) { RV.clear(host); }

    function clearResult() {
      [ 'hoPlain', 'hoScores', 'hoLucky', 'hoTransits', 'hoScoreNotes', 'hoDetails', 'hoLuckyNotes', 'hoDoAvoid', 'hoReading', 'hoExplain' ].forEach(function (id) { clear($(id)); });
      $('hoTitle').textContent = '';
      $('hoDateChip').textContent = '';
      $('hoMood').textContent = '';
      $('hoPct').textContent = '';
      $('hoMethod').textContent = '';
      $('hoAdvice').textContent = '';
      $('ho-error').textContent = '';
      $('ho-error').hidden = true;
    }

    function resetView() {
      sequence += 1;
      if (currentController) currentController.abort();
      currentController = null;
      clearResult();
      $('ho-result').hidden = true;
      $('ho-submit').disabled = false;
      $('ho-submit').textContent = '查询运势';
      status('');
    }

    function showError(message) {
      clearResult();
      $('ho-result').hidden = false;
      $('hoTitle').textContent = '暂时无法显示运势';
      $('ho-error').textContent = message;
      $('ho-error').hidden = false;
      status(message, true);
    }

    function showLoading(sign, date) {
      clearResult();
      $('ho-result').hidden = false;
      $('hoTitle').textContent = sign + '座 · 查询中';
      $('hoDateChip').textContent = date;
      $('hoPlain').appendChild(node('p', 'text-sm text-muted', '正在按所选日期计算，请稍候…'));
      status('正在查询 ' + sign + '座 ' + date + ' 的运势…');
    }

    function renderGuide(host, guide) {
      clear(host);
      if (!guide || !guide.title) return;
      var section = node('section', 'ft-plain-guide');
      section.setAttribute('aria-label', '白话结果导读');
      var head = node('div', 'ft-plain-head');
      head.appendChild(node('span', 'ft-tag', '先看这里'));
      head.appendChild(node('h2', '', guide.title));
      head.appendChild(node('p', '', guide.intro));
      section.appendChild(head);
      var highlights = Array.isArray(guide.highlights) ? guide.highlights : [];
      if (highlights.length) {
        var cards = node('div', 'ft-plain-highlights');
        highlights.forEach(function (item) {
          if (!item || typeof item !== 'object') return;
          var card = node('article', 'ft-plain-card');
          card.appendChild(node('h3', '', item.label));
          card.appendChild(node('p', '', item.text));
          cards.appendChild(card);
        });
        if (cards.children.length) section.appendChild(cards);
      }
      var readingOrder = Array.isArray(guide.readingOrder) ? guide.readingOrder : [];
      if (readingOrder.length) {
        var order = node('div', 'ft-plain-block');
        order.appendChild(node('h3', '', '建议阅读顺序'));
        var ol = node('ol', 'ft-plain-steps');
        readingOrder.forEach(function (text) { ol.appendChild(node('li', '', text)); });
        order.appendChild(ol);
        section.appendChild(order);
      }
      var remindersList = Array.isArray(guide.reminders) ? guide.reminders : [];
      if (remindersList.length) {
        var reminders = node('aside', 'ft-plain-reminders');
        reminders.appendChild(node('strong', '', '读之前记住'));
        var ul = node('ul');
        remindersList.forEach(function (text) { ul.appendChild(node('li', '', text)); });
        reminders.appendChild(ul);
        section.appendChild(reminders);
      }
      host.appendChild(section);
    }

    function stars(value) {
      var text = '';
      for (var i = 1; i <= 5; i++) text += i <= value ? '★' : '☆';
      var el = node('span', 'ft-stars', text);
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', value + ' 星');
      return el;
    }

    function renderKV(host, items) {
      clear(host);
      var grid = node('div', 'ft-kv-grid');
      items.forEach(function (item) {
        var cell = node('div', 'ft-kv');
        cell.appendChild(node('span', '', item[0]));
        cell.appendChild(node('strong', '', item[1]));
        grid.appendChild(cell);
      });
      host.appendChild(grid);
    }

    function renderTransits(host, transits) {
      clear(host);
      var wrap = node('div', 'ft-table-wrap');
      wrap.setAttribute('tabindex', '0');
      wrap.setAttribute('aria-label', '当日行运行星明细表，可横向滚动');
      var table = node('table', 'ft-ref-table');
      var thead = node('thead');
      var headRow = node('tr');
      [ '行星', '所在星座', '实际角距', '相位', '标准角', '允许误差', '实际误差', '性质' ].forEach(function (label) {
        var th = node('th', '', label);
        th.setAttribute('scope', 'col');
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      var tbody = node('tbody');
      transits.forEach(function (item) {
        var row = node('tr');
        if (item.aspect !== '无' && (item.nature === '和谐' || item.nature === '张力')) row.className = 'is-active';
        var values = [
          item.glyph + ' ' + item.planet,
          item.sign + ' ' + item.degree + '°',
          item.separation + '°',
          item.aspect === '无' ? '无主要相位' : item.aspect,
          item.aspectAngle == null ? '—' : item.aspectAngle + '°',
          item.allowedOrb == null ? '—' : '±' + item.allowedOrb + '°',
          item.orb == null ? '—' : item.orb + '°',
          item.nature,
        ];
        values.forEach(function (value) { row.appendChild(node('td', '', value)); });
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      host.appendChild(wrap);
      host.appendChild(node('p', 'text-sm text-muted mt-2', '实际角距是行星与星座中点的夹角；实际误差是实际角距偏离相位标准角的距离。高亮行为当前成相行星。'));
    }

    function shanghaiDateKey(date) {
      try {
        var parts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(date);
        var map = {};
        parts.forEach(function (part) { map[part.type] = part.value; });
        return map.year + '-' + map.month + '-' + map.day;
      } catch (error) {
        return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      }
    }

    function render(data, payload, cacheInfo) {
      var wrapped = Tools.horoscope.wrapResult(payload);
      if (wrapped.status === 'error') { showError(wrapped.errors.join('；')); return; }
      clearResult();
      renderGuide($('hoPlain'), data.plainGuide);
      var todayKey = shanghaiDateKey(new Date());
      $('hoTitle').textContent = data.sign + '座 · ' + (data.date === todayKey ? '今日运势' : data.date + ' 运势');
      $('hoDateChip').textContent = data.date;
      $('hoMood').textContent = '状态 ' + data.mood;

      clear($('hoScores'));
      [ [ '综合', data.scores.overall ], [ '爱情', data.scores.love ], [ '事业', data.scores.career ], [ '财运', data.scores.money ], [ '健康', data.scores.health ] ].forEach(function (item) {
        var row = node('div', 'ft-score-row');
        row.appendChild(node('span', '', item[0]));
        row.appendChild(stars(item[1]));
        $('hoScores').appendChild(row);
      });
      $('hoPct').textContent = data.percent + '%';
      var bar = node('span', 'ft-bar');
      bar.style.display = 'inline-block';
      bar.style.width = '120px';
      bar.style.verticalAlign = 'middle';
      var fill = node('i');
      fill.style.width = data.percent + '%';
      bar.appendChild(fill);
      $('hoPct').appendChild(document.createTextNode(' '));
      $('hoPct').appendChild(bar);

      clear($('hoLucky'));
      if (/^#[0-9a-f]{6}$/i.test(data.colorHex)) {
        var dot = node('span', 'ft-color-dot');
        dot.style.background = data.colorHex;
        $('hoLucky').appendChild(dot);
        $('hoLucky').appendChild(document.createTextNode(' '));
      }
      [ '幸运色 ' + data.color, '幸运数字 ' + data.number, '幸运方位 ' + data.direction, '今日月亮在' + data.moonSign + ' · ' + data.moonPhase ].forEach(function (text) {
        $('hoLucky').appendChild(node('span', 'ft-chip', text));
      });

      renderTransits($('hoTransits'), data.transits);
      var labels = { overall: '综合', love: '爱情', career: '事业', money: '财运', health: '健康' };
      renderKV($('hoScoreNotes'), Object.keys(labels).map(function (key) { return [ labels[key] + ' ' + data.scores[key] + ' 星', data.scoreNotes[key] ]; }));
      renderKV($('hoDetails'), [ [ '爱情', data.details.love ], [ '事业', data.details.career ], [ '财运', data.details.money ], [ '健康', data.details.health ] ]);
      renderKV($('hoLuckyNotes'), [ [ '幸运色', data.colorMeaning ], [ '幸运数字', data.numberMeaning ], [ '幸运方位', data.directionMeaning ] ]);
      clear($('hoDoAvoid'));
      [ [ '宜', data.doList ], [ '忌', data.avoidList ] ].forEach(function (group) {
        var line = node('div', group[0] === '忌' ? 'mt-2' : '');
        line.appendChild(node('strong', '', group[0]));
        line.appendChild(document.createTextNode(' '));
        group[1].forEach(function (text) { line.appendChild(node('span', 'ft-tag', text)); line.appendChild(document.createTextNode(' ')); });
        $('hoDoAvoid').appendChild(line);
      });
      clear($('hoReading'));
      data.reading.forEach(function (text) { $('hoReading').appendChild(node('li', '', text)); });
      $('hoMethod').textContent = data.methodNote;
      $('hoAdvice').textContent = '今日提示：' + data.advice + ' ' + data.highlight;
      RV.renderDetails($('hoExplain'), wrapped.details);
      $('hoExplain').appendChild(node('p', 'text-sm text-muted mt-2', '缓存状态：' + (cacheInfo && cacheInfo.cached ? '本次页面内存缓存' : '本次实时查询') + '；运势日期固定为 ' + data.date + '，不会因缓存而改成今天。'));
      $('ho-result').hidden = false;

      Array.prototype.forEach.call($('hoTabs').children, function (button) {
        var active = button.getAttribute('data-sign') === data.sign;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      if (cacheInfo && cacheInfo.cached) {
        status('来自 30 分钟内的页面内存缓存，获取时间 ' + new Date(cacheInfo.fetchedAt).toLocaleTimeString() + '。', !!cacheInfo.stale);
      } else {
        status('查询完成，本次未留痕。');
      }
      if (window.U && window.U.track) window.U.track('calc_result', { tool: 'horoscope', success: true, cached: !!(cacheInfo && cacheInfo.cached) });
    }

    function fallbackStale(sign, date, key, current) {
      var stale = Tools.horoscope.readCache(cache, key, Date.now(), true);
      if (!stale || current !== sequence) return false;
      try {
        render(stale.result, { result: stale.result, generatedAt: stale.generatedAt, retained: false }, stale);
      } catch (error) {
        return false;
      }
      status('网络不可用，当前展示超过 30 分钟的页面内存缓存，非实时结果。', true);
      return true;
    }

    function networkFailure(error) {
      return !error || error.name === 'AbortError' || error.name === 'TypeError' || /^HTTP 5\d\d$/.test(error.message || '');
    }

    function query() {
      var input = { sign: selectedSign, date: $('ho-date').value };
      var normalized = Tools.horoscope.normalize(input);
      if (!normalized.ok) { showError(normalized.errors.join('；')); return; }
      var key = Tools.horoscope.cacheKey(input.sign, input.date);
      var current = ++sequence;
      if (currentController) currentController.abort();
      var cached = Tools.horoscope.readCache(cache, key);
      if (cached) {
        currentController = null;
        $('ho-submit').disabled = false;
        $('ho-submit').textContent = '查询运势';
        try {
          render(cached.result, { result: cached.result, generatedAt: cached.generatedAt, retained: false }, cached);
        } catch (error) {
          showError('运势展示失败，请重试。');
        }
        return;
      }

      var body = Tools.horoscope.requestBody(input).value;
      var controller = typeof AbortController === 'function' ? new AbortController() : null;
      currentController = controller;
      var timer = controller ? setTimeout(function () { controller.abort(); }, 15000) : null;
      $('ho-submit').disabled = true;
      $('ho-submit').textContent = '查询中…';
      showLoading(input.sign, input.date);
      API.post(API.endpoints.fortuneCalculate, body, controller ? { signal: controller.signal } : undefined).then(function (response) {
        if (current !== sequence) return;
        var payload = Tools.horoscope.responsePayload(response, input);
        if (!payload) {
          var message = response && String(response.code) === '0'
            ? '运势数据不完整，请稍后重试'
            : (response && response.msg ? response.msg : '运势查询失败，请稍后重试');
          var failure = new Error(message);
          failure.business = true;
          throw failure;
        }
        var fetchedAt = Tools.horoscope.writeCache(cache, key, payload);
        try {
          render(payload.result, payload, { cached: false, fetchedAt: fetchedAt });
        } catch (error) {
          showError('运势展示失败，请重试。');
        }
      }).catch(function (error) {
        if (current !== sequence) return;
        if (networkFailure(error) && fallbackStale(input.sign, input.date, key, current)) return;
        var text = error && error.name === 'AbortError'
          ? '请求超时或已取消，请重试。'
          : (error && error.business ? error.message : '运势暂时无法显示，请稍后重试。');
        showError(text);
      }).finally(function () {
        if (timer) clearTimeout(timer);
        if (current === sequence) {
          currentController = null;
          $('ho-submit').disabled = false;
          $('ho-submit').textContent = '查询运势';
        }
      });
    }

    Tools.horoscope.signs.forEach(function (sign) {
      var button = node('button', 'ft-sign-tab', sign);
      button.type = 'button';
      button.setAttribute('data-sign', sign);
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', function () {
        selectedSign = sign;
        query();
      });
      $('hoTabs').appendChild(button);
    });

    form.addEventListener('submit', function (event) { event.preventDefault(); query(); });
    $('ho-date').addEventListener('change', resetView);
    if (!$('ho-date').value) $('ho-date').value = shanghaiDateKey(new Date());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
