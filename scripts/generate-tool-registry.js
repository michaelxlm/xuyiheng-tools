#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const LOCAL = ['tax', 'unit', 'pension', 'timezone', 'decoration', 'size', 'scientific', 'discount', 'date-calc', 'prepay', 'social-insurance', 'due-date', 'pace', 'pet-age', 'percentage', 'overtime', 'height-predict', 'fuel-cost', 'probability', 'random', 'vision', 'secret-message', 'lotto', 'buy-house', 'buy-car', 'health-check', 'life-plan'];
const API = ['baby-name', 'body-fat', 'solar-term', 'daily-guide', 'countdown', 'air-quality', 'idiom', 'polyphone', 'bazi', 'ziwei', 'natal', 'horoscope', 'zodiac-match', 'tarot'];
const HYBRID = ['calendar', 'fun-test', 'finance-toolkit', 'color-lab'];
const SENSITIVE = {
  tax: ['salary', 'insurance', 'deductions'], 'social-insurance': ['salary', 'contributionBase', 'deductions'],
  prepay: ['principal', 'annualRatePct', 'paidMonths', 'prepayAmount', 'income', 'expense'],
  'baby-name': ['surname', 'birthDate', 'name'], 'secret-message': ['message'],
  'body-fat': ['weight', 'height', 'circumferences'], timezone: ['datetime'],
  'health-check': ['sex', 'age', 'height', 'weight', 'activity', 'goal', 'neck', 'waist', 'hip', 'date'], 'fun-test': ['birthDate', 'answers'],
  'finance-toolkit': ['assets', 'income'], 'life-plan': ['income', 'expense', 'debtPayment', 'assets', 'annualRatePct', 'lowRatePct', 'highRatePct', 'years', 'inflationPct', 'withdrawalRatePct', 'goalAnnualExpense', 'timing', 'debtPrincipal', 'debtAnnualRatePct', 'debtRemainingMonths'],
  'buy-house': ['price', 'area', 'houseCount', 'policyDate', 'deedBasis', 'customDeedRatePct', 'downPct', 'years', 'commercialSharePct', 'commercialRatePct', 'fundRatePct', 'agentRatePct', 'buyerSharePct', 'otherCosts', 'monthlyIncome', 'otherMonthlyExpense', 'availableCash', 'emergencyMonths', 'incomeShockPct', 'rateShockPct'],
  'buy-car': ['guidePrice', 'invoicePrice', 'invoicePriceExVat', 'purchaseDate', 'taxReductionEligible', 'downPct', 'annualRatePct', 'years', 'purchaseFees', 'insurance', 'annualKm', 'energyUsePer100', 'energyPrice', 'monthlyIncome', 'otherMonthlyExpense'],
  bazi: ['birthDate', 'birthTime', 'gender'], ziwei: ['birthDate', 'birthTime', 'gender'],
  natal: ['birthDate', 'birthTime', 'birthPlace'], horoscope: ['zodiac', 'date'],
  'zodiac-match': ['birthDate', 'zodiac'], tarot: ['question'],
};
const POLICIES = {
  tax: ['individual-income-tax'], 'social-insurance': ['individual-income-tax', 'social-insurance'],
  'air-quality': ['aqi'], 'buy-house': ['deed-tax'], 'buy-car': ['vehicle-purchase-tax'],
};
const MODULES = {
  tax: 'tax', random: 'random', vision: 'vision', 'secret-message': 'secret-message',
  'air-quality': 'air-quality', 'social-insurance': 'social-insurance', prepay: 'prepay',
  scientific: 'scientific', percentage: 'percentage', timezone: 'timezone', 'buy-house': 'buy-house', 'buy-car': 'buy-car',
  'health-check': 'health-check', 'life-plan': 'life-plan',
};
const EVENTS = {
  tax: ['mode', 'success', 'resultType'], random: ['type', 'unique', 'count', 'success'],
  vision: ['eye', 'success', 'resultType'], 'secret-message': ['success'],
  'air-quality': ['success', 'cached', 'resultType'], 'social-insurance': ['mode', 'success'],
  prepay: ['method', 'mode', 'success'],
  scientific: ['method', 'angleMode', 'success'], percentage: ['mode', 'success'],
  timezone: ['success', 'mode'], 'buy-house': ['success', 'resultType'],
  'buy-car': ['success', 'resultType', 'energy'], 'health-check': ['success', 'resultType'],
  'life-plan': ['success', 'resultType'],
};

function slugOf(route) {
  const out = String(route.output || route.path + '.html').replace(/\.html$/, '');
  return out === 'index' ? 'home' : out.replace(/\//g, '-');
}

function buildRegistry() {
  const pages = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pages.json'), 'utf8'));
  const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
  const nav = new Map();
  (site.sidebar_categories || []).forEach((cat) => (cat.items || []).forEach((it) => nav.set(it.url, it)));
  const tools = pages.routes.filter((r) => r.type === 'tool' && r.indexable !== false && r.path !== 'combo/index').map((route) => {
    const id = route.path.split('/').pop();
    const url = '/' + route.path + '.html';
    const item = nav.get(url) || {};
    const pageScript = path.join(ROOT, 'assets/js/pages', slugOf(route) + '.js');
    const template = 'templates/pages/' + slugOf(route) + '.html';
    return {
      id,
      name: item.label || route.title.split(' - ')[0],
      route: route.path,
      url,
      category: route.category,
      template,
      entryScript: fs.existsSync(pageScript) ? 'assets/js/pages/' + slugOf(route) + '.js' : null,
      module: MODULES[id] || null,
      computationMode: LOCAL.includes(id) ? 'local' : API.includes(id) ? 'api' : HYBRID.includes(id) ? 'hybrid' : 'local',
      sensitiveFields: SENSITIVE[id] || [],
      policyDependencies: POLICIES[id] || [],
      resultVersion: '2026.11',
      analyticsAllowlist: EVENTS[id] || ['mode', 'success', 'resultType'],
      mobileLayout: ['lotto', 'bazi', 'ziwei', 'natal', 'zodiac-match'].includes(id) ? 'scroll-table' : 'stacked-cards',
    };
  });
  if (tools.length !== 45) throw new Error('预期 45 个独立工具，实际 ' + tools.length + '；combo/index 是汇总页，不计入工具数');
  return { version: '2026.11', generatedBy: 'scripts/generate-tool-registry.js', tools };
}

function main() {
  const registry = buildRegistry();
  fs.writeFileSync(path.join(ROOT, 'data/tool-registry.json'), JSON.stringify(registry, null, 2) + '\n');
  console.log('工具注册表：' + registry.tools.length + ' 个独立工具');
}

if (require.main === module) main();
module.exports = { main, buildRegistry };
