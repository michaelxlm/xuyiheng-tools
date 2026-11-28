'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const offline = require('../../scripts/build-offline-manifest');
const { renderRoute } = require('../../scripts/prerender');

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tool-registry.json'), 'utf8'));
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/site.json'), 'utf8'));
const pages = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/pages.json'), 'utf8'));

function toolById(id) {
  return registry.tools.find((tool) => tool.id === id);
}

test('offlineEligible 严格等于「纯本地计算且无敏感输入字段」', () => {
  for (const tool of registry.tools) {
    assert.equal(typeof tool.offlineEligible, 'boolean', tool.id + ' 的 offlineEligible 必须是显式布尔');
    const expected = tool.computationMode === 'local' && tool.sensitiveFields.length === 0;
    assert.equal(tool.offlineEligible, expected, tool.id + ' 的离线判定与 computationMode/sensitiveFields 不一致');
  }
});

test('敏感本地工具与需要联网的工具一律不进离线清单', () => {
  // 本地可算但含薪资/出生信息/健康数据等输入：不把副本落到设备共享缓存
  for (const id of ['tax', 'social-insurance', 'prepay', 'timezone', 'secret-message', 'health-check', 'life-plan', 'buy-house', 'buy-car']) {
    const tool = toolById(id);
    assert.equal(tool.computationMode, 'local', id + ' 应为本地计算');
    assert.ok(tool.sensitiveFields.length > 0, id + ' 应声明敏感字段');
    assert.equal(tool.offlineEligible, false, id + ' 不得离线缓存');
  }
  // 断网算不出结果，缓存它等于把不可用页面伪装成可离线
  assert.equal(toolById('air-quality').computationMode, 'api');
  assert.equal(toolById('air-quality').offlineEligible, false);
  for (const id of ['calendar', 'fun-test', 'finance-toolkit', 'color-lab']) {
    assert.equal(toolById(id).computationMode, 'hybrid', id + ' 应为混合计算');
    assert.equal(toolById(id).offlineEligible, false, id + ' 不得离线缓存');
  }
  const eligible = registry.tools.filter((tool) => tool.offlineEligible);
  assert.equal(eligible.length, 18);
  assert.ok(eligible.every((tool) => tool.computationMode === 'local' && tool.sensitiveFields.length === 0));
});

