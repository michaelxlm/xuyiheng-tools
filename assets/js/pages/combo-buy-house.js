/* combo-buy-house.js · 购房成本与组合贷款薄控制器 */
(function () {
  'use strict';

  function boot() {
    var U = window.U;
    var Tools = window.Tools || {};
    var RV = window.ToolCore && window.ToolCore.ResultView;
    var Core = window.Core;
    var form = document.getElementById('bhForm');
    if (!form || !U || !Tools.buyHouse || !RV || !Core) return;
    var $ = function (id) { return document.getElementById(id); };
    var lastResult = null;

    function status(message, isError) {
      $('bh-status').textContent = message || '';
      $('bh-status').hidden = !message;
      $('bh-status').classList.toggle('is-error', !!isError);
    }

    function readInput() {
      return {
        price: $('bh-price').value,
        area: $('bh-area').value,
        houseCount: $('bh-count').value,
        policyDate: $('bh-policy-date').value,
        deedBasis: $('bh-deed-basis').value,
        customDeedRatePct: $('bh-custom-rate').value,
        downPct: $('bh-down').value,
        years: $('bh-years').value,
        commercialSharePct: $('bh-commercial-share').value,
        commercialRatePct: $('bh-commercial-rate').value,
        fundRatePct: $('bh-fund-rate').value,
        agentRatePct: $('bh-agent-rate').value,
        buyerSharePct: $('bh-buyer-share').value,
        otherCosts: $('bh-other').value,
        monthlyIncome: $('bh-income').value,
        otherMonthlyExpense: $('bh-expense').value,
        availableCash: $('bh-cash').value,
        emergencyMonths: $('bh-emergency').value,
        incomeShockPct: $('bh-income-shock').value,
        rateShockPct: $('bh-rate-shock').value,
      };
    }

    function clearResult() {
      lastResult = null;
      $('bh-result').hidden = true;
      $('bh-stress').hidden = true;
      $('bh-stress-status').textContent = '';
      RV.clear($('bh-detail'));
      RV.clear($('bh-stress-detail'));
      RV.clear($('bh-explain'));
      RV.clear($('bh-error'));
      $('bh-monthly').textContent = '--';
      $('bh-upfront').textContent = '--';
      $('bh-total').textContent = '--';
      $('bh-to-plan').href = '#';
      $('bh-to-prepay').href = '#';
      $('bh-prepay-note').textContent = '';
      status('');
    }

    function syncDeedFields() {
      var third = $('bh-count').value === 'third';
      var date = $('bh-policy-date').value;
      var legacy = /^\d{4}-\d{2}-\d{2}$/.test(date) && date < '2024-12-01';
      var custom = third || legacy;
      $('bh-custom-wrap').hidden = !custom;
      $('bh-custom-rate').min = third ? '3' : '0';
      $('bh-custom-rate').max = '5';
      $('bh-custom-rate').placeholder = third ? '填写当地 3%–5% 税率' : '填写当地确认税率';
      if (!custom) $('bh-custom-rate').value = '';
    }

    function displayValue(item) {
      if (typeof item.value !== 'number') return item.value;
      if (item.note === '%') return String(U.round(item.value, 2));
      if (item.note.indexOf('元') === 0) return U.money(item.value);
      return U.round(item.value, 2);
    }

    function renderDetails(targetId, details) {
      RV.renderDetails($(targetId), details.map(function (item) {
        return { label: item.label, value: displayValue(item), note: item.note };
      }));
    }

    function optionalNumber(id) {
      var value = $(id).value.trim();
      if (value === '') return null;
      var n = Number(value);
      return isFinite(n) && n >= 0 ? n : null;
    }

    function updateLinks(input, metrics) {
      var planValues = {
        'lp-debt': U.round(metrics.monthlyPayment, 2),
        'lp-income': optionalNumber('bh-income'),
        'lp-expense': optionalNumber('bh-expense'),
      };
      $('bh-to-plan').href = Core.bridge.link('/combo/life-plan.html', planValues, { source: 'buy-house' });

      var useCommercial = metrics.commercialPrincipal > 0;
      var principal = useCommercial ? metrics.commercialPrincipal : metrics.fundPrincipal;
      var rate = useCommercial ? metrics.commercialRatePct : metrics.fundRatePct;
      $('bh-to-prepay').textContent = (useCommercial ? '商业贷款' : '公积金贷款') + '去算提前还款 →';
      $('bh-to-prepay').href = principal > 0
        ? Core.bridge.link('/calculator/prepay.html', {
          'pp-loan': U.round(principal, 2),
          'pp-rate': rate,
          'pp-term': input.years,
          'pp-paid': 0,
          'pp-method': 'equal',
          'pp-mode': 'reduce',
          'pp-income': optionalNumber('bh-income'),
          'pp-expense': optionalNumber('bh-expense'),
        }, { source: 'buy-house' })
        : '/calculator/prepay.html';
      $('bh-prepay-note').textContent = metrics.commercialPrincipal > 0 && metrics.fundPrincipal > 0
        ? '当前仅把商业贷款部分带入提前还款工具；公积金贷款请另行测算。'
        : '桥接只携带本次贷款参数与你主动填写的收支，不包含硬编码收入或支出。';
    }

    function renderStress(cashflow) {
      $('bh-stress').hidden = !cashflow.provided;
      if (!cashflow.provided) {
        $('bh-stress-status').textContent = '';
        RV.clear($('bh-stress-detail'));
        return;
      }
      var labels = {
        pass: '当前参数通过既定压力情景，仍请保留缓冲并核对银行审批口径。',
        reserve_shortfall: '压力月供可覆盖，但支付签约现金后未达到应急储备目标。',
        deficit: '压力情景下月度结余为负，需要降低贷款、增加首付或提高收入缓冲。',
      };
      $('bh-stress-status').textContent = labels[cashflow.status] || labels.deficit;
      renderDetails('bh-stress-detail', [
        { label: '当前月供收入比', value: cashflow.debtToIncomePct, note: '%' },
        { label: '当前月度结余', value: cashflow.baselineSurplus, note: '元/月' },
        { label: '压力月供', value: cashflow.stressedMonthlyPayment, note: '元/月' },
        { label: '压力月度结余', value: cashflow.stressedSurplus, note: '元/月' },
        { label: '签约资金缺口', value: cashflow.fundingGap, note: '元' },
        { label: '应急储备缺口', value: cashflow.reserveGap, note: '元' },
      ].filter(function (item) { return item.value !== null; }));
    }

    function show(result, input) {
      if (result.status !== 'success') {
        clearResult();
        RV.renderError($('bh-error'), result);
        status(result.errors.join('；'), true);
        return;
      }
      RV.renderError($('bh-error'), result);
      lastResult = result;
      var m = result.metrics;
      $('bh-monthly').textContent = U.money(m.monthlyPayment);
      $('bh-upfront').textContent = U.money(m.upfrontCash);
      $('bh-total').textContent = U.money(m.totalCost);
      renderDetails('bh-detail', result.details);
      RV.renderExplanation($('bh-explain'), result);
      renderStress(m.cashflow);
      updateLinks(input, m);
      $('bh-result').hidden = false;
      status('计算完成。金额显示到分，复制与导出保留两位小数。');
      U.track('calc_result', { tool: 'buy-house', success: true, resultType: m.cashflow.status });
    }

    function copyText(text) {
      if (window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText) {
        return window.navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
      }
      return new window.Promise(function (resolve) {
        var area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (error) { ok = false; }
        document.body.removeChild(area);
        resolve(ok);
      });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var input = readInput();
      show(Tools.buyHouse.calculate(input), input);
    });

    function refreshForm() {
      syncDeedFields();
      clearResult();
    }

    syncDeedFields();
    form.addEventListener('input', refreshForm);
    form.addEventListener('change', refreshForm);

    $('bh-copy').addEventListener('click', function () {
      if (!lastResult) { status('请先完成一次测算。', true); return; }
      var m = lastResult.metrics;
      var lines = [
        '买房全攻略测算',
        '房屋总价：' + U.money(m.price),
        '首付：' + U.money(m.downPayment),
        '组合贷款月供：' + U.money(m.monthlyPayment),
        '签约前现金需求：' + U.money(m.upfrontCash),
        '购房总成本：' + U.money(m.totalCost),
        '契税：' + U.money(m.deedTax) + '（' + U.round(m.deedRate * 100, 2) + '%）',
        '政策快照：' + lastResult.source.version + '，生效 ' + lastResult.source.effectiveDate,
        '结果仅为静态估算，实际以当地政策和银行合同为准。',
      ];
      copyText(lines.join('\n')).then(function (ok) {
        status(ok ? '测算摘要已复制。' : '复制失败，请手动选择结果文本。', !ok);
      });
    });

    $('bh-export').addEventListener('click', function () {
      if (!lastResult) { status('请先完成一次测算。', true); return; }
      var exported = Core.csv.download('买房成本测算.csv', lastResult.details.map(function (item) {
        return [item.label, typeof item.value === 'number' ? U.round(item.value, 2) : item.value, item.note];
      }), ['项目', '数值', '单位或说明']);
      status(exported ? '已导出当前测算明细。' : '导出失败，请检查浏览器下载权限。', !exported);
      U.track('export_result', { tool: 'buy-house', success: exported });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
