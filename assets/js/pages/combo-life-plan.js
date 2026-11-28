/* combo-life-plan.js · 人生规划薄控制器 */
(function () {
  'use strict';

  function boot() {
    var U = window.U;
    var Tools = window.Tools || {};
    var RV = window.ToolCore && window.ToolCore.ResultView;
    var Core = window.Core;
    var form = document.getElementById('lpForm');
    if (!form || !U || !Tools.lifePlan || !RV || !Core) return;
    var $ = function (id) { return document.getElementById(id); };
    var KEY = 'life-plan';
    var lastResult = null;
    var rows = [];
    var storageReadBlocked = false;

    function status(message, isError) {
      $('lp-status').textContent = message || '';
      $('lp-status').hidden = !message;
      $('lp-status').classList.toggle('is-error', !!isError);
    }

    function storageStatus(message, isError) {
      $('lp-storage-status').textContent = message || '';
      $('lp-storage-status').classList.toggle('is-error', !!isError);
    }

    function readInput() {
      return {
        income: $('lp-income').value,
        expense: $('lp-expense').value,
        debtPayment: $('lp-debt').value,
        debtPrincipal: $('lp-debt-principal').value,
        debtAnnualRatePct: $('lp-debt-rate').value,
        debtRemainingMonths: $('lp-debt-months').value,
        assets: $('lp-assets').value,
        annualRatePct: $('lp-return').value,
        lowRatePct: $('lp-low-rate').value,
        highRatePct: $('lp-high-rate').value,
        years: $('lp-years').value,
        inflationPct: $('lp-inflation').value,
        withdrawalRatePct: $('lp-withdrawal').value,
        goalAnnualExpense: $('lp-goal').value,
        timing: $('lp-timing').value,
      };
    }

    function clearResult() {
      lastResult = null;
      $('lp-result').hidden = true;
      $('lp-rate').textContent = '--';
      $('lp-future').textContent = '--';
      $('lp-progress').textContent = '--';
      $('lp-rate').classList.remove('lp-negative');
      $('lp-cashflow-note').textContent = '';
      RV.clear($('lp-detail'));
      RV.clear($('lp-required'));
      RV.clear($('lp-explain'));
      RV.clear($('lp-error'));
      $('lp-error').hidden = true;
      $('lp-to-finance').href = '/combo/finance-toolkit.html';
      status('');
    }

    function displayValue(item) {
      if (typeof item.value !== 'number') return item.value;
      if (item.note.indexOf('%') === 0) return String(U.round(item.value, 2));
      if (item.note.indexOf('元') === 0) return U.money(item.value);
      return U.round(item.value, 2);
    }

    function goalDetails(result) {
      var m = result.metrics;
      if (!(m.goalTarget > 0)) return [{ label: '目标设置', value: '填写目标年支出后可反推所需月储蓄', note: '' }];
      var state = m.goalTime;
      var timeText = state.status === 'reached'
        ? (state.months === 0 ? '当前已达成' : '约 ' + state.months + ' 个月')
        : (state.status === 'beyond_range' ? '超过 1000 年展示范围' : (state.status === 'overflow' ? '超出可计算范围' : '按当前现金流无法有限达成'));
      return [
        { label: '目标资产（今天购买力）', value: U.money(m.goalTarget), note: '目标年支出 ÷ 提取率' },
        { label: '规划期内所需月储蓄', value: U.money(Math.ceil(m.requiredMonthly * 100) / 100), note: '已计入债务还清后的现金流释放，向上取整到分' },
        { label: '当前月结余与所需月储蓄差额', value: U.money(m.currentSurplus - m.requiredMonthly), note: '负数表示缺口' },
        { label: '预计达成时间', value: timeText, note: state.status === 'reached' ? '已考虑债务还清后的现金流释放' : '不构成达标承诺' },
      ];
    }

    function show(result) {
      RV.renderError($('lp-error'), result);
      if (result.status !== 'success') {
        clearResult();
        RV.renderError($('lp-error'), result);
        status(result.errors.join('；'), true);
        return;
      }
      lastResult = result;
      var m = result.metrics;
      $('lp-rate').textContent = U.money(m.currentSurplus);
      $('lp-rate').classList.toggle('lp-negative', m.currentSurplus < 0);
      $('lp-future-label').textContent = m.depletedAt == null ? m.years + ' 年后资产（名义）' : m.years + ' 年后资产（耗尽后重启）';
      $('lp-future').textContent = U.money(m.projection);
      $('lp-progress').textContent = m.progressPct == null ? '未设目标' : U.round(m.progressPct, 1) + '%';
      $('lp-cashflow-note').textContent = m.depletedAt == null
        ? '当前储蓄率 ' + U.round(m.savingsRatePct, 1) + '%；规划期内未发现资产耗尽。'
        : '现金流赤字或提款过高：约第 ' + m.depletedAt + ' 个月资产耗尽；后续正结余从零重新累积，历史缺口 ' + U.money(m.fundingGap) + '。';
      $('lp-cashflow-note').classList.toggle('lp-negative', m.depletedAt != null);
      RV.renderDetails($('lp-detail'), result.details.map(function (item) {
        return { label: item.label, value: displayValue(item), note: item.note };
      }));
      RV.renderDetails($('lp-required'), goalDetails(result));
      RV.renderExplanation($('lp-explain'), result);
      $('lp-to-finance').href = Core.bridge.link('/combo/finance-toolkit.html', {
        'ci-p': U.round(m.assets, 2),
        'ci-m': U.round(Math.max(0, m.currentSurplus) * 12, 2),
        'ci-r': m.annualRatePct,
        'ci-y': m.years,
      }, { source: 'life-plan' });
      $('lp-result').hidden = false;
      status(m.currentSurplus < 0 ? '计算完成：当前为现金流赤字，请查看资产耗尽提示。' : '计算完成；请核对收益率、通胀与提取率假设。', m.currentSurplus < 0);
      U.track('calc_result', { tool: 'life-plan', success: true, resultType: m.goalTime.status });
    }

    function normalizeHistory(value) {
      if (!Array.isArray(value)) throw new Error('记录格式不是数组');
      var skipped = 0;
      var records = [];
      value.forEach(function (record, index) {
        try {
          if (!record || typeof record !== 'object') throw new Error('记录格式损坏');
          var summary = record.summary || record;
          var numbers = ['income', 'save', 'rate', 'annual', 'years', 'future'];
          var valid = numbers.every(function (key) { return summary[key] != null && String(summary[key]).trim() !== '' && isFinite(Number(summary[key])); });
          if (!valid) throw new Error('记录字段损坏');
          var future = Number(summary.future);
          var fundingGap = summary.fundingGap == null ? 0 : Number(summary.fundingGap);
          if (future < 0) {
            if (summary.fundingGap == null) fundingGap = Math.max(fundingGap, -future);
            future = 0;
          }
          if (!isFinite(fundingGap) || fundingGap < 0) throw new Error('资金缺口字段损坏');
          records.push({
            id: String(record.id || ('legacy-' + index)),
            savedAt: String(record.savedAt || ''),
            legacy: !record.summary,
            summary: {
              income: Number(summary.income), save: Number(summary.save), rate: Number(summary.rate),
              annual: Number(summary.annual), years: Number(summary.years), future: future,
              fundingGap: fundingGap,
            },
          });
        } catch (error) {
          skipped += 1;
        }
      });
      return { records: records, skipped: skipped };
    }

    function readHistory() {
      storageReadBlocked = false;
      try {
        var raw = window.localStorage.getItem(Core.history.key(KEY));
        if (raw == null || raw === '') { rows = []; storageStatus('尚无已保存方案。'); return; }
        var normalized = normalizeHistory(JSON.parse(raw));
        rows = normalized.records;
        storageStatus(normalized.skipped
          ? '已显示 ' + rows.length + ' 条有效方案，跳过 ' + normalized.skipped + ' 条损坏记录。'
          : '方案仅保存在本机浏览器；最多保留 20 条。', normalized.skipped > 0);
      } catch (error) {
        rows = [];
        storageReadBlocked = true;
        storageStatus('无法解析本机方案，已显示空态；原始内容未覆盖。请先清空后再保存，本次仍可计算。', true);
      }
    }

    function writeHistory(next, message) {
      if (storageReadBlocked) {
        storageStatus('原始方案无法解析，已阻止保存或删除以避免覆盖；请先使用“清空方案”。', true);
        return false;
      }
      try {
        var normalized = normalizeHistory(next).records.slice(0, 20);
        window.localStorage.setItem(Core.history.key(KEY), JSON.stringify(normalized));
        rows = normalized;
        storageStatus(message || '方案已保存到本机浏览器。');
        renderHistory();
        return true;
      } catch (error) {
        storageStatus('无法保存或更新本机方案：存储可能被禁用、已满或受隐私设置限制。计算结果仍可查看。', true);
        return false;
      }
    }

    function renderHistory() {
      RV.clear($('lp-tbody'));
      $('lp-compare-wrap').hidden = rows.length === 0;
      rows.forEach(function (record, index) {
        var tr = document.createElement('tr');
        var s = record.summary;
        var values = [
          record.legacy ? '旧版方案' : (record.savedAt || '时间未知'),
          U.money(s.income), U.money(s.save), U.round(s.rate, 1) + '%',
          U.round(s.annual, 2) + '%', U.round(s.years, 2) + ' 年', U.money(s.future), U.money(s.fundingGap),
        ];
        values.forEach(function (value) {
          var td = document.createElement('td');
          td.textContent = value;
          tr.appendChild(td);
        });
        var action = document.createElement('td');
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary lp-del';
        button.textContent = '删除';
        button.setAttribute('aria-label', '删除第 ' + (index + 1) + ' 个方案');
        button.addEventListener('click', function () {
          var next = rows.slice();
          next.splice(index, 1);
          writeHistory(next, '方案已从本机删除。');
        });
        action.appendChild(button);
        tr.appendChild(action);
        $('lp-tbody').appendChild(tr);
      });
    }

    function summaryOf(result) {
      var m = result.metrics;
      return {
        income: m.income, save: m.currentSurplus, rate: m.savingsRatePct,
        annual: m.annualRatePct, years: m.years, future: m.projection, fundingGap: m.fundingGap,
      };
    }

    function download(filename, records) {
      var data = records.map(function (record) {
        var s = record.summary;
        return [record.legacy ? '旧版方案' : record.savedAt, s.income, s.save, U.round(s.rate, 2), s.annual, s.years, U.round(s.future, 2), U.round(s.fundingGap, 2)];
      });
      var ok = Core.csv.download(filename, data, ['保存时间', '月收入', '当前月结余', '储蓄率(%)', '基准有效年收益率(%)', '规划年限', '期末资产', '规划期末资金缺口']);
      status(ok ? '已导出方案 CSV。' : '导出失败，请检查浏览器下载权限。', !ok);
      U.track('export_result', { tool: 'life-plan', success: ok });
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
      show(Tools.lifePlan.calculate(readInput()));
    });
    form.addEventListener('input', clearResult);
    form.addEventListener('change', clearResult);

    $('lp-save').addEventListener('click', function () {
      var result = Tools.lifePlan.calculate(readInput());
      show(result);
      if (result.status !== 'success') return;
      var record = { id: Date.now().toString(36), savedAt: new Date().toISOString(), summary: summaryOf(result) };
      var saved = writeHistory([record].concat(rows), '本次方案已保存到本机浏览器。');
      U.track('save_result', { tool: 'life-plan', success: saved, resultType: result.metrics.goalTime.status });
    });
    $('lp-copy').addEventListener('click', function () {
      if (!lastResult) { status('请先完成一次测算。', true); return; }
      var m = lastResult.metrics;
      var lines = [
        '人生规划财务全景', '规划年限：' + m.years + ' 年', '每月投入时点：' + (m.timing === 'begin' ? '月初' : '月末'),
        '当前月结余：' + U.money(m.currentSurplus), '期末资产（名义）：' + U.money(m.projection),
        '规划期末资金缺口：' + U.money(m.fundingGap),
        '期末资产（今天购买力）：' + U.money(m.realProjection),
        '财务自由进度：' + (m.progressPct == null ? '未设目标' : U.round(m.progressPct, 1) + '%'),
        '结果仅为确定性情景，不构成投资建议。',
      ];
      copyText(lines.join('\n')).then(function (ok) { status(ok ? '结果摘要已复制。' : '复制失败，请手动选择结果文本。', !ok); });
    });
    $('lp-export').addEventListener('click', function () {
      if (!lastResult) { status('请先完成一次测算。', true); return; }
      download('人生规划当前方案.csv', [{ savedAt: new Date().toISOString(), summary: summaryOf(lastResult) }]);
    });
    $('lp-export-all').addEventListener('click', function () {
      if (!rows.length) { storageStatus('没有可导出的方案。', true); return; }
      download('人生规划方案.csv', rows);
    });
    $('lp-clear').addEventListener('click', function () {
      if (!window.confirm('确定清空本机全部已存方案？')) return;
      try {
        window.localStorage.removeItem(Core.history.key(KEY));
        rows = [];
        storageReadBlocked = false;
        storageStatus('本机方案已清空。');
        renderHistory();
      } catch (error) {
        storageStatus('无法清空本机方案：浏览器存储可能被禁用或受隐私设置限制。', true);
      }
    });

    readHistory();
    renderHistory();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
