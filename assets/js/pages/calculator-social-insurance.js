/* calculator-social-insurance.js · 工资、社保基数与公积金基数分离薄控制器 */
(function () {
  'use strict';

  function boot() {
    var U = window.U;
    var Tools = window.Tools || {};
    var Result = window.ToolCore && window.ToolCore.Result;
    var RV = window.ToolCore && window.ToolCore.ResultView;
    var Core = window.Core;
    var form = document.getElementById('siForm');
    if (!form || !U || !Tools.socialInsurance || !Result || !RV || !Core) return;
    var $ = function (id) { return document.getElementById(id); };
    var policies = window.__TOOL_POLICIES__ || {};
    var policy = policies['social-insurance'];
    var taxPolicy = policies['individual-income-tax'];
    var KEY = 'social-insurance';
    var rateFields = {
      personal: { pension: 'si-pr-pension', medical: 'si-pr-medical', unemployment: 'si-pr-unemployment', fund: 'si-pr-fund' },
      company: { pension: 'si-co-pension', medical: 'si-co-medical', unemployment: 'si-co-unemployment', injury: 'si-co-injury', maternity: 'si-co-maternity', fund: 'si-co-fund' },
    };

    function status(message, isError) {
      $('si-status').textContent = message || '';
      $('si-status').hidden = !message;
      $('si-status').classList.toggle('is-error', !!isError);
    }

    function setDefaults() {
      var defaults = policy && policy.defaultCustomRatesPercent || {};
      Object.keys(rateFields).forEach(function (side) {
        Object.keys(rateFields[side]).forEach(function (key) {
          $(rateFields[side][key]).value = defaults[side] && defaults[side][key] != null ? defaults[side][key] : 0;
        });
      });
      $('si-policyYear').value = policy && policy.policyYear ? String(policy.policyYear) : '2026';
      $('si-salary').value = 20000;
      $('si-socialBase').value = 10000;
      $('si-fundBase').value = 10000;
      $('si-special').value = 0;
      ['si-socialMin', 'si-socialMax', 'si-fundMin', 'si-fundMax'].forEach(function (id) { $(id).value = ''; });
    }

    function optionalNumber(id) {
      return $(id).value.trim() === '' ? null : U.numInput($(id));
    }

    function readRates(side) {
      var out = {};
      Object.keys(rateFields[side]).forEach(function (key) { out[key] = U.numInput($(rateFields[side][key])); });
      return out;
    }

    function readInput() {
      return {
        salary: $('si-salary').value,
        socialBase: $('si-socialBase').value,
        fundBase: $('si-fundBase').value,
        specialMonthly: $('si-special').value,
        personalRates: readRates('personal'),
        companyRates: readRates('company'),
        limits: {
          socialMin: optionalNumber('si-socialMin'), socialMax: optionalNumber('si-socialMax'),
          fundMin: optionalNumber('si-fundMin'), fundMax: optionalNumber('si-fundMax'),
        },
        policyYear: $('si-policyYear').value,
      };
    }

    function calculate() {
      return Tools.socialInsurance.calculate(readInput(), policy, taxPolicy);
    }

    function roundedDetails(details) {
      return (details || []).map(function (item) {
        return Object.assign({}, item, { value: typeof item.value === 'number' ? U.round(item.value, 2) : item.value });
      });
    }

    function show(result) {
      RV.renderError($('si-error'), result);
      if (result.status !== 'success') {
        $('si-result').hidden = true;
        $('si-explain').hidden = true;
        status(result.errors.join('；'), true);
        return null;
      }
      var m = result.metrics;
      $('si-personal').textContent = U.money(m.personalTotal);
      $('si-company').textContent = U.money(m.companyTotal);
      $('si-account').textContent = U.money(m.fundAccount);
      $('si-net').textContent = U.money(m.net);
      RV.renderDetails($('si-detail'), roundedDetails(result.details));
      RV.renderExplanation($('si-explain'), result);
      $('si-explain').hidden = false;
      $('si-result').hidden = false;
      status('计算完成。费率与基数均为你当前填写的参数。');
      return result;
    }

    function textCell(value) {
      var td = document.createElement('td');
      td.textContent = value == null ? '—' : String(value);
      return td;
    }

    function renderCompare() {
      var rows = Core.history.list(KEY);
      RV.clear($('si-tbody'));
      $('si-compare-wrap').hidden = rows.length === 0;
      rows.forEach(function (row, index) {
        var tr = document.createElement('tr');
        [row.salary, row.socialBase, row.fundBase, U.money(row.personalTotal), U.money(row.companyTotal), U.money(row.tax), U.money(row.net)].forEach(function (value) {
          tr.appendChild(textCell(value));
        });
        var action = document.createElement('td');
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary si-del';
        button.textContent = '删除';
        button.setAttribute('aria-label', '删除第 ' + (index + 1) + ' 个方案');
        button.addEventListener('click', function () {
          if (!Core.history.remove(KEY, index)) status('删除失败，浏览器可能禁用了本地存储。', true);
          renderCompare();
        });
        action.appendChild(button);
        tr.appendChild(action);
        $('si-tbody').appendChild(tr);
      });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      show(calculate());
    });

    $('si-save').addEventListener('click', function () {
      var result = calculate();
      if (!show(result)) return;
      var saved = Core.history.add(KEY, {
        salary: result.metrics.salary, socialBase: result.metrics.socialBase, fundBase: result.metrics.fundBase,
        personalTotal: result.metrics.personalTotal, companyTotal: result.metrics.companyTotal,
        tax: result.metrics.tax, net: result.metrics.net,
      }, 20);
      status(saved ? '方案已保存到当前浏览器。' : '保存失败，浏览器可能禁用了本地存储。', !saved);
      renderCompare();
      if (saved) U.track('save_result', { tool: 'social-insurance' });
    });

    $('si-export').addEventListener('click', function () {
      var rows = Core.history.list(KEY);
      if (!rows.length) { status('还没有可导出的方案。', true); return; }
      Core.csv.download('五险一金方案.csv', rows.map(function (row) {
        return [row.salary, row.socialBase, row.fundBase, U.round(row.personalTotal, 2), U.round(row.companyTotal, 2), U.round(row.tax, 2), U.round(row.net, 2)];
      }), ['税前工资', '社保基数', '公积金基数', '个人月缴', '单位月缴', '个税', '到手工资']);
      status('已导出 ' + rows.length + ' 个方案。');
      U.track('export_result', { tool: 'social-insurance' });
    });

    $('si-clear').addEventListener('click', function () {
      if (!window.confirm('确定清空本机全部已存方案？')) return;
      var ok = Core.history.clear(KEY);
      status(ok ? '已清空保存的方案。' : '清空失败，浏览器可能禁用了本地存储。', !ok);
      renderCompare();
    });

    $('si-reset').addEventListener('click', function () {
      form.reset();
      setDefaults();
      $('si-result').hidden = true;
      $('si-explain').hidden = true;
      $('si-error').hidden = true;
      RV.clear($('si-detail'));
      RV.clear($('si-explain'));
      status('已恢复可编辑示例参数。');
    });

    setDefaults();
    renderCompare();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
