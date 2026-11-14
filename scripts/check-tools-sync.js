#!/usr/bin/env node
'use strict';
/* ==========================================================================
   check-tools-sync.js · 工具清单一致性门禁（零依赖）
   --------------------------------------------------------------------------
   单一事实源约束：
     - data/site.json → sidebar_categories 是「展示清单」唯一事实源
     - data/pages.json → type==='tool' 且 indexable!==false 的路由是「可展示工具」全集
   两者必须双向一致：
     1) 任一可展示工具都必须在侧栏导航列出（否则新增工具只改 pages.json 就不会在 UI 出现）
     2) 侧栏任一链接都必须对应一个真实路由（杜绝死链）
   失败 exit 1（构建门禁）；成功打印通过信息与工具数。
   用法：node scripts/check-tools-sync.js
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function urlOf(r) {
  const p = String(r.path || '');
  if (!p || p === 'index') return '/';
  return '/' + p.replace(/^\/+|\/+$/g, '') + '.html';
}

function run() {
  const site = readJson('data/site.json');
  const data = readJson('data/pages.json');

  const nav = new Set();
  (site.sidebar_categories || []).forEach((cat) => {
    (cat.items || []).forEach((it) => { if (it.url) nav.add(it.url); });
  });

  const routes = data.routes || [];
  const allUrls = new Set(routes.map(urlOf));
  const toolUrls = new Set(
    routes.filter((r) => r.type === 'tool' && r.indexable !== false).map(urlOf)
  );

  const errors = [];
  toolUrls.forEach((u) => { if (!nav.has(u)) errors.push('工具未在任何侧栏分类列出（pages.json 已收录但 UI 不可见）: ' + u); });
  nav.forEach((u) => { if (!allUrls.has(u)) errors.push('侧栏链接指向不存在的路由（死链）: ' + u); });

  if (errors.length) {
    console.error('[check-tools-sync] 失败（' + errors.length + ' 处不一致）：\n  ' + errors.join('\n  '));
    process.exit(1);
  }
  console.log('[check-tools-sync] 通过：' + toolUrls.size + ' 个可展示工具全部在侧栏可见，侧栏无死链');
}

module.exports = { run };
if (require.main === module) run();
