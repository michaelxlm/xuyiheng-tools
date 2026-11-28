'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

const Result = require('../../assets/js/core/result');
const Core = require('../../assets/js/tool-core');
const prepay = require('../../assets/js/tools/prepay');
const random = require('../../assets/js/tools/random');
const vision = require('../../assets/js/tools/vision');
const secretMessage = require('../../assets/js/tools/secret-message');
const airQuality = require('../../assets/js/tools/air-quality');
const tax = require('../../assets/js/tools/tax');
const socialInsurance = require('../../assets/js/tools/social-insurance');
const scientific = require('../../assets/js/tools/scientific');
const percentage = require('../../assets/js/tools/percentage');
const timezone = require('../../assets/js/tools/timezone');
const buyHouse = require('../../assets/js/tools/buy-house');
const buyCar = require('../../assets/js/tools/buy-car');
const healthCheck = require('../../assets/js/tools/health-check');
const lifePlan = require('../../assets/js/tools/life-plan');
const bazi = require('../../assets/js/tools/bazi');
const horoscope = require('../../assets/js/tools/horoscope');
const natal = require('../../assets/js/tools/natal');
const tarot = require('../../assets/js/tools/tarot');
const taxPolicy = require('../../data/policies/individual-income-tax.json');
const socialPolicy = require('../../data/policies/social-insurance.json');
const aqiPolicy = require('../../data/policies/aqi.json');
const deedPolicy = require('../../data/policies/deed-tax.json');
const vehiclePolicy = require('../../data/policies/vehicle-purchase-tax.json');
const { versionTemplateAssets } = require('../../scripts/prerender');

