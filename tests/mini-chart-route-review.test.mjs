import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ref } from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';

const filename = resolve(dirname(fileURLToPath(import.meta.url)), '../src/pages/chart/chart.vue');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const chart = id => ({ id: 'chart-' + id, craftId: id, showText: id !== 'A', showDimensions: true, locked: id === 'A' });

async function fixture(options = {}) {
  const key = randomUUID(), listeners = new Map();
  const calls = { fetch: [], charts: 0, save: [], notify: [], navigate: [] };
  const context = {
    authenticated: ref(true),
    window: {
      location: { hash: '#/pages/chart/chart?id=A' },
      addEventListener(type, listener) {
        const set = listeners.get(type) || new Set();
        set.add(listener); listeners.set(type, set);
      },
      removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    },
    onLoad(callback) { context.load = callback; },
    onShow(callback) { context.show = callback; },
    onUnload(callback) { context.unload = callback; },
    drawingSample: () => ({ id: 'sample', name: 'sample' }),
    uid: () => 'new-chart',
    notify: value => calls.notify.push(value),
    navigate: value => calls.navigate.push(value),
    async fetchCraft(id) { calls.fetch.push(id); return options.fetch ? options.fetch(id) : { id, name: id }; },
    async refreshCharts() { calls.charts++; return options.charts ? options.charts(calls.charts) : ['A', 'B', 'C'].map(chart); },
    async saveChart(payload) {
      calls.save.push(structuredClone(payload));
      return options.save ? options.save(payload, calls.save.length) : payload;
    },
  };
  globalThis.__miniChartRoutes ||= {};
  globalThis.__miniChartRoutes[key] = context;
  let source = readFileSync(filename, 'utf8');
  if (options.native) source = source.replace(/^\s*\/\/ #ifdef H5\n[\s\S]*?^\s*\/\/ #endif\n/gm, '\n');
  const { descriptor } = parse(source, { filename });
  source = `const window = globalThis.__miniChartRoutes[${JSON.stringify(key)}].window;\n` +
    compileScript(descriptor, { id: key }).content;
  source = source.replace(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm, (line, binding, specifier) => {
    if (specifier.endsWith('.vue')) return `const ${binding} = {};`;
    if (['@dcloudio/uni-app', '../../lib/store.js', '../../lib/session.js', '../../lib/reference-data.js'].includes(specifier)) {
      return `const ${binding} = globalThis.__miniChartRoutes[${JSON.stringify(key)}];`;
    }
    const target = specifier.startsWith('.') ? pathToFileURL(resolve(dirname(filename), specifier)).href : import.meta.resolve(specifier);
    return `import ${binding} from ${JSON.stringify(target)};`;
  });
  const component = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
  const state = component.setup({}, { expose() {} });
  context.load({ id: 'A' });
  const changeHash = hash => {
    context.window.location.hash = hash;
    return Promise.all([...listeners.get('hashchange') || []].map(listener => listener()));
  };
  return { state, context, calls, changeHash, listeners: () => listeners.get('hashchange')?.size || 0 };
}

test('chart A → B query change immediately hides A, blocks saving and loads B once', async () => {
  const gate = deferred();
  const p = await fixture({ fetch: id => id === 'B' ? gate.promise : { id } });
  await p.context.show();
  assert.equal(p.state.craft.value.id, 'A');
  assert.equal(p.state.locked.value, true);
  const pending = p.changeHash('#/pages/chart/chart?id=B');
  assert.equal(p.state.craft.value, null);
  assert.equal(p.state.loading.value, true);
  assert.equal(p.state.locked.value, false);
  await p.state.save();
  await p.changeHash('#/pages/chart/chart?id=B');
  assert.deepEqual(p.calls.fetch, ['A', 'B']);
  assert.deepEqual(p.calls.save, []);
  gate.resolve({ id: 'B' }); await pending;
  assert.equal(p.state.craft.value.id, 'B');
  await p.state.save();
  assert.deepEqual(p.calls.save[0], { id: 'chart-B', craftId: 'B', showText: true, showDimensions: true, locked: false });
});

for (const reject of [false, true]) test(`late A craft ${reject ? 'failure' : 'success'} cannot replace B`, async () => {
  const gate = deferred();
  const p = await fixture({ fetch: id => id === 'A' ? gate.promise : { id } });
  const old = p.context.show();
  await p.changeHash('#/pages/chart/chart?id=B');
  if (reject) gate.reject(new Error('old A offline'));
  else gate.resolve({ id: 'A' });
  await old;
  assert.equal(p.state.craft.value.id, 'B');
  assert.equal(p.state.loadError.value, '');
  assert.equal(p.state.loading.value, false);
  assert.equal(p.calls.charts, 1, 'obsolete craft reads must not start another chart lookup');
});

test('late A chart settings cannot overwrite the newer B drawing or controls', async () => {
  const gate = deferred();
  const p = await fixture({ charts: count => count === 1 ? gate.promise : [chart('B')] });
  const old = p.context.show();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(p.calls.charts, 1);
  await p.changeHash('#/pages/chart/chart?id=B');
  gate.resolve([chart('A')]); await old;
  assert.equal(p.state.craft.value.id, 'B');
  assert.equal(p.state.showText.value, true);
  assert.equal(p.state.locked.value, false);
});

test('returning A → B → A still rejects the first A generation', async () => {
  const gate = deferred();
  let reads = 0;
  const p = await fixture({ fetch: id => id === 'A' && ++reads === 1 ? gate.promise : { id, name: 'current-' + id } });
  const old = p.context.show();
  await p.changeHash('#/pages/chart/chart?id=B');
  await p.changeHash('#/pages/chart/chart?id=A');
  gate.resolve({ id: 'A', name: 'obsolete-A-generation' }); await old;
  assert.equal(p.state.craft.value.name, 'current-A');
  assert.equal(p.state.loading.value, false);
});

test('late save keeps its captured A payload and cannot change B chart identity, toast or busy state', async () => {
  const oldSave = deferred(), currentSave = deferred();
  const p = await fixture({ save: (payload, count) => count === 1 ? oldSave.promise : count === 2 ? currentSave.promise : payload });
  await p.context.show();
  const old = p.state.save();
  await p.changeHash('#/pages/chart/chart?id=B');
  const current = p.state.save();
  oldSave.resolve({ id: 'late-A-chart' }); await old;
  assert.equal(p.state.saving.value, true, 'old finally must not unlock the newer save');
  assert.deepEqual(p.calls.notify, []);
  assert.equal(p.calls.save[0].craftId, 'A');
  assert.equal(p.calls.save[0].id, 'chart-A');
  assert.equal(p.calls.save[1].craftId, 'B');
  assert.equal(p.calls.save[1].id, 'chart-B');
  currentSave.resolve({ id: 'saved-B-chart' }); await current;
  assert.equal(p.state.saving.value, false);
  assert.deepEqual(p.calls.notify, ['工艺图已保存']);
  await p.state.save();
  assert.equal(p.calls.save[2].id, 'saved-B-chart');
});

test('non-chart hashes and a repeated current id never switch the cached chart target', async () => {
  const p = await fixture(); await p.context.show();
  await p.changeHash('#/pages/profile/profile?id=B');
  await p.changeHash('#/pages/shared/shared?id=B');
  await p.state.save();
  await p.changeHash('#/pages/chart/chart?id=A&unrelated=1');
  assert.deepEqual(p.calls.fetch, ['A']);
  assert.deepEqual(p.calls.save, []);
  assert.equal(p.state.craft.value.id, 'A');
});

test('onShow and a save click reconcile an H5 query even before hashchange is delivered', async () => {
  const p = await fixture(); await p.context.show();
  p.context.window.location.hash = '#/pages/chart/chart?id=B';
  await p.context.show();
  assert.equal(p.state.craft.value.id, 'B');
  p.context.window.location.hash = '#/pages/chart/chart?id=C';
  await p.state.save();
  await p.state.load();
  assert.equal(p.state.craft.value.id, 'C');
  assert.deepEqual(p.calls.fetch, ['A', 'B', 'C']);
  assert.deepEqual(p.calls.save, []);
});

test('unload removes the listener and rejects late load/save updates', async () => {
  const read = deferred();
  const p = await fixture({ fetch: () => read.promise });
  const pending = p.context.show();
  assert.equal(p.listeners(), 1);
  p.context.unload();
  read.resolve({ id: 'A' }); await pending;
  assert.equal(p.listeners(), 0);
  assert.equal(p.state.craft.value, null);
  assert.equal(p.state.loading.value, false);
  await p.changeHash('#/pages/chart/chart?id=B');
  assert.deepEqual(p.calls.fetch, ['A']);
  const save = deferred();
  const q = await fixture({ save: () => save.promise }); await q.context.show();
  const saving = q.state.save();
  q.context.unload(); save.reject(new Error('late save offline')); await saving;
  assert.equal(q.state.saving.value, false);
  assert.deepEqual(q.calls.notify, []);
});

test('native onLoad/onShow remains usable without an H5 listener', async () => {
  const p = await fixture({ native: true }); await p.context.show();
  assert.equal(p.listeners(), 0);
  assert.equal(p.state.craft.value.id, 'A');
  await p.state.save();
  assert.equal(p.calls.save[0].craftId, 'A');
  p.context.load({ id: 'B' });
  await p.context.show();
  assert.equal(p.state.craft.value.id, 'B');
  assert.equal(p.listeners(), 0);
});

test('a missing replacement clears the previous craft and retries the current id', async () => {
  let missing = true;
  const p = await fixture({ fetch: id => id === 'B' && missing ? null : { id } });
  await p.context.show();
  await p.changeHash('#/pages/chart/chart?id=B');
  assert.equal(p.state.craft.value, null);
  assert.equal(p.state.loadError.value, '工艺单不存在');
  await p.state.save(); assert.deepEqual(p.calls.save, []);
  missing = false; await p.state.load();
  assert.equal(p.state.craft.value.id, 'B');
  assert.equal(p.state.loadError.value, '');
});
