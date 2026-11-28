#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const minify = require('@xuyiheng/static-build-kit/minify');

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 10);
}

function shellToken() {
  const hash = crypto.createHash('sha256');
  for (const rel of ['assets/css/site-shell.css', 'assets/js/site-shell.js']) {
    const file = path.join(ROOT, rel);
    if (fs.existsSync(file)) hash.update(fs.readFileSync(file));
  }
  return hash.digest('hex').slice(0, 10);
}

function run() {
  const errors = [];
  const expectedManifestUrls = new Set();
  for (const kind of ['css', 'js']) {
    for (const source of minify.walkSourceFiles(path.join(ROOT, 'assets', kind))) {
      const text = fs.readFileSync(source, 'utf8');
      if (kind === 'js') {
        try { new vm.Script(text, { filename: path.relative(ROOT, source) }); }
        catch (error) { errors.push('JavaScript 源文件语法错误：' + path.relative(ROOT, source) + '：' + error.message); }
      }
      const expected = (kind === 'css' ? minify.minifyCss(text) : minify.minifyJs(text)) + '\n';
      const target = source.replace(/\.(css|js)$/, '.min.$1');
      expectedManifestUrls.add('/' + path.relative(ROOT, target).replace(/\\/g, '/'));
      if (!fs.existsSync(target)) errors.push('缺少 min 产物：' + path.relative(ROOT, target));
      else {
        const artifact = fs.readFileSync(target, 'utf8');
        if (kind === 'js') {
          try { new vm.Script(artifact, { filename: path.relative(ROOT, target) }); }
          catch (error) { errors.push('JavaScript 构建产物语法错误：' + path.relative(ROOT, target) + '：' + error.message); }
        }
        if (artifact !== expected) errors.push('min 产物过期：' + path.relative(ROOT, target));
      }
    }
  }

  const manifestPath = path.join(ROOT, 'assets/manifest.json');
  let manifest = {};
  if (!fs.existsSync(manifestPath)) errors.push('缺少 assets/manifest.json');
  else {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const [url, token] of Object.entries(manifest)) {
      const file = path.join(ROOT, url.replace(/^\/+/, ''));
      if (!fs.existsSync(file)) errors.push('manifest 指向缺失资源：' + url);
      else if (hashFile(file) !== token) errors.push('manifest 版本过期：' + url);
    }
    for (const url of expectedManifestUrls) {
      if (!Object.prototype.hasOwnProperty.call(manifest, url)) errors.push('manifest 缺少资源版本：' + url);
    }
  }

  const shellUrls = new Set(['/assets/css/site-shell.css', '/assets/js/site-shell.js']);
  const expectedShellToken = shellToken();
  const pages = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pages.json'), 'utf8'));
  const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
  const { sourceDigest } = require('./prerender');
  for (const route of pages.routes || []) {
    const output = route.output || (route.path === 'index' ? 'index.html' : route.path + '.html');
    const file = path.join(ROOT, output);
    if (!fs.existsSync(file)) errors.push('缺少页面产物：' + output);
    else {
      const html = fs.readFileSync(file, 'utf8');
      const digest = sourceDigest(site, route);
      if (!html.includes('name="xuyiheng-source-digest" content="' + digest + '"')) errors.push('页面产物与源文件不一致：' + output);
      const checkedRefs = new Set();
      for (const match of html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)) {
        const ref = match[1];
        if (checkedRefs.has(ref)) continue;
        checkedRefs.add(ref);
        const parsed = new URL(ref, 'https://local.invalid');
        const expected = manifest[parsed.pathname];
        const version = parsed.searchParams.get('v');
        if (shellUrls.has(parsed.pathname)) {
          if (version !== expectedShellToken) errors.push('HTML 共享外壳资源版本过期：' + output + ' → ' + ref);
        } else if (expected) {
          if (version !== expected) errors.push('HTML 资源版本过期：' + output + ' → ' + ref);
        } else if (version) {
          errors.push('HTML 引用未登记资源：' + output + ' → ' + parsed.pathname);
        } else if (!fs.existsSync(path.join(ROOT, parsed.pathname.replace(/^\/+/, '')))) {
          errors.push('HTML 引用缺失资源：' + output + ' → ' + parsed.pathname);
        }
      }
    }
  }

  // 离线 PWA 产物：sw.js 与离线清单同为构建产物，按当前注册表/页面重算逐字比对，
  // 并同时断言安全不变量（不含接口/跨域/敏感工具页）——改了注册表或模板而未重建即红。
  for (const error of require('./build-offline-manifest').verify()) errors.push(error);

  if (errors.length) {
    console.error('[check-build-artifacts] 失败：\n  ' + errors.join('\n  '));
    process.exitCode = 1;
  } else console.log('[check-build-artifacts] 通过：min、manifest 与全部页面源产物一致');
  return errors;
}

if (require.main === module) run();
module.exports = { run };
