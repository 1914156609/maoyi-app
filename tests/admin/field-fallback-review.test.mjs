import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../maoyi-admin/package.json', import.meta.url));
const Vue = require('vue');
const { renderToString } = require('vue/server-renderer');
const { parse, compileScript } = require('@vue/compiler-sfc');
const { transformSync } = require('esbuild');
const root = new URL('../../../maoyi-admin/src/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
function loadModule(source, dependencies, globals = {}) {
  const module = { exports: {} };
  const code = transformSync(source, { format: 'cjs' }).code;
  Function('module', 'exports', 'require', ...Object.keys(globals), code)(module, module.exports, key => dependencies[key], ...Object.values(globals));
  return module.exports;
}
function tagComponent() {
  const { descriptor } = parse(read('components/DictTag/index.vue'));
  return loadModule(compileScript(descriptor, { id: 'dict-tag', inlineTemplate: true }).content, { vue: Vue }, Vue).default;
}
async function renderTag(props) {
  const app = Vue.createSSRApp(tagComponent(), props);
  app.component('ElTag', { setup(_, { slots }) { return () => Vue.h('span', slots.default?.()); } });
  return renderToString(app);
}

test('unknown dictionary values render their actual text rather than Vue 3 bitwise-filter output', async () => {
  const html = await renderTag({ options: [{ value: 'known', label: 'Known', elTagType: 'default', elTagClass: '' }], value: ['unknown', 'unknown2'] });
  assert.ok(html.includes('unknown unknown2'), html);
  assert.equal(/>0</.test(html), false);
});
test('dictionary empty/failed loads keep the current value readable and respect showValue=false', async () => {
  for (const options of [[], null]) {
    const html = await renderTag({ options, value: 'existing-value' });
    assert.ok(html.includes('existing-value'), html);
    assert.equal((await renderTag({ options, value: 'existing-value', showValue: false })).includes('existing-value'), false);
  }
  assert.equal((await renderTag({ options: [], value: null })).includes('null'), false);
});
test('known dictionary labels and numeric zero retain their original mapping', async () => {
  const options = [{ value: '0', label: 'Normal', elTagType: 'success', elTagClass: '' }];
  assert.ok((await renderTag({ options, value: 0 })).includes('Normal'));
  const mixed = await renderTag({ options, value: ['0', 'other'] });
  assert.ok(mixed.includes('Normal'));
  assert.ok(mixed.includes('other'));
});
test('malformed persisted tag list cannot abort tag restoration or restore invalid routes', () => {
  const defineStore = (_, config) => () => {
    const state = config.state();
    for (const [key, action] of Object.entries(config.actions)) state[key] = action.bind(state);
    return state;
  };
  for (const persisted of [{ wrong: [] }, 'invalid', 2, [null, {}, { path: '/ok', fullPath: '/ok', name: 'Ok', meta: {} }]]) {
    const store = loadModule(read('store/modules/tagsView.js'), {
      '@/plugins/cache': { local: { getJSON: () => persisted, setJSON() {} } },
      '@/store/modules/settings': () => ({ tagsViewPersist: true })
    }, { defineStore }).default();
    assert.doesNotThrow(() => store.loadPersistedViews());
    assert.deepEqual(store.visitedViews.map(view => view.path), Array.isArray(persisted) ? ['/ok'] : []);
  }
});

test('loading cleanup is safe before the first monitor request and remains idempotent', () => {
  let closed = 0;
  const modal = loadModule(read('plugins/modal.js'), { 'element-plus': { ElLoading: { service: () => ({ close() { closed++; } }) } } }).default;
  const latest = loadModule(read('utils/useLatestRequest.js'), { vue: Vue });
  const requests = latest.createLatestRequest(() => modal.closeLoading());
  assert.doesNotThrow(() => requests.start());
  assert.doesNotThrow(() => modal.closeLoading());
  modal.loading('Loading');
  modal.closeLoading(); modal.closeLoading();
  assert.equal(closed, 1);
});

test('closing avatar cropper destroys crop state and an obsolete image read cannot replace the saved avatar', () => {
  const readers = [];
  class FileReader {
    constructor() { readers.push(this); }
    readAsDataURL() {}
    abort() { this.aborted = true; }
  }
  const userStore = { avatar: '/profile/current.png' };
  const { descriptor } = parse(read('views/system/user/profile/userAvatar.vue'));
  const compiled = compileScript(descriptor, { id: 'avatar' }).content.replaceAll('import.meta.env.VITE_APP_BASE_API', "'/prod-api'");
  const comp = loadModule(compiled, { vue: Vue, '@/store/modules/user': () => userStore, '@/api/system/user': {}, 'vue-cropper': {}, 'vue-cropper/dist/index.css': {} }, { ...Vue, FileReader, getCurrentInstance: () => ({ proxy: { $modal: { msgError() {} } } }) }).default;
  const s = comp.setup({}, { expose() {} });
  s.editCropper(); s.modalOpened();
  s.beforeUpload({ type: 'image/png', name: 'selected.png' });
  const reader = readers[0];
  s.open.value = false; s.closeDialog();
  reader.result = 'data:image/png;base64,old'; reader.onload();
  assert.equal(s.visible.value, false);
  assert.equal(reader.aborted, true);
  assert.equal(s.options.img, userStore.avatar);
  s.editCropper(); s.modalOpened();
  s.beforeUpload({ type: 'image/png', name: 'fresh.png' });
  readers[1].result = 'data:image/png;base64,fresh'; readers[1].onload();
  assert.equal(s.options.img, readers[1].result);
});
