#!/usr/bin/env node
'use strict';
/* ==========================================================================
   aggregate-popularity.js · 构建期热度覆盖生成器（可复跑，零依赖，Node 18+）
   --------------------------------------------------------------------------
   用途：把「可选的」埋点导出文件聚合为 data/tool-popularity.json，供
        scripts/prerender.js 在构建期重排首页 FEATURED 热门工具卡。

   重要：**绝不编造 PV**。若导出文件不存在 / 无有效数据，本脚本只打印说明、
        不写入任何文件、也不覆盖已有 tool-popularity.json（保持空数组降级，
        首页沿用 FEATURED 硬编码顺序）。可重复运行，结果确定（按 clicks 降序）。

   用法：
     node scripts/aggregate-popularity.js
     node scripts/aggregate-popularity.js data/calc-click-export.json
     node scripts/aggregate-popularity.js --dry            # 只报告，不落盘

   导出文件（可选，缺省 data/calc-click-export.json）支持两种形态，可混用：
     A) 事件明细数组： [ {"tool":"tax"}, {"tool":"tax"}, {"tool":"prepay"} ]
        → 每个元素计 1 次点击；tool 即 calc_click 的 p.tool 短名。
     B) 已聚合数组：   [ {"tool":"tax","clicks":120},
                         {"url":"/calculator/prepay.html","clicks":30} ]
        → 按 clicks / value / count / pv 字段取点击数；url 优先于 tool。
     也可包一层 { "events": [...] } 或 { "rows": [...] }。

   tool 短名 → 站内 url 的映射来自 data/site.json 的 sidebar_categories 与
   data/pages.json 的 output（均取文件名 stem）。无法映射 / 无正点击数的行
   会被跳过并计数，不会写入猜测出来的 url。
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_EXPORT = path.join(ROOT, 'data', 'calc-click-export.json');
const OUT = path.join(ROOT, 'data', 'tool-popularity.json');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return null; }
}

/** /calculator/tax.html → tax ；combo/buy-house.html → buy-house */
function stem(u) {
  return String(u).split('?')[0].split('#')[0].replace(/\/+$/, '')
    .split('/').pop().replace(/\.html$/, '');
}

/** 站内 tool 短名 → url（仅用本仓真实路由，绝不拼造外部地址） */
function buildStemMap() {
  const map = {};
  const site = readJson(path.join(ROOT, 'data', 'site.json')) || {};
  (site.sidebar_categories || []).forEach((c) => (c.items || []).forEach((it) => {
    if (it && it.url) map[stem(it.url)] = it.url;
  }));
  const pages = readJson(path.join(ROOT, 'data', 'pages.json')) || {};
  (pages.routes || []).forEach((r) => {
    const o = r && r.output;
    if (o) map[stem(o)] = '/' + String(o).replace(/^\/+/, '');
  });
  return map;
}

function rowsOf(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.events)) return data.events;
  if (data && Array.isArray(data.rows)) return data.rows;
  return null;
}

function clickCount(r) {
  const v = r.clicks != null ? r.clicks
    : (r.value != null ? r.value : (r.count != null ? r.count : (r.pv != null ? r.pv : 1)));
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const fileArg = args.find((a) => !a.startsWith('--'));
  const src = fileArg ? path.resolve(ROOT, fileArg) : DEFAULT_EXPORT;

  if (!fs.existsSync(src)) {
    console.log('[aggregate-popularity] 未找到导出文件：' + path.relative(ROOT, src));
    console.log('  当前无全站聚合数据，**不写假数据**；data/tool-popularity.json 保持不变（tools 为空时首页沿用硬编码顺序）。');
    console.log('  用法：node scripts/aggregate-popularity.js <导出文件.json>  （格式见本文件头注释）');
    return; // 诚实降级：无输入即无输出，退出码 0
  }

  const rows = rowsOf(readJson(src));
  if (!rows || !rows.length) {
    console.log('[aggregate-popularity] 导出文件无有效行，不写入。');
    return;
  }

  const stemMap = buildStemMap();
  const agg = {};
  let skipped = 0;
  rows.forEach((r) => {
    if (!r || typeof r !== 'object') { skipped++; return; }
    let url = r.url;
    if (!url && r.tool) url = stemMap[r.tool];
    if (!url || typeof url !== 'string' || url.charAt(0) !== '/') { skipped++; return; }
    const n = clickCount(r);
    if (!n) { skipped++; return; }
    agg[url] = (agg[url] || 0) + n;
  });

  const tools = Object.keys(agg)
    .map((url) => ({ url: url, clicks: agg[url] }))
    .sort((a, b) => b.clicks - a.clicks);

  if (!tools.length) {
    console.log('[aggregate-popularity] 无任何可映射的有效点击（跳过 ' + skipped + ' 行），不写入。');
    return;
  }

  const out = {
    updated: new Date().toISOString().slice(0, 10),
    _note: '由 scripts/aggregate-popularity.js 从导出文件聚合生成；仅含真实统计，不编造 PV。无数据时清空 tools 即回到 FEATURED 硬编码顺序。',
    tools: tools,
  };
  console.log('[aggregate-popularity] 聚合 ' + tools.length + ' 个工具，跳过 ' + skipped + ' 行'
    + (dry ? '（--dry 未落盘）' : ' → ' + path.relative(ROOT, OUT)));
  if (!dry) fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
}

main();
