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
function loadModule(source, dependencies, globals = {}) {
  const module = { exports: {} };
  Function('module', 'exports', 'require', ...Object.keys(globals), transformSync(source, { format: 'cjs' }).code)(module, module.exports, name => dependencies[name], ...Object.values(globals));
  return module.exports;
}
function page(dictId) {
  if (arguments.length === 0) dictId = '105';
  const requests = { types: [], options: [], lists: [] };
  const hooks = { activated: [], deactivated: [], unmounted: [] };
  const vue = { ...Vue, onActivated: fn => hooks.activated.push(fn), onDeactivated: fn => hooks.deactivated.push(fn), onBeforeUnmount: fn => hooks.unmounted.push(fn) };
  const latest = loadModule(read('utils/useLatestRequest.js'), { vue });
  const request = (kind, params, signal) => { const pending = { ...deferred(), params: typeof params === 'object' ? { ...params } : params, signal }; requests[kind].push(pending); return pending.promise; };
  const typeApi = { getType: (id, signal) => request('types', id, signal), optionselect: signal => request('options', null, signal) };
  const dataApi = { listData: (params, signal) => request('lists', params, signal) };
  const route = Vue.reactive({ params: { dictId } });
  const messages = [], downloads = [];
  const proxy = { resetForm() {}, $refs: {}, $modal: { msgError: text => messages.push(text), msgSuccess() {} }, download: (...args) => downloads.push(args) };
  const { descriptor, errors } = parse(read('views/system/dict/data.vue'));
  assert.deepEqual(errors, []);
  const script = compileScript(descriptor, { id: 'dictionary-data-target' });
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, id: 'dictionary-data-target', compilerOptions: { bindingMetadata: script.bindings } }).errors, []);
  const globals = { ...vue, useRoute: () => route, useDict: () => ({ sys_normal_disable: Vue.ref([]) }), getCurrentInstance: () => ({ proxy }) };
  const component = loadModule(script.content, { vue, '@/utils/useLatestRequest': latest, '@/api/system/dict/type': typeApi, '@/api/system/dict/data': dataApi, '@/store/modules/dict': () => ({ removeDict() {} }) }, globals).default;
  const scope = Vue.effectScope();
  const state = scope.run(() => component.setup({}, { expose() {} }));
  return { state, route, requests, hooks, messages, downloads, close: () => scope.stop() };
}
async function initial(p, type = 'qa_old') {
  p.requests.options[0].resolve({ data: [{ dictId: 105, dictType: type, dictName: '字典' }] });
  p.requests.types[0].resolve({ data: { dictId: 105, dictType: type } }); await settle();
  p.requests.lists[0].resolve({ rows: [{ dictCode: 108, dictValue: '0', dictLabel: '本轮零值中文' }], total: 1 }); await settle();
}

test('KeepAlive dictionary data resolves the current type by ID after rename and resets the old page', async t => {
  const p = page(); t.after(p.close); await initial(p);
  p.state.queryParams.value.pageNum = 4;
  p.hooks.deactivated.forEach(fn => fn()); p.hooks.activated.forEach(fn => fn());
  assert.equal(p.requests.types.length, 2, 'resume must resolve stable dictId, not query the cached type name');
  assert.equal(p.requests.types[1].params, '105');
  p.requests.types[1].resolve({ data: { dictId: 105, dictType: 'qa_renamed' } });
  p.requests.options[1].resolve({ data: [{ dictId: 105, dictType: 'qa_renamed', dictName: '改名字典' }] }); await settle();
  const list = p.requests.lists.at(-1);
  assert.equal(list.params.dictType, 'qa_renamed'); assert.equal(list.params.pageNum, 1);
  list.resolve({ rows: [{ dictCode: 108, dictValue: '0', dictLabel: '本轮零值中文' }], total: 1 }); await settle();
  assert.equal(p.state.defaultDictType.value, 'qa_renamed'); assert.equal(p.state.typeOptions.value[0].dictName, '改名字典');
  assert.equal(p.state.dataList.value[0].dictValue, '0'); assert.equal(p.state.loading.value, false);
});

test('route target changes abort old metadata/options and late metadata cannot overwrite the new dictionary', async t => {
  const p = page(); t.after(p.close); const first = p.requests.types[0], firstOptions = p.requests.options[0];
  p.state.queryParams.value.pageNum = 9; p.route.params.dictId = '106'; await Vue.nextTick();
  assert.equal(first.signal.aborted, true); assert.equal(firstOptions.signal.aborted, true);
  assert.equal(p.requests.types[1].params, '106');
  p.requests.types[1].resolve({ data: { dictId: 106, dictType: 'qa_second' } });
  p.requests.options[1].resolve({ data: [{ dictId: 106, dictType: 'qa_second' }] }); await settle();
  p.requests.lists[0].resolve({ rows: [{ dictCode: 2 }], total: 1 }); await settle();
  first.resolve({ data: { dictId: 105, dictType: 'qa_stale' } }); firstOptions.resolve({ data: [{ dictType: 'qa_stale' }] }); await settle();
  assert.equal(p.state.queryParams.value.dictType, 'qa_second'); assert.equal(p.state.defaultDictType.value, 'qa_second');
  assert.equal(p.state.queryParams.value.pageNum, 1); assert.equal(p.requests.lists.length, 1);
  assert.equal(p.state.typeOptions.value[0].dictType, 'qa_second'); assert.equal(p.state.dataList.value[0].dictCode, 2);
});

