/* ==========================================================================
   result.js · 工具统一结果契约（无 DOM，可在 Node 与浏览器运行）
   ========================================================================== */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.ToolCore = root.ToolCore || {};
    root.ToolCore.Result = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STATUSES = ['success', 'invalid', 'error', 'empty', 'offline', 'timeout'];

  function create(toolId, options) {
    var o = options || {};
    var status = o.status == null ? 'success' : o.status;
    if (STATUSES.indexOf(status) < 0) throw new Error('不支持的结果状态：' + status);
    return {
      schemaVersion: '1.0',
      toolId: String(toolId || ''),
      status: status,
      metrics: o.metrics && typeof o.metrics === 'object' ? o.metrics : {},
      details: Array.isArray(o.details) ? o.details : [],
      formula: String(o.formula || ''),
      assumptions: Array.isArray(o.assumptions) ? o.assumptions : [],
      source: o.source && typeof o.source === 'object' ? o.source : {},
      precision: o.precision && typeof o.precision === 'object' ? o.precision : { money: 2 },
      limitations: Array.isArray(o.limitations) ? o.limitations : [],
      errors: Array.isArray(o.errors) ? o.errors : [],
      generatedAt: o.generatedAt || new Date().toISOString(),
    };
  }

  function invalid(toolId, message, source) {
    return create(toolId, {
      status: 'invalid',
      errors: [String(message || '参数不合法')],
      source: source || {},
      limitations: ['参数修正前不生成计算结果'],
    });
  }

  function detail(label, value, note) {
    return { label: String(label || ''), value: value, note: note == null ? '' : String(note) };
  }

  return { create: create, invalid: invalid, detail: detail, statuses: STATUSES.slice() };
});
