#!/usr/bin/env node
'use strict';
/* ==========================================================================
   build-llms.js · 生成 llms.txt + robots.txt（零依赖）
   --------------------------------------------------------------------------
   读 data/site.json + data/pages.json：
     - llms.txt：面向 LLM/搜索引擎的站点导览（H1 站名 + 简介 + 关键页 + 分类链接）
     - robots.txt：放行全站、指向 sitemap
   用法：node scripts/build-llms.js
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { urlPathOf } = require('./prerender');

const ROOT = path.resolve(__dirname, '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pages.json'), 'utf8'));

function run() {
  const origin = site.url.replace(/\/+$/, '');

  // robots.txt
  const robots = [
    'User-agent: *',
    'Allow: /',
    '',
    'Sitemap: ' + origin + '/sitemap.xml',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), robots);

  // llms.txt
  const routes = (data.routes || []).filter((r) => r.indexable !== false);
  const byCat = {};
  routes.forEach((r) => {
    if (r.path === 'index') return;
    const cat = r.category || '其他';
    (byCat[cat] = byCat[cat] || []).push(r);
  });
  const CAT_LABEL = { calculator: '计算器', calendar: '日历工具', combo: '场景组合', tools: '其他工具', core: '核心页面', info: '关于' };
  let llms = '# ' + site.site_name + '\n\n';
  llms += '> ' + (site.description || '') + '\n\n';
  llms += '本站为纯在线工具站，无需注册登录，打开即用。以下按分类列出全部页面（Markdown 链接）。\n\n';
  llms += '## 首页\n- [首页](' + origin + '/): ' + (site.description || '') + '\n\n';
  Object.keys(byCat).forEach(function (cat) {
    llms += '## ' + (CAT_LABEL[cat] || cat) + '\n';
    byCat[cat].forEach(function (r) {
      llms += '- [' + r.title.split(' - ')[0] + '](' + origin + urlPathOf(r) + '): ' + (r.description || '') + '\n';
    });
    llms += '\n';
  });
  fs.writeFileSync(path.join(ROOT, 'llms.txt'), llms);

  console.log('build-llms：写入 robots.txt + llms.txt（' + routes.length + ' 页）');
  return routes.length;
}

if (require.main === module) run();
module.exports = { run };
