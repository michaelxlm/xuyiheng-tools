/* calculator-timezone.js · IANA 时区转换、DST 确认与会议规划薄控制器 */
(function () {
  'use strict';

  function boot() {
    var U = window.U;
    var Tools = window.Tools || {};
    var RV = window.ToolCore && window.ToolCore.ResultView;
    var Core = window.Core;
    var form = document.getElementById('tzForm');
    if (!form || !U || !Tools.timezone || !RV || !Core) return;
    var T = Tools.timezone;
    var $ = function (id) { return document.getElementById(id); };
    var KEY = 'xt_timezone_meetings_v2';
    var lastResult = null;
    var pending = null;

    function status(message, isError) {
      $('tz-status').textContent = message || '';
      $('tz-status').hidden = !message;
      $('tz-status').classList.toggle('is-error', !!isError);
    }

    function fillZones() {
      T.zones.forEach(function (zone) {
        [$('tz-from'), $('tz-to')].forEach(function (select) {
          var option = document.createElement('option');
          option.value = zone.id;
          option.textContent = zone.name + '（' + zone.id + '）';
          select.appendChild(option);
        });
      });
    }

    function setDefaults() {
      var detected = 'Asia/Shanghai';
      try {
        var localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (T.validZone(localZone)) detected = localZone;
      } catch (error) {}
      var sourceZone = T.zones.some(function (zone) { return zone.id === detected; }) ? detected : 'Asia/Shanghai';
      var targetZone = sourceZone === 'America/New_York' ? 'Europe/London' : 'America/New_York';
      $('tz-from').value = sourceZone;
      $('tz-to').value = targetZone;
      var now = T.format(Date.now(), sourceZone).split(' ');
      $('tz-date').value = now[0];
      $('tz-time').value = now[1].slice(0, 5);
    }

    function clearCandidates() {
      RV.clear($('tz-candidates'));
      $('tz-candidates').hidden = true;
    }

    function renderCandidates(candidates) {
      RV.clear($('tz-candidates'));
      candidates.forEach(function (candidate, index) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary';
        button.textContent = candidate.local + '（' + candidate.offset + '）';
        button.addEventListener('click', function () {
          run(index);
        });
        $('tz-candidates').appendChild(button);
      });
      $('tz-candidates').hidden = false;
    }

    function clockNode(zone, utcMs) {
      var node = document.createElement('div');
      node.className = 'clock-item';
      var city = document.createElement('div');
      city.className = 'c-city';
      city.textContent = zone.name + ' ' + zone.offset;
      var time = document.createElement('div');
      time.className = 'c-time';
      time.textContent = zone.local.slice(5);
      node.appendChild(city);
      node.appendChild(time);
      return node;
    }

    function renderAll(utcMs) {
      RV.clear($('tz-all'));
      T.at(utcMs).forEach(function (zone) { $('tz-all').appendChild(clockNode(zone, utcMs)); });
      $('tz-all-wrap').hidden = false;
    }

    function renderClocks() {
      RV.clear($('tz-clocks'));
      T.at(Date.now()).slice(0, 8).forEach(function (zone) { $('tz-clocks').appendChild(clockNode(zone, Date.now())); });
    }

    function show(result) {
      RV.renderError($('tz-error'), result);
      if (result.status !== 'success') {
        lastResult = null;
        $('tz-result').hidden = true;
        $('tz-all-wrap').hidden = true;
        status(result.errors.join('；'), true);
        return null;
      }
      lastResult = result;
      var m = result.metrics;
      $('tz-slabel').textContent = m.from + '（' + m.sourceOffset + '）';
      $('tz-tlabel').textContent = m.to + '（' + m.targetOffset + '）';
      $('tz-src').textContent = m.source;
      $('tgt').textContent = m.target;
      RV.renderDetails($('tz-detail'), result.details);
      RV.renderExplanation($('tz-explain'), result);
      $('tz-result').hidden = false;
      renderAll(m.utcMs);
      clearCandidates();
      status('转换完成；重要会议建议同时保存 UTC 时刻。');
      U.track('calc_result', { tool: 'timezone', success: true });
      return result;
    }

    function invalidateResult() {
      lastResult = null;
      $('tz-result').hidden = true;
      $('tz-all-wrap').hidden = true;
      clearCandidates();
      RV.clear($('tz-error'));
      status('');
    }

    function run(candidateIndex) {
      lastResult = null;
      pending = {
        date: $('tz-date').value,
        time: $('tz-time').value,
        from: $('tz-from').value,
        to: $('tz-to').value,
        candidateIndex: candidateIndex,
      };
      if (candidateIndex !== undefined && candidateIndex !== null) return show(T.calculate(pending));
      var resolved = T.resolve(pending);
      if (resolved.status === 'ambiguous') {
        $('tz-result').hidden = true;
        $('tz-all-wrap').hidden = true;
        renderCandidates(resolved.candidates);
        status(resolved.message, true);
        return null;
      }
      if (resolved.status !== 'unique') {
        clearCandidates();
        $('tz-result').hidden = true;
        $('tz-all-wrap').hidden = true;
        RV.renderError($('tz-error'), { errors: [resolved.message || '时间参数不合法'] });
        status(resolved.message || '时间参数不合法', true);
        return null;
      }
      return show(T.calculate(pending));
    }

    function hourTime(id) {
      var value = String($(id).value);
      return (value.length === 1 ? '0' + value : value) + ':00';
    }

    function slotTime(start, end) {
      return start.slice(0, 16) + (start.slice(0, 10) === end.slice(0, 10) ? '–' + end.slice(11, 16) : '–' + end.slice(0, 16));
    }

    function findOverlap() {
      RV.clear($('tz-slots'));
      $('tz-slots-hint').textContent = '';
      try {
        var windows = T.overlap({
          date: $('tz-date').value,
          from: $('tz-from').value,
          to: $('tz-to').value,
          start: hourTime('tz-start'),
          end: hourTime('tz-end'),
        });
        if (!windows.length) {
          $('tz-slots-hint').textContent = '以源时区所选日期为基准，这两个时区在工作时段内没有重叠，建议调整时段。';
          return;
        }
        $('tz-slots-hint').textContent = '以下窗口按分钟计算；日期以源时区所选日期为基准，目标时区可能落在相邻日期：';
        windows.forEach(function (window) {
          var node = document.createElement('div');
          node.className = 'tz-slot';
          node.textContent = slotTime(window.fromStart, window.fromEnd) + ' ⇄ ' + slotTime(window.toStart, window.toEnd);
          $('tz-slots').appendChild(node);
        });
        U.track('calc_result', { tool: 'timezone', mode: 'overlap', success: true });
      } catch (error) {
        $('tz-slots-hint').textContent = error.message || '无法计算重叠窗口';
      }
    }

    function readMeetings() {
      try {
        var rows = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(rows) ? rows : [];
      } catch (error) { return []; }
    }

    function renderMeetings() {
      var rows = readMeetings();
      $('tz-meet-wrap').hidden = rows.length === 0;
      RV.clear($('tz-tbody'));
      rows.forEach(function (row, index) {
        var tr = document.createElement('tr');
        [row.from + ' · ' + row.source, row.to + ' · ' + row.target, row.difference].forEach(function (value) {
          var td = document.createElement('td');
          td.textContent = value;
          tr.appendChild(td);
        });
        var action = document.createElement('td');
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary tz-del';
        button.textContent = '删除';
        button.setAttribute('aria-label', '删除会议');
        button.addEventListener('click', function () {
          var current = readMeetings();
          current.splice(index, 1);
          try {
            localStorage.setItem(KEY, JSON.stringify(current));
            renderMeetings();
            status('会议记录已删除。');
          } catch (error) { status('浏览器未允许保存，删除未生效。', true); }
        });
        action.appendChild(button);
        tr.appendChild(action);
        $('tz-tbody').appendChild(tr);
      });
    }

    function downloadText(filename, text, mime) {
      try {
        var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
        return true;
      } catch (error) { return false; }
    }

    form.addEventListener('submit', function (event) { event.preventDefault(); run(); });
    ['tz-date', 'tz-time', 'tz-from', 'tz-to'].forEach(function (id) {
      ['input', 'change'].forEach(function (eventName) {
        $(id).addEventListener(eventName, invalidateResult);
      });
    });
    $('tz-swap').addEventListener('click', function () {
      var from = $('tz-from').value;
      $('tz-from').value = $('tz-to').value;
      $('tz-to').value = from;
      invalidateResult();
      findOverlap();
    });
    $('tz-find').addEventListener('click', findOverlap);
    $('tz-save').addEventListener('click', function () {
      var result = lastResult ? lastResult : run();
      if (!result) return;
      var row = {
        from: result.metrics.from,
        to: result.metrics.to,
        source: result.metrics.source,
        target: result.metrics.target,
        utcMs: result.metrics.utcMs,
        difference: (result.metrics.differenceMinutes >= 0 ? '+' : '−') + Math.abs(result.metrics.differenceMinutes) + ' 分钟',
      };
      try {
        var rows = readMeetings();
        rows.unshift(row);
        localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 20)));
        renderMeetings();
        status('会议时间已保存到当前浏览器。');
        U.track('save_result', { tool: 'timezone', success: true });
      } catch (error) { status('浏览器未允许本地保存，请检查存储权限。', true); }
    });
    $('tz-export').addEventListener('click', function () {
      var rows = readMeetings().map(function (row) { return [row.from, row.source, row.to, row.target, row.utcMs, row.difference]; });
      var ok = Core.csv.download('会议时间.csv', rows, ['源时区', '源时间', '目标时区', '目标时间', 'UTC 时间戳', '时差']);
      status(ok ? '已导出会议时间 CSV。' : '导出失败，请稍后重试。', !ok);
    });
    $('tz-ics').addEventListener('click', function () {
      if (!lastResult) { status('请先完成一次时区换算。', true); return; }
      try {
        var text = T.ics({
          startUtcMs: lastResult.metrics.utcMs,
          endUtcMs: lastResult.metrics.utcMs + 60 * 60000,
          title: '跨时区会议',
          description: lastResult.metrics.source + ' → ' + lastResult.metrics.target,
        });
        var ok = downloadText('会议时间.ics', text, 'text/calendar;charset=utf-8');
        status(ok ? '已导出 ICS，可导入日历应用。' : 'ICS 导出失败，请稍后重试。', !ok);
      } catch (error) { status(error.message || 'ICS 导出失败', true); }
    });
    $('tz-clear').addEventListener('click', function () {
      try {
        localStorage.removeItem(KEY);
        renderMeetings();
        status('本机保存的会议时间已清空。');
      } catch (error) { status('浏览器未允许修改本地存储。', true); }
    });

    fillZones();
    setDefaults();
    renderClocks();
    findOverlap();
    renderMeetings();
    setInterval(renderClocks, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
