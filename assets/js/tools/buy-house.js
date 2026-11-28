/* ==========================================================================
   buy-house.js · 购房成本、组合贷款与现金流压力测试纯计算模块
   ========================================================================== */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(globalThis, require('../tool-core'), require('../core/result'), require('../../../data/policies/deed-tax.json'));
  } else {
    root.Tools = root.Tools || {};
    root.Tools.buyHouse = factory(root, root.Core, root.ToolCore.Result, (root.__TOOL_POLICIES__ || {})['deed-tax']);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (global, Core, Result, defaultPolicy) {
  'use strict';
  var D = Result.detail;
  var MAX_MONEY = 1e12;

  function numeric(value, fallback, required, errors, label, min, max) {
    if (value == null || String(value).trim() === '') {
      if (required) errors.push(label + '不能为空');
      return fallback;
    }
    var n = Number(value);
    if (!isFinite(n)) {
      errors.push(label + '必须是有限数');
      return fallback;
    }
    if (min != null && n < min) errors.push(label + '不能小于 ' + min);
    if (max != null && n > max) errors.push(label + '不能大于 ' + max);
    return n;
  }

  function deedRate(houseCount, area, customRatePct, policy) {
    var p = policy || defaultPolicy;
    if (!p || !p.rates || !(Number(area) > 0)) return NaN;
    if (customRatePct != null && String(customRatePct).trim() !== '') {
      var custom = Number(customRatePct) / 100;
      var min = houseCount === 'third' && p.thirdOrMore ? Number(p.thirdOrMore.minRate) : 0;
      var max = houseCount === 'third' && p.thirdOrMore ? Number(p.thirdOrMore.maxRate) : 0.05;
      return isFinite(custom) && custom >= min && custom <= max ? custom : NaN;
    }
    if (houseCount === 'third') return NaN;
    var bracket = p.rates[houseCount];
    if (!bracket) return NaN;
    return area <= Number(p.thresholdAreaM2) ? bracket.upTo : bracket.above;
  }

  function validDate(value) {
    var text = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    var parts = text.split('-').map(Number);
    if (parts[0] < 1900) return false;
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
  }

  function loanPart(principal, annualRatePct, months) {
    if (principal <= 0) return { principal: 0, monthly: 0, interest: 0 };
    var monthly = Core.loan.annuity(principal, annualRatePct, months);
    var interest = monthly * months - principal;
    if (!isFinite(monthly) || !isFinite(interest)) throw new Error('贷款结果超出可表示范围');
    return { principal: principal, monthly: monthly, interest: Math.max(0, interest) };
  }

  function calculate(input, policyOverride) {
    var o = input || {};
    var policy = policyOverride || defaultPolicy;
    var errors = [];
    if (!policy || !policy.rates || !Array.isArray(policy.sources)) {
      return Result.invalid('buy-house', '缺少契税政策快照', {});
    }

    var price = numeric(o.price, NaN, true, errors, '房屋总价', 0, MAX_MONEY);
    var area = numeric(o.area, NaN, true, errors, '建筑面积', 0, 1000000);
    var deedBasis = numeric(o.deedBasis, price, false, errors, '契税计税依据', 0, MAX_MONEY);
    var downPct = numeric(o.downPct, 30, false, errors, '首付比例', 0, 100);
    var years = numeric(o.years, 30, false, errors, '贷款年限', 1, 50);
    var months = Math.round(years * 12);
    if (Math.floor(years) !== years) errors.push('贷款年限必须按整年填写');
    var commercialSharePct = numeric(o.commercialSharePct, 100, false, errors, '商业贷款占比', 0, 100);
    var commercialRatePct = numeric(o.commercialRatePct, NaN, false, errors, '商业贷款年利率', 0, 100);
    var fundRatePct = numeric(o.fundRatePct, NaN, false, errors, '公积金贷款年利率', 0, 100);
    var agentRatePct = numeric(o.agentRatePct, 0, false, errors, '中介费率', 0, 100);
    var buyerSharePct = numeric(o.buyerSharePct, 100, false, errors, '买方承担比例', 0, 100);
    var otherCosts = numeric(o.otherCosts, 0, false, errors, '其他前期成本', 0, MAX_MONEY);
    var customDeedRatePct = numeric(o.customDeedRatePct, null, false, errors, '自定义契税税率', 0, 5);
    if (o.houseCount != null && ['first', 'second', 'third'].indexOf(o.houseCount) < 0) errors.push('购房套数必须是首套、二套或第三套及以上');
    var houseCount = ['first', 'second', 'third'].indexOf(o.houseCount) >= 0 ? o.houseCount : 'first';
    var hasCustomRate = customDeedRatePct != null && String(customDeedRatePct).trim() !== '';
    var rate = deedRate(houseCount, area, customDeedRatePct, policy);

    if (price <= 0) errors.push('房屋总价必须大于 0');
    if (area <= 0) errors.push('建筑面积必须大于 0');
    if (o.policyDate && !validDate(o.policyDate)) errors.push('契税适用日期必须是有效的 YYYY-MM-DD 日期');
    var beforeEffectiveDate = validDate(o.policyDate) && String(o.policyDate) < policy.effectiveDate;
    if (beforeEffectiveDate && !hasCustomRate) {
      errors.push('适用日期早于 ' + policy.effectiveDate + '，请填写经当地确认的契税税率');
    }
    if (!beforeEffectiveDate && houseCount !== 'third' && hasCustomRate) {
      errors.push('当前政策下首套与二套按 140㎡ 分档自动计算，请清除自定义税率');
    }
    if (!isFinite(rate)) {
      errors.push(houseCount === 'third' ? '第三套及以上请填写当地适用契税税率（3%–5%）' : '契税税率不合法');
    }

    var downPayment = price * downPct / 100;
    var loanPrincipal = Math.max(0, price - downPayment);
    var commercialPrincipal = loanPrincipal * commercialSharePct / 100;
    var fundPrincipal = loanPrincipal - commercialPrincipal;
    if (commercialPrincipal > 0 && !isFinite(commercialRatePct)) errors.push('商业贷款金额大于 0 时必须填写年利率');
    if (fundPrincipal > 0 && !isFinite(fundRatePct)) errors.push('公积金贷款金额大于 0 时必须填写年利率');
    if (errors.length) return Result.invalid('buy-house', errors.join('；'), policy);

    var commercial = loanPart(commercialPrincipal, commercialRatePct, months);
    var fund = loanPart(fundPrincipal, fundRatePct, months);
    var monthlyPayment = commercial.monthly + fund.monthly;
    var totalInterest = commercial.interest + fund.interest;
    var deedTax = deedBasis * rate;
    var agentFee = price * agentRatePct / 100 * buyerSharePct / 100;
    var upfrontCash = downPayment + deedTax + agentFee + otherCosts;
    var totalCost = price + totalInterest + deedTax + agentFee + otherCosts;

    var income = numeric(o.monthlyIncome, null, false, errors, '税后月收入', 0, MAX_MONEY);
    var otherExpense = numeric(o.otherMonthlyExpense, 0, false, errors, '其他月支出', 0, MAX_MONEY);
    var availableCash = numeric(o.availableCash, null, false, errors, '可用现金', 0, MAX_MONEY);
    var emergencyMonths = numeric(o.emergencyMonths, 6, false, errors, '应急储备月数', 0, 36);
    var incomeShockPct = numeric(o.incomeShockPct, 20, false, errors, '收入压力降幅', 0, 100);
    var rateShockPct = numeric(o.rateShockPct, 1, false, errors, '利率压力增幅', 0, 20);
    if (errors.length) return Result.invalid('buy-house', errors.join('；'), policy);

    var cashflow = {
      provided: false,
      status: 'not_provided',
      income: null,
      otherExpense: null,
      baselineSurplus: null,
      debtToIncomePct: null,
      stressedIncome: null,
      stressedMonthlyPayment: null,
      stressedSurplus: null,
      availableCash: null,
      cashAfterUpfront: null,
      emergencyReserveTarget: null,
      fundingGap: null,
      reserveGap: null,
    };
    if (income != null) {
      var stressedIncome = income * (1 - incomeShockPct / 100);
      var stressedCommercial = loanPart(commercialPrincipal, commercialRatePct + rateShockPct, months);
      var stressedFund = loanPart(fundPrincipal, fundRatePct + rateShockPct, months);
      var stressedMonthly = stressedCommercial.monthly + stressedFund.monthly;
      var baselineSurplus = income - otherExpense - monthlyPayment;
      var stressedSurplus = stressedIncome - otherExpense - stressedMonthly;
      var cashAfterUpfront = availableCash == null ? null : availableCash - upfrontCash;
      var reserveTarget = (otherExpense + stressedMonthly) * emergencyMonths;
      cashflow = {
        provided: true,
        income: income,
        otherExpense: otherExpense,
        baselineSurplus: baselineSurplus,
        debtToIncomePct: income > 0 ? monthlyPayment / income * 100 : null,
        stressedIncome: stressedIncome,
        stressedMonthlyPayment: stressedMonthly,
        stressedSurplus: stressedSurplus,
        availableCash: availableCash,
        cashAfterUpfront: cashAfterUpfront,
        emergencyReserveTarget: reserveTarget,
        fundingGap: availableCash == null ? null : Math.max(0, -cashAfterUpfront),
        reserveGap: cashAfterUpfront == null ? null : Math.max(0, reserveTarget - cashAfterUpfront),
        status: stressedSurplus < 0 ? 'deficit' : (cashAfterUpfront != null && cashAfterUpfront < reserveTarget ? 'reserve_shortfall' : 'pass'),
      };
    }

    var details = [
      D('贷款总额', loanPrincipal, '元'),
      D('商业贷款', commercialPrincipal, '元，占贷款 ' + commercialSharePct + '%'),
      D('商业贷款月供', commercial.monthly, '元/月'),
      D('公积金贷款', fundPrincipal, '元'),
      D('公积金贷款月供', fund.monthly, '元/月'),
      D('还款总期数', months, '期'),
      D('支付总利息', totalInterest, '元'),
      D('契税税率', rate * 100, '%'),
      D('契税', deedTax, '元'),
      D('中介费', agentFee, '元，留空费率时未计入'),
      D('其他前期成本', otherCosts, '元'),
      D('签约前现金需求', upfrontCash, '元，含首付、契税、中介费与其他成本'),
    ];

    if (cashflow.provided) {
      details.push(
        D('当前月度结余', cashflow.baselineSurplus, '元/月'),
        D('月供收入比', cashflow.debtToIncomePct, '%'),
        D('压力测试月收入', cashflow.stressedIncome, '元/月，收入下降 ' + incomeShockPct + '%'),
        D('压力测试月供', cashflow.stressedMonthlyPayment, '元/月，两类贷款利率各上浮 ' + rateShockPct + ' 个百分点'),
        D('压力测试月度结余', cashflow.stressedSurplus, '元/月')
      );
      if (cashflow.availableCash != null) {
        details.push(
          D('支付签约现金后余额', cashflow.cashAfterUpfront, '元'),
          D('应急储备目标', cashflow.emergencyReserveTarget, '元，' + emergencyMonths + ' 个月其他支出与压力月供'),
          D('签约资金缺口', cashflow.fundingGap, '元'),
          D('应急储备缺口', cashflow.reserveGap, '元')
        );
      }
    } else {
      details.push(D('现金流压力测试', '未填写税后月收入，未生成压力结论', '填写收入、其他支出和可用现金后可比较当前与压力情景'));
    }

    var limitations = policy.limitations.slice();
    limitations.push('月供采用等额本息，假设利率在贷款期限内不变；未计重定价、提前还款、违约金与银行舍入差异。');
    limitations.push('增值税、个税、土地增值税、评估费、登记费、权证费、装修及后续物业停车等费用未自动推定，可在其他前期成本中填写已知金额。');
    limitations.push('压力测试是情景演算，不是贷款审批、还款能力认定或投资建议。');

    return Result.create('buy-house', {
      metrics: {
        price: price,
        area: area,
        houseCount: houseCount,
        policyDate: o.policyDate || policy.effectiveDate,
        downPayment: downPayment,
        loanPrincipal: loanPrincipal,
        commercialPrincipal: commercialPrincipal,
        fundPrincipal: fundPrincipal,
        commercialSharePct: commercialSharePct,
        commercialRatePct: commercialPrincipal > 0 ? commercialRatePct : null,
        fundRatePct: fundPrincipal > 0 ? fundRatePct : null,
        months: months,
        commercialMonthlyPayment: commercial.monthly,
        fundMonthlyPayment: fund.monthly,
        monthlyPayment: monthlyPayment,
        totalInterest: totalInterest,
        deedRate: rate,
        deedTax: deedTax,
        agentFee: agentFee,
        otherCosts: otherCosts,
        upfrontCash: upfrontCash,
        totalCost: totalCost,
        cashflow: cashflow,
      },
      details: details,
      formula: '首付 = 房屋总价 × 首付比例；贷款 = 房屋总价 − 首付；组合贷款月供 = 商业贷款月供 + 公积金贷款月供；契税 = 计税依据 × 适用税率；签约前现金需求 = 首付 + 契税 + 买方中介费 + 其他前期成本；购房总成本 = 房屋总价 + 贷款利息 + 税费与成本。',
      assumptions: ['房屋总价同时作为默认契税计税依据，可在当地确认后修改', '商业与公积金贷款采用相同期限、等额本息与静态利率', '收入压力默认下降 20%，两类贷款利率默认各上浮 1 个百分点，均可修改'],
      source: {
        name: '住房交易契税政策快照（核验 ' + policy.verifiedAt + '）',
        version: policy.version,
        effectiveDate: policy.effectiveDate,
        sources: policy.sources,
      },
      precision: { money: 2, percent: 2, months: 0 },
      limitations: limitations,
    });
  }

  return { calculate: calculate, deedRate: deedRate };
});
