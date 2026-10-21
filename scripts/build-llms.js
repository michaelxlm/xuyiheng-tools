#!/usr/bin/env node
'use strict';
/* ==========================================================================
   build-llms.js · 生成 llms.txt + robots.txt（零依赖）
   --------------------------------------------------------------------------
   读 data/site.json + data/pages.json + data/llms-api.json：
     - llms.txt：面向 LLM/搜索引擎的站点导览（H1 站名 + 简介 + 关键页 + 分类链接
       + WO-124 ## Datasets 开放数据 API 区块）
     - robots.txt：放行全站、指向 sitemap
   用法：node scripts/build-llms.js
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { urlPathOf } = require('./prerender');

const ROOT = path.resolve(__dirname, '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pages.json'), 'utf8'));

// WO-124 DaaS 免费曝光腿：开放数据集清单的站点侧镜像（事实源见文件 _note）
const api = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'llms-api.json'), 'utf8'));

/* 与 main-api/scripts/gen-llms.js 的 buildDatasets() 逐字同步，改格式两处一起改 */
function buildDatasets(a) {
  const lines = [];
  if (!a || !Array.isArray(a.datasets) || !a.datasets.length) return lines;
  const base = (a.base || '').replace(/\/$/, '');
  lines.push('## Datasets');
  lines.push('');
  lines.push('> ' + (a.access || '开放数据 API（供 LLM / Agent 只读调用）。'));
  lines.push('');
  a.datasets.forEach(function (ds) {
    const params = ds.params && ds.params !== '-' ? '（入参：' + ds.params + '）' : '';
    lines.push('- [' + ds.label + '](' + base + ds.path + '): ' + ds.id + ' 数据集' + params + '；鉴权 ' + (a.auth || 'x-api-key') + '。');
  });
  if (a.mcp && a.mcp.endpoint) {
    const tools = (a.mcp.tools || []).join(' / ');
    lines.push('- [MCP Server](' + base + a.mcp.endpoint + '): ' + a.mcp.protocol + '。工具：' + tools + '。');
  }
  if (a.portal) {
    lines.push('- 接入与 Key 申请：开发者门户 ' + base + a.portal);
  }
  lines.push('');
  return lines;
}

function run() {
  const origin = site.url.replace(/\/+$/, '');

  // 约定 AI 搜索爬虫 UA（GEO / LLM-SEO · WO-96 全网放行，与 main-api config.siteGeo.aiBots 一致）
  const AI_BOTS = [ 'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'anthropic-ai', 'PerplexityBot', 'Google-Extended', 'CCBot' ];

  // robots.txt：通用放行 + 显式列出 AI 爬虫 UA 段（收录观测看板逐条校验其存在）
  const robots = [
    'User-agent: *',
    'Allow: /',
    '',
    '# AI 搜索爬虫（GEO / LLM-SEO · WO-96 全网放行）：允许读取公共内容页',
    ...AI_BOTS.map((ua) => 'User-agent: ' + ua),
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
  // WO-124：面向 LLM / Agent 的开放数据集目录（端点 + 入参 + 免费接入，不含单价 / 档位）
  llms += buildDatasets(api).join('\n') + '\n';
  fs.writeFileSync(path.join(ROOT, 'llms.txt'), llms);

  console.log('build-llms：写入 robots.txt + llms.txt（' + routes.length + ' 页）');
  return routes.length;
}

if (require.main === module) run();
module.exports = { run };
