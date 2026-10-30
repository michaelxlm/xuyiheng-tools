#!/usr/bin/env node
'use strict';
/* ==========================================================================
   collect-ssq.js · 双色球开奖数据构建期采集（零依赖）
   --------------------------------------------------------------------------
   目标产物：data/ssq-draws.json = { updated_at, total, draws:[{code,date,reds,blue}] }
   取数优先级（任一成功即止，全失败则保留上一次 seed，构建绝不中断）：
     1. main-api 下发接口 /api/v1/front/lottery/ssq-draws（部署后可用）；
     2. 直连福彩官网 findDrawNotice；
     3. 直连 500.com list.xml。
   合并策略：新数据按 code 覆盖旧 seed，旧 seed 中未出现的期号保留（只增不减、去重）。
   用法：node scripts/collect-ssq.js   （由 build.js 自动调用）
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'ssq-draws.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const API = (process.env.SSQ_API || 'https://api.xuyiheng.com/api/v1/front/lottery/ssq-draws');
const CWL = 'https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice';
const XML500 = 'https://kaijiang.500.com/static/info/kaijiang/xml/ssq/list.xml';
const LIMIT = parseInt(process.env.SSQ_LIMIT, 10) || 2000;
const TIMEOUT = 20000;

const pad = n => String(n).padStart(2, '0');

/** 校验并归一单条 → {code,date,reds:[str],blue:str} 或 null */
function normalize(raw) {
  const code = String(raw.code || '').trim();
  if (!/^\d{7}$/.test(code)) return null;
  const date = String(raw.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  let reds = raw.reds;
  if (typeof reds === 'string') reds = reds.split(',');
  const nums = (reds || []).map(x => parseInt(String(x).trim(), 10));
  if (nums.length !== 6 || nums.some(n => !Number.isInteger(n) || n < 1 || n > 33)) return null;
  if (new Set(nums).size !== 6) return null;
  const blue = parseInt(String(raw.blue).trim(), 10);
  if (!Number.isInteger(blue) || blue < 1 || blue > 16) return null;
  return { code, date, reds: nums.sort((a, b) => a - b).map(pad), blue: pad(blue) };
}

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const resp = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return resp;
  } finally { clearTimeout(timer); }
}

/** 源1：main-api 下发（返回已归一 {updated_at,total,draws} 或 null） */
async function fromApi() {
  try {
    const resp = await fetchWithTimeout(API, { headers: { 'User-Agent': UA } });
    const body = await resp.json();
    const res = body && body.data ? body.data : body;
    if (!res || !Array.isArray(res.draws)) return null;
    const draws = res.draws.map(normalize).filter(Boolean);
    return draws.length ? { updated_at: res.updated_at || '', draws } : null;
  } catch (e) { console.warn('  [collect-ssq] API 取数失败：' + e.message); return null; }
}

/** 源2：福彩官网 */
async function fromCwl() {
  try {
    const resp = await fetchWithTimeout(`${CWL}?name=ssq&issueCount=${LIMIT}`, { headers: { Referer: 'https://www.cwl.gov.cn/kjxx/ssq/kjgg/', 'User-Agent': UA } });
    const body = await resp.json();
    const draws = ((body && body.result) || []).map(r => normalize({ code: r.code, date: r.date, reds: r.red, blue: r.blue })).filter(Boolean);
    return draws.length ? { updated_at: '', draws } : null;
  } catch (e) { console.warn('  [collect-ssq] 福彩官网取数失败：' + e.message); return null; }
}

/** 源3：500.com XML */
async function from500() {
  try {
    const resp = await fetchWithTimeout(XML500, { headers: { 'User-Agent': UA } });
    const xml = await resp.text();
    const out = [];
    const re = /expect="(\d+)"\s+opencode="([^"]+)"\s+opentime="([^"]+)"/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const code = m[1].length === 7 ? m[1] : '20' + m[1];
      const [ red, blue ] = String(m[2]).split('|');
      const n = normalize({ code, date: m[3].slice(0, 10), reds: red, blue });
      if (n) out.push(n);
    }
    return out.length ? { updated_at: '', draws: out } : null;
  } catch (e) { console.warn('  [collect-ssq] 500.com 取数失败：' + e.message); return null; }
}

function loadSeed() {
  try {
    const j = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    return Array.isArray(j.draws) ? j : { updated_at: '', draws: [] };
  } catch (e) { return { updated_at: '', draws: [] }; }
}

async function run() {
  console.log('== collect-ssq：双色球开奖数据 ==');
  const fresh = (await fromApi()) || (await fromCwl()) || (await from500());
  const seed = loadSeed();

  if (!fresh) {
    console.log('  所有源不可达，沿用本地 seed（' + seed.draws.length + ' 期），构建继续');
    return { total: seed.draws.length, source: 'seed' };
  }

  // 合并去重：以 code 为键，新数据覆盖旧；旧独有保留
  const map = new Map();
  seed.draws.forEach(d => map.set(d.code, d));
  fresh.draws.forEach(d => map.set(d.code, d));
  const merged = [ ...map.values() ].sort((a, b) => b.code.localeCompare(a.code));
  const latest = merged[0] ? merged[0].date : '';

  fs.writeFileSync(OUT, JSON.stringify({ updated_at: latest, total: merged.length, draws: merged }));
  const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(`  写入 data/ssq-draws.json：${merged.length} 期（最新 ${latest}），${kb} KB`);
  return { total: merged.length, source: 'fresh' };
}

if (require.main === module) {
  run().catch(e => { console.error('collect-ssq 异常（不阻断构建）：', e.message); });
}

module.exports = { run };
