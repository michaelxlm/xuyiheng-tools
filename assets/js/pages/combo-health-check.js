/* combo-health-check.js · 健康指标结果、本地记录与日期趋势薄控制器 */
(function () {
  'use strict';

  function boot() {
    var U = window.U;
    var Tools = window.Tools || {};
    var RV = window.ToolCore && window.ToolCore.ResultView;
    var Core = window.Core;
    var form = document.getElementById('hcForm');
    if (!form || !U || !Tools.healthCheck || !RV || !Core) return;

    var Health = Tools.healthCheck;
    var KEY = 'health-check';
    var $ = function (id) { return document.getElementById(id); };
    var rows = [];
    var lastResult = null;

    function status(message, isError) {
      $('hc-status').textContent = message || '';
      $('hc-status').hidden = !message;
      $('hc-status').classList.toggle('is-error', !!isError);
    }

    function storageStatus(message, isError) {
      $('hc-storage-status').textContent = message || '';
      $('hc-storage-status').hidden = !message;
      $('hc-storage-status').classList.toggle('is-error', !!isError);
    }

    function clearResult() {
      lastResult = null;
      $('hc-result').hidden = true;
      $('hc-bmi').textContent = '--';
      $('hc-cat').textContent = '--';
      $('hc-tdee').textContent = '--';
      RV.clear($('hc-detail'));
      RV.clear($('hc-explain'));
      RV.clear($('hc-error'));
      status('');
    }

    function readInput() {
      return {
        sex: $('hc-sex').value,
        age: $('hc-age').value,
        height: $('hc-height').value,
        weight: $('hc-weight').value,
        activity: $('hc-activity').value,
        goal: $('hc-goal').value,
        neck: $('hc-neck').value,
        waist: $('hc-waist').value,
        hip: $('hc-hip').value,
        date: $('hc-date').value,
      };
    }

    function displayValue(item) {
      if (typeof item.value !== 'number') return item.value;
      if (item.label.indexOf('BMI') >= 0 || item.label.indexOf('体重') >= 0 || item.label.indexOf('体脂率') >= 0) {
        return U.round(item.value, 1);
      }
      if (item.label.indexOf('腰高比') >= 0) return U.round(item.value, 3);
      if (item.label.indexOf('RMR') >= 0 || item.label.indexOf('TDEE') >= 0 || item.label.indexOf('热量') >= 0) {
        return Math.round(item.value);
      }
      return U.round(item.value, 2);
    }

    function show(result) {
      RV.renderError($('hc-error'), result);
      if (result.status !== 'success') {
        clearResult();
        RV.renderError($('hc-error'), result);
        status(result.errors.join('；'), true);
        return;
      }
      lastResult = result;
      var m = result.metrics;
      $('hc-bmi').textContent = U.round(m.bmi, 1);
      $('hc-cat').textContent = m.bmiCategory || '不适用';
      $('hc-tdee').textContent = m.tdee == null ? '不适用' : Math.round(m.tdee) + ' kcal';
      RV.renderDetails($('hc-detail'), result.details.map(function (item) {
        return { label: item.label, value: displayValue(item), note: item.note };
      }));
      RV.renderExplanation($('hc-explain'), result);
      $('hc-result').hidden = false;
      status(m.ageGroup === 'child'
        ? '5–17 岁仅记录 BMI 数值；成人分级、BMR/TDEE、Navy 体脂与成人腰高比结论均已关闭。'
        : '计算完成；所有指标均为估算或筛查参考，不能替代专业评估。');
      U.track('calc_result', { tool: 'health-check', success: true, resultType: m.ageGroup });
    }

    function syncAgeFields() {
      var age = U.numInput($('hc-age'));
      var child = isFinite(age) && age > 0 && age < Health.adultAge;
      ['hc-activity', 'hc-goal', 'hc-neck', 'hc-waist', 'hc-hip'].forEach(function (id) {
        $(id).disabled = child;
      });
      $('hc-age-note').textContent = child
        ? '当前为 5–17 岁：仅计算 BMI 数值，成人能量、体脂与腰高比分级不适用。'
        : (isFinite(age) && age >= Health.adultAge
          ? '当前采用 18 岁及以上成人口径；结果仍为筛查与估算。'
          : '请填写实际年龄；年龄缺失时不会默认按 30 岁计算。');
    }

    function syncSex() {
      var male = $('hc-sex').value !== 'female';
      $('hc-hip-wrap').hidden = male;
      if (male) $('hc-hip').value = '';
      syncAgeFields();
    }

    function readHistory() {
      try {
        var raw = window.localStorage.getItem(Core.history.key(KEY));
        if (raw == null || raw === '') return [];
        var parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('记录格式不是数组');
        var normalized = Health.normalizeHistory(parsed);
        if (normalized.length !== parsed.length) storageStatus('已忽略无法识别的本地记录；原始内容未删除。', true);
        return normalized;
      } catch (error) {
        storageStatus('无法读取本地健康记录，已显示空态；本次仍可计算，但记录可能无法保存。', true);
        return [];
      }
    }

    function writeHistory(next, message) {
      try {
        var normalized = Health.normalizeHistory(next).slice(0, 100);
        window.localStorage.setItem(Core.history.key(KEY), JSON.stringify(normalized));
        rows = normalized;
        storageStatus(message || '记录已保存到本机浏览器。');
        renderTrack();
        return true;
      } catch (error) {
        storageStatus('无法保存或更新本地记录：浏览器存储可能被禁用、已满或受隐私设置限制。本次计算结果仍可查看。', true);
        return false;
      }
    }

    function appendMetric(label, value) {
      var box = document.createElement('div');
      var name = document.createElement('div');
      var number = document.createElement('div');
      name.className = 'result-label';
      number.className = 'result-value';
      name.textContent = label;
      number.textContent = value;
      box.appendChild(name);
      box.appendChild(number);
      $('hc-stats').appendChild(box);
    }

    function svgNode(name, attributes, text) {
      var node = document.createElementNS('http://www.w3.org/2000/svg', name);
      Object.keys(attributes || {}).forEach(function (key) { node.setAttribute(key, String(attributes[key])); });
      if (text != null) node.textContent = text;
      return node;
    }

    function renderChart(points) {
      var host = $('hc-chart');
      RV.clear(host);
      if (!points.length) {
        var empty = document.createElement('p');
        empty.className = 'form-help';
        empty.id = 'hc-chart-empty';
        empty.textContent = '暂无测量记录。完成评估后点击“记录本次”，图表会按测量日期显示体重趋势。';
        host.appendChild(empty);
        return;
      }

      var width = 640, height = 180, left = 48, right = 20, top = 18, bottom = 42;
      var weights = points.map(function (point) { return Number(point.w); });
      var min = Math.min.apply(null, weights), max = Math.max.apply(null, weights);
      var padding = Math.max(0.5, (max - min) * 0.15);
      var low = min - padding, high = max + padding;
      var times = points.map(function (point) { return Date.parse(point.date + 'T00:00:00Z'); });
      var firstTime = times[0], lastTime = times[times.length - 1];
      function x(index) {
        if (points.length === 1 || lastTime === firstTime) return left + (width - left - right) / 2;
        return left + (times[index] - firstTime) / (lastTime - firstTime) * (width - left - right);
      }
      function y(value) {
        return height - bottom - (value - low) / (high - low) * (height - top - bottom);
      }

      var svg = svgNode('svg', {
        viewBox: '0 0 ' + width + ' ' + height,
        width: '100%',
        height: height,
        role: 'img',
        'aria-label': '体重趋势，共 ' + points.length + ' 个最近记录，日期从 ' + points[0].date + ' 到 ' + points[points.length - 1].date,
      });
      svg.appendChild(svgNode('title', {}, '体重随测量日期变化趋势'));
      svg.appendChild(svgNode('desc', {}, '横轴为测量日期，纵轴为体重；完整数值见下方文字表格。'));
      svg.appendChild(svgNode('line', { x1: left, y1: top, x2: left, y2: height - bottom, stroke: 'var(--color-border-strong)' }));
      svg.appendChild(svgNode('line', { x1: left, y1: height - bottom, x2: width - right, y2: height - bottom, stroke: 'var(--color-border-strong)' }));
      svg.appendChild(svgNode('text', { x: left - 8, y: top + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--color-muted)' }, U.round(high, 1)));
      svg.appendChild(svgNode('text', { x: left - 8, y: height - bottom + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--color-muted)' }, U.round(low, 1)));

      var path = points.map(function (point, index) {
        return (index ? 'L' : 'M') + x(index).toFixed(1) + ' ' + y(Number(point.w)).toFixed(1);
      }).join(' ');
      svg.appendChild(svgNode('path', { d: path, fill: 'none', stroke: 'var(--color-primary)', 'stroke-width': 2.5 }));
      points.forEach(function (point, index) {
        var circle = svgNode('circle', { cx: x(index).toFixed(1), cy: y(Number(point.w)).toFixed(1), r: 3.5, fill: 'var(--color-primary)' });
        circle.appendChild(svgNode('title', {}, point.date + ' · ' + U.round(point.w, 1) + ' kg'));
        svg.appendChild(circle);
      });
      [0, Math.floor((points.length - 1) / 2), points.length - 1].forEach(function (index) {
        svg.appendChild(svgNode('text', {
          x: x(index).toFixed(1),
          y: height - 18,
          'text-anchor': index === 0 ? 'start' : (index === points.length - 1 ? 'end' : 'middle'),
          'font-size': 12,
          fill: 'var(--color-muted)',
        }, points[index].date));
      });
      host.appendChild(svg);
    }

    function textCell(value) {
      var td = document.createElement('td');
      td.textContent = value;
      return td;
    }

    function renderTrack() {
      var summary = Health.summarizeHistory(rows);
      RV.clear($('hc-stats'));
      RV.clear($('hc-tbody'));
      $('hc-empty').hidden = summary.count > 0;
      $('hc-table-wrap').hidden = summary.count === 0;
      $('hc-export').disabled = summary.count === 0;
      $('hc-clear').disabled = summary.count === 0;
      if (!summary.count) {
        renderChart([]);
        return;
      }
      appendMetric('当前体重', U.round(summary.current.w, 1) + ' kg');
      appendMetric('较首次变化', (summary.delta >= 0 ? '+' : '') + U.round(summary.delta, 1) + ' kg');
      appendMetric('记录次数', String(summary.count));
      renderChart(summary.chart);

      rows.slice(0, 50).forEach(function (record, index) {
        var tr = document.createElement('tr');
        tr.appendChild(textCell(record.date));
        tr.appendChild(textCell(U.round(record.w, 1) + ' kg'));
        tr.appendChild(textCell(U.round(record.bmi, 1) + (record.ageGroup === 'child' ? '（仅数值）' : '')));
        tr.appendChild(textCell(Number.isFinite(record.bf) ? U.round(record.bf, 1) + '%' : '--'));
        tr.appendChild(textCell(Number.isFinite(record.tdee) && record.tdee > 0 ? Math.round(record.tdee) + ' kcal' : '--'));
        var action = document.createElement('td');
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary hc-del';
        button.setAttribute('data-index', String(index));
        button.setAttribute('aria-label', '删除 ' + record.date + ' 的记录');
        button.textContent = '删除';
        action.appendChild(button);
        tr.appendChild(action);
        $('hc-tbody').appendChild(tr);
      });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      show(Health.calculate(readInput()));
    });

    form.addEventListener('input', function () {
      syncAgeFields();
      clearResult();
    });
    form.addEventListener('change', function () {
      syncSex();
      clearResult();
    });

    $('hc-save').addEventListener('click', function () {
      var result = Health.calculate(readInput());
      show(result);
      if (result.status !== 'success') return;
      var m = result.metrics;
      var entry = {
        date: m.date,
        sex: m.sex,
        age: m.age,
        w: m.weight,
        h: m.height,
        bmi: m.bmi,
        bf: m.bodyFat,
        tdee: m.tdee,
        ageGroup: m.ageGroup,
        t: Date.now(),
      };
      var saved = writeHistory([entry].concat(rows), '本次测量已保存到本机浏览器。');
      U.track('save_result', { tool: 'health-check', success: saved, resultType: m.ageGroup });
    });

    $('hc-tbody').addEventListener('click', function (event) {
      var button = event.target.closest('.hc-del');
      if (!button) return;
      var index = Number(button.getAttribute('data-index'));
      var next = Health.removeAt(rows, index);
      if (next.length === rows.length) return;
      writeHistory(next, '已删除选中的本地记录。');
    });

    $('hc-export').addEventListener('click', function () {
      if (!rows.length) return;
      Core.csv.download('健康记录.csv', rows.map(function (record) {
        return [
          record.date,
          record.w,
          record.h,
          U.round(record.bmi, 1),
          Number.isFinite(record.bf) ? U.round(record.bf, 1) : '',
          Number.isFinite(record.tdee) && record.tdee > 0 ? Math.round(record.tdee) : '',
          record.ageGroup,
        ];
      }), ['日期', '体重(kg)', '身高(cm)', 'BMI', '体脂率(%)', 'TDEE(kcal)', '年龄口径']);
      U.track('export_result', { tool: 'health-check', success: true });
    });

    $('hc-clear').addEventListener('click', function () {
      if (!window.confirm('确定清空本机全部健康记录？')) return;
      try {
        window.localStorage.removeItem(Core.history.key(KEY));
        rows = [];
        storageStatus('本机健康记录已清空。');
        renderTrack();
      } catch (error) {
        storageStatus('无法清空本地记录：浏览器存储可能被禁用或受隐私设置限制。', true);
      }
    });

    var today = Health.localDate();
    if (!$('hc-date').value) $('hc-date').value = today;
    $('hc-date').max = today;
    Health.activity.forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.key;
      option.textContent = item.label;
      if (item.key === 'moderate') option.selected = true;
      $('hc-activity').appendChild(option);
    });
    rows = readHistory();
    syncSex();
    renderTrack();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
