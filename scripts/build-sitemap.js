#!/usr/bin/env node
'use strict';
/* ==========================================================================
   build-sitemap.js · 生成 sitemap.xml（零依赖）
   --------------------------------------------------------------------------
   读 data/pages.json + data/site.json，输出可收录（indexable!==false）路由的
   canonical URL 到站点根 sitemap.xml。sitemap URL 数 == 可收录页数（验收项）。
   用法：node scripts/build-sitemap.js
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { urlPathOf } = require('./prerender');

const ROOT = path.resolve(__dirname, '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pages.json'), 'utf8'));

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function run() {
  const origin = site.url.replace(/\/+$/, '');
  const today = new Date().toISOString().slice(0, 10);
  const routes = (data.routes || []).filter((r) => r.indexable !== false);
  const urls = routes.map((r) => {
    const loc = esc(origin + urlPathOf(r));
    const pri = r.path === 'index' ? '1.0' : (r.type === 'tool' ? '0.8' : '0.6');
    return '  <url>\n    <loc>' + loc + '</loc>\n    <lastmod>' + today + '</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>' + pri + '</priority>\n  </url>';
  }).join('\n');

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '\n</urlset>\n';
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
  console.log('build-sitemap：写入 sitemap.xml（' + routes.length + ' 条 URL）');
  return routes.length;
}

if (require.main === module) run();
module.exports = { run };
