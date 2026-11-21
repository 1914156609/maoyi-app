import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../maoyi-admin/package.json', import.meta.url));
const Vue = require('vue');
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc');
const { transformSync } = require('esbuild');
const root = new URL('../../../maoyi-admin/src/', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function loadModule(source, deps, globals = {}) {
  const module = { exports: {} };
  Function('module', 'exports', 'require', ...Object.keys(globals), transformSync(source, { format: 'cjs' }).code)(module, module.exports, name => deps[name], ...Object.values(globals));
  return module.exports;
}
function drawer() {
  const requests = [];
  const lifecycle = { deactivated: [], activated: [], unmounted: [] };
  const vue = { ...Vue, onDeactivated: fn => lifecycle.deactivated.push(fn), onActivated: fn => lifecycle.activated.push(fn), onBeforeUnmount: fn => lifecycle.unmounted.push(fn) };
  const latest = loadModule(read('utils/useLatestRequest.js'), { vue });
  const { descriptor, errors } = parse(read('views/system/dict/detail.vue'));
  assert.deepEqual(errors, []);
  const script = compileScript(descriptor, { id: 'dict-drawer-recovery' });
  const template = compileTemplate({ source: descriptor.template.content, id: 'dict-drawer-recovery', compilerOptions: { bindingMetadata: script.bindings } });
  assert.deepEqual(template.errors, []);
  const api = { listData: (params, signal) => { const request = { ...deferred(), params, signal }; requests.push(request); return request.promise; } };
  const component = loadModule(script.content, { vue, '@/utils/useLatestRequest': latest, '@/api/system/dict/data': api }, vue).default;
  const props = Vue.reactive({ visible: true, row: { dictType: 'first' } });
  const state = component.setup(props, { expose() {}, emit() {} });
  return { props, state, requests, lifecycle, template: descriptor.template.content };
}

test('dictionary drawer retains an explicit request failure and exposes retry, then distinguishes successful empty results', async () => {
  const { state: s, requests, template } = drawer();
  const failed = s.loadData(); requests[0].reject(new Error('HTTP 500')); await failed;
  assert.equal(s.loading.value, false);
  assert.equal(s.dataList.value.length, 0);
  assert.equal(s.loadError.value, '字典数据加载失败，请重试。');
  assert.match(template, /loadError\s*\|\|\s*'暂无字典数据'/);
  assert.match(template, /<el-button[^>]+v-if="loadError"[^>]+@click="loadData"[^>]*>重新加载<\/el-button>/);
  await settle();
  assert.equal(s.loadError.value, '字典数据加载失败，请重试。', 'failure remains after global toast lifetime');
  const retry = s.loadData();
  assert.equal(s.loadError.value, ''); assert.equal(s.loading.value, true);
  requests[1].resolve({ rows: [], total: 0 }); await retry;
  assert.equal(s.loadError.value, ''); assert.equal(s.loading.value, false);
  assert.deepEqual(s.dataList.value, []);
});

test('dictionary drawer discards partial pages on failure and retries the same dictionary from the first page', async () => {
  const { state: s, requests } = drawer();
  const first = s.loadData();
  requests[0].resolve({ rows: Array.from({ length: 100 }, (_, i) => ({ dictCode: i })), total: 101 }); await settle();
  assert.equal(requests[1].params.pageNum, 2);
  requests[1].reject(new Error('page 2 unavailable')); await first;
  assert.equal(s.dataList.value.length, 0); assert.ok(s.loadError.value);
  const retry = s.loadData();
  assert.equal(requests[2].params.dictType, 'first'); assert.equal(requests[2].params.pageNum, 1);
  requests[2].resolve({ rows: [{ dictCode: 102 }], total: 1 }); await retry;
  assert.equal(s.loadError.value, ''); assert.equal(s.dataList.value[0].dictCode, 102);
});

test('closing or changing dictionaries clears failures and obsolete rejection cannot replace current success', async () => {
  const { state: s, props, requests } = drawer();
  const failed = s.loadData(); requests[0].reject(new Error('unavailable')); await failed;
  props.visible = false; await Vue.nextTick();
  assert.equal(s.loadError.value, ''); assert.equal(s.loading.value, false);
  props.visible = true; await Vue.nextTick();
  const old = requests[1];
  props.row = { dictType: 'second' }; await Vue.nextTick();
  assert.equal(old.signal.aborted, true); assert.equal(s.loadError.value, '');
  requests[2].resolve({ rows: [{ dictCode: 2 }], total: 1 }); await settle();
  old.reject(new Error('late obsolete failure')); await settle();
  assert.equal(s.loadError.value, ''); assert.equal(s.dataList.value[0].dictCode, 2);
  const pending = s.loadData(); const last = requests.at(-1);
  props.visible = false; await Vue.nextTick();
  last.reject(new Error('late after close')); await pending;
  assert.equal(s.loadError.value, ''); assert.equal(s.dataList.value.length, 0);
});

test('an invalid or hidden dictionary target cancels reads and cannot issue a request', async () => {
  const { state: s, props, requests } = drawer();
  const current = s.loadData();
  props.row = {}; await Vue.nextTick();
  assert.equal(requests[0].signal.aborted, true);
  requests[0].reject(new Error('old target')); await current;
  assert.equal(requests.length, 1); assert.equal(s.loadError.value, '');
  props.visible = false; await Vue.nextTick();
  props.row = { dictType: 'hidden' }; await Vue.nextTick();
  await s.loadData();
  assert.equal(requests.length, 1);
});
