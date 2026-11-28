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
     6. build-offline-manifest → data/offline-manifest.json + 根级 sw.js（离线白名单）
     7. apply-site-shell + inject-scripts（守卫）+ 注册表/源产物/死链/WCAG 门禁
   产物即部署内容：仓库根目录 = 站点根（deploy 同步 . → /www/wwwroot/uni-web/）。
   用法：node scripts/build.js（发布路径始终执行完整门禁，不支持跳过）
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { renderRoute } = require('./prerender');
const minify = require('@xuyiheng/static-build-kit/minify'); // WO-164 ④ 私有包化
const fingerprint = require('@xuyiheng/static-build-kit/fingerprint'); // WO-164 ④ 私有包化
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
  if (process.argv.slice(2).length) throw new Error('build.js 不接受跳过参数；诊断请单独运行对应 check 脚本');
  console.log('== xuyiheng-tools build ==');

  const sourceRegistryErrors = require('./check-tool-registry').run({ phase: 'source' });
  if (sourceRegistryErrors.length) throw new Error('源文件注册表门禁失败，已停止构建');

  const site = readJson('data/site.json');
  const data = readJson('data/pages.json');
  const routes = data.routes || [];

  // 构建期采集双色球开奖 → data/ssq-draws.json（fail-soft，源不可达沿用 seed，绝不中断构建）
  try {
    await collectSsq.run();
  } catch (e) {
    console.warn('  collect-ssq 跳过：' + (e && e.message ? e.message : e));
  }

  // WO-191：从已落盘的 calc_click 导出聚合热门工具 → data/tool-popularity.json
  // （fail-soft，无导出/无有效数据时脚本自身 no-op 不写文件，首页沿用 FEATURED 硬编码）
  try {
    require('./aggregate-popularity');
  } catch (e) {
    console.warn('  aggregate-popularity 跳过：' + (e && e.message ? e.message : e));
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
  require('./apply-site-shell').run();

  // 离线 PWA 清单：必须在 prerender 与 apply-site-shell 之后运行（要读已渲染、已套壳的
  // 根级 HTML 才能拿到带 ?v= 令牌的真实资源 URL），且必须在门禁之前（清单本身要被校验）。
  const offlineResult = require('./build-offline-manifest').run();
  if (offlineResult.errors.length) throw new Error('离线清单生成失败，已停止后续检查');

  require('@xuyiheng/static-build-kit/inject-scripts').run(); // WO-164 ④ 私有包化
  const artifactRegistryErrors = require('./check-tool-registry').run({ phase: 'artifacts' });
  if (artifactRegistryErrors.length) throw new Error('构建产物注册表门禁失败，已停止后续检查');
  const artifactErrors = require('./check-build-artifacts').run();
  if (artifactErrors.length) throw new Error('构建产物门禁失败，已停止后续检查');
  require('@xuyiheng/static-build-kit/check-links').run(); // WO-164 ④ 私有包化
  require('./check-tools-sync').run();
  const wcagProblems = require('./check-wcag')();
  if (wcagProblems.length) throw new Error('WCAG 门禁失败：' + wcagProblems.join('；'));

  console.log('== 完成，用时 ' + ((Date.now() - t0) / 1000).toFixed(2) + 's ==');
}

main().catch(e => {
  console.error('构建失败：', e && e.stack ? e.stack : e);
  process.exit(1);
});
