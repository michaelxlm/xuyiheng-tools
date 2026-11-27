/* ==========================================================================
   tax.js · 个税单月静态估算与全年一次性奖金测算
   ========================================================================== */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(globalThis, require('../core/result'), require('../../../data/policies/individual-income-tax.json'));
  } else {
    root.Tools = root.Tools || {};
    root.Tools.tax = factory(root, root.ToolCore.Result, (root.__TOOL_POLICIES__ || {})['individual-income-tax']);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (global, Result, defaultPolicy) {
  'use strict';
  var D = Result.detail;

  function finiteNonNegative(value, fallback, label, errors) {
    if (value == null || value === '') return fallback;
    var n = Number(value);
    if (!isFinite(n) || n < 0) {
      errors.push(label + '必须是非负有限数');
      return fallback;
    }
    return n;
  }

  function progressive(income, brackets) {
    var t = Math.max(0, Number(income) || 0);
    for (var i = 0; i < brackets.length; i++) {
      var b = brackets[i];
      if (b.limit == null || t <= b.limit) return { tax: Math.max(0, t * b.rate - b.quickDeduction), rate: b.rate, quickDeduction: b.quickDeduction };
    }
    return { tax: 0, rate: 0, quickDeduction: 0 };
  }

  function calculate(input, policyOverride) {
    var policy = policyOverride || defaultPolicy;
    if (!policy || !Array.isArray(policy.monthlyBrackets)) return Result.invalid('tax', '缺少个税政策快照', {});
    var o = input || {};
    var errors = [];
    var salary = finiteNonNegative(o.salary, 0, '税前月收入', errors);
    var insurance = finiteNonNegative(o.insurance, 0, '五险一金', errors);
    var threshold = o.threshold == null ? policy.basicDeductionMonthly : finiteNonNegative(o.threshold, 0, '基本减除费用', errors);
    var bonus = finiteNonNegative(o.bonus, 0, '年终奖', errors);
    var policyYear = Number(o.policyYear || policy.policyYear);
    var deductions = o.deductions || {};
    var values = {};
    Object.keys(deductions).forEach(function (key) { values[key] = finiteNonNegative(deductions[key], 0, key, errors); });
    if (!(salary > 0)) errors.push('税前月收入必须大于 0');
    if ((values.mortgageInterest || 0) > 0 && (values.housingRent || 0) > 0) errors.push('住房贷款利息与住房租金不能同时扣除');
    if (o.bonusMode === 'separate' && bonus > 0 && policyYear > 2027) errors.push('2028 年起单独计税政策尚未确认，请切换计税方式或核对新政');
    if (errors.length) return Result.invalid('tax', errors.join('；'), policy);

    var limits = policy.specialDeductionsMonthly || {};
    var annualLimits = policy.specialDeductionsAnnual || {};
    var capped = function (key) { return Math.min(values[key] || 0, Number(limits[key] && limits[key].limit) || Infinity); };
    var vocationalAnnual = Math.min(values.vocationalEducationAnnual || 0, Number(annualLimits.vocationalEducation && annualLimits.vocationalEducation.limit) || Infinity);
    var vocationalMonthly = vocationalAnnual / 12;
    var medicalAnnualExpense = values.medicalAnnualExpense || 0;
    var medicalRule = policy.medicalDeduction || {};
    var medicalDeductionAnnual = Math.min(Number(medicalRule.limitAnnual) || 0, Math.max(0, medicalAnnualExpense - (Number(medicalRule.thresholdAnnual) || 0)));
    var medicalMonthly = medicalDeductionAnnual / (Number(medicalRule.monthlyEstimateDivisor) || 12);
    // 子女教育、婴幼儿照护与赡养老人输入的是符合条件后的合计，不能按单个对象上限压低。
    var monthlyDeductions = (values.childEducation || 0) + (values.infantCare || 0) + capped('continuingEducation') + vocationalMonthly + capped('mortgageInterest') + capped('housingRent') + (values.elderlySupport || 0) + medicalMonthly;
    var salaryTaxable = Math.max(0, salary - insurance - threshold - monthlyDeductions);
    var salaryTax = progressive(salaryTaxable, policy.monthlyBrackets);
    var bonusMode = o.bonusMode === 'combined' ? 'combined' : 'separate';
    var bonusTax = { tax: 0, rate: 0, quickDeduction: 0 };
    if (bonusMode === 'separate' && bonus > 0) {
      var bonusBracket = progressive(bonus / 12, policy.monthlyBrackets);
      bonusTax = { tax: Math.max(0, bonus * bonusBracket.rate - bonusBracket.quickDeduction), rate: bonusBracket.rate, quickDeduction: bonusBracket.quickDeduction };
    }
    var combinedTaxable = salaryTaxable + (bonusMode === 'combined' ? bonus : 0);
    var combined = bonusMode === 'combined' ? progressive(combinedTaxable, policy.monthlyBrackets) : salaryTax;
    var tax = bonusMode === 'combined' ? combined.tax : salaryTax.tax + bonusTax.tax;
    var gross = salary - insurance + bonus;
    var afterTax = Math.max(0, gross - tax);

    return Result.create('tax', {
      metrics: {
        salary: salary,
        insurance: insurance,
        bonus: bonus,
        monthlyDeductions: monthlyDeductions,
        salaryTaxable: salaryTaxable,
        salaryTax: salaryTax.tax,
        bonusTax: bonusTax.tax,
        tax: tax,
        afterTax: afterTax,
        effectiveRate: gross > 0 ? tax / gross : 0,
      },
      details: [
        D('税前月收入', salary, '元'),
        D('五险一金', insurance, '元'),
        D('基本减除费用', threshold, '元/月'),
        D('专项附加扣除（月均）', monthlyDeductions, '元/月'),
        D('职业资格继续教育（月均）', vocationalMonthly, '元/月'),
        D('大病医疗年度可扣除', medicalDeductionAnnual, '元/年，月均 ' + medicalMonthly.toFixed(2) + ' 元'),
        D('工资应纳税所得额', salaryTaxable, '元/月'),
        D('工资个税', salaryTax.tax, '元/月'),
        D('年终奖个税', bonusTax.tax, '元'),
        D('合计个税', tax, '元'),
        D('税后收入', afterTax, '元'),
      ],
      formula: '应纳税所得额 = 税前收入 − 五险一金 − 基本减除费用 − 专项附加扣除；税额 = 应纳税所得额 × 适用税率 − 速算扣除数',
      assumptions: ['单月静态估算，不模拟累计预扣', '大病医疗与职业资格继续教育按年度可扣除额折算为月均', '住房贷款利息与住房租金互斥', '子女教育、婴幼儿照护与赡养老人按符合条件后的合计填写', '扣除资格与金额由纳税人据实确认'],
      source: policy,
      precision: { money: 2, rate: 6 },
      limitations: policy.limitations || [],
    });
  }

  return { calculate: calculate, progressive: progressive };
});
