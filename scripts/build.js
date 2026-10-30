#!/usr/bin/env node
'use strict';
/* ==========================================================================
   build.js · 主构建编排（零依赖）
   --------------------------------------------------------------------------
   流程（对齐方案 D1）：
     1. 读 data/site.json + data/pages.json
     2. minify    → 生成 assets 下各 .min 压缩产物
     3. fingerprint → 生成 assets/manifest.json（资源版本 token）
     4. prerender → 逐路由渲染静态 HTML，写入 ROOT/<output>（根级 index.html + 显式 .html 页）
     5. build-sitemap → sitemap.xml
     6. inject-scripts（守卫）+ check-links（死链）；任一失败 exit 1
   产物即部署内容：仓库根目录 = 站点根（deploy 同步 . → /www/wwwroot/uni-web/）。
   用法：node scripts/build.js  |  node scripts/build.js --no-check
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { renderRoute } = require('./prerender');
const minify = require('./minify');
const fingerprint = require('./fingerprint');
const buildSitemap = require('./build-sitemap');
const buildLlms = require('./build-llms');
const collectSsq = require('./collect-ssq');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function writeRoute(route, site, ctx) {
  const html = renderRoute(site, route, ctx);
  const out = route.output || (route.path === 'index' ? 'index.html' : route.path + '.html');
  const abs = path.join(ROOT, out.replace(/\//g, path.sep));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, html);
  return out;
}

/** 清理旧版目录路由产物（<path>/index.html），避免新旧 URL 双份内容 */
function cleanLegacyOutputs(routes) {
  const removeEmpty = (dir) => {
    let cur = dir;
    while (cur !== ROOT && cur.indexOf(ROOT) === 0 && fs.existsSync(cur) && fs.readdirSync(cur).length === 0) {
      fs.rmdirSync(cur);
      cur = path.dirname(cur);
    }
  };
  routes.forEach((route) => {
    const p = String(route.path || '');
    if (!p || p === 'index') return;
    const dir = path.join(ROOT, p);
    const legacy = path.join(dir, 'index.html');
    if (fs.existsSync(legacy)) fs.unlinkSync(legacy);
    removeEmpty(dir);
  });
}

async function main() {
  const t0 = Date.now();
  const skipCheck = process.argv.indexOf('--no-check') !== -1;
  console.log('== xuyiheng-tools build ==');

  const site = readJson('data/site.json');
  const data = readJson('data/pages.json');
  const routes = data.routes || [];

  // 构建期采集双色球开奖 → data/ssq-draws.json（fail-soft，源不可达沿用 seed，绝不中断构建）
  try {
    await collectSsq.run();
  } catch (e) {
    console.warn('  collect-ssq 跳过：' + (e && e.message ? e.message : e));
  }

  minify.run();
  const manifest = fingerprint.run();
  const ctx = { manifest };

  cleanLegacyOutputs(routes);

  let written = 0;
  routes.forEach((route) => {
    writeRoute(route, site, ctx);
    written++;
  });
  console.log('prerender：生成 ' + written + ' 个页面');

  buildSitemap.run();
  buildLlms.run();

  if (!skipCheck) {
    require('./inject-scripts').run();
    require('./check-links').run();
  }

  console.log('== 完成，用时 ' + ((Date.now() - t0) / 1000).toFixed(2) + 's ==');
}

main().catch(e => {
  console.error('构建失败：', e && e.stack ? e.stack : e);
  process.exit(1);
});
