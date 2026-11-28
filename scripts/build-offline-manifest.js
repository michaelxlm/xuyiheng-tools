#!/usr/bin/env node
'use strict';
/* ==========================================================================
   build-offline-manifest.js · 离线白名单生成（零依赖，构建期）
   --------------------------------------------------------------------------
   输入：data/tool-registry.json（offlineEligible 判据）+ 已渲染并套壳的根级 HTML 产物
   输出：data/offline-manifest.json（审计与门禁用清单）
         sw.js（站点根级 Service Worker，内联同一份清单 —— 必须在站点根，
                脚本 URL 决定 scope，放子目录就只能离线那一个目录）

   为什么构建期生成而不是运行期拉清单：
     1. 免一次网络往返，断网首装也能拿到白名单；
     2. 清单落进 sw.js 就是可 review、可门禁的产物，避免「手写第二份离线名单」
        与注册表漂移（同 localStorage 键名双清单的历史教训）；
     3. 资源 URL 带 ?v=<内容哈希>，只有构建后才存在，运行期无从推导。

   确定性：缓存名取清单内容哈希，不含时间戳 —— 同一份源码重复构建逐字节一致。
   用法：node scripts/build-offline-manifest.js（build.js 在 apply-site-shell 之后调用）
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_REL = 'templates/sw.template.js';
const MANIFEST_REL = 'data/offline-manifest.json';
const SW_REL = 'sw.js';

/* 站点入口：site.webmanifest 的 start_url 是 /index.html，同时保留根路径 '/'，
   两者是同一文件的两个缓存键（用户从哪个入口进都能离线打开）。 */
const ENTRY_PAGES = [ '/', '/index.html' ];

/* 允许进入预缓存的引用前缀：只有带版本令牌的同源静态资源与安装清单。
   其余绝对路径（/api/、/data/、/reports/、/sitemap.xml 等）一律不进——
   要么内容随时变化，要么本就不该被离线副本暴露。 */
const ASSET_PREFIX = '/assets/';
const EXTRA_ALLOW = [ '/site.webmanifest' ];

const REF_RE = /(?:src|href)="(\/[^"]*)"/g;

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

/** 页面 URL → 仓库内产物相对路径（构建产物即部署内容，根 = 站点根） */
function fileOfPage(url) {
  const pathname = String(url).split('?')[0].split('#')[0];
  if (pathname === '/' || pathname === '') return 'index.html';
  return decodeURIComponent(pathname.replace(/^\/+/, ''));
}

function pathnameOf(url) {
  return String(url).split('?')[0].split('#')[0];
}

/** 从注册表推导离线页面清单（入口页 + offlineEligible 工具页），保持注册表顺序 */
function offlinePages(registry) {
  const pages = ENTRY_PAGES.slice();
  for (const tool of registry.tools || []) {
    if (tool.offlineEligible === true && pages.indexOf(tool.url) === -1) pages.push(tool.url);
  }
  return pages;
}

/** 抽取页面实际引用的同源静态资源（含 ?v= 令牌原文，逐字与 HTML 引用一致） */
function assetsOfPage(html) {
  const found = [];
  let match;
  REF_RE.lastIndex = 0;
  while ((match = REF_RE.exec(html))) {
    const ref = match[1];
    if (ref.indexOf('//') === 0) continue; // 协议相对外链
    if (ref.indexOf(ASSET_PREFIX) === 0 || EXTRA_ALLOW.indexOf(pathnameOf(ref)) !== -1) found.push(ref);
  }
  return found;
}

/** 缓存名由清单内容决定（不含时间戳）：内容变则换缓存、内容不变则重建产物逐字节一致。 */
function cacheNameOf(urls) {
  return 'xuyiheng-tools-' + crypto.createHash('sha256').update(JSON.stringify(urls)).digest('hex').slice(0, 10);
}

