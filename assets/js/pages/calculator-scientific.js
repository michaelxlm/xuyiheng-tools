/* calculator-scientific.js · 科学计算器薄控制器 */
(function () {
  'use strict';

  function boot() {
    var U = window.U;
    var Tools = window.Tools || {};
    var RV = window.ToolCore && window.ToolCore.ResultView;
    var form = document.getElementById('scForm');
    if (!form || !U || !Tools.scientific || !RV) return;
    var $ = function (id) { return document.getElementById(id); };
    var history = [];
    var lastValue = null;

    function status(message, isError) {
      $('sc-status').textContent = message || '';
      $('sc-status').hidden = !message;
      $('sc-status').classList.toggle('is-error', !!isError);
    }

    function updateAngle() {
      $('sc-angle-wrap').hidden = !Tools.scientific.trig[$('sc-method').value];
    }

    function display(value) {
      var n = Number(value);
      if (!Number.isFinite(n)) return String(value);
      if (n !== 0 && (Math.abs(n) >= 1e15 || Math.abs(n) < 1e-6)) return n.toExponential(10);
      return String(Number(n.toFixed(12)));
    }

    function expression(result) {
      var m = result.metrics;
      var symbol = { factorial: 'n!', sqrt: '√n', sin: 'sin', cos: 'cos', tan: 'tan', atan: 'atan', log: 'ln', exp: 'e^', abs: '|n|', round: 'round', ceil: 'ceil' }[m.method];
      var unit = m.method === 'atan' ? '' : (m.angleMode === 'deg' && Tools.scientific.trig[m.method] ? '°' : '');
      return symbol + '(' + display(m.input) + unit + ') = ' + display(m.value) + (m.resultUnit || '');
    }

    function renderHistory() {
      RV.clear($('sc-history'));
      if (!history.length) {
        var empty = document.createElement('li');
        empty.textContent = '暂无历史记录。';
        empty.className = 'text-muted';
        $('sc-history').appendChild(empty);
        return;
      }
      history.forEach(function (item) {
        var li = document.createElement('li');
        li.textContent = item;
        $('sc-history').appendChild(li);
      });
    }

    function show(result) {
      RV.renderError($('sc-error'), result);
      if (result.status !== 'success') {
        $('sc-result').hidden = true;
        status(result.errors.join('；'), true);
        return;
      }
      lastValue = result.metrics.value;
      $('sc-value').textContent = display(lastValue) + (result.metrics.resultUnit || '');
      $('sc-engine').textContent = '本地 JavaScript 引擎';
      RV.renderDetails($('sc-detail'), result.details);
      RV.renderExplanation($('sc-explain'), result);
      $('sc-result').hidden = false;
      history.unshift(expression(result));
      history = history.slice(0, 12);
      renderHistory();
      status('计算完成；结果在本地生成，不依赖网络。');
      U.track('calc_result', { tool: 'scientific', method: result.metrics.method, success: true });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      show(Tools.scientific.calculate({
        value: $('sc-num').value,
        method: $('sc-method').value,
        angleMode: $('sc-angle').value,
      }));
    });

    Object.keys(Tools.scientific.methods).forEach(function (method) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-outline btn-sm';
      button.textContent = Tools.scientific.methods[method];
      button.addEventListener('click', function () {
        $('sc-method').value = method;
        updateAngle();
        if (form.requestSubmit) form.requestSubmit();
        else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      $('sc-chips').appendChild(button);
    });

    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
      }
      return new Promise(function (resolve) {
        var input = document.createElement('textarea');
        input.value = text;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (error) { ok = false; }
        document.body.removeChild(input);
        resolve(ok);
      });
    }

    $('sc-copy').addEventListener('click', function () {
      if (lastValue == null) return;
      copyText(String(lastValue)).then(function (ok) {
        $('sc-copy').textContent = ok ? '已复制完整精度' : '复制失败，请手动选择';
        setTimeout(function () { $('sc-copy').textContent = '复制完整精度'; }, 1800);
      });
    });

    $('sc-clear-history').addEventListener('click', function () {
      history = [];
      renderHistory();
      status('历史记录已清空；历史仅保存在当前页面内存中。');
    });

    $('sc-method').addEventListener('change', updateAngle);
    updateAngle();
    renderHistory();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
