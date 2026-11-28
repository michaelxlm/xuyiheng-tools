#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function run(options) {
  const phase = options && options.phase || 'artifacts';
  const errors = [];
  const registryPath = path.join(ROOT, 'data/tool-registry.json');
  if (!fs.existsSync(registryPath)) throw new Error('缺少 data/tool-registry.json，请运行 node scripts/generate-tool-registry.js');
  const registry = readJson('data/tool-registry.json');
  const expected = require('./generate-tool-registry').buildRegistry();
  if (JSON.stringify(registry) !== JSON.stringify(expected)) errors.push('工具注册表与 pages/site/入口脚本不一致，请重新生成');
  const ids = new Set();
  const urls = new Set();
  for (const tool of registry.tools || []) {
    if (!tool.id || ids.has(tool.id)) errors.push('工具 ID 缺失或重复：' + tool.id);
    if (!tool.url || urls.has(tool.url)) errors.push('工具 URL 缺失或重复：' + tool.url);
    ids.add(tool.id);
    urls.add(tool.url);
    for (const rel of [tool.template, tool.entryScript, tool.module && 'assets/js/tools/' + tool.module + '.js'].filter(Boolean)) {
      if (!fs.existsSync(path.join(ROOT, rel))) errors.push(tool.id + ' 缺少源文件：' + rel);
      else if (phase !== 'source' && /\.js$/.test(rel) && !fs.existsSync(path.join(ROOT, rel.replace(/\.js$/, '.min.js')))) errors.push(tool.id + ' 缺少压缩产物：' + rel.replace(/\.js$/, '.min.js'));
    }
    for (const policy of tool.policyDependencies || []) {
      const policyPath = path.join(ROOT, 'data/policies', policy + '.json');
      if (!fs.existsSync(policyPath)) errors.push(tool.id + ' 缺少政策快照：' + policy);
      else {
        try {
          const snapshot = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
          const sources = Array.isArray(snapshot.sources) ? snapshot.sources : [];
          if (snapshot.id !== policy || !snapshot.title || !snapshot.version || !sources.length || sources.some((s) => !s || !/^https?:\/\//.test(s.url || ''))) {
            errors.push(tool.id + ' 政策快照字段不完整：' + policy);
          }
        } catch (error) {
          errors.push(tool.id + ' 政策快照无法解析：' + policy);
        }
      }
    }
    for (const field of ['computationMode', 'resultVersion', 'mobileLayout']) {
      if (!tool[field]) errors.push(tool.id + ' 缺少注册属性：' + field);
    }
    // 离线标记必须是显式布尔（不能靠「非空即真」）；与判据的一致性由
    // check-build-artifacts → build-offline-manifest.verify() 单点核对，避免规则两处漂移。
    if (typeof tool.offlineEligible !== 'boolean') errors.push(tool.id + ' 缺少注册属性：offlineEligible（布尔）');
    if (!Array.isArray(tool.sensitiveFields) || !Array.isArray(tool.analyticsAllowlist)) errors.push(tool.id + ' 的敏感字段或事件白名单不是数组');
  }
  if ((registry.tools || []).length !== 45) errors.push('独立工具注册数必须为 45（不含 combo/index 汇总页）');
  if (errors.length) {
    console.error('[check-tool-registry] 失败：\n  ' + errors.join('\n  '));
    process.exitCode = 1;
  } else {
    console.log('[check-tool-registry] 通过（' + phase + '）：45 个独立工具，模板、入口、模块与政策快照完整');
  }
  return errors;
}

if (require.main === module) run();
module.exports = { run };
