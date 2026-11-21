import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parse, compileScript } from '@vue/compiler-sfc';

const filename = resolve(dirname(fileURLToPath(import.meta.url)), '../src/pages/shared/shared.vue');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
async function fixture(read = async code => ({ id: code, name: 'snapshot-' + code })) {
  const key = randomUUID(), listeners = new Map(), calls = [];
  const context = {
    window: {
      location: { hash: '#/pages/shared/shared?code=A' },
      addEventListener(type, listener) { const set = listeners.get(type) || new Set(); set.add(listener); listeners.set(type, set); },
      removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    },
    onLoad(callback) { context.load = callback; },
    onShow(callback) { context.show = callback; },
    onUnload(callback) { context.unload = callback; },
    async readShare(code) { calls.push(code); return read(code); },
  };
  globalThis.__miniSharedRouteReview ||= {};
  globalThis.__miniSharedRouteReview[key] = context;
  const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename });
  let source = `const window = globalThis.__miniSharedRouteReview[${JSON.stringify(key)}].window;\n` + compileScript(descriptor, { id: key }).content;
  source = source.replace(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm, (line, binding, specifier) => {
    if (specifier.endsWith('.vue')) return `const ${binding} = {};`;
    if (['@dcloudio/uni-app', '../../lib/sharing.js'].includes(specifier)) return `const ${binding} = globalThis.__miniSharedRouteReview[${JSON.stringify(key)}];`;
    const target = specifier.startsWith('.') ? pathToFileURL(resolve(dirname(filename), specifier)).href : import.meta.resolve(specifier);
    return `import ${binding} from ${JSON.stringify(target)};`;
  });
  const component = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
  const state = component.setup({}, { expose() {} });
  context.load({ code: 'A' });
  const changeHash = hash => {
    context.window.location.hash = hash;
    return Promise.all([...listeners.get('hashchange') || []].map(listener => listener()));
  };
  return { state, context, calls, changeHash, listenerCount: () => listeners.get('hashchange')?.size || 0 };
}

test('same-page share code change clears old content immediately and reads the new snapshot', async () => {
  const gate = deferred();
  const p = await fixture(code => code === 'B' ? gate.promise : { id: code, name: 'old-62cm-286rows' });
  await p.context.show();
  assert.equal(p.state.craft.value.name, 'old-62cm-286rows');
  const request = p.changeHash('#/pages/shared/shared?code=B');
  assert.deepEqual(p.calls, ['A', 'B']);
  assert.equal(p.state.craft.value, null);
  assert.equal(p.state.loading.value, true);
  gate.resolve({ id: 'B', name: 'new-65cm-300rows' }); await request;
  assert.equal(p.state.craft.value.name, 'new-65cm-300rows');
  assert.equal(p.state.code.value, 'B');
  assert.equal(p.state.loading.value, false);
});

test('repeating the same code or navigating to another page does not request another snapshot', async () => {
  const p = await fixture(); await p.context.show();
  await p.changeHash('#/pages/shared/shared?code=A');
  await p.changeHash('#/pages/profile/profile?code=B');
  assert.deepEqual(p.calls, ['A']);
  assert.equal(p.state.code.value, 'A');
});

test('a delayed old share response cannot replace the new code snapshot', async () => {
  const old = deferred(), current = deferred();
  const p = await fixture(code => code === 'A' ? old.promise : current.promise);
  const first = p.context.show();
  const second = p.changeHash('#/pages/shared/shared?code=B');
  current.resolve({ id: 'B', name: 'new' }); await second;
  old.resolve({ id: 'A', name: 'stale' }); await first;
  assert.equal(p.state.craft.value.id, 'B');
  assert.equal(p.state.loading.value, false);
});

test('a delayed old share error cannot hide the newer successful snapshot', async () => {
  const old = deferred();
  const p = await fixture(code => code === 'A' ? old.promise : { id: code });
  const first = p.context.show();
  await p.changeHash('#/pages/shared/shared?code=B');
  old.reject(new Error('old request offline')); await first;
  assert.equal(p.state.craft.value.id, 'B');
  assert.equal(p.state.error.value, '');
});

test('missing or revoked new codes remove the old snapshot instead of preserving private content', async () => {
  const p = await fixture(code => code === 'A' ? { id: 'A' } : null);
  await p.context.show();
  await p.changeHash('#/pages/shared/shared?code=revoked');
  assert.equal(p.state.craft.value, null);
  assert.equal(p.state.loading.value, false);
  await p.changeHash('#/pages/shared/shared');
  assert.equal(p.state.code.value, '');
  assert.equal(p.state.craft.value, null);
});

test('unloading removes the hash listener and invalidates an in-flight snapshot', async () => {
  const gate = deferred();
  const p = await fixture(code => code === 'A' ? { id: 'A' } : gate.promise);
  await p.context.show();
  const request = p.changeHash('#/pages/shared/shared?code=B');
  assert.equal(p.listenerCount(), 1);
  p.context.unload();
  assert.equal(p.listenerCount(), 0);
  gate.resolve({ id: 'B' }); await request;
  assert.equal(p.state.craft.value, null);
  await p.changeHash('#/pages/shared/shared?code=C');
  assert.deepEqual(p.calls, ['A', 'B']);
});

test('ordinary onLoad/onShow entry keeps the native lifecycle behavior', async () => {
  const p = await fixture(); await p.context.show();
  assert.equal(p.state.craft.value.id, 'A');
  assert.equal(p.state.loading.value, false);
});