test('failed or deleted dictionary metadata clears old rows and cannot query/export all dictionaries', async t => {
  const p = page(); t.after(p.close); await initial(p);
  p.hooks.deactivated.forEach(fn => fn()); p.hooks.activated.forEach(fn => fn());
  p.requests.types[1].reject(new Error('HTTP 500')); p.requests.options[1].reject(new Error('HTTP 500')); await settle();
  assert.deepEqual(p.state.dataList.value, []); assert.equal(p.state.total.value, 0);
  assert.equal(p.state.queryParams.value.dictType, undefined); assert.equal(p.state.defaultDictType.value, '');
  assert.deepEqual(p.state.typeOptions.value, []); assert.equal(p.state.loading.value, false);
  p.state.handleAdd(); p.state.handleExport();
  assert.equal(p.state.open.value, false); assert.equal(p.downloads.length, 0);
  const retry = p.state.getList();
  assert.equal(p.requests.types.length, 3, 'refresh after metadata failure must retry the ID lookup');
  p.requests.types[2].resolve({ data: null }); p.requests.options[2].resolve({ data: [] }); await retry; await settle();
  assert.equal(p.requests.lists.length, 1); assert.equal(p.state.loading.value, false);
  assert.ok(p.messages.some(message => /字典/.test(message)));
});

test('a selected query type wins over pending route metadata and resets pagination', async t => {
  const p = page(); t.after(p.close); const first = p.requests.types[0];
  p.requests.options[0].resolve({ data: [{ dictId: 106, dictType: 'qa_manual' }] }); await settle();
  p.state.queryParams.value.pageNum = 8; p.state.queryParams.value.dictType = 'qa_manual'; await Vue.nextTick();
  assert.equal(first.signal.aborted, true);
  assert.equal(p.requests.lists[0].params.dictType, 'qa_manual'); assert.equal(p.requests.lists[0].params.pageNum, 1);
  p.requests.lists[0].resolve({ rows: [{ dictCode: 6 }], total: 1 }); first.resolve({ data: { dictType: 'qa_old' } }); await settle();
  assert.equal(p.state.queryParams.value.dictType, 'qa_manual'); assert.equal(p.state.dataList.value[0].dictCode, 6);
});

test('changing query identity cancels old lists, snapshots parameters and clears selected rows', async t => {
  const p = page(); t.after(p.close);
  p.requests.types[0].resolve({ data: { dictType: 'qa_first' } }); p.requests.options[0].resolve({ data: [] }); await settle();
  const first = p.requests.lists[0]; p.state.handleSelectionChange([{ dictCode: 108 }]);
  p.state.queryParams.value.pageNum = 5; p.state.queryParams.value.dictType = 'qa_second'; await Vue.nextTick();
  assert.equal(first.signal.aborted, true); assert.equal(first.params.dictType, 'qa_first');
  assert.equal(p.requests.lists[1].params.dictType, 'qa_second'); assert.equal(p.requests.lists[1].params.pageNum, 1);
  assert.deepEqual(p.state.ids.value, []); assert.equal(p.state.single.value, true); assert.equal(p.state.multiple.value, true);
  p.requests.lists[1].resolve({ rows: [{ dictCode: 2 }], total: 1 }); await settle();
  first.reject(new Error('obsolete first list')); await settle();
  assert.equal(p.state.dataList.value[0].dictCode, 2); assert.equal(p.state.total.value, 1);
});

test('dictionary metadata and options cannot commit after departure, and unchanged targets keep their page', async t => {
  const p = page(); t.after(p.close); const first = p.requests.types[0], options = p.requests.options[0];
  p.hooks.deactivated.forEach(fn => fn());
  assert.equal(first.signal.aborted, true); assert.equal(options.signal.aborted, true);
  first.resolve({ data: { dictType: 'qa_departed' } }); options.resolve({ data: [{ dictType: 'qa_departed' }] }); await settle();
  assert.equal(p.state.queryParams.value.dictType, undefined); assert.equal(p.requests.lists.length, 0);
  p.hooks.activated.forEach(fn => fn());
  p.requests.types[1].resolve({ data: { dictType: 'qa_current' } }); p.requests.options[1].resolve({ data: [] }); await settle();
  p.requests.lists[0].resolve({ rows: [], total: 0 }); await settle();
  p.state.queryParams.value.pageNum = 3;
  p.hooks.deactivated.forEach(fn => fn()); p.hooks.activated.forEach(fn => fn());
  p.requests.types[2].resolve({ data: { dictType: 'qa_current' } }); p.requests.options[2].resolve({ data: [] }); await settle();
  assert.equal(p.requests.lists[1].params.pageNum, 3, 'unchanged ID/type preserves normal paginated return');
  p.hooks.unmounted.forEach(fn => fn()); p.requests.lists[1].resolve({ rows: [{ dictCode: 99 }], total: 1 }); await settle();
  assert.deepEqual(p.state.dataList.value, []); assert.equal(p.state.loading.value, false);
});

test('invalid IDs or invalid metadata never reach an unfiltered dictionary data list', async t => {
  for (const id of ['', undefined, 'not-an-id', '0', []]) {
    const p = page(id); t.after(p.close); await settle();
    assert.equal(p.requests.types.length, 0); assert.equal(p.requests.lists.length, 0);
    assert.equal(p.state.loading.value, false);
  }
  const p = page(); t.after(p.close);
  p.requests.types[0].resolve({ data: { dictType: '   ' } }); p.requests.options[0].resolve({ data: [] }); await settle();
  assert.equal(p.requests.lists.length, 0); assert.equal(p.state.queryParams.value.dictType, undefined);
});

test('dictionary option API forwards the optional cancellation signal', async () => {
  let request;
  const api = loadModule(read('api/system/dict/type.js'), { '@/utils/request': value => { request = value; return Promise.resolve({}); } });
  const signal = new AbortController().signal; await api.optionselect(signal);
  assert.equal(request.signal, signal);
});