function close(actual, expected, tolerance = 0.005) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} 应接近 ${expected}`);
}

function taxInput(overrides) {
  return Object.assign({
    salary: 10000,
    insurance: 0,
    threshold: 5000,
    bonus: 0,
    bonusMode: 'separate',
    policyYear: 2026,
    deductions: {},
  }, overrides || {});
}

function socialInput(overrides) {
  return Object.assign({
    salary: 20000,
    socialBase: 10000,
    fundBase: 10000,
    specialMonthly: 0,
    personalRates: {},
    companyRates: {},
    limits: {},
    policyYear: 2026,
  }, overrides || {});
}

function houseInput(overrides) {
  return Object.assign({
    price: 1000000,
    area: 100,
    houseCount: 'first',
    policyDate: '',
    customDeedRatePct: '',
    downPct: 100,
    years: 30,
    commercialSharePct: 100,
    commercialRatePct: '',
    fundRatePct: '',
    agentRatePct: 0,
    buyerSharePct: 100,
    otherCosts: 0,
  }, overrides || {});
}

function carInput(overrides) {
  return Object.assign({
    guidePrice: 450000,
    invoicePrice: 452000,
    invoicePriceExVat: 400000,
    vatRatePct: 13,
    purchaseDate: '2026-11-28',
    energyType: 'ev',
    taxReductionEligible: false,
    seats: 5,
    downPct: 30,
    annualRatePct: 6,
    years: 3,
    registrationFee: 500,
    serviceFee: 3000,
    decorationFee: 2000,
    chargerFee: 5000,
    otherPurchaseFees: 1000,
    compulsoryInsurance: 950,
    commercialInsurance: 5000,
    vehicleVesselTax: 480,
    holdYears: 3,
    annualKm: 12000,
    energyUsePer100: 15,
    energyPrice: 1,
    maintenancePerYear: 1200,
    parkingPerMonth: 300,
    otherAnnualCost: 600,
    renewalInsurancePerYear: 4000,
    monthlyIncome: 20000,
    otherMonthlyExpense: 5000,
  }, overrides || {});
}

function healthInput(overrides) {
  return Object.assign({
    date: healthCheck.localDate(),
    sex: 'male',
    age: 30,
    height: 170,
    weight: 70,
    activity: 'moderate',
    goal: 'maintain',
    neck: 38,
    waist: 85,
    hip: '',
  }, overrides || {});
}

function fakeStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
  };
}

test('统一结果契约包含全部必备字段', () => {
  const result = Result.create('sample', { metrics: { value: 1 } });
  for (const field of ['schemaVersion', 'toolId', 'status', 'metrics', 'details', 'formula', 'assumptions', 'source', 'precision', 'limitations', 'errors', 'generatedAt']) {
    assert.ok(Object.prototype.hasOwnProperty.call(result, field), `缺少 ${field}`);
  }
  assert.equal(result.schemaVersion, '1.0');
  assert.equal(result.status, 'success');
  assert.equal(Result.invalid('sample', '错误').status, 'invalid');
  assert.throws(() => Result.create('sample', { status: 'succes' }), /不支持的结果状态/);
});

test('模板资源版本统一由 manifest 重写', () => {
  const html = '<script src="/assets/js/slot-loader.js?v=stale"></script><link href="/assets/img/favicon.svg">';
  const rendered = versionTemplateAssets(html, { '/assets/js/slot-loader.js': 'current' });
  assert.match(rendered, /<script src="\/assets\/js\/slot-loader\.js\?v=current"><\/script>/);
  assert.match(rendered, /favicon\.svg/);
  assert.doesNotMatch(rendered, /stale/);
});

test('combo 模板不重复注入公共 slot-loader', () => {
  for (const name of ['buy-car', 'buy-house', 'life-plan', 'finance-toolkit', 'fun-test', 'color-lab', 'health-check']) {
    const html = fs.readFileSync(path.join(ROOT, 'templates/pages/combo-' + name + '.html'), 'utf8');
    assert.doesNotMatch(html, /slot-loader\.js/, `${name} 应由 prerender 统一注入 slot-loader`);
  }
});

test('共享贷款内核与提前还款模块使用同一利率口径', () => {
  close(Core.loan.annuity(10000, 12, 12), 888.49);
  const result = prepay.calculate({ principal: 10000, annualRatePct: 12, months: 12, paidMonths: 0, amount: 0, method: 'equal', mode: 'reduce' });
  assert.equal(result.status, 'success');
  close(result.metrics.monthlyPayment, 888.49);
  assert.equal(result.schedule.length, 12);
  close(result.schedule[11].balance, 0);
});

test('等额本息缩期与减月供分别重算剩余利息和计划', () => {
  const base = { principal: 10000, annualRatePct: 12, months: 12, paidMonths: 0, amount: 1000, method: 'equal' };
  const reduce = prepay.calculate(Object.assign({}, base, { mode: 'reduce' }));
  const shorten = prepay.calculate(Object.assign({}, base, { mode: 'shorten' }));
  assert.equal(reduce.status, 'success');
  assert.equal(shorten.status, 'success');
  close(reduce.metrics.monthlyPayment, 888.49);
  close(reduce.metrics.newPayment, 799.64);
  assert.equal(reduce.metrics.remainingMonthsAfterPrepay, 12);
  assert.ok(shorten.metrics.remainingMonthsAfterPrepay < 12);
  close(shorten.metrics.newPayment, 888.49);
  assert.equal(shorten.schedule.length, shorten.metrics.remainingMonthsAfterPrepay);
  close(shorten.schedule.at(-1).balance, 0);
  close(shorten.schedule.reduce((sum, row) => sum + row.principal, 0), 9000);
  assert.ok(shorten.metrics.interestAfterPrepay < reduce.metrics.interestAfterPrepay);
});

test('等额本金支持缩期、减月供与结清', () => {
  const partial = prepay.calculate({ principal: 120000, annualRatePct: 6, months: 120, paidMonths: 12, amount: 20000, method: 'principal', mode: 'shorten' });
  assert.equal(partial.status, 'success');
  close(partial.metrics.fixedPrincipal, 1000);
  assert.ok(partial.metrics.remainingMonthsAfterPrepay < 108);
  assert.equal(partial.schedule.length, partial.metrics.remainingMonthsAfterPrepay);
  close(partial.schedule.at(-1).balance, 0);

  const payoff = prepay.calculate({ principal: 10000, annualRatePct: 12, months: 12, paidMonths: 0, amount: 12000, method: 'equal', mode: 'reduce' });
  assert.equal(payoff.metrics.status, 'payoff');
  assert.equal(payoff.metrics.interestAfterPrepay, 0);
  assert.equal(payoff.metrics.remainingMonthsAfterPrepay, 0);
  assert.equal(payoff.schedule.length, 0);
  close(payoff.metrics.overpayment, 2000);

  const finalOnly = prepay.calculate({ principal: 10000, annualRatePct: 12, months: 12, paidMonths: 0, amount: 9999, method: 'equal', mode: 'shorten' });
  assert.equal(finalOnly.status, 'success');
  assert.equal(finalOnly.metrics.remainingMonthsAfterPrepay, 1);
  close(finalOnly.metrics.regularPayment, 888.49);
  close(finalOnly.metrics.newPayment, finalOnly.schedule[0].payment);
  close(finalOnly.metrics.newPayment, 1.01);
});

test('提前还款拒绝非法参数', () => {
  for (const input of [
    { principal: -1, annualRatePct: 12, months: 12 },
    { principal: 10000, annualRatePct: -1, months: 12 },
    { principal: 10000, annualRatePct: 12, months: 0 },
    { principal: 10000, annualRatePct: 12, months: 12, paidMonths: 12 },
    { principal: 10000, annualRatePct: 12, months: 12, amount: -1 },
  ]) {
    assert.equal(prepay.calculate(input).status, 'invalid');
  }
});

test('买房契税覆盖四个验收算例与 140㎡ 包含本数边界', () => {
  const cases = [
    ['first', 100, 0.01],
    ['first', 150, 0.015],
    ['second', 100, 0.01],
    ['second', 150, 0.02],
    ['first', 140, 0.01],
    ['first', 140.01, 0.015],
    ['second', 140, 0.01],
    ['second', 140.01, 0.02],
  ];
  for (const [houseCount, area, expected] of cases) {
    const result = buyHouse.calculate(houseInput({ houseCount, area }));
    assert.equal(result.status, 'success');
    close(result.metrics.deedRate, expected, 1e-12);
    close(result.metrics.deedTax, 1000000 * expected);
  }
});

test('买房第三套、旧政策日期与非法日历日期使用明确税率边界', () => {
  const missing = buyHouse.calculate(houseInput({ houseCount: 'third' }));
  assert.equal(missing.status, 'invalid');
  assert.match(missing.errors.join('；'), /3%–5%/);
  assert.ok(Number.isNaN(buyHouse.deedRate('third', 100, 2, deedPolicy)));
  assert.ok(Number.isNaN(buyHouse.deedRate('third', 100, 5.1, deedPolicy)));

  for (const customDeedRatePct of [3, 5]) {
    const result = buyHouse.calculate(houseInput({ houseCount: 'third', customDeedRatePct }));
    assert.equal(result.status, 'success');
    close(result.metrics.deedRate, customDeedRatePct / 100, 1e-12);
  }

  const invalidDate = buyHouse.calculate(houseInput({ policyDate: '2026-02-31' }));
  assert.equal(invalidDate.status, 'invalid');
  assert.match(invalidDate.errors.join('；'), /有效的 YYYY-MM-DD/);

  const legacyMissing = buyHouse.calculate(houseInput({ policyDate: '2024-11-30' }));
  assert.equal(legacyMissing.status, 'invalid');
  assert.match(legacyMissing.errors.join('；'), /请填写经当地确认/);
  assert.equal(buyHouse.calculate(houseInput({ policyDate: '2024-11-30', customDeedRatePct: 3 })).status, 'success');
  assert.equal(buyHouse.calculate(houseInput({ customDeedRatePct: 3 })).status, 'invalid');
});

test('买房组合贷款拆分月供与利息并区分现金需求和总成本', () => {
  const result = buyHouse.calculate(houseInput({
    price: 2000000,
    area: 100,
    downPct: 30,
    years: 30,
    commercialSharePct: 50,
    commercialRatePct: 4,
    fundRatePct: 3,
    agentRatePct: 1,
    otherCosts: 10000,
  }));
  assert.equal(result.status, 'success');
  const m = result.metrics;
  close(m.downPayment, 600000);
  close(m.loanPrincipal, 1400000);
  close(m.commercialPrincipal, 700000);
  close(m.fundPrincipal, 700000);
  close(m.commercialMonthlyPayment, Core.loan.annuity(700000, 4, 360));
  close(m.fundMonthlyPayment, Core.loan.annuity(700000, 3, 360));
  close(m.monthlyPayment, m.commercialMonthlyPayment + m.fundMonthlyPayment);
  close(m.totalInterest, (m.commercialMonthlyPayment + m.fundMonthlyPayment) * 360 - 1400000);
  close(m.deedTax, 20000);
  close(m.agentFee, 20000);
  close(m.upfrontCash, 650000);
  close(m.totalCost, 2050000 + m.totalInterest);
  assert.ok(result.details.some((item) => item.label === '商业贷款月供'));
  assert.ok(result.details.some((item) => item.label === '公积金贷款月供'));
  assert.ok(result.source.sources.length >= 3);
});

test('买房支持零利率、纯公积金、全款和缺失利率的确定性处理', () => {
  const zeroRate = buyHouse.calculate(houseInput({ price: 120000, downPct: 0, years: 10, commercialRatePct: 0 }));
  assert.equal(zeroRate.status, 'success');
  close(zeroRate.metrics.monthlyPayment, 1000);
  close(zeroRate.metrics.totalInterest, 0);

  const fundOnly = buyHouse.calculate(houseInput({
    price: 120000, downPct: 0, years: 10, commercialSharePct: 0, commercialRatePct: '', fundRatePct: 0,
  }));
  assert.equal(fundOnly.status, 'success');
  close(fundOnly.metrics.commercialPrincipal, 0);
  close(fundOnly.metrics.fundPrincipal, 120000);
  close(fundOnly.metrics.monthlyPayment, 1000);
  assert.equal(fundOnly.metrics.commercialRatePct, null);

  const fullCash = buyHouse.calculate(houseInput({ price: 120000, downPct: 100 }));
  assert.equal(fullCash.status, 'success');
  close(fullCash.metrics.loanPrincipal, 0);
  close(fullCash.metrics.monthlyPayment, 0);
  close(fullCash.metrics.commercialRatePct, null);

  const missing = buyHouse.calculate(houseInput({ price: 120000, downPct: 0 }));
  assert.equal(missing.status, 'invalid');
  assert.match(missing.errors.join('；'), /商业贷款金额大于 0/);
});

test('买房拒绝非法金额、套数、期限、费率与压力参数', () => {
  const cases = [
    { price: 0 },
    { area: 0 },
    { houseCount: 'fourth' },
    { years: 1.5 },
    { price: 120000, downPct: 0, commercialSharePct: 50, commercialRatePct: 4 },
    { price: 120000, downPct: 0, commercialRatePct: 101 },
    { monthlyIncome: 10000, otherMonthlyExpense: -1 },
    { monthlyIncome: 10000, incomeShockPct: 101 },
    { monthlyIncome: 10000, rateShockPct: 21 },
    { monthlyIncome: 10000, emergencyMonths: 37 },
  ];
  for (const overrides of cases) {
    assert.equal(buyHouse.calculate(houseInput(overrides)).status, 'invalid');
  }
});

test('买房现金流压力测试区分通过、储备缺口、月度赤字与未填写', () => {
  const base = { price: 120000, area: 100, downPct: 50, years: 10, commercialRatePct: 0, monthlyIncome: 1000, otherMonthlyExpense: 200, rateShockPct: 0 };
  const pass = buyHouse.calculate(houseInput(Object.assign({}, base, { availableCash: 100000 })));
  assert.equal(pass.status, 'success');
  assert.equal(pass.metrics.cashflow.status, 'pass');
  close(pass.metrics.cashflow.debtToIncomePct, 50);
  close(pass.metrics.cashflow.stressedIncome, 800);
  close(pass.metrics.cashflow.stressedSurplus, 100);
  close(pass.metrics.cashflow.fundingGap, 0);
  close(pass.metrics.cashflow.reserveGap, 0);

  const rateShock = buyHouse.calculate(houseInput(Object.assign({}, base, { availableCash: 100000, rateShockPct: 1 })));
  close(rateShock.metrics.cashflow.stressedMonthlyPayment, Core.loan.annuity(60000, 1, 120));
  assert.ok(rateShock.metrics.cashflow.stressedMonthlyPayment > rateShock.metrics.monthlyPayment);

  const shortfall = buyHouse.calculate(houseInput(Object.assign({}, base, { availableCash: 61000 })));
  assert.equal(shortfall.metrics.cashflow.status, 'reserve_shortfall');
  close(shortfall.metrics.cashflow.fundingGap, 200);
  close(shortfall.metrics.cashflow.reserveGap, 4400);

  const deficit = buyHouse.calculate(houseInput(Object.assign({}, base, { monthlyIncome: 500, availableCash: 61000 })));
  assert.equal(deficit.metrics.cashflow.status, 'deficit');
  close(deficit.metrics.cashflow.stressedSurplus, -300);

  const absent = buyHouse.calculate(houseInput({ price: 120000, downPct: 50, years: 10, commercialRatePct: 0 }));
  assert.equal(absent.metrics.cashflow.status, 'not_provided');
  assert.equal(absent.metrics.cashflow.provided, false);
  assert.equal(absent.metrics.cashflow.fundingGap, null);
});

test('买车购置税执行减半与 1.5 万元限额，不把新能源算成零税率', () => {
  close(buyCar.purchaseTax(400000, 'ev', true, 5, '2026-11-28', vehiclePolicy), 25000);
  close(buyCar.purchaseTax(140000, 'ev', true, 5, '2026-11-28', vehiclePolicy), 7000);
  close(buyCar.purchaseTax(300000, 'ev', true, 5, '2026-11-28', vehiclePolicy), 15000);
  close(buyCar.purchaseTax(339000, 'ev', true, 5, '2026-11-28', vehiclePolicy), 18900);
  close(buyCar.purchaseTax(339001, 'ev', true, 5, '2026-11-28', vehiclePolicy), 18900.10);
  close(buyCar.purchaseTax(400000, 'ev', false, 5, '2026-11-28', vehiclePolicy), 40000);
  close(buyCar.purchaseTax(400000, 'fuel', false, 5, '2026-11-28', vehiclePolicy), 40000);

  const capped = buyCar.calculate(carInput({ taxReductionEligible: true }));
  assert.equal(capped.status, 'success');
  close(capped.metrics.baseTax, 40000);
  close(capped.metrics.taxReduction, 15000);
  close(capped.metrics.purchaseTax, 25000);
  close(capped.metrics.taxablePrice, 400000);
  assert.equal(capped.source.sources.length, 4);
});

test('买车购置税校验政策日期、车型资格与九座边界', () => {
  close(buyCar.purchaseTax(400000, 'ev', true, 9, '2026-01-01', vehiclePolicy), 25000);
  close(buyCar.purchaseTax(400000, 'ev', true, 9, '2027-12-31', vehiclePolicy), 25000);
  for (const date of ['2025-12-31', '2028-01-01', '2026-02-31', '']) {
    assert.ok(Number.isNaN(buyCar.purchaseTax(400000, 'ev', true, 5, date, vehiclePolicy)));
  }
  assert.ok(Number.isNaN(buyCar.purchaseTax(400000, 'ev', true, 10, '2026-11-28', vehiclePolicy)));

  for (const overrides of [{ purchaseDate: '2028-01-01' }, { purchaseDate: '2026-02-31' }]) {
    const result = buyCar.calculate(carInput(overrides));
    assert.equal(result.status, 'invalid');
    assert.match(result.errors.join('；'), /购置日期/);
  }
  const seats = buyCar.calculate(carInput({ taxReductionEligible: true, seats: 10 }));
  assert.equal(seats.status, 'invalid');
  assert.match(seats.errors.join('；'), /9 座/);
  const missingSeats = buyCar.calculate(carInput({ taxReductionEligible: true, seats: '' }));
  assert.equal(missingSeats.status, 'invalid');
  assert.match(missingSeats.errors.join('；'), /座位数不能为空/);
  assert.equal(buyCar.calculate(carInput({ seats: '' })).status, 'success');
});

test('买车优先使用不含税价并拆分开票价、税贷与前期现金需求', () => {
  const result = buyCar.calculate(carInput());
  assert.equal(result.status, 'success');
  const m = result.metrics;
  close(m.invoicePrice, 452000);
  close(m.taxablePrice, 400000);
  close(m.purchaseTax, 40000);
  close(m.downPayment, 135600);
  close(m.loanPrincipal, 316400);
  close(m.monthlyPayment, Core.loan.annuity(316400, 6, 36));
  close(m.totalInterest, m.monthlyPayment * 36 - 316400);
  close(m.purchaseFees, 11500);
  close(m.firstYearInsurance, 6430);
  close(m.upfrontExtras, 57930);
  close(m.cashUpfront, 193530);
  close(m.landingPrice, 509930);

  const converted = buyCar.calculate(carInput({ invoicePriceExVat: '' }));
  close(converted.metrics.taxablePrice, 452000 / 1.13);
  assert.ok(result.details.some((item) => item.label === '车辆购置税'));
  assert.ok(result.details.some((item) => item.label === '签约前现金需求'));
  assert.ok(result.details.some((item) => item.label === '落地价格'));
});

test('买车持有期成本只重复后续保险并区分全款、贷款和月均口径', () => {
  const result = buyCar.calculate(carInput());
  const m = result.metrics;
  close(m.energyAnnual, 1800);
  close(m.maintenanceAnnual, 1200);
  close(m.parkingAnnual, 3600);
  close(m.otherAnnual, 600);
  close(m.monthlyOwnershipCost, (1800 + 1200 + 3600 + 600 + 4000) / 12);
  close(m.recurringDuringHold, (1800 + 1200 + 3600 + 600) * 3 + 4000 * 2);
  close(m.fullCashOwnershipTotal, m.landingPrice + m.recurringDuringHold);
  close(m.loanOwnershipTotal, m.cashUpfront + m.monthlyPayment * 36 + m.recurringDuringHold);
  close(m.monthlyBurden, m.monthlyPayment + m.monthlyOwnershipCost);
  close(m.cashflow.debtToIncomePct, m.monthlyBurden / 20000 * 100);
  close(m.cashflow.monthlySurplus, 15000 - m.monthlyBurden);

  const oneYear = buyCar.calculate(carInput({ holdYears: 1, renewalInsurancePerYear: 9000 }));
  close(oneYear.metrics.recurringDuringHold, 7200);
  const absent = buyCar.calculate(carInput({ monthlyIncome: '' }));
  assert.equal(absent.metrics.cashflow.status, 'not_provided');
  assert.equal(absent.metrics.cashflow.monthlySurplus, null);
});

test('买车贷款持有期总成本按相同持有期结清剩余本金', () => {
  const scenarios = [1, 7, 8].map((holdYears) => buyCar.calculate(carInput({
    years: 7, annualRatePct: 4, holdYears,
  })));
  for (const result of scenarios) {
    assert.equal(result.status, 'success');
    const m = result.metrics;
    const expectedPaidMonths = Math.min(84, m.holdYears * 12);
    const monthlyRate = 4 / 1200;
    const factor = Math.pow(1 + monthlyRate, 84);
    const expectedBalance = m.loanPrincipal * (factor - Math.pow(1 + monthlyRate, expectedPaidMonths)) / (factor - 1);
    close(m.paidMonths, expectedPaidMonths);
    close(m.loanPaymentsDuringHold, m.monthlyPayment * expectedPaidMonths);
    close(m.remainingPrincipalAtSale, expectedBalance);
    close(m.loanOwnershipTotal, m.cashUpfront + m.loanPaymentsDuringHold + expectedBalance + m.recurringDuringHold);
    assert.ok(result.details.some((item) => item.label === '期末结清剩余本金'));
  }
  assert.ok(scenarios[0].metrics.remainingPrincipalAtSale > 0);
  close(scenarios[1].metrics.remainingPrincipalAtSale, 0);
  close(scenarios[2].metrics.remainingPrincipalAtSale, 0);
  assert.ok(scenarios[0].metrics.loanOwnershipTotal < scenarios[1].metrics.loanOwnershipTotal);
});

test('买车支持全款、零利率、费用留空与缺失报价的确定性处理', () => {
  const full = buyCar.calculate(carInput({ downPct: 100, annualRatePct: '' }));
  assert.equal(full.status, 'success');
  close(full.metrics.monthlyPayment, 0);
  close(full.metrics.totalInterest, 0);
  assert.equal(full.metrics.annualRatePct, null);

  const zero = buyCar.calculate(carInput({
    guidePrice: '', invoicePrice: 120000, invoicePriceExVat: 120000, energyType: 'fuel',
    downPct: 0, annualRatePct: 0, registrationFee: '', serviceFee: '', decorationFee: '',
    chargerFee: '', otherPurchaseFees: '', compulsoryInsurance: '', commercialInsurance: '', vehicleVesselTax: '',
  }));
  close(zero.metrics.purchaseTax, 12000);
  close(zero.metrics.monthlyPayment, 120000 / 36);
  close(zero.metrics.totalInterest, 0);
  close(zero.metrics.firstYearInsurance, 0);
  close(zero.metrics.purchaseFees, 0);

  const missing = buyCar.calculate(carInput({ annualRatePct: '' }));
  assert.equal(missing.status, 'invalid');
  assert.match(missing.errors.join('；'), /必须填写车贷年利率/);
  assert.equal(buyCar.calculate(carInput(), null).status, 'success');
  assert.equal(buyCar.calculate(carInput(), {}).status, 'invalid');
});

test('买车拒绝非法金额、税率、资格、期限和费用', () => {
  const cases = [
    { invoicePrice: 0 },
    { invoicePriceExVat: 500000 },
    { invoicePriceExVat: '', vatRatePct: 100 },
    { energyType: 'hybrid-unknown' },
    { energyType: 'fuel', taxReductionEligible: true },
    { taxReductionEligible: true, seats: 5.5 },
    { years: 1.5 },
    { holdYears: 1.5 },
    { downPct: 101 },
    { annualRatePct: -1 },
    { registrationFee: -1 },
    { commercialInsurance: -1 },
    { energyPrice: -1 },
    { monthlyIncome: -1 },
  ];
  for (const overrides of cases) {
    assert.equal(buyCar.calculate(carInput(overrides)).status, 'invalid');
  }
});

test('买车桥接只携带白名单数值且不带车辆与资产字段', () => {
  const href = Core.bridge.link('/combo/life-plan.html', {
    'lp-income': 20000, 'lp-expense': 5933.33, 'lp-debt': 9665.71,
    'bc-invoice': 452000, 'bc-income': 20000, 'lp-assets': null,
  }, { source: 'buy-car' });
  const payload = JSON.parse(decodeURIComponent(href.split('#s=')[1]));
  assert.equal(payload['lp-income'], 20000);
  assert.equal(payload['lp-expense'], 5933.33);
  assert.equal(payload['lp-debt'], 9665.71);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'lp-assets'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'bc-invoice'), false);
  assert.equal(payload.__bridge.source, 'buy-car');
});

test('跨页桥接只保留目标白名单字段并校验类型和来源', () => {
  const target = '/combo/life-plan.html';
  const href = Core.bridge.link(target, {
    'lp-income': 12000,
    'lp-expense': -1,
    'lp-debt': '3500.25',
    'bh-price': 2000000,
  }, { source: 'buy-house' });
  const payload = JSON.parse(decodeURIComponent(href.split('#s=')[1]));
  assert.equal(payload['lp-income'], 12000);
  assert.equal(payload['lp-debt'], 3500.25);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'lp-expense'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'bh-price'), false);
  assert.deepEqual(payload.__bridge, { version: '1', source: 'buy-house', target });
  assert.deepEqual(Core.bridge.allowed(target, { 'lp-income': 12000, 'lp-expense': -1, 'bh-price': 2000000 }), { 'lp-income': 12000 });
  assert.equal(Core.bridge.link('/unknown.html', { value: 1 }, { source: 'buy-house' }), '/unknown.html');
  const nodeDefault = Core.bridge.link(target, { 'lp-debt': 100 });
  assert.equal(JSON.parse(decodeURIComponent(nodeDefault.split('#s=')[1])).__bridge.source, 'unknown');
});

test('安全整数随机覆盖大跨度且不重复模式保持局部采样', () => {
  const values = random.uniqueIntegers(0, Number.MAX_SAFE_INTEGER, 5);
  assert.equal(values.length, 5);
  assert.equal(new Set(values).size, 5);
  for (const value of values) assert.ok(Number.isSafeInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER);

  const local = random.uniqueIntegers(10, 19, 10);
  assert.deepEqual(local.slice().sort((a, b) => a - b), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  const result = random.calculate({ min: 0, max: Number.MAX_SAFE_INTEGER, count: 3, type: 'int', unique: true });
  assert.equal(result.status, 'success');
  assert.equal(result.metrics.secure, true);
});

test('随机数拒绝不安全整数与超额不重复请求', () => {
  assert.throws(() => random.integer(0, Number.MAX_SAFE_INTEGER + 1));
  assert.throws(() => random.uniqueIntegers(1, 2, 3));
  assert.equal(random.calculate({ min: 0, max: 10, count: 0 }).status, 'invalid');
  const float = random.randomFloat(-2, 2);
  assert.ok(float >= -2 && float <= 2);
  close(Math.round(float * 100) / 100, float);
  assert.throws(() => random.randomFloat(0.004, 0.005), /不存在合法的两位小数/);
  assert.throws(() => random.randomFloat(-1e308, 1e308), /安全计算范围/);
  const bounded = random.calculate({ min: 0.1, max: 0.9, count: 20, type: 'float' });
  assert.equal(bounded.status, 'success');
  for (const value of bounded.metrics.values) assert.ok(value >= 0.1 && value <= 0.9);
});

test('视力状态机只在实际连续通过后记录等级', () => {
  const state = vision.start(vision.createState());
  for (const level of [0.5, 0.6, 0.8]) {
    vision.recordAnswer(state, true);
    vision.recordAnswer(state, true);
    assert.equal(state.maxPass, level);
  }
  assert.equal(state.li, vision.levels.indexOf(1.0));
  vision.recordAnswer(state, true);
  assert.equal(state.maxPass, 0.8);
  vision.recordAnswer(state, true);
  assert.equal(state.maxPass, 1.0);
  close(vision.mmForAcuity(1.0, 5), 7.27, 0.01);
  assert.equal(vision.minReliablePx, 6);
  assert.equal(vision.recordAnswer(vision.createState(), true).changed, false);
});

test('密语使用认证加密，篡改密文无法解密', async () => {
  const plaintext = '只属于这次分享的密语';
  const encoded = await secretMessage.encrypt(plaintext);
  assert.ok(!encoded.includes(plaintext));
  assert.equal(await secretMessage.decrypt(encoded), plaintext);
  assert.equal(secretMessage.fromHash('#msg=' + encodeURIComponent(encoded)), encoded);
  assert.equal(secretMessage.fromHash('#msg=%'), null);

  const payload = secretMessage.decode(encoded);
  const ciphertext = Buffer.from(payload.ct, 'base64url');
  ciphertext[ciphertext.length - 1] ^= 1;
  payload.ct = ciphertext.toString('base64url');
  await assert.rejects(secretMessage.decrypt(payload));
});

test('AQI=0 合法，空值与恶意字段被安全处理', () => {
  assert.equal(airQuality.classify(0, aqiPolicy).label, '优');
  assert.equal(airQuality.classify('', aqiPolicy), null);
  const malicious = '<img src=x onerror=alert(1)>';
  const data = airQuality.normalizeResponse({ code: 0, data: { aqi: 0, area: malicious, primary_pollutant: malicious, pm2_5: malicious } }, '北京', aqiPolicy);
  assert.equal(data.aqi, 0);
  assert.equal(data.quality, '优');
  assert.equal(data.area, malicious);
  assert.equal(data.primaryPollutant, '无');
  assert.equal(data.pm2_5, malicious);
  assert.equal(airQuality.normalizeResponse({ code: 0, data: { aqi: '' } }, '北京', aqiPolicy), null);
  assert.equal(airQuality.normalizeResponse({ code: 0, data: {} }, '北京', aqiPolicy), null);
});

test('AQI 缓存 30 分钟有效并支持过期降级', () => {
  const storage = fakeStorage();
  const now = 1000000;
  const data = { aqi: 0, quality: '优' };
  airQuality.writeCache(storage, '北京', data, now);
  const fresh = airQuality.readCache(storage, '北京', now + airQuality.ttlMs);
  assert.equal(fresh.cached, true);
  assert.equal(fresh.stale, false);
  assert.equal(airQuality.readCache(storage, '北京', now + airQuality.ttlMs + 1), null);
  const stale = airQuality.readCache(storage, '北京', now + airQuality.ttlMs + 1, true);
  assert.equal(stale.cached, true);
  assert.equal(stale.stale, true);
  assert.equal(airQuality.readCache(null, '北京', now), null);

  storage.setItem(airQuality.cacheKey('北京'), JSON.stringify({ fetchedAt: now, data: { aqi: 'oops' } }));
  assert.equal(airQuality.readCache(storage, '北京', now), null);
  assert.equal(storage.getItem(airQuality.cacheKey('北京')), null);
});

test('个税固定算例、年终奖与互斥校验', () => {
  const result = tax.calculate(taxInput());
  assert.equal(result.status, 'success');
  close(result.metrics.tax, 290);
  close(result.metrics.afterTax, 9710);

  const blankOptional = tax.calculate(taxInput({
    insurance: '',
    deductions: { childEducation: '', infantCare: '', medicalAnnualExpense: '' },
  }));
  assert.equal(blankOptional.status, 'success');
  close(blankOptional.metrics.tax, 290);

  const bonus = tax.calculate(taxInput({ bonus: 36000 }));
  close(bonus.metrics.bonusTax, 1080);
  close(bonus.metrics.tax, 1370);
  close(bonus.metrics.afterTax, 44630);

  const invalid = tax.calculate(taxInput({ deductions: { mortgageInterest: 1000, housingRent: 1500 } }));
  assert.equal(invalid.status, 'invalid');
  assert.match(invalid.errors.join('；'), /不能同时扣除/);
});

test('个税大病医疗年度限额与婴幼儿照护生效', () => {
  const medical = tax.calculate(taxInput({ salary: 30000, deductions: { medicalAnnualExpense: 95000 } }));
  assert.equal(medical.status, 'success');
  close(medical.metrics.monthlyDeductions, 80000 / 12);
  const medicalDetail = medical.details.find((item) => item.label === '大病医疗年度可扣除');
  assert.equal(String(medicalDetail.value) + ' ' + medicalDetail.note, '80000 元/年，月均 6666.67 元');

  const infant = tax.calculate(taxInput({ deductions: { infantCare: 2000 } }));
  close(infant.metrics.monthlyDeductions, 2000);
  close(infant.metrics.tax, 90);

  const vocational = tax.calculate(taxInput({ deductions: { vocationalEducationAnnual: 3600 } }));
  close(vocational.metrics.monthlyDeductions, 300);
  close(vocational.metrics.tax, 260);
});

test('社保分离工资与两类基数并共享个税政策', () => {
  const result = socialInsurance.calculate(socialInput(), socialPolicy, taxPolicy);
  assert.equal(result.status, 'success');
  close(result.metrics.personalTotal, 2250);
  // 当前政策月度税率表：12750 元适用 20% 档，速算扣除数 1410 元。
  // 因此月税为 1140 元、到手 16610 元；原计划中的 1065/16685 与税率表不一致。
  close(result.metrics.taxable, 12750);
  close(result.metrics.tax, 1140);
  close(result.metrics.net, 16610);
  assert.ok(result.source.urls.length >= 4);
});

test('社保支持基数夹取并拒绝非法费率与上下限', () => {
  const clamped = socialInsurance.calculate(socialInput({ limits: { socialMin: 11000, socialMax: 20000, fundMin: 9000, fundMax: 12000 } }), socialPolicy, taxPolicy);
  assert.equal(clamped.status, 'success');
  assert.equal(clamped.metrics.socialBase, 11000);
  assert.equal(clamped.metrics.fundBase, 10000);

  for (const input of [
    socialInput({ personalRates: { pension: -1 } }),
    socialInput({ companyRates: { injury: 101 } }),
    socialInput({ limits: { socialMin: 20000, socialMax: 10000 } }),
    socialInput({ salary: Number.NaN }),
  ]) {
    assert.equal(socialInsurance.calculate(input, socialPolicy, taxPolicy).status, 'invalid');
  }
});

test('科学计算器区分 DEG/RAD、atan 比值输入与未定义边界', () => {
  const tan90 = scientific.calculate({ value: 90, method: 'tan', angleMode: 'deg' });
  assert.equal(tan90.status, 'invalid');
  assert.match(tan90.errors.join('；'), /无定义/);

  const atan90 = scientific.calculate({ value: 90, method: 'atan', angleMode: 'deg' });
  assert.equal(atan90.status, 'success');
  close(atan90.metrics.value, 89.363406, 0.001);
  assert.equal(atan90.metrics.resultUnit, '°');
  close(scientific.calculate({ value: 1, method: 'atan', angleMode: 'rad' }).metrics.value, Math.PI / 4);
  close(scientific.calculate({ value: 90, method: 'sin', angleMode: 'deg' }).metrics.value, 1);

  for (const input of [
    { value: -1, method: 'sqrt' },
    { value: 0, method: 'log' },
    { value: 710, method: 'exp' },
    { value: 171, method: 'factorial' },
    { value: '', method: 'abs' },
  ]) assert.equal(scientific.calculate(input).status, 'invalid');
});

test('百分比覆盖百分点、相对变化与 -100% 还原奇点', () => {
  const points = percentage.calculate({ mode: 'points', a: 5, b: 8 });
  assert.equal(points.status, 'success');
  assert.equal(points.metrics.value, 3);
  assert.equal(points.metrics.unit, '个百分点');
  assert.equal(points.metrics.relativeChange, 60);

  const restore = percentage.calculate({ mode: 'restore', a: -100, b: 0 });
  assert.equal(restore.status, 'invalid');
  assert.match(restore.errors.join('；'), /不存在有限原值/);
  assert.equal(percentage.calculate({ mode: 'growth', a: 0, b: 1 }).status, 'invalid');
  assert.equal(percentage.calculate({ mode: 'share', a: 1, b: 0 }).status, 'invalid');
  close(percentage.calculate({ mode: 'growth', a: 100, b: 0 }).metrics.value, -100);

  const extremeGrowth = percentage.calculate({ mode: 'growth', a: -1e308, b: 1e308 });
  assert.equal(extremeGrowth.status, 'success');
  close(extremeGrowth.metrics.value, -200);
  assert.equal(Object.prototype.hasOwnProperty.call(extremeGrowth.metrics, 'change'), false);
  assert.equal(percentage.calculate({ mode: 'share', a: 1e308, b: 1e-308 }).status, 'invalid');
  assert.equal(percentage.calculate({ mode: 'points', a: -1e308, b: 1e308 }).status, 'invalid');
  close(percentage.calculate({ mode: 'value', a: 1e308, b: 1e-308 }).metrics.value, 0.01, 1e-12);
});

test('时区使用 IANA 规则识别 DST 跳空、重复与半小时偏移', () => {
  assert.equal(timezone.resolve({ date: '2026-03-08', time: '02:30', from: 'America/New_York' }).status, 'nonexistent');
  const fold = timezone.resolve({ date: '2026-11-01', time: '01:30', from: 'America/New_York' });
  assert.equal(fold.status, 'ambiguous');
  assert.equal(fold.candidates.length, 2);

  const converted = timezone.calculate({ date: '2026-11-01', time: '01:30', from: 'America/New_York', to: 'Asia/Kolkata', candidateIndex: 0 });
  assert.equal(converted.status, 'success');
  assert.equal(converted.metrics.target, '2026-11-01 11:00:00');
  assert.equal(converted.metrics.differenceMinutes, 570);
  assert.equal(converted.metrics.targetOffset, 'UTC+05:30');
  assert.equal(timezone.resolve({ date: '2026-02-31', time: '10:00', from: 'Asia/Shanghai' }).status, 'invalid');

  const emptyWindows = timezone.overlap({ date: '2026-11-02', from: 'Asia/Shanghai', to: 'America/New_York', start: '09:00', end: '18:00' });
  assert.deepEqual(emptyWindows, []);

  const windows = timezone.overlap({ date: '2026-11-02', from: 'Europe/London', to: 'Europe/Paris', start: '09:00', end: '18:00' });
  assert.equal(windows.length, 1);
  assert.equal(windows[0].fromStart, '2026-11-02 09:00:00');
  assert.equal(windows[0].fromEnd, '2026-11-02 17:00:00');
  assert.equal(windows[0].toStart, '2026-11-02 10:00:00');
  assert.equal(windows[0].toEnd, '2026-11-02 18:00:00');
  assert.ok(windows[0].endUtcMs > windows[0].startUtcMs);

  const previousDay = timezone.overlap({ date: '2026-01-15', from: 'Asia/Shanghai', to: 'America/Los_Angeles', start: '09:00', end: '18:00' });
  assert.equal(previousDay.length, 1);
  assert.equal(previousDay[0].fromStart, '2026-01-15 09:00:00');
  assert.equal(previousDay[0].fromEnd, '2026-01-15 10:00:00');
  assert.equal(previousDay[0].toStart, '2026-01-14 17:00:00');
  assert.equal(previousDay[0].toEnd, '2026-01-14 18:00:00');
  assert.equal(previousDay[0].utc, '2026-01-15 01:00:00 ~ 2026-01-15 02:00:00');

  const nextDay = timezone.overlap({ date: '2026-01-15', from: 'America/Los_Angeles', to: 'Asia/Shanghai', start: '09:00', end: '18:00' });
  assert.equal(nextDay.length, 1);
  assert.equal(nextDay[0].fromStart, '2026-01-15 17:00:00');
  assert.equal(nextDay[0].fromEnd, '2026-01-15 18:00:00');
  assert.equal(nextDay[0].toStart, '2026-01-16 09:00:00');
  assert.equal(nextDay[0].toEnd, '2026-01-16 10:00:00');
  assert.equal(nextDay[0].utc, '2026-01-16 01:00:00 ~ 2026-01-16 02:00:00');

  const ics = timezone.ics({ startUtcMs: Date.UTC(2026, 10, 2, 9), endUtcMs: Date.UTC(2026, 10, 2, 10), title: '测试会议' });
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART:\d{8}T\d{6}Z/);
});

test('健康成人指标使用中国成人口径与固定公式算例', () => {
  const result = healthCheck.calculate(healthInput());
  assert.equal(result.status, 'success');
  const m = result.metrics;
  close(m.bmi, 24.221453);
  assert.equal(m.bmiCategory, '超重');
  close(m.healthyWeight.min, 53.465);
  close(m.healthyWeight.max, 69.071);
  close(m.idealWeight, 65.9370079);
  close(m.bmr, 1617.5);
  close(m.tdee, 2507.125);
  close(m.goalCalories, 2507.125);
  close(healthCheck.calculate(healthInput({ goal: 'cut' })).metrics.goalCalories, 2107.125);
  close(healthCheck.calculate(healthInput({ goal: 'gain' })).metrics.goalCalories, 2757.125);
  close(m.bodyFat, 17.889474, 0.001);
  close(m.waistToHeight, 0.5);
  assert.equal(m.waistCategory, '未达到中心型肥胖腰围界值');
  assert.ok(result.formula.includes('Devine'));
  assert.ok(result.source.sources.length >= 6);
});

test('健康 5–17 岁仅保留 BMI 数值并关闭成人解释', () => {
  for (const age of [5, 17]) {
    const result = healthCheck.calculate(healthInput({ age, height: age === 5 ? 110 : 165, weight: age === 5 ? 20 : 55 }));
    assert.equal(result.status, 'success');
    const m = result.metrics;
    assert.equal(m.ageGroup, 'child');
    close(m.bmi, age === 5 ? 16.528926 : 20.202268);
    for (const field of ['bmiCategory', 'healthyWeight', 'idealWeight', 'bmr', 'tdee', 'goalCalories', 'bodyFat', 'activity', 'activityFactor', 'goal', 'waistCategory']) {
      assert.equal(m[field], null, `${age} 岁不应输出 ${field}`);
    }
    assert.ok(result.limitations.join('；').includes('百分位或生长曲线'));
  }
});

test('健康年龄缺失与非法测量日期返回明确错误', () => {
  for (const age of ['', null, 'abc', 4, 121, 30.5]) {
    const result = healthCheck.calculate(healthInput({ age }));
    assert.equal(result.status, 'invalid');
    assert.match(result.errors.join('；'), /年龄/);
  }
  const tomorrow = new Date(Date.now() + 86400000);
  const future = healthCheck.localDate(tomorrow);
  for (const date of ['', '2026-02-31', '2026-13-01', future]) {
    const result = healthCheck.calculate(healthInput({ date }));
    assert.equal(result.status, 'invalid');
    assert.match(result.errors.join('；'), /测量日期/);
  }
  const extreme = healthCheck.calculate(healthInput({ age: 120, height: 50, weight: 2 }));
  assert.equal(extreme.status, 'invalid');
  assert.match(extreme.errors.join('；'), /正数结果/);
});

test('健康 Navy 围度法处理男女公式、缺失围度和非法差值', () => {
  close(healthCheck.bodyFatNavy('male', 180, 38, 85), 16.150806, 0.001);
  close(healthCheck.bodyFatNavy('female', 165, 32, 72, 96), 26.679406, 0.001);
  assert.ok(Number.isNaN(healthCheck.bodyFatNavy('male', 180, '', 85)));
  assert.ok(Number.isNaN(healthCheck.bodyFatNavy('male', 180, 90, 85)));
  assert.ok(Number.isNaN(healthCheck.bodyFatNavy('female', 165, 32, 72, '')));
  assert.equal(healthCheck.calculate(healthInput({ waist: '' })).metrics.bodyFat, null);
  assert.equal(healthCheck.calculate(healthInput({ sex: 'female', hip: '' })).metrics.bodyFat, null);
});

test('健康记录按测量日期和保存时间稳定排序并支持按索引删除', () => {
  const future = healthCheck.localDate(new Date(Date.now() + 86400000));
  const rows = [
    { date: '2026-11-25', w: 70, h: 170, age: 30, t: 1 },
    { date: '2026-11-28', w: 69, h: 170, age: 30, t: 2 },
    { date: '2026-11-27', w: 71, h: 170, age: 30, t: 3 },
    { date: '2026-11-28', w: 68.5, h: 170, age: 30, t: 4 },
    { date: '2026-11-28', w: 68, h: 170, age: 30, t: 4 },
    { date: '2026-02-31', w: 60, h: 170, age: 30, t: 9 },
    { date: future, w: 99, h: 170, age: 30, t: 10 },
  ];
  const normalized = healthCheck.normalizeHistory(rows);
  assert.deepEqual(normalized.map((row) => row.w), [68.5, 68, 69, 71, 70]);
  const summary = healthCheck.summarizeHistory(rows);
  assert.equal(summary.current.w, 68.5);
  assert.equal(summary.first.w, 70);
  close(summary.delta, -1.5);
  assert.deepEqual(summary.chart.map((row) => row.date), ['2026-11-25', '2026-11-27', '2026-11-28', '2026-11-28', '2026-11-28']);
  assert.deepEqual(healthCheck.removeAt(rows, 0).map((row) => row.w), [68, 69, 71, 70]);
  assert.equal(healthCheck.removeAt(rows, 99).length, normalized.length);
});

test('健康旧记录不向儿童或未知年龄回显成人体脂与 TDEE', () => {
  const rows = healthCheck.normalizeHistory([
    { date: '2026-11-28', w: 20, h: 110, age: 5, bf: 16, tdee: 1200 },
    { date: '2026-11-27', w: 70, h: 170, bf: 16, tdee: 2500 },
    { date: '2026-11-26', w: 70, h: 170, age: 30, bf: 16, tdee: 2500 },
  ]);
  assert.deepEqual(rows.map((row) => [row.ageGroup, row.bf, row.tdee]), [
    ['child', null, null], ['unknown', null, null], ['adult', 16, 2500],
  ]);
});

 function lifeInput(overrides) {
   return Object.assign({
     income: 10000, expense: 8000, debtPayment: 0, assets: 0,
     annualRatePct: 5, lowRatePct: 3, highRatePct: 7, years: 10,
     inflationPct: 0, withdrawalRatePct: 4, goalAnnualExpense: 48000, timing: 'end',
     debtPrincipal: '', debtAnnualRatePct: '', debtRemainingMonths: '',
   }, overrides || {});
 }

 test('人生规划使用有效年利率并区分期初与期末供款', () => {
   close(lifePlan.monthlyRate(6), Math.pow(1.06, 1 / 12) - 1, 1e-12);
   close(lifePlan.futureValue(10000, 1000, 6, 120, 'end'), 180381.92, 0.02);
   close(lifePlan.futureValue(10000, 1000, 6, 120, 'begin'), 181172.77, 0.02);
   close(lifePlan.futureValue(10000, 1000, 0, 120, 'end'), 130000);
   const result = lifePlan.calculate(lifeInput());
   assert.equal(result.status, 'success');
   close(result.metrics.projection, 308726.3226029319, 0.02);
   close(result.metrics.requiredMonthly, 7773.88, 0.02);
   assert.ok(result.source.sources.length >= 2);
 });

 test('人生规划统一预测与达成时间，且两投入时点相差小于一个月', () => {
   const end = lifePlan.timeToTarget(0, 1200000, 1000, 5, 'end');
   const begin = lifePlan.timeToTarget(0, 1200000, 1000, 5, 'begin');
   assert.deepEqual(end, { status: 'reached', months: 437 });
   assert.deepEqual(begin, { status: 'reached', months: 436 });
   const continuous = (timing) => {
     const i = lifePlan.monthlyRate(5);
     const k = 1000 * (timing === 'begin' ? 1 + i : 1) / i;
     return Math.log(1 + 1200000 / k) / Math.log1p(i);
   };
   assert.ok(Math.abs(continuous('end') - continuous('begin')) < 1);
   assert.deepEqual(lifePlan.timeToTarget(200000, 200000, 0, 5, 'end'), { status: 'reached', months: 0 });
   assert.deepEqual(lifePlan.timeToTarget(100000, 200000, 1000, -6, 'end'), { status: 'unreachable', months: null });
   assert.equal(lifePlan.timeToTarget(0, 100000, 1000, -6, 'end').status, 'reached');
   assert.deepEqual(lifePlan.timeToTarget(10000, 200000, 1000, 0, 'end'), { status: 'reached', months: 190 });
   assert.equal(lifePlan.timeToTarget(10000, 1000000, 1, 0, 'end').status, 'beyond_range');
 });

 test('人生规划负结余显示赤字与耗尽，不产生虚假正收益达标', () => {
   const deficit = lifePlan.calculate(lifeInput({ income: 10000, expense: 12000 }));
   assert.equal(deficit.status, 'success');
   assert.equal(deficit.metrics.currentSurplus, -2000);
   assert.equal(deficit.metrics.projection, 0);
   assert.ok(deficit.metrics.fundingGap > 0);
   assert.equal(deficit.metrics.gain, null);
   assert.equal(deficit.metrics.scenarios[1].total, 0);
   assert.equal(deficit.metrics.depletedAt, 1);
   assert.equal(deficit.metrics.goalTime.status, 'unreachable');
   assert.ok(deficit.metrics.scenarios.every((item) => item.fundingGap > 0));
   assert.ok(deficit.details.some((item) => item.label === '月度现金流状态' && item.value === '赤字'));
   assert.ok(deficit.details.some((item) => item.label === '资产耗尽提示'));
 });

 test('人生规划债务还清后释放现金流并统一目标时间口径', () => {
   const result = lifePlan.calculate(lifeInput({
     income: 15000, expense: 7000, debtPayment: 3000, assets: 100000,
     debtPrincipal: 100000, debtAnnualRatePct: 6, debtRemainingMonths: 36,
   }));
   assert.equal(result.status, 'success');
   assert.equal(result.metrics.currentSurplus, 5000);
   assert.equal(result.metrics.afterPayoffSurplus, 8000);
   close(result.metrics.estimatedDebtPayment, 3034.9973845817053, 0.02);
   const debtMonthlyRate = lifePlan.monthlyRate(6);
   close(result.metrics.estimatedDebtPayment, 100000 * debtMonthlyRate / (1 - Math.pow(1 + debtMonthlyRate, -36)), 1e-8);
   const automatic = lifePlan.calculate(lifeInput({
     income: 15000, expense: 7000, debtPayment: 0, assets: 100000,
     debtPrincipal: 100000, debtAnnualRatePct: 6, debtRemainingMonths: 36,
   }));
   assert.equal(automatic.status, 'success');
   assert.equal(automatic.metrics.payoffMonth, 36);
   for (const term of [936, 1200]) {
     const longTerm = lifePlan.calculate(lifeInput({
       debtPayment: 0, debtPrincipal: 100000, debtAnnualRatePct: 30, debtRemainingMonths: term,
     }));
     assert.equal(longTerm.status, 'success');
     assert.equal(longTerm.metrics.payoffMonth, term);
   }
   const zeroBalance = lifePlan.calculate(lifeInput({
     debtPayment: 3000, debtPrincipal: 0, debtAnnualRatePct: 0, debtRemainingMonths: 12,
   }));
   assert.equal(zeroBalance.status, 'success');
   assert.equal(zeroBalance.details.find((item) => item.label === '规划期内释放现金流').value, 0);
   assert.equal(result.metrics.debtRemainingMonths, 36);
   assert.equal(result.metrics.payoffMonth, 37);
   close(result.metrics.invested, 100000 + 5000 * 37 + 8000 * 83);
   assert.ok(result.details.some((item) => item.label === '规划期内释放现金流' && Math.abs(item.value - 249000) < 0.01));
   const requiredPath = lifePlan.futureValue(
     lifePlan.futureValue(100000, result.metrics.requiredMonthly, 5, 37, 'end'),
     result.metrics.requiredMonthly + 3000, 5, 83, 'end'
   );
   close(requiredPath, result.metrics.goalTarget, 0.02);
   assert.ok(result.metrics.requiredMonthly < lifePlan.requiredMonthly(100000, result.metrics.goalTarget, 5, 120, 'end'));
   assert.ok(result.metrics.goalTime.months <= 120);
   assert.equal(lifePlan.calculate(lifeInput({ debtPrincipal: 100000, debtAnnualRatePct: 6, debtRemainingMonths: 36, debtPayment: 400 })).status, 'invalid');
   const withoutSchedule = lifePlan.calculate(lifeInput({ income: 15000, expense: 7000, debtPayment: 3000 }));
   assert.equal(withoutSchedule.metrics.debtRemainingMonths, null);
   assert.equal(withoutSchedule.metrics.afterPayoffSurplus, 8000);
   close(withoutSchedule.metrics.invested, 600000);
 });

 test('人生规划耗尽后截断负账户并从零重启，所需储蓄不为负', () => {
   const restarted = lifePlan.calculate(lifeInput({
     income: 15000, expense: 14000, debtPayment: 3000, assets: 0,
     debtPrincipal: 3000, debtAnnualRatePct: 0, debtRemainingMonths: 1,
   }));
   assert.equal(restarted.status, 'success');
   assert.equal(restarted.metrics.depletedAt, 1);
   close(restarted.metrics.fundingGap, 2000);
   close(restarted.metrics.projection, lifePlan.futureValue(0, 1000, 5, 119, 'end'), 0.02);
   assert.ok(restarted.metrics.scenarios.every((item) => item.depletedAt === 1 && item.fundingGap === 2000));
   const requiredPath = lifePlan.simulateAssetPath(0, restarted.metrics.requiredMonthly,
     restarted.metrics.requiredMonthly + 3000, 5, 120, 'end', 1);
   assert.ok(requiredPath.balance >= restarted.metrics.goalTarget - 0.02);

   const compoundOnly = lifePlan.calculate(lifeInput({ assets: 800000 }));
   assert.equal(compoundOnly.metrics.requiredMonthly, 0);
   assert.equal(compoundOnly.metrics.goalTime.status, 'reached');
   assert.equal(lifePlan.requiredMonthly(800000, 1200000, 5, 120, 'end'), 0);
 });

 test('人生规划三情景使用绝对收益率且负收益情景不颠倒', () => {
   const result = lifePlan.calculate(lifeInput({ annualRatePct: -2, lowRatePct: -5, highRatePct: 1 }));
   assert.equal(result.status, 'success');
   const totals = result.metrics.scenarios.map((item) => item.total);
   assert.ok(totals[0] < totals[1] && totals[1] < totals[2]);
   assert.deepEqual(result.metrics.scenarios.map((item) => item.annualRatePct), [-5, -2, 1]);
   assert.equal(lifePlan.calculate(lifeInput({ annualRatePct: -2, lowRatePct: -1, highRatePct: 1 })).status, 'invalid');
 });

 test('人生规划按今天购买力解释目标并使用费雪实际收益率', () => {
   const result = lifePlan.calculate(lifeInput({ assets: 100000, annualRatePct: 3, inflationPct: 4, withdrawalRatePct: 3.5 }));
   assert.equal(result.status, 'success');
   close(result.metrics.realRatePct, -0.96153846, 1e-8);
   close(result.metrics.goalTarget, 48000 / 0.035);
   close(result.metrics.realProjection, result.metrics.projection / Math.pow(1.04, 10));
   assert.ok(result.details.some((item) => item.label === '财务自由目标资产（今天购买力）'));
   assert.ok(result.details.some((item) => item.label === '实际年收益率'));
 });

 test('人生规划校验金额、期限、提取率、债务与极值边界', () => {
   for (const overrides of [
     { income: '' }, { income: 0 }, { expense: -1 }, { assets: -1 }, { annualRatePct: -100 },
     { years: 1.5 }, { years: 61 }, { withdrawalRatePct: 0 }, { inflationPct: -1 },
     { timing: 'middle' }, { debtPrincipal: 1000 },
     { debtPrincipal: 1000, debtAnnualRatePct: 5, debtRemainingMonths: 1.5 },
   ]) assert.equal(lifePlan.calculate(lifeInput(overrides)).status, 'invalid');
  const largeFinite = lifePlan.calculate(lifeInput({ annualRatePct: 1000, lowRatePct: 998, highRatePct: 1000, years: 60 }));
  assert.equal(largeFinite.status, 'success');
  assert.ok(isFinite(largeFinite.metrics.projection));
  const highScenario = lifePlan.calculate(lifeInput({ annualRatePct: 5, highRatePct: 1000, years: 60 }));
  assert.equal(highScenario.status, 'success');
  assert.ok(highScenario.metrics.scenarios.every((item) => isFinite(item.total) && isFinite(item.fundingGap)));
 });

 test('人生规划显式桥接仅携带目标白名单数值', () => {
   const href = Core.bridge.link('/combo/finance-toolkit.html', {
     'ci-p': 100000, 'ci-m': 24000, 'ci-r': 5, 'ci-y': 10, 'lp-income': 10000,
   }, { source: 'life-plan' });
   const payload = JSON.parse(decodeURIComponent(href.split('#s=')[1]));
   assert.deepEqual(Object.keys(payload).sort(), ['__bridge', 'ci-m', 'ci-p', 'ci-r', 'ci-y']);
   assert.equal(payload.__bridge.source, 'life-plan');
 });

 test('八字请求默认不留痕，未知时辰移除时间字段并拒绝非法组合', () => {
   const input = { date: '1990-06-15', hour: 11, minute: 30, asOfDate: '2026-11-28', gender: 'unknown' };
   const body = bazi.requestBody(input);
   assert.equal(body.ok, true);
   assert.equal(body.value.tool, 'bazi');
   assert.equal(body.value.retain, false);
   assert.equal(body.value.input.hour, 11);
   assert.equal(body.value.input.minute, 30);
   assert.equal(body.value.input.gender, 'unknown');
   assert.equal(bazi.requestBody(input, true).value.retain, true);
   assert.match(bazi.requestBody(input, true).value.requestId, /^[A-Za-z0-9_-]{16,80}$/);

   const unknown = bazi.requestBody(Object.assign({}, input, { timePrecision: 'unknown', hour: '', minute: '' }));
   assert.equal(unknown.ok, true);
   assert.equal(Object.prototype.hasOwnProperty.call(unknown.value.input, 'hour'), false);
   assert.equal(Object.prototype.hasOwnProperty.call(unknown.value.input, 'minute'), false);
   assert.equal(Object.prototype.hasOwnProperty.call(unknown.value.input, 'longitude'), false);

   for (const invalid of [
     Object.assign({}, input, { date: '2026-02-30' }),
     Object.assign({}, input, { hour: 24 }),
     Object.assign({}, input, { minute: 60 }),
     Object.assign({}, input, { timeBasis: 'true-solar', longitude: 181 }),
     Object.assign({}, input, { timePrecision: 'unknown', timeBasis: 'true-solar', longitude: 120 }),
   ]) {
     assert.equal(bazi.requestBody(invalid).ok, false);
   }
 });

 test('八字结果包装披露历法版本、候选边界与未知信息限制', () => {
   const payload = {
     retained: false,
     result: {
       dayMaster: '己', dayElement: '土', tendency: '中和', strengthIndex: 50,
       certainty: 'ambiguous', timePillar: { unknown: true },
       dayun: { enabled: false, direction: '不排', reason: '时辰未知，无法确定起运时间', items: [] },
       calendar: { version: 'lunar-javascript@1.7.3', timeBasis: 'beijing', inputTimeKnown: false, adjustedDateTime: null, lateZiRule: 'same-day', asOfDate: '2026-11-28', note: '输入与交节时刻均按北京时间处理' },
       pillars: [
         { name: '年柱', ganzhi: '丙午', hidden: [], nayin: '天河水', chengSheng: '临官', god: '伤官' },
         { name: '月柱', ganzhi: '庚寅', hidden: [], nayin: '松柏木', chengSheng: '死', god: '比肩' },
         { name: '日柱', ganzhi: '己酉', hidden: [], nayin: '大驿土', chengSheng: '长生', god: '日主' },
       ],
       weighted: [1, 2, 3, 4, 5], count: [1, 1, 1, 1, 1], candidates: [], shenSha: [], branchRels: [], pillarNotes: [],
       pattern: { name: '待确定', text: '' }, yongshen: { label: '待确定', element: '—' }, jishen: { label: '待确定', element: '—' },
       gods: {}, godBriefs: {}, hiddenGods: {}, wuxingFlow: { top: '土', low: '金' }, liuNian: { year: 2026, ganzhi: '丙午', god: '正印' },
       liuNianList: [], reading: [], preferences: { trait: '稳重', color: '黄', direction: '中央', fields: [] }, jie: { name: '立春', day: 4, time: '04:01:51' },
       tendencyText: '候选未确定。', zodiac: '马',
     },
   };
   const result = bazi.wrapResult(payload);
   assert.equal(result.status, 'success');
   assert.equal(result.metrics.certainty, 'ambiguous');
   assert.equal(result.metrics.retained, false);
   assert.ok(result.details.some((item) => item.value === 'lunar-javascript@1.7.3'));
   assert.ok(result.details.some((item) => item.value === '北京时间'));
   assert.ok(result.details.some((item) => item.value === '未知'));
   assert.ok(result.limitations.some((item) => item.includes('候选')));
   assert.ok(result.limitations.some((item) => item.includes('不生成精确时柱')));
   assert.ok(result.limitations.some((item) => item.includes('不排大运')));
   assert.equal(result.precision.time, 'unknown');
   assert.equal(bazi.wrapResult({}).status, 'error');
   const incomplete = JSON.parse(JSON.stringify(payload));
   delete incomplete.result.weighted;
   assert.equal(bazi.wrapResult(incomplete).status, 'error');
   const missingBriefs = JSON.parse(JSON.stringify(payload));
   delete missingBriefs.result.godBriefs;
   assert.equal(bazi.wrapResult(missingBriefs).status, 'error');
 });

 test('八字真实后端结果可直接进入静态站结果契约', () => {
   const engine = require(path.join(ROOT, '../main-api/app/lib/fortune-engine'));
   const cases = [
     { date: '1990-06-15', hour: 11, minute: 30, asOfDate: '2026-11-28' },
     { date: '2026-02-04', hour: 4, minute: 1, asOfDate: '2026-11-28' },
     { date: '2026-02-04', timePrecision: 'unknown', asOfDate: '2026-11-28' },
   ];
   for (const input of cases) {
     const payload = engine.compute('bazi', input);
     assert.ok(Array.isArray(payload.result.preferences.fields));
     assert.equal(bazi.wrapResult(payload).status, 'success');
   }
 });

 test('星座运势请求默认不留痕并拒绝非法日期', () => {
   const body = horoscope.requestBody({ sign: '白羊', date: '2026-11-23' });
   assert.equal(body.ok, true);
   assert.deepEqual(body.value, { tool: 'horoscope', input: { sign: '白羊', date: '2026-11-23' }, retain: false });
   for (const input of [
     { sign: '不存在', date: '2026-11-23' },
     { sign: '白羊', date: '2026-02-30' },
     { sign: '白羊', date: '2025-02-29' },
     { sign: '白羊', date: '1899-12-31' },
     { sign: '白羊', date: '2051-01-01' },
   ]) assert.equal(horoscope.requestBody(input).ok, false);
 });

 test('星座运势真实后端结果可包装，角距与相位误差分开展示', () => {
   const engine = require(path.join(ROOT, '../main-api/app/lib/fortune-engine'));
   const payload = engine.compute('horoscope', { sign: '白羊', date: '2026-11-23' });
   assert.equal(horoscope.completeResult(payload.result), true);
   const wrapped = horoscope.wrapResult(payload);
   assert.equal(wrapped.status, 'success');
   assert.equal(wrapped.metrics.retained, false);
   assert.ok(wrapped.details.some(item => item.value === '2026-11-23T12:00:00+08:00'));
   assert.ok(wrapped.formula.includes('separation') && wrapped.formula.includes('orb'));
   assert.ok(wrapped.limitations.some(item => item.includes('不是高精度星历')));
   assert.ok(payload.result.transits.every(item => item.aspect === '无'
     ? item.orb === null
     : Math.abs(item.orb - Math.abs(item.separation - item.aspectAngle)) <= 0.001));
   const response = { code: 0, data: payload };
   assert.ok(horoscope.responsePayload(response, { sign: '白羊', date: '2026-11-23' }));
   assert.equal(horoscope.responsePayload(response, { sign: '白羊', date: '2026-11-22' }), null);
   assert.equal(horoscope.responsePayload(response, { sign: '金牛', date: '2026-11-23' }), null);
   const incomplete = JSON.parse(JSON.stringify(payload));
   delete incomplete.result.calculation;
   assert.equal(horoscope.wrapResult(incomplete).status, 'error');
 });

 test('星座运势内存缓存按星座与日期隔离并在 30 分钟后失效', () => {
   const engine = require(path.join(ROOT, '../main-api/app/lib/fortune-engine'));
   const payload = engine.compute('horoscope', { sign: '白羊', date: '2026-11-23' });
   payload.generatedAt = '2026-11-23T04:00:00.000Z';
   const cache = new Map();
   const key = horoscope.cacheKey('白羊', '2026-11-23');
   assert.equal(horoscope.readCache(cache, key, 1000), null);
   assert.equal(horoscope.writeCache(cache, key, payload, 1000), 1000);
   assert.equal(horoscope.readCache(cache, key, 1000 + horoscope.ttlMs).cached, true);
   assert.equal(horoscope.readCache(cache, key, 1001 + horoscope.ttlMs), null);
   assert.equal(horoscope.readCache(cache, key, 1001 + horoscope.ttlMs, true).stale, true);
   assert.equal(horoscope.readCache(cache, horoscope.cacheKey('金牛', '2026-11-23'), 1000), null);
   assert.equal(horoscope.readCache(cache, horoscope.cacheKey('白羊', '2026-11-24'), 1000), null);
 });

 test('本命星盘请求默认不留痕、校验 IANA 时区与时间精确度', () => {
   const body = natal.requestBody({
     date: '1990-06-15', timePrecision: 'exact', time: '11:30',
     timezone: 'Asia/Shanghai', lat: 39.9, lon: 116.4,
   });
   assert.equal(body.ok, true);
   assert.equal(body.value.retain, false);
   assert.equal(body.value.requestId, undefined);
   assert.equal(body.value.input.timezone, 'Asia/Shanghai');
   for (const input of [
     { date: '1990-06-15', time: '11:30', timezone: 'UTC+8', lat: 39.9, lon: 116.4 },
     { date: '1799-12-31', time: '11:30', timezone: 'Asia/Shanghai', lat: 39.9, lon: 116.4 },
     { date: '1990-06-15', time: '24:00', timezone: 'Asia/Shanghai', lat: 39.9, lon: 116.4 },
     { date: '1990-06-15', time: '11:30', timezone: 'Asia/Shanghai', lat: 91, lon: 116.4 },
     { date: '1990-06-15', time: '11:30', timezone: 'Asia/Shanghai', lat: 39.9, lon: 181 },
     { date: '1990-06-15', timePrecision: 'guess', time: '11:30', timezone: 'Asia/Shanghai', lat: 39.9, lon: 116.4 },
   ]) assert.equal(natal.requestBody(input).ok, false);
   const unknown = natal.requestBody({
     date: '1990-06-15', timePrecision: 'unknown', time: '11:30',
     timezone: 'Asia/Shanghai', lat: 39.9, lon: 116.4,
   });
   assert.equal(unknown.ok, true);
   assert.equal(unknown.value.input.time, undefined);
   assert.equal(unknown.value.input.occurrence, undefined);
   const kept = natal.requestBody({
     date: '1990-06-15', time: '11:30', timezone: 'Asia/Shanghai', lat: 39.9, lon: 116.4,
   }, true);
   assert.equal(kept.value.retain, true);
   assert.ok(/^[A-Za-z0-9_-]{16,80}$/.test(kept.value.requestId));
 });
 
 test('本命星盘真实后端结果可包装，未知时间不伪造宫位', () => {
   const engine = require(path.join(ROOT, '../main-api/app/lib/fortune-engine'));
   const exactInput = { date: '1990-06-15', time: '11:30', timezone: 'Asia/Shanghai', lat: 39.9, lon: 116.4 };
   const exact = engine.compute('natal', exactInput);
   assert.equal(natal.completeResult(exact.result), true);
   const wrapped = natal.wrapResult(exact);
   assert.equal(wrapped.status, 'success');
   assert.equal(wrapped.metrics.timeStatus, 'resolved');
   assert.ok(wrapped.details.some(item => item.value === 'Asia/Shanghai'));
   assert.ok(wrapped.limitations.some(item => item.includes('占星无科学依据')));
   const response = { code: 0, data: exact };
   assert.ok(natal.responsePayload(response, exactInput));
   assert.equal(natal.responsePayload(response, Object.assign({}, exactInput, { date: '1990-06-16' })), null);
   assert.equal(natal.responsePayload(response, Object.assign({}, exactInput, { timezone: 'Asia/Tokyo' })), null);
   const unknownInput = { date: '1990-06-15', timePrecision: 'unknown', timezone: 'Asia/Shanghai', lat: 39.9, lon: 116.4 };
   const unknown = engine.compute('natal', unknownInput);
   assert.equal(unknown.result.timeResolution.status, 'unknown');
   assert.equal(unknown.result.houses.length, 0);
   assert.equal(unknown.result.rising, '未确定');
   assert.ok(unknown.result.planets.every(planet => planet.house === null));
   assert.equal(natal.wrapResult(unknown).status, 'success');
   assert.ok(natal.responsePayload({ code: 0, data: unknown }, unknownInput));
   const incomplete = JSON.parse(JSON.stringify(exact));
   delete incomplete.result.houses;
   assert.equal(natal.wrapResult(incomplete).status, 'error');
 });
 
 test('本命星盘识别夏令时跳时与重复时间候选', () => {
   const engine = require(path.join(ROOT, '../main-api/app/lib/fortune-engine'));
   function failureFor(input) {
     try {
       engine.compute('natal', input);
     } catch (error) {
       return { code: 1, msg: error.message, data: { errorCode: error.code, details: error.details } };
     }
     return null;
   }
   const gap = failureFor({ date: '2026-03-08', time: '02:30', timezone: 'America/New_York', lat: 40.7, lon: -74 });
   assert.equal(gap.data.errorCode, 'NATAL_DST_GAP');
   const gapView = natal.dstFailure(gap);
   assert.equal(gapView.code, 'NATAL_DST_GAP');
   assert.equal(gapView.candidates.length, 2);
   assert.ok(gapView.candidates.every(item => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(item.localDateTime)));
   const fold = failureFor({ date: '2026-11-01', time: '01:30', timezone: 'America/New_York', lat: 40.7, lon: -74 });
   assert.equal(fold.data.errorCode, 'NATAL_DST_FOLD');
   const foldView = natal.dstFailure(fold);
   assert.equal(foldView.code, 'NATAL_DST_FOLD');
   assert.deepEqual(foldView.candidates.map(item => item.occurrence), [ 'first', 'second' ]);
   const resolved = engine.compute('natal', { date: '2026-11-01', time: '01:30', occurrence: 'second', timezone: 'America/New_York', lat: 40.7, lon: -74 });
   assert.equal(resolved.result.timeResolution.occurrence, 'second');
   assert.ok(natal.wrapResult(resolved).limitations.some(item => item.includes('第二次')));
   assert.equal(natal.dstFailure({ code: 0, data: {} }), null);
   assert.equal(natal.dstFailure({ code: 1, data: { errorCode: 'OTHER' } }), null);
 });
 
 test('塔罗默认不留痕不提交问题，留痕与复现字段边界正确', () => {
   const plain = tarot.requestBody({ spread: 3, question: '这周先推进哪件事' }, false);
   assert.equal(plain.ok, true);
   assert.deepEqual(plain.value, { tool: 'tarot', input: { spread: 3, mode: 'new' }, retain: false });
   const kept = tarot.requestBody({ spread: 1, question: '工作方向' }, true);
   assert.equal(kept.value.input.question, '工作方向');
   assert.equal(kept.value.retain, true);
   assert.ok(/^[A-Za-z0-9_-]{16,80}$/.test(kept.value.requestId));
   const seed = require('node:crypto').randomBytes(32).toString('base64url');
   const reproduce = tarot.requestBody({ spread: 3, mode: 'reproduce', seed: seed, question: '人际关系' }, false);
   assert.equal(reproduce.value.input.seed, seed);
   assert.equal(reproduce.value.input.question, undefined);
   assert.equal(reproduce.value.retain, false);
   for (const input of [
     { spread: 2 },
     { spread: 1, mode: 'shuffle' },
     { spread: 1, mode: 'reproduce', seed: 'short' },
     { spread: 1, question: '换行\n问题' },
   ]) assert.equal(tarot.requestBody(input).ok, false);
 });
 
 test('塔罗真实后端结果可包装、响应回显可校验且分享快照隐藏问题与种子', () => {
   const engine = require(path.join(ROOT, '../main-api/app/lib/fortune-engine'));
   const payload = engine.compute('tarot', { spread: 3 });
   assert.equal(tarot.completeResult(payload.result), true);
   assert.equal(payload.result.question, '今日指引');
   assert.ok(/^[A-Za-z0-9_-]{43}$/.test(payload.result.draw.seed));
   const wrapped = tarot.wrapResult(payload);
   assert.equal(wrapped.status, 'success');
   assert.ok(wrapped.limitations.some(item => item.includes('未留痕')));
   const response = { code: 0, data: payload };
   assert.ok(tarot.responsePayload(response, { spread: 3, mode: 'new' }));
   assert.equal(tarot.responsePayload(response, { spread: 1, mode: 'new' }), null);
   assert.equal(tarot.responsePayload(response, { spread: 3, mode: 'reproduce', seed: 'x'.repeat(43) }), null);
   const reproduced = engine.compute('tarot', { spread: 3, mode: 'reproduce', seed: payload.result.draw.seed });
   assert.equal(reproduced.result.cards.map(card => card.name).join('|'), payload.result.cards.map(card => card.name).join('|'));
   assert.ok(tarot.responsePayload({ code: 0, data: reproduced }, { spread: 3, mode: 'reproduce', seed: payload.result.draw.seed }));
   const snapshot = JSON.parse(JSON.stringify(payload.result));
   snapshot.question = '已隐藏';
   delete snapshot.draw.seed;
   snapshot.readingList[0] = '本次问题已隐藏；采用过去 · 现在 · 未来，共 3 张牌。';
   assert.equal(tarot.completeResult(snapshot), false);
   assert.equal(tarot.completeSharedResult(snapshot), true);
   const shared = tarot.sharePayload({ code: 0, data: { shareId: 'a'.repeat(43), result: snapshot, summary: '摘要' } });
   assert.ok(shared);
   assert.equal(tarot.sharePayload({ code: 0, data: { shareId: 'bad', result: snapshot } }), null);
   const shareWrapped = tarot.wrapShareResult({ result: snapshot, generatedAt: '2026-11-28T00:00:00.000Z', expiresAt: '2026-11-29T00:00:00.000Z' });
   assert.equal(shareWrapped.status, 'success');
   assert.ok(shareWrapped.details.every(item => item.label !== '复现种子'));
   assert.match(tarot.shareUrl('b'.repeat(43)), /^\/fortune\/tarot\.html\?share=/);
   assert.equal(tarot.shareUrl('bad'), '');
 });
 
 test('注册表包含 45 个独立工具与十五个 P0 工具模块', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tool-registry.json'), 'utf8'));
  assert.equal(registry.tools.length, 45);
  const byId = new Map(registry.tools.map((tool) => [tool.id, tool]));
  for (const id of ['random', 'vision', 'secret-message', 'air-quality', 'tax', 'social-insurance', 'prepay', 'scientific', 'percentage', 'timezone', 'buy-house', 'buy-car', 'health-check', 'life-plan', 'bazi']) {
    const tool = byId.get(id);
    assert.ok(tool, `缺少 ${id}`);
    assert.equal(tool.module, id);
    assert.ok(tool.entryScript, `${id} 缺少入口脚本`);
    assert.equal(tool.computationMode, [ 'air-quality', 'bazi' ].includes(id) ? 'api' : 'local');
  }
  assert.deepEqual(byId.get('buy-house').policyDependencies, ['deed-tax']);
  assert.deepEqual(byId.get('buy-car').policyDependencies, ['vehicle-purchase-tax']);
  assert.ok(byId.get('buy-car').sensitiveFields.includes('invoicePrice'));
  assert.ok(byId.get('buy-car').sensitiveFields.includes('monthlyIncome'));
  assert.ok(byId.get('buy-house').sensitiveFields.includes('monthlyIncome'));
  assert.ok(byId.get('prepay').sensitiveFields.includes('principal'));
  assert.ok(byId.get('prepay').sensitiveFields.includes('income'));
  assert.deepEqual(byId.get('health-check').policyDependencies, []);
  assert.deepEqual(byId.get('health-check').analyticsAllowlist, ['success', 'resultType']);
  assert.deepEqual(byId.get('life-plan').policyDependencies, []);
  assert.deepEqual(byId.get('life-plan').analyticsAllowlist, ['success', 'resultType']);
  assert.deepEqual(byId.get('bazi').analyticsAllowlist, ['success', 'certainty', 'retained']);
  assert.equal(byId.get('horoscope').module, 'horoscope');
  assert.equal(byId.get('horoscope').entryScript, 'assets/js/pages/fortune-horoscope.js');
  assert.deepEqual(byId.get('horoscope').sensitiveFields, ['sign', 'date']);
  assert.deepEqual(byId.get('horoscope').analyticsAllowlist, ['success', 'cached']);
  assert.equal(byId.get('natal').module, 'natal');
  assert.equal(byId.get('natal').entryScript, 'assets/js/pages/fortune-natal.js');
  assert.deepEqual(byId.get('natal').sensitiveFields, ['date', 'time', 'timePrecision', 'timezone', 'lat', 'lon', 'occurrence']);
  assert.deepEqual(byId.get('natal').analyticsAllowlist, ['success', 'timePrecision', 'retained']);
  assert.equal(byId.get('tarot').module, 'tarot');
  assert.equal(byId.get('tarot').entryScript, 'assets/js/pages/fortune-tarot.js');
  assert.deepEqual(byId.get('tarot').sensitiveFields, ['question', 'seed']);
  assert.deepEqual(byId.get('tarot').analyticsAllowlist, ['success', 'spread', 'retained']);
  for (const field of ['birthDate', 'birthTime', 'gender', 'timePrecision', 'timeBasis', 'longitude', 'lateZi', 'asOfDate']) {
    assert.ok(byId.get('bazi').sensitiveFields.includes(field));
  }
  for (const field of ['income', 'expense', 'debtPayment', 'assets', 'goalAnnualExpense', 'debtPrincipal']) {
    assert.ok(byId.get('life-plan').sensitiveFields.includes(field));
  }
  for (const field of ['sex', 'age', 'height', 'weight', 'neck', 'waist', 'hip', 'date']) {
    assert.ok(byId.get('health-check').sensitiveFields.includes(field));
  }
});

test('P0/P1 控制器引用的 DOM ID 均存在于模板', () => {
  const pairs = [
    ['random', 'random'],
    ['vision', 'vision'],
    ['calculator-secret-message', 'calculator-secret-message'],
    ['tool-air-quality', 'tool-air-quality'],
    ['calculator-tax', 'calculator-tax'],
    ['calculator-social-insurance', 'calculator-social-insurance'],
    ['calculator-prepay', 'calculator-prepay'],
    ['calculator-scientific', 'calculator-scientific'],
    ['calculator-percentage', 'calculator-percentage'],
    ['calculator-timezone', 'calculator-timezone'],
    ['combo-buy-house', 'combo-buy-house'],
    ['combo-buy-car', 'combo-buy-car'],
    ['combo-health-check', 'combo-health-check'],
    ['combo-life-plan', 'combo-life-plan'],
    ['fortune-bazi', 'fortune-bazi'],
    ['fortune-horoscope', 'fortune-horoscope'],
    ['fortune-natal', 'fortune-natal'],
    ['fortune-tarot', 'fortune-tarot'],
  ];
  for (const [controller, template] of pairs) {
    const js = fs.readFileSync(path.join(ROOT, 'assets/js/pages', controller + '.js'), 'utf8');
    const html = fs.readFileSync(path.join(ROOT, 'templates/pages', template + '.html'), 'utf8');
    assert.doesNotThrow(() => new Function(js), `${controller} 存在 JavaScript 语法错误`);
    const ids = new Set(Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]));
    const referenced = new Set([
      ...Array.from(js.matchAll(/\$\('([^']+)'\)/g), (match) => match[1]),
      ...Array.from(js.matchAll(/getElementById\('([^']+)'\)/g), (match) => match[1]),
    ]);
    for (const id of referenced) assert.ok(ids.has(id), `${controller} 引用了不存在的 #${id}`);
    assert.doesNotMatch(js, /innerHTML\s*=/, `${controller} 不得使用 innerHTML 渲染第三方或计算结果`);
  }
});