function build() {
  const registry = readJson('data/tool-registry.json');
  const pages = offlinePages(registry);
  const missing = [];
  const urls = [];
  const seen = new Set();

  const push = (url) => {
    if (seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  };

  for (const page of pages) {
    const rel = fileOfPage(page);
    if (!fs.existsSync(path.join(ROOT, rel))) {
      missing.push(page + ' → ' + rel);
      continue;
    }
    push(pathnameOf(page));
    assetsOfPage(fs.readFileSync(path.join(ROOT, rel), 'utf8')).forEach(push);
  }

  const assets = urls.filter((url) => url.indexOf(ASSET_PREFIX) === 0 || EXTRA_ALLOW.indexOf(pathnameOf(url)) !== -1).sort();
  const pageUrls = urls.filter((url) => assets.indexOf(url) === -1);
  const ordered = pageUrls.concat(assets);

  return {
    errors: missing.map((item) => '离线页面缺少构建产物：' + item),
    manifest: {
      version: registry.version || '',
      generatedBy: 'scripts/build-offline-manifest.js',
      cacheName: cacheNameOf(ordered),
      pages: pageUrls,
      offlineTools: (registry.tools || []).filter((t) => t.offlineEligible === true).map((t) => t.id),
      urls: ordered,
    },
  };
}

/** 安全不变量：任何一条被破坏都应中断构建，而不是等线上出现越界缓存。
 *  registryOverride 仅供测试注入（避免为验证篡改场景而改写仓库内的注册表产物）。 */
function invariantErrors(manifest, registryOverride) {
  const registry = registryOverride || readJson('data/tool-registry.json');
  const errors = [];
  const byUrl = new Map((registry.tools || []).map((t) => [ t.url, t ]));

  for (const url of manifest.urls || []) {
    if (url.indexOf('//') === 0 || /:\/\//.test(url)) errors.push('离线清单含外链：' + url);
    if (url.indexOf('/api/') === 0) errors.push('离线清单含接口路径：' + url);
    if (url.indexOf('/data/') === 0) errors.push('离线清单含源数据目录：' + url);
    if (pathnameOf(url).indexOf(ASSET_PREFIX) !== 0 && EXTRA_ALLOW.indexOf(pathnameOf(url)) === -1
      && ENTRY_PAGES.indexOf(pathnameOf(url)) === -1 && !byUrl.has(pathnameOf(url))) {
      errors.push('离线清单含未授权条目：' + url);
    }
    if (pathnameOf(url).indexOf(ASSET_PREFIX) === 0 && !fs.existsSync(path.join(ROOT, pathnameOf(url).replace(/^\/+/, '')))) {
      errors.push('离线清单指向缺失资源：' + url);
    }
  }

  for (const tool of registry.tools || []) {
    const offline = tool.computationMode === 'local' && !(tool.sensitiveFields || []).length;
    if (tool.offlineEligible !== offline) errors.push(tool.id + ' offlineEligible 与判据不符（应为 ' + offline + '）');
    if (!offline && (manifest.pages || []).indexOf(tool.url) !== -1) errors.push('不可离线工具进入清单：' + tool.id);
  }
  for (const page of manifest.pages || []) {
    if (ENTRY_PAGES.indexOf(page) === -1 && !byUrl.has(page)) errors.push('离线清单含未注册页面：' + page);
    else if (byUrl.has(page) && byUrl.get(page).offlineEligible !== true) errors.push('离线清单含非离线工具页：' + page);
  }
  return errors;
}

function formatList(items) {
  if (!items.length) return '[]';
  return '[\n' + items.map((item) => '  ' + JSON.stringify(item)).join(',\n') + '\n]';
}

/* 注入点按「整行字面量」匹配而不是只匹配占位符名：早期版本只替换占位符名，
   模板注释里提到同一个名字就把注释当成首个命中项，真正的 var 赋值行反而没被
   替换，产物留下一个未定义标识符（语法能过、运行期 ReferenceError，且无任何门禁拦得住）。
   现在缺注入点直接报错，替换后若仍残留占位符名同样报错。 */
const SW_ASSIGNMENTS = [
  [ "var CACHE_NAME = '__OFFLINE_CACHE_NAME__';", (m) => 'var CACHE_NAME = ' + JSON.stringify(m.cacheName) + ';' ],
  [ 'var PRECACHE_URLS = __OFFLINE_PRECACHE_URLS__;', (m) => 'var PRECACHE_URLS = ' + formatList(m.urls) + ';' ],
  [ 'var OFFLINE_PAGES = __OFFLINE_PAGES__;', (m) => 'var OFFLINE_PAGES = ' + formatList(m.pages) + ';' ],
];
const PLACEHOLDER_MARK = '__OFFLINE_';

function renderSw(manifest, templateText) {
  const template = templateText === undefined
    ? fs.readFileSync(path.join(ROOT, TEMPLATE_REL), 'utf8')
    : String(templateText);
  let out = template;
  for (const [ needle, make ] of SW_ASSIGNMENTS) {
    if (out.indexOf(needle) === -1) throw new Error('离线模板缺少注入点（整行匹配失败）：' + needle);
    out = out.replace(needle, make(manifest));
  }
  if (out.indexOf(PLACEHOLDER_MARK) !== -1) throw new Error('离线模板存在未替换的占位符，请检查模板与注入点是否一致');
  // 根级 sw.js 不在 assets/ 下，不会被 check-build-artifacts 的 vm 语法检查覆盖，这里自守。
  try { new vm.Script(out, { filename: SW_REL }); }
  catch (error) { throw new Error('生成的 sw.js 语法错误：' + error.message); }
  return out;
}

function run() {
  const { errors, manifest } = build();
  if (errors.length) {
    console.error('[build-offline-manifest] 失败：\n  ' + errors.join('\n  '));
    process.exitCode = 1;
    return { errors, manifest };
  }
  const invariant = invariantErrors(manifest);
  if (invariant.length) {
    console.error('[build-offline-manifest] 失败：\n  ' + invariant.join('\n  '));
    process.exitCode = 1;
    return { errors: invariant, manifest };
  }
  fs.writeFileSync(path.join(ROOT, MANIFEST_REL), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, SW_REL), renderSw(manifest));
  console.log('[build-offline-manifest] 离线清单：' + manifest.pages.length + ' 页 / '
    + manifest.urls.length + ' 项，缓存名 ' + manifest.cacheName);
  return { errors: [], manifest };
}

/** 门禁：按当前源码重算清单，与磁盘产物逐字比对（产物过期即红，杜绝改了注册表没重建） */
function verify() {
  const { errors, manifest } = build();
  if (errors.length) return errors;
  const invariant = invariantErrors(manifest);
  if (invariant.length) return invariant;

  if (!fs.existsSync(path.join(ROOT, MANIFEST_REL))) return [ '缺少 ' + MANIFEST_REL ];
  if (!fs.existsSync(path.join(ROOT, SW_REL))) return [ '缺少站点根级 ' + SW_REL ];

  const onDisk = fs.readFileSync(path.join(ROOT, MANIFEST_REL), 'utf8');
  if (onDisk !== JSON.stringify(manifest, null, 2) + '\n') errors.push('离线清单产物过期：请重新构建（' + MANIFEST_REL + '）');
  const swOnDisk = fs.readFileSync(path.join(ROOT, SW_REL), 'utf8');
  if (swOnDisk !== renderSw(manifest)) errors.push('sw.js 产物过期：请重新构建（模板或离线清单已变化）');
  return errors;
}

if (require.main === module) {
  const result = process.argv.includes('--verify') ? { errors: verify(), manifest: null } : run();
  if (result.errors.length) process.exit(1);
}

module.exports = { run, verify, build, renderSw, invariantErrors, offlinePages, cacheNameOf, ENTRY_PAGES, ASSET_PREFIX };
