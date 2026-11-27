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
const taxPolicy = require('../../data/policies/individual-income-tax.json');
const socialPolicy = require('../../data/policies/social-insurance.json');
const aqiPolicy = require('../../data/policies/aqi.json');
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

test('注册表包含 45 个独立工具与七个 P0 本地模块', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tool-registry.json'), 'utf8'));
  assert.equal(registry.tools.length, 45);
  const byId = new Map(registry.tools.map((tool) => [tool.id, tool]));
  for (const id of ['random', 'vision', 'secret-message', 'air-quality', 'tax', 'social-insurance', 'prepay']) {
    const tool = byId.get(id);
    assert.ok(tool, `缺少 ${id}`);
    assert.equal(tool.module, id);
    assert.ok(tool.entryScript, `${id} 缺少入口脚本`);
    assert.equal(tool.computationMode, id === 'air-quality' ? 'api' : 'local');
  }
  assert.ok(byId.get('prepay').sensitiveFields.includes('principal'));
  assert.ok(byId.get('prepay').sensitiveFields.includes('income'));
});

test('七个 P0 控制器引用的 DOM ID 均存在于模板', () => {
  const pairs = [
    ['random', 'random'],
    ['vision', 'vision'],
    ['calculator-secret-message', 'calculator-secret-message'],
    ['tool-air-quality', 'tool-air-quality'],
    ['calculator-tax', 'calculator-tax'],
    ['calculator-social-insurance', 'calculator-social-insurance'],
    ['calculator-prepay', 'calculator-prepay'],
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

  assert.match(randomController, /\.step = float \? 'any' : '1'/);
  const aqiController = fs.readFileSync(path.join(ROOT, 'assets/js/pages/tool-air-quality.js'), 'utf8');
  assert.match(aqiController, /var current = \+\+sequence;\s*\$\('aq-query'\)\.disabled = false;/);
  const toolState = fs.readFileSync(path.join(ROOT, 'assets/js/tool-state.js'), 'utf8');
  assert.match(toolState, /'calculator-prepay': 1/);
});
