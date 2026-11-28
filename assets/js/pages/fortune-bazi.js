/* fortune-bazi.js · 八字排盘薄控制器：显式提交、默认不留痕、安全文本渲染 */
(function () {
  'use strict';

  function boot() {
    var Tools = window.Tools || {};
    var RV = window.ToolCore && window.ToolCore.ResultView;
    var API = window.API;
    var form = document.getElementById('bzForm');
    if (!form || !Tools.bazi || !RV || !API) return;
    var $ = function (id) { return document.getElementById(id); };
    var sequence = 0;
    var currentController = null;
    var deleteController = null;
    var retained = null;
    var pendingRetainBody = null;
    var activeBody = null;

    function node(tag, className, text) {
      var el = document.createElement(tag);
      if (className) el.className = className;
      if (text != null) el.textContent = String(text);
      return el;
    }

    function status(message, isError) {
      $('bz-status').textContent = message || '';
      $('bz-status').hidden = !message;
      $('bz-status').classList.toggle('is-error', !!isError);
    }

    function clear(host) { RV.clear(host); }

    function renderTable(host, headers, rows) {
      clear(host);
      if (!rows.length) {
        host.appendChild(node('p', 'text-sm text-muted', '暂无数据。'));
        return;
      }
      var wrap = node('div', 'ft-table-wrap');
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
      if (guide.highlights && guide.highlights.length) {
        var cards = node('div', 'ft-plain-highlights');
        guide.highlights.forEach(function (item) {
          var card = node('article', 'ft-plain-card');
          card.appendChild(node('h3', '', item.label));
          card.appendChild(node('p', '', item.text));
          cards.appendChild(card);
        });
        section.appendChild(cards);
      }
      host.appendChild(section);
    }

    function readInput() {
      return {
        date: $('bz-date').value,
        timePrecision: $('bz-precision').value,
        hour: $('bz-hour').value,
        minute: $('bz-minute').value,
        timeBasis: $('bz-basis').value,
        longitude: $('bz-longitude').value,
        lateZi: $('bz-late-zi').value,
        gender: $('bz-gender').value,
        asOfDate: $('bz-asof').value,
      };
    }

    function syncTimeFields() {
      var unknown = $('bz-precision').value === 'unknown';
      $('bz-hour').disabled = unknown;
      $('bz-minute').disabled = unknown;
      $('bz-longitude').disabled = $('bz-basis').value !== 'true-solar';
    }

    function resetResult() {
      sequence += 1;
      if (currentController) currentController.abort();
      if (deleteController) deleteController.abort();
      currentController = null;
      deleteController = null;
      activeBody = null;
      $('bz-result').hidden = true;
      [ 'bzPlain', 'bzPillars', 'bzDetail', 'bzWuxing', 'bzPattern', 'bzShenSha', 'bzBranchRels', 'bzGods', 'bzPillarNotes', 'bzHiddenGods', 'bzFlow', 'bzNow', 'bzLiuNian', 'bzReading', 'bzPref', 'bzDayun', 'bzCandidates', 'bzExplain', 'bzError' ].forEach(function (id) { clear($(id)); });
      $('bz-error').hidden = true;
      $('bz-note').textContent = '';
      status('');
    }

    function showError(message) {
      $('bz-result').hidden = false;
      $('bz-error').textContent = message;
      $('bz-error').hidden = false;
      status(message, true);
    }

    function renderPillars(pillars, unknown) {
      clear($('bzPillars'));
      pillars.forEach(function (pillar) {
        var card = node('div', 'ft-pillar' + (pillar.name === '日柱' ? ' is-day' : ''));
        card.appendChild(node('div', 'ft-label', pillar.name));
        if (pillar.unknown) {
          card.appendChild(node('div', 'ft-gz', '未知'));
          card.appendChild(node('div', 'ft-sub', '不生成精确时柱'));
        } else {
          var gz = node('div', 'ft-gz');
          gz.appendChild(node('span', 's', String(pillar.ganzhi).charAt(0)));
          gz.appendChild(node('span', '', String(pillar.ganzhi).charAt(1)));
          card.appendChild(gz);
          card.appendChild(node('div', 'ft-sub', '藏干 ' + pillar.hidden.join('、')));
          card.appendChild(node('div', 'ft-sub', pillar.nayin + ' · ' + pillar.chengSheng));
          card.appendChild(node('span', 'ft-god', pillar.god));
        }
        $('bzPillars').appendChild(card);
      });
      if (unknown) {
        var unknownCard = node('div', 'ft-pillar');
        unknownCard.appendChild(node('div', 'ft-label', '时柱'));
        unknownCard.appendChild(node('div', 'ft-gz', '未知'));
        unknownCard.appendChild(node('div', 'ft-sub', '五行统计仅含三柱'));
        $('bzPillars').appendChild(unknownCard);
      }
    }

    function renderWuxing(data) {
      clear($('bzWuxing'));
      var max = Math.max.apply(null, data.weighted) || 1;
      var names = [ '金', '木', '水', '火', '土' ];
      names.forEach(function (name, index) {
        var row = node('div', 'ft-wx-row');
        row.appendChild(node('span', '', name));
        var track = node('span', 'ft-wx-track');
        var fill = node('span', 'ft-wx-fill');
        fill.style.width = Math.round(data.weighted[index] / max * 100) + '%';
        track.appendChild(fill);
        row.appendChild(track);
        row.appendChild(node('span', 'ft-wx-num', data.weighted[index] + (data.count[index] ? '' : '（缺）')));
        $('bzWuxing').appendChild(row);
      });
    }

    function renderCandidates(candidates, timeKnown) {
      clear($('bzCandidates'));
      $('bz-candidate-title').hidden = !candidates || !candidates.length;
      if (!candidates || !candidates.length) return;
      $('bzCandidates').appendChild(node('p', 'text-sm text-muted', timeKnown === false
        ? '出生时辰未知，且当天存在交节。以下按交节前后列出可能的年月柱，日柱相同；请补全出生时间后再采用。'
        : '以下候选按交节前后排列。由于输入只精确到分钟，请补全出生秒数或以权威历法复核后再采用。'));
      candidates.forEach(function (candidate, index) {
        var box = node('div', 'card mt-3');
        box.appendChild(node('h3', '', '候选 ' + (index + 1)));
        var grid = node('div', 'ft-kv-grid');
        candidate.forEach(function (pillar) {
          var cell = node('div', 'ft-kv');
          cell.appendChild(node('span', '', pillar.name));
          cell.appendChild(node('strong', '', pillar.ganzhi));
          grid.appendChild(cell);
        });
        box.appendChild(grid);
        $('bzCandidates').appendChild(box);
      });
    }

    function render(data, payload) {
      var wrapped = Tools.bazi.wrapResult(payload);
      if (wrapped.status === 'error') { showError(wrapped.errors.join('；')); return; }
      renderGuide($('bzPlain'), data.plainGuide);
      renderPillars(data.pillars, !!(data.timePillar && data.timePillar.unknown));
      RV.renderDetails($('bzDetail'), wrapped.details.concat([
        { label: '日主', value: data.dayMaster + '（' + data.dayElement + '）', note: '' },
        { label: '生肖', value: data.zodiac, note: '' },
        { label: '强弱倾向', value: data.tendency + ' · 指数 ' + data.strengthIndex, note: '' },
        { label: '月令节气', value: data.jie.name + ' ' + data.jie.day + '日 ' + data.jie.time, note: '' },
      ]));
      renderWuxing(data);
      renderKV($('bzPattern'), [
        [ '格局', data.pattern.name ], [ '用神参考', data.yongshen.label + ' · ' + data.yongshen.element ],
        [ '忌神参考', data.jishen.label + ' · ' + data.jishen.element ], [ '确定性', data.certainty ],
      ]);
      $('bzPattern').appendChild(node('p', 'text-sm mt-2', data.pattern.text));
      renderTable($('bzShenSha'), [ '神煞', '基准', '命局', '释义' ], data.shenSha.map(function (item) {
        return [ item.name, item.key, item.present ? item.foundIn.join('、') : '不见', item.note ];
      }));
      renderKV($('bzBranchRels'), (data.branchRels || []).map(function (item) { return [ item.pair, item.rels.join('、') ]; }));
      renderKV($('bzGods'), Object.keys(data.gods).sort(function (a, b) { return data.gods[b] - data.gods[a]; }).map(function (key) { return [ key + ' × ' + data.gods[key], data.godBriefs[key] || '' ]; }));
      renderKV($('bzPillarNotes'), data.pillarNotes.map(function (item) { return [ item.name + ' · ' + item.ganzhi, item.role ]; }));
      renderKV($('bzHiddenGods'), Object.keys(data.hiddenGods).sort(function (a, b) { return data.hiddenGods[b] - data.hiddenGods[a]; }).map(function (key) { return [ key + ' × ' + data.hiddenGods[key], data.godBriefs[key] || '' ]; }));
      renderKV($('bzFlow'), [ [ '较多五行', data.wuxingFlow.top ], [ '较少五行', data.wuxingFlow.low ] ]);
      renderKV($('bzNow'), [
        [ '当前大运', data.dayun.current ? data.dayun.current.ganzhi + '（' + data.dayun.current.god + '）' : '未排大运' ],
        [ '流年 ' + data.liuNian.year, data.liuNian.ganzhi + ' · ' + data.liuNian.god ],
        [ '起运', data.dayun.enabled ? data.dayun.direction + ' · 约 ' + data.dayun.startAge + ' 岁' : (data.dayun.reason || '本次不排大运') ],
      ]);
      renderTable($('bzLiuNian'), [ '年份', '干支', '十神' ], data.liuNianList.map(function (item) { return [ item.year, item.ganzhi, item.god ]; }));
      clear($('bzReading'));
      (data.reading || []).forEach(function (text) { $('bzReading').appendChild(node('li', '', text)); });
      clear($('bzPref'));
      [ data.preferences.trait, data.preferences.color, data.preferences.direction, data.preferences.fields ].forEach(function (text) { $('bzPref').appendChild(node('span', 'ft-chip', text)); });
      renderTable($('bzDayun'), [ '运次', '干支', '十神', '起岁', '约年' ], (data.dayun.items || []).map(function (item, index) { return [ index + 1, item.ganzhi, item.god, item.age, item.year ]; }));
      if (!data.dayun.enabled) $('bzDayun').appendChild(node('p', 'text-sm text-muted', (data.dayun.reason || '本次不排大运') + '。'));
      renderCandidates(data.candidates, data.calendar.inputTimeKnown);
      RV.renderExplanation($('bzExplain'), wrapped);
      $('bz-note').textContent = data.tendencyText + ' 「' + data.tendency + '」仅是传统结构描述，不是命运判断。';
      $('bz-delete').hidden = !retained;
      $('bz-result').hidden = false;
      status(retained ? '排盘完成，已按你的选择留痕；关闭页面后删除凭证不会保留。' : '排盘完成，本次未留痕。');
    }

    function acceptRetention(data) {
      if (!data || data.retained !== true) return;
      if (!data.id || !data.deleteToken) throw new Error('留痕响应缺少删除凭证，请关闭页面后等待自动清理。');
      retained = { id: data.id, token: data.deleteToken };
      $('bz-delete').hidden = false;
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
        if (!form.reportValidity()) { showError('请先补全有效的出生信息。'); return; }
        body = Tools.bazi.requestBody(readInput(), $('bz-retain').checked);
        if (!body.ok) { showError(body.errors.join('；')); return; }
        if (body.value.retain) pendingRetainBody = body.value;
      }
      var current = sequence;
      if (currentController) currentController.abort();
      currentController = new AbortController();
      activeBody = body.value;
      var controller = currentController;
      var timer = setTimeout(function () { controller.abort(); }, 15000);
      $('bz-submit').disabled = true;
      $('bz-submit').textContent = pendingRetainBody ? '同步留痕中…' : '排盘中…';
      status(pendingRetainBody ? '正在确认上次留痕，请勿关闭页面…' : '正在排盘，请稍候…');
      API.post(API.endpoints.fortuneCalculate, body.value, { signal: controller.signal }).then(function (response) {
        if (current !== sequence) return;
        if (!response || String(response.code) !== '0' || !response.data) throw new Error((response && response.msg) || '排盘失败，请稍后重试');
        acceptRetention(response.data);
        pendingRetainBody = null;
        if (!response.data.result) throw new Error('排盘结果为空，请重试。');
        render(response.data.result, response.data);
      }).catch(function (error) {
        if (current !== sequence) return;
        if (body.value.retain && !retained) {
          pendingRetainBody = body.value;
          showError('留痕结果尚未确认。请保持页面并再次点击“重试同步留痕”，系统会复用同一请求，避免重复记录。');
        } else {
          showError(error && error.name === 'AbortError' ? '请求超时或已取消，请重试。' : (error && error.message ? error.message : '网络不可用，请稍后重试。'));
        }
      }).finally(function () {
        clearTimeout(timer);
        if (current === sequence) {
          currentController = null;
          activeBody = null;
          $('bz-submit').disabled = false;
          $('bz-submit').textContent = pendingRetainBody ? '重试同步留痕' : '一键排盘';
        }
      });
    }

    form.addEventListener('submit', function (event) { event.preventDefault(); calculate(); });
    form.addEventListener('input', function () { if (currentController && !activeBody.retain) resetResult(); });
    form.addEventListener('change', function () { if (currentController && !activeBody.retain) resetResult(); });
    $('bz-precision').addEventListener('change', syncTimeFields);
    $('bz-basis').addEventListener('change', syncTimeFields);
    $('bz-delete').addEventListener('click', function () {
      if (!retained) return;
      var record = retained;
      var generation = sequence;
      var controller = new AbortController();
      deleteController = controller;
      var timer = setTimeout(function () { controller.abort(); }, 15000);
      $('bz-delete').disabled = true;
      API.post(API.endpoints.fortuneDelete, record, { signal: controller.signal }).then(function (response) {
        if (generation !== sequence || !retained || retained.id !== record.id) return;
        if (!response || String(response.code) !== '0' || !response.data || response.data.deleted !== true) throw new Error((response && response.msg) || '删除失败');
        retained = null;
        pendingRetainBody = null;
        $('bz-delete').hidden = true;
        status('本次留痕已物理删除。');
      }).catch(function (error) {
        if (generation !== sequence || !retained || retained.id !== record.id) return;
        status(error && error.name === 'AbortError' ? '删除请求超时，请重试。' : (error && error.message ? error.message : '删除失败，请稍后重试。'), true);
      }).finally(function () {
        clearTimeout(timer);
        if (deleteController === controller) deleteController = null;
        if (generation === sequence) $('bz-delete').disabled = false;
      });
    });
    syncTimeFields();
    if (!$('bz-asof').value) {
      var now = new Date();
      $('bz-asof').value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
