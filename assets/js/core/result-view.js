/* ==========================================================================
   result-view.js · 统一结果契约的浏览器渲染（仅 DOM，不理解工具业务）
   ========================================================================== */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.ToolCore = root.ToolCore || {};
    root.ToolCore.ResultView = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clear(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function textNode(value) {
    return String(value == null ? '' : value);
  }

  function renderDetails(list, details) {
    if (!list) return;
    clear(list);
    (details || []).forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'result-detail-row';
      var dt = document.createElement('dt');
      var dd = document.createElement('dd');
      dt.textContent = textNode(item.label);
      dd.textContent = textNode(item.value) + (item.note ? ' ' + textNode(item.note) : '');
      row.appendChild(dt);
      row.appendChild(dd);
      list.appendChild(row);
    });
  }

  function sourceText(source) {
    var s = source || {};
    var parts = [];
    if (s.name) parts.push(s.name);
    if (s.standard) parts.push(s.standard);
    if (s.version) parts.push('版本 ' + s.version);
    if (s.policyYear) parts.push(s.policyYear + ' 年');
    if (s.title) parts.push(s.title);
    if (s.jurisdiction) parts.push(s.jurisdiction);
    if (s.effectiveDate) parts.push('生效 ' + s.effectiveDate);
    var urls = Array.isArray(s.urls) ? s.urls : (Array.isArray(s.sources) ? s.sources.map(function (x) { return x.url; }) : []);
    urls.filter(Boolean).forEach(function (url) { parts.push(url); });
    return parts.join('；') || '本工具未声明外部政策来源';
  }

  function renderExplanation(host, result) {
    if (!host) return;
    clear(host);
    var r = result || {};
    var sections = [
      { title: '如何计算', text: r.formula || '本工具未提供公式说明' },
      { title: '数据依据', text: sourceText(r.source) },
      { title: '适用范围与误差', items: (r.assumptions || []).concat(r.limitations || []) },
    ];
    sections.forEach(function (section) {
      var details = document.createElement('details');
      details.className = 'result-explain';
      var summary = document.createElement('summary');
      summary.textContent = section.title;
      details.appendChild(summary);
      var body = document.createElement('div');
      if (section.items) {
        var list = document.createElement('ul');
        section.items.forEach(function (item) {
          var li = document.createElement('li');
          li.textContent = textNode(item);
          list.appendChild(li);
        });
        body.appendChild(list);
      } else {
        body.textContent = section.text;
      }
      details.appendChild(body);
      host.appendChild(details);
    });
  }

  function renderError(host, result) {
    if (!host) return;
    clear(host);
    var errors = result && Array.isArray(result.errors) ? result.errors : [];
    host.textContent = errors.join('；');
    host.hidden = errors.length === 0;
  }

  return {
    clear: clear,
    renderDetails: renderDetails,
    renderExplanation: renderExplanation,
    renderError: renderError,
    sourceText: sourceText,
  };
});
