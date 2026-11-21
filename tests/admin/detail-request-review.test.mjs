import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../maoyi-admin/package.json', import.meta.url));
const Vue = require('vue');
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc');
const { transformSync } = require('esbuild');
const sourceRoot = new URL('../../../maoyi-admin/src/', import.meta.url);
const read = file => fs.readFileSync(new URL(file, sourceRoot), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function moduleFrom(source, dependencies, globals = {}) {
  const module = { exports: {} };
  const code = transformSync(source, { format: 'cjs' }).code;
  Function('module', 'exports', 'require', ...Object.keys(globals), code)(module, module.exports, name => dependencies[name], ...Object.values(globals));
  return module.exports;
}
function component(file, apiName, overrides = {}, props = {}) {
  const pending = [];
  const lifecycle = { activated: [], deactivated: [], unmounted: [] };
  const hookVue = { ...Vue, onActivated: fn => lifecycle.activated.push(fn), onDeactivated: fn => lifecycle.deactivated.push(fn), onBeforeUnmount: fn => lifecycle.unmounted.push(fn), onMounted() {} };
  const latest = moduleFrom(read('utils/useLatestRequest.js'), { vue: hookVue });
  const dictDataPage = file === 'views/system/dict/data.vue';
  const apis = new Proxy({}, { get: (_, name) => overrides[name] || (name === apiName ? (id, signal) => { const request = { ...deferred(), id, signal }; pending.push(request); return request.promise; } : () => Promise.resolve({ data: dictDataPage && name === 'getType' ? { dictId: 105, dictType: 'qa_detail_review' } : {}, rows: [], total: 0 })) });
  const dependencies = new Proxy({}, { get: (_, name) => name === 'vue' ? hookVue : name === '@/utils/useLatestRequest' ? latest : name.startsWith('@/api/') ? apis : name === '@/utils/passwordRule' ? { usePasswordRule: () => ({}) } : name === '@/store/modules/dict' ? () => ({ removeDict() {} }) : {} });
  const proxy = { addDateRange: v => v, resetForm() {}, getConfigKey: () => Promise.resolve({ msg: 'test' }), $refs: {}, $modal: { msgError() {}, msgSuccess() {} } };
  const globals = { ...hookVue, useRouter: () => ({}), useRoute: () => ({ params: dictDataPage ? { dictId: '105' } : {}, query: {} }), getCurrentInstance: () => ({ proxy }), useDict: () => new Proxy({}, { get: () => Vue.ref([]) }) };
  const { descriptor, errors } = parse(read(file));
  assert.deepEqual(errors, []);
  const compiled = compileScript(descriptor, { id: file });
  const template = compileTemplate({ id: file, source: descriptor.template.content, compilerOptions: { bindingMetadata: compiled.bindings } });
  assert.deepEqual(template.errors, []);
  const loaded = moduleFrom(compiled.content, dependencies, globals).default;
  return { state: loaded.setup(props, { expose() {} }), pending, lifecycle };
}

const pages = [
  ['system/user/index.vue', 'getUser', 'userId'],
  ['system/post/index.vue', 'getPost', 'postId'],
  ['system/config/index.vue', 'getConfig', 'configId'],
  ['system/dict/index.vue', 'getType', 'dictId'],
  ['system/dict/data.vue', 'getData', 'dictCode'],
  ['system/notice/index.vue', 'getNotice', 'noticeId'],
  ['monitor/job/index.vue', 'getJob', 'jobId']
];
for (const [page, apiName, idKey] of pages) {
  test(page + ' preserves latest edited record and ignores a late response after Add, close or departure', async () => {
    const { state: s, pending, lifecycle } = component('views/' + page, apiName);
    s.handleUpdate({ [idKey]: 21 });
    s.handleUpdate({ [idKey]: 22 });
    const answer = id => ({ data: { [idKey]: id, name: 'record-' + id }, posts: [], roles: [], postIds: [], roleIds: [] });
    pending[1].resolve(answer(22)); await settle();
    pending[0].resolve(answer(21)); await settle();
    assert.equal(s.form.value[idKey], 22, 'late first edit must never replace the selected record');
    s.handleUpdate({ [idKey]: 23 });
    s.handleAdd();
    if (page.startsWith('system/user/')) pending.at(-1).resolve({ data: {}, posts: [], roles: [] });
    pending.find(r => r.id === 23).resolve(answer(23)); await settle();
    assert.equal(s.form.value[idKey], undefined, 'new form must remain new while old detail resolves');
    s.open.value = false; await settle();
    s.handleUpdate({ [idKey]: 24 });
    lifecycle.deactivated.forEach(fn => fn());
    pending.find(r => r.id === 24).resolve(answer(24)); await settle();
    assert.equal(s.form.value[idKey], undefined, 'departed page cannot receive obsolete record fields');
    lifecycle.activated.forEach(fn => fn());
    s.handleUpdate({ [idKey]: 25 });
    pending.find(r => r.id === 25).resolve(answer(25)); await settle();
    assert.equal(s.form.value[idKey], 25, 'active page must allow a fresh successful retry');
  });
}

test('task details remain separate from task edit fields and pending detail cannot reopen a departed page', async () => {
  const { state: s, pending, lifecycle } = component('views/monitor/job/index.vue', 'getJob');
  s.handleView({ jobId: 31 });
  pending[0].resolve({ data: { jobId: 31, jobName: 'viewed' } }); await settle();
  s.handleAdd();
  assert.equal(s.viewForm.value.jobId, 31);
  assert.equal(s.form.value.jobId, undefined);
  s.handleView({ jobId: 32 });
  lifecycle.deactivated.forEach(fn => fn());
  pending[1].resolve({ data: { jobId: 32 } }); await settle();
  assert.equal(s.openView.value, false);
});

for (const [file, fn] of [['system/post', 'getPost'], ['system/config', 'getConfig'], ['system/dict/type', 'getType'], ['system/dict/data', 'getData'], ['monitor/job', 'getJob']]) {
  test(file + ' detail API forwards cancellation signal', async () => {
    let request;
    const api = moduleFrom(read('api/' + file + '.js'), { '@/utils/request': value => { request = value; return Promise.resolve({}); } });
    const signal = new AbortController().signal;
    await api[fn](4, signal);
    assert.equal(request.signal, signal);
  });
}

test('an open dictionary drawer resumes its cancelled pagination after KeepAlive reactivation', async () => {
  const props = Vue.reactive({ visible: true, row: { dictType: 'review' } });
  const { state: s, pending, lifecycle } = component('views/system/dict/detail.vue', 'listData', {}, props);
  const initial = s.loadData();
  lifecycle.deactivated.forEach(fn => fn());
  pending[0].resolve({ rows: [{ dictCode: 1 }], total: 1 }); await initial;
  lifecycle.activated.forEach(fn => fn());
  assert.equal(pending.length, 2, 'still-visible drawer must request fresh entries when its page returns');
  pending[1].resolve({ rows: [{ dictCode: 2 }], total: 1 }); await settle();
  assert.equal(s.dataList.value[0].dictCode, 2);
  assert.equal(s.loading.value, false);
});