test('P0 模板保留关键隐私与安全边界', () => {
  const visionHtml = fs.readFileSync(path.join(ROOT, 'templates/pages/vision.html'), 'utf8');
  const secretHtml = fs.readFileSync(path.join(ROOT, 'templates/pages/calculator-secret-message.html'), 'utf8');
  const aqiHtml = fs.readFileSync(path.join(ROOT, 'templates/pages/tool-air-quality.html'), 'utf8');
  const houseHtml = fs.readFileSync(path.join(ROOT, 'templates/pages/combo-buy-house.html'), 'utf8');
  const houseController = fs.readFileSync(path.join(ROOT, 'assets/js/pages/combo-buy-house.js'), 'utf8');
  const carHtml = fs.readFileSync(path.join(ROOT, 'templates/pages/combo-buy-car.html'), 'utf8');
  const carController = fs.readFileSync(path.join(ROOT, 'assets/js/pages/combo-buy-car.js'), 'utf8');
  const healthHtml = fs.readFileSync(path.join(ROOT, 'templates/pages/combo-health-check.html'), 'utf8');
  const healthController = fs.readFileSync(path.join(ROOT, 'assets/js/pages/combo-health-check.js'), 'utf8');
  const lifeHtml = fs.readFileSync(path.join(ROOT, 'templates/pages/combo-life-plan.html'), 'utf8');
  const lifeController = fs.readFileSync(path.join(ROOT, 'assets/js/pages/combo-life-plan.js'), 'utf8');
  const baziHtml = fs.readFileSync(path.join(ROOT, 'templates/pages/fortune-bazi.html'), 'utf8');
  const baziController = fs.readFileSync(path.join(ROOT, 'assets/js/pages/fortune-bazi.js'), 'utf8');
  const randomController = fs.readFileSync(path.join(ROOT, 'assets/js/pages/random.js'), 'utf8');
  assert.doesNotMatch(randomController, /Math\.random/);
  assert.doesNotMatch(visionHtml, /maxPass\s*=\s*1\.0/);
  assert.doesNotMatch(visionHtml, /Math\.max\(12/);
  assert.match(visionHtml, /<svg[^>]+id="vs-e"/);
  assert.match(secretHtml, /不是。链接可重复打开/);
  assert.doesNotMatch(secretHtml, /链接仅可打开一次|打开后自动销毁/);
  assert.match(secretHtml, /history\.replaceState/);
  assert.match(secretHtml, /location\.hash = ''/);
  assert.doesNotMatch(aqiHtml, /!d\.aqi/);
  assert.doesNotMatch(houseHtml, /<script>|innerHTML|'lp-income': 20000|二套 3%/);
  assert.match(houseHtml, /id="bh-custom-rate"/);
  assert.match(houseHtml, /140㎡ 包含本数|140㎡包含本数/);
  assert.doesNotMatch(houseController, /20000|8000|innerHTML/);
  assert.doesNotMatch(carHtml, /<script>|innerHTML|'lp-income': 20000|新能源.*税[^。]{0,8}(?:为|=) ?0/);
  assert.doesNotMatch(carController, /20000|8000|4\.5|innerHTML/);
  assert.match(carHtml, /id="bc-invoice-ex"/);
  assert.match(carHtml, /1\.5 万元/);
  assert.match(carHtml, /id="bc-to-usage"/);
  assert.doesNotMatch(healthHtml, /<script>|innerHTML|age\s*=\s*30/);
  assert.doesNotMatch(healthController, /innerHTML|age\s*=\s*30/);
  assert.match(healthHtml, /id="hc-empty"/);
  assert.match(healthHtml, /id="hc-storage-status"/);
  assert.doesNotMatch(lifeHtml, /<script>|innerHTML|安全提取率/);
  assert.doesNotMatch(lifeController, /innerHTML|20000|8000/);
  assert.match(lifeHtml, /id="lp-withdrawal"/);
  assert.match(lifeHtml, /id="lp-debt-principal"/);
  assert.match(lifeHtml, /id="lp-timing"/);
  assert.match(lifeHtml, /有效年收益率/);
  assert.doesNotMatch(baziHtml, /<script>|innerHTML|value="12"|<option value="male" selected/);
  assert.match(baziHtml, /<option value="unknown">/);
  assert.doesNotMatch(baziController, /innerHTML|localStorage|sessionStorage/);
  assert.match(baziHtml, /默认不留痕/);
  assert.match(baziHtml, /id="bz-precision"/);
  assert.match(baziHtml, /id="bz-retain"/);
  const natalHtml = fs.readFileSync(path.join(ROOT, 'templates/pages/fortune-natal.html'), 'utf8');
  const natalController = fs.readFileSync(path.join(ROOT, 'assets/js/pages/fortune-natal.js'), 'utf8');
  const tarotHtml = fs.readFileSync(path.join(ROOT, 'templates/pages/fortune-tarot.html'), 'utf8');
  const tarotController = fs.readFileSync(path.join(ROOT, 'assets/js/pages/fortune-tarot.js'), 'utf8');
  assert.doesNotMatch(natalHtml, /<script>|innerHTML/);
  assert.match(natalHtml, /默认不留痕/);
  assert.match(natalHtml, /id="nt-precision"/);
  assert.match(natalHtml, /id="nt-retain"/);
  assert.match(natalHtml, /Asia\/Shanghai/);
  assert.doesNotMatch(natalController, /innerHTML|localStorage|sessionStorage/);
  assert.doesNotMatch(tarotHtml, /<script>|innerHTML|alert\(/);
  assert.match(tarotHtml, /默认不留痕/);
  assert.match(tarotHtml, /id="tr-retain"/);
  assert.match(tarotHtml, /id="tr-share"/);
  assert.doesNotMatch(tarotController, /innerHTML|localStorage|sessionStorage|Math\.random/);

  assert.match(randomController, /\.step = float \? 'any' : '1'/);
  const aqiController = fs.readFileSync(path.join(ROOT, 'assets/js/pages/tool-air-quality.js'), 'utf8');
  assert.match(aqiController, /var current = \+\+sequence;\s*\$\('aq-query'\)\.disabled = false;/);
  const toolState = fs.readFileSync(path.join(ROOT, 'assets/js/tool-state.js'), 'utf8');
  assert.match(toolState, /'calculator-prepay': 1/);
  assert.match(toolState, /'calculator-timezone': 1/);
  assert.match(toolState, /'combo-buy-house': 1/);
  assert.match(toolState, /'combo-buy-car': 1/);
  assert.match(toolState, /'combo-health-check': 1/);
  assert.match(toolState, /'combo-life-plan': 1/);
  assert.match(toolState, /'fortune-bazi': 1/);
  assert.match(toolState, /'fortune-horoscope': 1/);
  assert.match(toolState, /'buy-car': '买车全攻略'/);
  assert.match(toolState, /Core\.bridge\.allowed/);
});
