/* fortune-natal.js · 本命星盘薄控制器：IANA/DST 边界、最新请求保护与安全文本渲染 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function boot() {
    var Tools = window.Tools || {};
    var RV = window.ToolCore && window.ToolCore.ResultView;
    var API = window.API;
    var form = document.getElementById('ntForm');
    if (!form || !Tools.natal || !RV || !API) return;
    var $ = function (id) { return document.getElementById(id); };
    var sequence = 0;
    var currentController = null;
    var deleteController = null;
    var retained = null;
    var pendingRetainBody = null;
    var pendingRetainInput = null;
    var activeBody = null;

    function node(tag, className, text) {
      var el = document.createElement(tag);
      if (className) el.className = className;
      if (text != null) el.textContent = String(text);
      return el;
    }

    function svgNode(tag, attrs) {
      var el = document.createElementNS(SVG_NS, tag);
      Object.keys(attrs || {}).forEach(function (key) { el.setAttribute(key, String(attrs[key])); });
      return el;
    }

    function status(message, isError) {
      $('nt-status').textContent = message || '';
      $('nt-status').hidden = !message;
      $('nt-status').classList.toggle('is-error', !!isError);
    }

    function clear(host) { RV.clear(host); }

    function showError(message) {
      $('nt-error').textContent = message;
      $('nt-error').hidden = false;
      status(message, true);
    }

    function hideError() {
      $('nt-error').textContent = '';
      $('nt-error').hidden = true;
    }

    function renderTable(host, headers, rows) {
      clear(host);
      if (!rows.length) {
        host.appendChild(node('p', 'text-sm text-muted', '暂无数据。'));
        return;
      }
      var wrap = node('div', 'ft-table-wrap');
      wrap.setAttribute('tabindex', '0');
      var table = node('table', 'ft-ref-table');
      var thead = node('thead');
      var tr = node('tr');
      headers.forEach(function (header) { tr.appendChild(node('th', '', header)); });
      thead.appendChild(tr);
      table.appendChild(thead);
      var tbody = node('tbody');
      rows.forEach(function (row) {
        var line = node('tr');
        row.forEach(function (value) { line.appendChild(node('td', '', value)); });
        tbody.appendChild(line);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      host.appendChild(wrap);
    }

    function renderKV(host, items) {
      clear(host);
      if (!items.length) {
        host.appendChild(node('p', 'text-sm text-muted', '暂无数据。'));
        return;
      }
      var grid = node('div', 'ft-kv-grid');
      items.forEach(function (item) {
        var cell = node('div', 'ft-kv');
        cell.appendChild(node('span', '', item[0]));
        cell.appendChild(node('strong', '', item[1]));
        grid.appendChild(cell);
      });
      host.appendChild(grid);
    }

    function renderChips(host, label, values, emptyText) {
      clear(host);
      host.appendChild(node('span', 'text-sm text-muted', label));
      var list = values && values.length ? values : [ emptyText ];
      list.forEach(function (value) { host.appendChild(node('span', 'ft-chip', value)); });
    }

    function renderBars(host, label, data) {
      host.appendChild(node('strong', '', label));
      var keys = Object.keys(data || {});
      var max = 1;
      keys.forEach(function (key) { max = Math.max(max, Number(data[key]) || 0); });
      keys.forEach(function (key) {
        var row = node('div', 'ft-wx-row');
        row.appendChild(node('span', '', key));
        var track = node('span', 'ft-wx-track');
        var fill = node('span', 'ft-wx-fill');
        fill.style.width = Math.round((Number(data[key]) || 0) / max * 100) + '%';
        track.appendChild(fill);
        row.appendChild(track);
        row.appendChild(node('span', 'ft-wx-num', data[key]));
        host.appendChild(row);
      });
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
      if (Array.isArray(guide.highlights) && guide.highlights.length) {
        var cards = node('div', 'ft-plain-highlights');
        guide.highlights.forEach(function (item) {
          if (!item || typeof item !== 'object') return;
          var card = node('article', 'ft-plain-card');
          card.appendChild(node('h3', '', item.label));
          card.appendChild(node('p', '', item.text));
          cards.appendChild(card);
        });
        section.appendChild(cards);
      }
      if (Array.isArray(guide.readingOrder) && guide.readingOrder.length) {
        var order = node('div', 'ft-plain-block');
        order.appendChild(node('h3', '', '建议阅读顺序'));
        var ol = node('ol', 'ft-plain-steps');
        guide.readingOrder.forEach(function (text) { ol.appendChild(node('li', '', text)); });
        order.appendChild(ol);
        section.appendChild(order);
      }
      if (Array.isArray(guide.reminders) && guide.reminders.length) {
        var reminders = node('aside', 'ft-plain-reminders');
        reminders.appendChild(node('strong', '', '读之前记住'));
        var ul = node('ul');
        guide.reminders.forEach(function (text) { ul.appendChild(node('li', '', text)); });
        reminders.appendChild(ul);
        section.appendChild(reminders);
      }
      host.appendChild(section);
    }

    function readInput() {
      return {
        date: $('nt-date').value,
        timePrecision: $('nt-precision').value,
        time: $('nt-time').value,
        timezone: $('nt-tz').value,
        lat: $('nt-lat').value,
        lon: $('nt-lon').value,
        occurrence: $('nt-occurrence').value,
      };
    }

    function syncTimeFields() {
      var unknown = $('nt-precision').value === 'unknown';
      $('nt-time').disabled = unknown;
      if (unknown) $('nt-occurrence').value = '';
    }

    function resetResult() {
      sequence += 1;
      if (currentController) currentController.abort();
      currentController = null;
      activeBody = null;
      pendingRetainBody = null;
      pendingRetainInput = null;
      $('nt-result').hidden = true;
      [ 'ntPlain', 'ntTrio', 'ntWheel', 'ntPlanets', 'ntSky', 'ntRulers', 'ntDist', 'ntAspects', 'ntAspectStats', 'ntEmpty', 'ntNotes', 'ntHouses', 'ntReading', 'ntExplain', 'nt-detail', 'ntCandidates' ].forEach(function (id) { clear($(id)); });
      $('nt-candidates').hidden = true;
      $('ntNote').textContent = '';
      hideError();
      status('');
    }

    function point(theta, r) {
      var a = theta * Math.PI / 180;
      return [ 200 + r * Math.cos(a), 200 - r * Math.sin(a) ];
    }

    function drawWheel(data) {
      var host = $('ntWheel');
      clear(host);
      if (data.timeResolution.status === 'unknown' || !Number.isFinite(data.asc)) {
        host.appendChild(node('p', 'text-sm text-muted', '出生时间未知，本次不生成上升、天顶与宫位轮盘。补充时间后可重新排盘。'));
        return;
      }
      var signs = Tools.natal.signs;
      var ascIdx = Math.max(0, signs.indexOf(data.rising));
      var svg = svgNode('svg', { viewBox: '0 0 400 400', 'class': 'ft-wheel', role: 'img', 'aria-label': '本命星盘轮盘' });
      var border = 'var(--color-border)';
      var ink = 'var(--color-text)';
      var mute = 'var(--color-muted)';
      [ [ 160, 1.5 ], [ 112, 1 ], [ 56, 1 ] ].forEach(function (ring) {
        svg.appendChild(svgNode('circle', { cx: 200, cy: 200, r: ring[0], fill: 'none', stroke: border, 'stroke-width': ring[1] }));
      });
      for (var k = 0; k < 12; k++) {
        var edge = point(180 + k * 30, 160);
        var inner = point(180 + k * 30, 56);
        svg.appendChild(svgNode('line', { x1: edge[0].toFixed(1), y1: edge[1].toFixed(1), x2: inner[0].toFixed(1), y2: inner[1].toFixed(1), stroke: border, 'stroke-width': 1 }));
        var mid = point(180 + k * 30 + 15, 138);
        var label = svgNode('text', { x: mid[0].toFixed(1), y: mid[1].toFixed(1), 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 14, fill: mute });
        label.textContent = signs[(ascIdx + k) % 12];
        svg.appendChild(label);
      }
      data.planets.forEach(function (planet, index) {
        if (!Number.isFinite(planet.longitude)) return;
        var theta = 180 + planet.longitude - data.asc;
        var radius = index < 2 ? 92 : (index < 5 ? 132 : 84);
        var pos = point(theta, radius);
        var glyph = svgNode('text', { x: pos[0].toFixed(1), y: pos[1].toFixed(1), 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 20, fill: 'var(--cat-fortune-ink)' });
        glyph.textContent = planet.glyph;
        svg.appendChild(glyph);
        var deg = point(theta, radius - 18);
        var degText = svgNode('text', { x: deg[0].toFixed(1), y: deg[1].toFixed(1), 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 10, fill: mute });
        degText.textContent = planet.degree + '°';
        svg.appendChild(degText);
      });
      var a1 = point(180, 172);
      var a2 = point(180, 148);
      svg.appendChild(svgNode('line', { x1: a1[0].toFixed(1), y1: a1[1].toFixed(1), x2: a2[0].toFixed(1), y2: a2[1].toFixed(1), stroke: 'var(--color-primary)', 'stroke-width': 2 }));
      var ascLabel = svgNode('text', { x: a1[0].toFixed(1), y: (a1[1] - 12).toFixed(1), 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--color-primary)' });
      ascLabel.textContent = 'ASC';
      svg.appendChild(ascLabel);
      var mcPos = point(180 + data.mc - data.asc, 172);
      var mcLabel = svgNode('text', { x: mcPos[0].toFixed(1), y: mcPos[1].toFixed(1), 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 12, fill: 'var(--color-primary)' });
      mcLabel.textContent = 'MC';
      svg.appendChild(mcLabel);
      var title = svgNode('text', { x: 200, y: 196, 'text-anchor': 'middle', 'font-size': 12, fill: ink });
      title.textContent = '本命盘';
      svg.appendChild(title);
      var sub = svgNode('text', { x: 200, y: 214, 'text-anchor': 'middle', 'font-size': 10, fill: mute });
      sub.textContent = '整宫制';
      svg.appendChild(sub);
      host.appendChild(svg);
    }

    function render(data, payload) {
      var wrapped = Tools.natal.wrapResult(payload);
      if (wrapped.status === 'error') {
        $('nt-result').hidden = false;
        showError(wrapped.errors.join('；'));
        return;
      }
      var timeKnown = data.timeResolution.status !== 'unknown';
      renderGuide($('ntPlain'), data.plainGuide);
      clear($('ntTrio'));
      [
        [ '☉ 太阳', data.sun ], [ '☽ 月亮', data.moon ],
        [ 'MC 天顶', data.midheaven ], [ 'ASC 上升', data.rising ],
      ].forEach(function (item) {
        var card = node('div', 'ft-trio-item');
        card.appendChild(node('span', '', item[0]));
        card.appendChild(node('strong', '', item[1]));
        $('ntTrio').appendChild(card);
      });
      RV.renderDetails($('nt-detail'), wrapped.details);
      drawWheel(data);
      renderTable($('ntPlanets'),
        [ '星体', '星座', '度数', '宫位', '运动' ],
        data.planets.map(function (planet) {
          return [
            planet.glyph + ' ' + planet.name,
            planet.sign,
            planet.degree + '°',
            Number.isInteger(planet.house) ? '第 ' + planet.house + ' 宫' : '未确定',
            (planet.retrograde ? '℞ 逆行 · ' : '') + planet.speed + '°/日',
          ];
        }));
      $('ntNote').textContent = timeKnown
        ? '天顶落在' + data.midheaven + '座；上升 ' + data.asc.toFixed(1) + '°。行星度数按地心黄经取整，临界度数与出生时间误差都可能改变星座归属。'
        : '出生时间未知：本次按当地正午锚点计算行星位置，不生成上升、天顶与宫位。月亮在一天内可能移动约 13°，因此月亮星座也仅供概览。';
      renderKV($('ntSky'), [
        [ '出生日月相 · ' + data.moonPhase.name, '日月黄经差 ' + data.moonPhase.angle + '°，月面照亮约 ' + data.moonPhase.illum + '%' ],
        [ '逆行星体', data.retrogrades.length ? data.retrogrades.join('、') : '无，均顺行' ],
      ]);
      $('ntSky').appendChild(node('p', 'text-sm text-muted mt-2', data.moonPhase.sentence));
      renderTable($('ntRulers'), [ '行星', '守护星座（现代）', '传统守护' ], data.rulers.map(function (ruler) {
        return [ ruler.planet, ruler.rules, ruler.rulesTrad || '—' ];
      }));
      clear($('ntDist'));
      renderBars($('ntDist'), '元素', data.elements);
      var modeBox = node('div', 'mt-3');
      $('ntDist').appendChild(modeBox);
      renderBars(modeBox, '模态', data.modalities);
      renderTable($('ntAspects'), [ '星体', '相位', '容差', '说明' ], data.aspectDetail.slice(0, 10).map(function (aspect) {
        return [ aspect.a + ' · ' + aspect.b, aspect.type, aspect.orb + '°', aspect.note ];
      }));
      renderChips($('ntAspectStats'), '相位统计：', Object.keys(data.aspectStats).map(function (key) { return key + ' ' + data.aspectStats[key] + ' 组'; }), '无显著相位');
      renderChips($('ntEmpty'), '空宫：', data.emptyHouses.map(function (house) { return '第 ' + house + ' 宫'; }), timeKnown ? '无' : '时间未知，不判断宫位');
      renderKV($('ntNotes'), data.planetNotes.map(function (planet) {
        return [ planet.glyph + ' ' + planet.name, planet.note ];
      }));
      renderTable($('ntHouses'), [ '宫位', '星座', '落星', '主题', '宫主星' ], data.houses.map(function (house) {
        return [
          '第 ' + house.house + ' 宫',
          house.sign,
          house.planets.length ? house.planets.join('、') : '空宫',
          house.topic,
          house.ruler + '（落第 ' + house.rulerHouse + ' 宫 · ' + house.rulerSign + '）',
        ];
      }));
      if (!timeKnown) $('ntHouses').appendChild(node('p', 'text-sm text-muted', '出生时间未知，十二宫落星未生成。'));
      clear($('ntReading'));
      data.reading.forEach(function (text) { $('ntReading').appendChild(node('li', '', text)); });
      RV.renderExplanation($('ntExplain'), wrapped);
      $('nt-delete').hidden = !retained;
      $('nt-result').hidden = false;
      status(retained ? '排盘完成，已按你的选择留痕；关闭页面后删除凭证不会保留。' : '排盘完成，本次未留痕。');
      if (window.U && window.U.track) window.U.track('calc_result', { tool: 'natal', success: true, timePrecision: data.timeResolution.inputPrecision, retained: !!retained });
    }

    function formatOffset(seconds) {
      var value = Number(seconds);
      if (!Number.isFinite(value)) return '';
      var sign = value < 0 ? '-' : '+';
      var abs = Math.abs(value);
      var hours = Math.floor(abs / 3600);
      var minutes = Math.floor((abs % 3600) / 60);
      return 'UTC' + sign + hours + (minutes ? ':' + String(minutes).padStart(2, '0') : '');
    }

    function retryWith(patch) {
      Object.keys(patch).forEach(function (key) {
        if (key === 'occurrence') {
          $('nt-occurrence-group').hidden = false;
          $('nt-occurrence').value = patch[key];
        } else if (key === 'time') {
          $('nt-time').value = patch[key];
        }
      });
      $('nt-candidates').hidden = true;
      calculate();
    }

    function showCandidates(failure) {
      clear($('ntCandidates'));
      $('nt-candidates').hidden = false;
      $('ntCandidates').appendChild(node('p', 'text-sm text-muted', failure.code === 'NATAL_DST_GAP'
        ? '该当地时间在夏令时跳时中不存在（' + (failure.timezone || '所选时区') + '）。请选择跳时前或跳时后的有效时间；本次未留痕。'
        : '该当地时间在夏令时回拨中出现两次（' + (failure.timezone || '所选时区') + '）。请确认使用第一次还是第二次；本次未留痕。'));
      failure.candidates.forEach(function (candidate, index) {
        var button = node('button', 'btn btn-outline', '');
        button.type = 'button';
        if (failure.code === 'NATAL_DST_GAP') {
          var time = String(candidate.localDateTime || '').slice(11, 16);
          button.textContent = '改用 ' + time + '（' + formatOffset(candidate.utcOffsetSeconds) + '）';
          button.addEventListener('click', function () { retryWith({ time: time }); });
        } else {
          var first = candidate.occurrence === 'first';
          button.textContent = (first ? '第一次' : '第二次') + '（' + (candidate.offsetLabel || formatOffset(candidate.utcOffsetSeconds)) + '）';
          button.addEventListener('click', function () { retryWith({ occurrence: candidate.occurrence }); });
        }
        if (index) button.classList.add('mt-2');
        $('ntCandidates').appendChild(button);
      });
      hideError();
      status(failure.message, true);
    }

    function acceptRetention(data) {
      if (!data || data.retained !== true) return;
      if (!data.id || !data.deleteToken) throw new Error('留痕响应缺少删除凭证，请关闭页面后等待自动清理。');
      retained = { id: data.id, token: data.deleteToken };
      $('nt-delete').hidden = false;
    }

    function calculate() {
      var body;
      if (pendingRetainBody) {
        body = { ok: true, value: pendingRetainBody };
      } else {
        if (retained) {
          showError('请先物理删除上一次留痕，再开始新的测算，避免丢失删除凭证。');
          return;
        }
        resetResult();
        hideError();
        if (!$('nt-date').value) { showError('请先填写出生日期。'); return; }
        body = Tools.natal.requestBody(readInput(), $('nt-retain').checked);
        if (!body.ok) { showError(body.errors.join('；')); return; }
        if (body.value.retain) {
          pendingRetainBody = body.value;
          pendingRetainInput = readInput();
        }
      }
      var expected = pendingRetainInput || readInput();
      var current = sequence;
      if (currentController) currentController.abort();
      currentController = new AbortController();
      activeBody = body.value;
      var controller = currentController;
      var timer = setTimeout(function () { controller.abort(); }, 15000);
      $('nt-submit').disabled = true;
      $('nt-submit').textContent = pendingRetainBody ? '同步留痕中…' : '排盘中…';
      status(pendingRetainBody ? '正在确认上次留痕，请勿关闭页面…' : '正在排盘，请稍候…');
      API.post(API.endpoints.fortuneCalculate, body.value, { signal: controller.signal }).then(function (response) {
        if (current !== sequence) return;
        var failure = Tools.natal.dstFailure(response);
        if (failure) {
          pendingRetainBody = null;
          showCandidates(failure);
          return;
        }
        var payload = Tools.natal.responsePayload(response, expected);
        if (!payload) {
          var message = response && String(response.code) === '0'
            ? '星盘数据不完整或与输入不一致，请稍后重试'
            : (response && response.msg ? response.msg : '排盘失败，请稍后重试');
          var error = new Error(message);
          error.business = true;
          throw error;
        }
        acceptRetention(payload);
        pendingRetainBody = null;
        pendingRetainInput = null;
        try {
          render(payload.result, payload);
        } catch (renderError) {
          showError('星盘展示失败，请重试。');
        }
      }).catch(function (error) {
        if (current !== sequence) return;
        if (body.value.retain && !retained) {
          pendingRetainBody = body.value;
          pendingRetainInput = expected;
          showError('留痕结果尚未确认。请保持页面并再次点击“重试同步留痕”，系统会复用同一请求，避免重复记录。');
        } else if (error && error.business) {
          showError(error.message);
        } else {
          showError(error && error.name === 'AbortError' ? '请求超时或已取消，请重试。' : '星盘暂时无法显示，请检查出生信息与网络后重试。');
        }
      }).finally(function () {
        clearTimeout(timer);
        if (current === sequence) {
          currentController = null;
          activeBody = null;
          $('nt-submit').disabled = false;
          $('nt-submit').textContent = pendingRetainBody ? '重试同步留痕' : '一键排盘';
        }
      });
    }

    form.addEventListener('submit', function (event) { event.preventDefault(); calculate(); });
    form.addEventListener('input', function () { if (currentController && activeBody && !activeBody.retain) resetResult(); });
    form.addEventListener('change', function () { if (currentController && activeBody && !activeBody.retain) resetResult(); });
    $('nt-precision').addEventListener('change', syncTimeFields);
    $('nt-city').addEventListener('change', function () {
      var option = this.options[this.selectedIndex];
      if (!option) return;
      $('nt-tz').value = option.value;
      $('nt-lat').value = option.getAttribute('data-lat') || '';
      $('nt-lon').value = option.getAttribute('data-lon') || '';
    });
    $('nt-delete').addEventListener('click', function () {
      if (!retained) return;
      var record = retained;
      var generation = sequence;
      var controller = new AbortController();
      deleteController = controller;
      var timer = setTimeout(function () { controller.abort(); }, 15000);
      $('nt-delete').disabled = true;
      API.post(API.endpoints.fortuneDelete, record, { signal: controller.signal }).then(function (response) {
        if (generation !== sequence || !retained || retained.id !== record.id) return;
        if (!response || String(response.code) !== '0' || !response.data || response.data.deleted !== true) throw new Error((response && response.msg) || '删除失败');
        retained = null;
        pendingRetainBody = null;
        pendingRetainInput = null;
        $('nt-delete').hidden = true;
        status('本次留痕已物理删除。');
      }).catch(function (error) {
        if (generation !== sequence || !retained || retained.id !== record.id) return;
        status(error && error.name === 'AbortError' ? '删除请求超时，请重试。' : (error && error.message ? error.message : '删除失败，请稍后重试。'), true);
      }).finally(function () {
        clearTimeout(timer);
        if (deleteController === controller) deleteController = null;
        if (generation === sequence) $('nt-delete').disabled = false;
      });
    });
    syncTimeFields();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();