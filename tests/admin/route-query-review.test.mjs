import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../maoyi-admin/package.json', import.meta.url));
const Vue = require('vue');
const { parse, compileScript } = require('@vue/compiler-sfc');
const { transformSync } = require('esbuild');
const root = new URL('../../../maoyi-admin/src/', import.meta.url);
const read = file => fs.readFileSync(new URL(file, root), 'utf8');
function loadModule(source, deps, globals = {}) {
  const module = { exports: {} };
  Function('module', 'exports', 'require', ...Object.keys(globals), transformSync(source, { format: 'cjs' }).code)(module, module.exports, key => deps[key], ...Object.values(globals));
  return module.exports;
}
function component(file, props = {}) {
  const calls = [];
  const router = { push: value => calls.push(value) };
  const helper = fs.existsSync(new URL('utils/routeQuery.js', root)) ? loadModule(read('utils/routeQuery.js'), {}) : {};
  const dependencies = new Proxy({}, { get: (_, key) => key === 'vue' ? Vue : key === '@/utils/routeQuery' ? helper : key === '@/utils/validate' ? { isExternal: value => /^https?:/.test(value), isHttp: value => /^https?:/.test(value) } : key === '@/utils/ruoyi' ? { getNormalPath: value => value.replace(/\/+/g, '/') } : key === '@/store/modules/permission' ? () => ({ routes: [], topbarRouters: [] }) : {} });
  const globals = { ...Vue, useRoute: () => ({ path: '/', query: {} }), useRouter: () => router, getCurrentInstance: () => ({ proxy: {} }), useDict: () => ({}), onMounted() {}, onBeforeUnmount() {}, onActivated() {}, onDeactivated() {} };
  const { descriptor } = parse(read(file));
  const script = compileScript(descriptor, { id: file });
  const c = loadModule(script.content, dependencies, globals).default;
  return { s: c.setup(props, { expose() {} }), calls };
}

test('legacy malformed menu queries cannot crash sidebar navigation; valid object queries are preserved', () => {
  const { s } = component('layout/components/Sidebar/SidebarItem.vue', { basePath: '/system', item: {} });
  for (const input of ['not-json', 'null', '[]', '1', 'true', '"text"']) {
    assert.doesNotThrow(() => s.resolvePath('user', input));
    assert.deepEqual(s.resolvePath('user', input), { path: '/system/user', query: {} });
  }
  assert.deepEqual(s.resolvePath('user', '{"id":1,"name":"中文"}'), { path: '/system/user', query: { id: 1, name: '中文' } });
});
test('header search safely handles saved malformed menu parameters and keeps literal title text', () => {
  const { s, calls } = component('components/HeaderSearch/index.vue');
  assert.doesNotThrow(() => s.change({ path: '/system/user', query: 'not-json' }));
  assert.deepEqual(calls.at(-1), { path: '/system/user', query: {} });
  s.search.value = '';
  assert.equal(s.highlightText('<b>Title</b> & "quoted"'), '&lt;b&gt;Title&lt;/b&gt; &amp; &quot;quoted&quot;');
  s.search.value = '<b>';
  assert.equal(s.highlightText('<b>Title</b>'), '<span class="highlight">&lt;b&gt;</span>Title&lt;/b&gt;');
  s.search.value = 'a+b';
  assert.equal(s.highlightText('A+B <>'), '<span class="highlight">A+B</span> &lt;&gt;');
});