test('离线清单只含站点入口、可离线工具页与其引用的版本化同源资源', () => {
  const { errors, manifest } = offline.build();
  assert.deepEqual(errors, []);
  assert.deepEqual(manifest.pages.slice(0, 2), offline.ENTRY_PAGES);
  const eligibleUrls = registry.tools.filter((tool) => tool.offlineEligible).map((tool) => tool.url);
  assert.deepEqual(manifest.pages.slice(2), eligibleUrls);
  assert.deepEqual(manifest.offlineTools, registry.tools.filter((tool) => tool.offlineEligible).map((tool) => tool.id));

  for (const url of manifest.urls) {
    assert.equal(url[0], '/', url + ' 必须是站内绝对路径');
    assert.ok(url.indexOf('//') !== 0, url + ' 不得是协议相对外链');
    assert.ok(!/^[a-z]+:\/\//i.test(url), url + ' 不得是外链');
    assert.ok(url.indexOf('/api/') !== 0, url + ' 不得缓存接口');
    assert.ok(url.indexOf('/data/') !== 0, url + ' 不得暴露源数据目录');
    const pathname = url.split('?')[0];
    const onDisk = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    assert.ok(fs.existsSync(path.join(ROOT, onDisk)), url + ' 指向缺失产物');
    // 资源必须带内容哈希令牌，否则 cache-first 会把更新钉死在旧版本上
    if (pathname.indexOf(offline.ASSET_PREFIX) === 0 && pathname !== '/assets/img/favicon.svg') {
      assert.ok(/[?&]v=/.test(url), url + ' 缺少版本令牌，不应 cache-first');
    }
  }
  const manifestAsset = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
  assert.ok(manifest.urls.includes('/assets/js/sw-register.min.js?v=' + manifestAsset['/assets/js/sw-register.min.js']));
});

test('缓存名由清单内容决定且可复现（无时间戳，重建逐字节一致）', () => {
  const first = offline.build().manifest;
  const second = offline.build().manifest;
  assert.equal(first.cacheName, second.cacheName);
  assert.equal(first.cacheName, offline.cacheNameOf(first.urls));
  assert.equal(offline.renderSw(first), offline.renderSw(second));
  assert.match(first.cacheName, /^xuyiheng-tools-[0-9a-f]{10}$/);
  assert.notEqual(offline.cacheNameOf(first.urls.concat('/extra.html')), first.cacheName);
});

test('生成的 sw.js 无残留占位符、语法可解析且注入点齐备', () => {
  const { manifest } = offline.build();
  const source = fs.readFileSync(path.join(ROOT, 'templates/sw.template.js'), 'utf8');
  for (const needle of [
    "var CACHE_NAME = '__OFFLINE_CACHE_NAME__';",
    'var PRECACHE_URLS = __OFFLINE_PRECACHE_URLS__;',
    'var OFFLINE_PAGES = __OFFLINE_PAGES__;',
  ]) {
    assert.ok(source.includes(needle), '模板缺少注入点：' + needle);
  }
  const sw = offline.renderSw(manifest);
  assert.ok(!sw.includes('__OFFLINE_'), '产物仍残留占位符');
  assert.doesNotThrow(() => new vm.Script(sw, { filename: 'sw.js' }));
  assert.ok(sw.includes('var CACHE_NAME = "' + manifest.cacheName + '";'));
  assert.ok(sw.includes(JSON.stringify(manifest.pages[0])));
  // 跨域与接口必须透传，绝不能被离线策略接管
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.match(sw, /pathname\.indexOf\('\/api\/'\) === 0/);
  assert.match(sw, /request\.method !== 'GET'/);
});

test('离线清单越界条目会被安全不变量拒绝', () => {
  const { manifest } = offline.build();
  const cases = [
    [ '外链', Object.assign({}, manifest, { urls: manifest.urls.concat(['https://api.xuyiheng.com/public/ai-widget.js']) }) ],
    [ '接口路径', Object.assign({}, manifest, { urls: manifest.urls.concat(['/api/v1/front/calc']) }) ],
    [ '源数据目录', Object.assign({}, manifest, { urls: manifest.urls.concat(['/data/tool-registry.json']) }) ],
    [ '未授权条目', Object.assign({}, manifest, { urls: manifest.urls.concat(['/secret.html']) }) ],
    [ '非离线工具页', Object.assign({}, manifest, { pages: manifest.pages.concat([toolById('tax').url]) }) ],
    [ '清单外资源缺失', Object.assign({}, manifest, { urls: manifest.urls.concat(['/assets/js/不存在.min.js?v=0000000000']) }) ],
  ];
  for (const [label, tampered] of cases) {
    assert.ok(offline.invariantErrors(tampered).length > 0, label + ' 应被不变量拒绝');
  }
  // 把敏感工具误标为可离线：不仅自校验要报错，重算出的页面清单也会与磁盘清单不一致
  const tamperedRegistry = JSON.parse(JSON.stringify(registry));
  tamperedRegistry.tools.find((tool) => tool.id === 'tax').offlineEligible = true;
  assert.ok(offline.invariantErrors(manifest, tamperedRegistry).length > 0, 'offlineEligible 与判据不符应报错');
});

test('模板缺少注入点或残留占位符时直接报错，不产出半成品 sw.js', () => {
  const { manifest } = offline.build();
  const broken = "var CACHE_NAME = '__OFFLINE_CACHE_NAME__';";
  assert.throws(() => offline.renderSw(manifest, broken), /缺少注入点/);
  // 三个注入点齐全但仍有多余占位符（如新增赋值行忘了登记注入点）：必须拦截，
  // 否则产物里会留下未定义标识符——语法能过、运行期才报错，且没有任何静态门禁拦得住。
  const residue = [
    "var CACHE_NAME = '__OFFLINE_CACHE_NAME__';",
    'var PRECACHE_URLS = __OFFLINE_PRECACHE_URLS__;',
    'var OFFLINE_PAGES = __OFFLINE_PAGES__;',
    'var EXTRA_LIST = __OFFLINE_EXTRA_LIST__;',
  ].join('\n');
  assert.throws(() => offline.renderSw(manifest, residue), /未替换/);
});

test('全站页面都注册离线 Service Worker 且注册脚本已纳入资源指纹', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
  assert.ok(manifest['/assets/js/sw-register.min.js'], 'sw-register.min.js 未纳入指纹令牌');
  const ctx = { manifest };
  for (const route of [ pages.routes.find((r) => r.path === 'index'), pages.routes.find((r) => r.type === 'tool') ]) {
    const html = renderRoute(site, route, ctx);
    assert.match(html, /<script src="\/assets\/js\/sw-register\.min\.js\?v=[0-9a-f]{10}" defer><\/script>/);
    assert.ok(html.indexOf('sw-register.min.js') > html.indexOf('combo-popularity.js'), '注册脚本应排在业务脚本之后');
  }
});

test('离线产物与当前源码同步（改了注册表或模板必须重新构建）', () => {
  assert.deepEqual(offline.verify(), []);
});
