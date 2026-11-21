import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function load(name, context, mocks) {
  const key = randomUUID(), filename = resolve(root, name);
  globalThis.__miniReviewContexts ||= {};
  globalThis.__miniReviewContexts[key] = context;
  let source = `const uni = globalThis.__miniReviewContexts[${JSON.stringify(key)}].uni; const __MAOYI_REVIEW__ = false;\n` + readFileSync(filename, 'utf8');
  source = source.replace(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm, (line, binding, specifier) => {
    if (mocks.includes(specifier)) return `const ${binding} = globalThis.__miniReviewContexts[${JSON.stringify(key)}];`;
    const target = specifier.startsWith('.') ? pathToFileURL(resolve(dirname(filename), specifier)).href : import.meta.resolve(specifier);
    return `import ${binding} from ${JSON.stringify(target)};`;
  });
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
const identity = token => ({ user: { id: token === 'old' ? 103 : 107 }, token, review: false });
async function storeFixture() {
  const gate = deferred();
  const context = { authState: identity('old'), reviewEnabled: false, api: () => gate.promise,
    uni: { $on() {}, getStorageSync() {}, setStorageSync() {}, showToast() {} } };
  const module = await load('src/lib/store.js', context, ['./client.js']);
  return { ...module, context, gate };
}
for (const id of [undefined, 'old-craft']) test(`craft ${id ? 'update' : 'create'} cannot put a delayed previous-account response in the current store`, async () => {
  const f = await storeFixture();
  const pending = f.saveCraft({ name: 'previous private craft', sizes: {} }, id);
  Object.assign(f.context.authState, identity('new')); f.clearData();
  f.gate.resolve({ craft: { id: 'private-old', ownerId: 103, name: 'previous private craft', sizes: {} } });
  await assert.rejects(pending, /登录账号已变化/);
  assert.deepEqual(Object.keys(f.store.details), []);
  assert.equal(f.store.crafts.length, 0);
});
test('delayed submit/review response after logout cannot restore private detail data', async () => {
  const f = await storeFixture();
  f.store.details['private-old'] = { id: 'private-old', status: 'draft', version: 1, sizes: {} };
  const pending = f.changeStatus('private-old', 'pending');
  Object.assign(f.context.authState, { user: null, token: '' }); f.clearData();
  f.gate.resolve({ craft: { id: 'private-old', ownerId: 103, status: 'pending', version: 2, sizes: {} } });
  await assert.rejects(pending, /登录账号已变化/);
  assert.deepEqual(Object.keys(f.store.details), []);
});
test('same-session save still applies canonical server data', async () => {
  const f = await storeFixture();
  const pending = f.saveCraft({ name: 'new', sizes: {} });
  f.gate.resolve({ craft: { id: 'created', ownerId: 103, name: 'canonical', sizes: {} } });
  const craft = await pending;
  assert.equal(craft.name, 'canonical');
  assert.equal(f.store.details.created.name, 'canonical');
  assert.equal(f.store.crafts[0].id, 'created');
});
async function sessionFixture() {
  const gate = deferred();
  let cleared = 0, refreshed = 0;
  const context = { authState: identity('old'), reviewEnabled: false, apiBase: '/api', api: () => gate.promise,
    store: {}, persist() {}, loadReviewData() {}, setAuth() {},
    clearAuth() { Object.assign(context.authState, { user: null, token: '', review: false }); },
    clearData() { cleared++; }, async refreshCrafts() { refreshed++; }, uni: {} };
  const module = await load('src/lib/session.js', context, ['./client.js', './store.js']);
  return { ...module, context, gate, cleared: () => cleared, refreshed: () => refreshed };
}
test('old profile response cannot overwrite the user after switching sessions', async () => {
  const f = await sessionFixture();
  const pending = f.restoreSession();
  Object.assign(f.context.authState, identity('new'));
  f.gate.resolve({ user: { id: 103, name: 'OLD_PROFILE' } }); await pending;
  assert.equal(f.session.token, 'new');
  assert.equal(f.session.user.id, 107);
  assert.equal(f.refreshed(), 0);
});
test('old logout response cannot clear the newly signed-in account', async () => {
  const f = await sessionFixture();
  const pending = f.signOut();
  Object.assign(f.context.authState, identity('new'));
  f.gate.resolve({}); await pending;
  assert.equal(f.session.token, 'new');
  assert.equal(f.session.user.id, 107);
  assert.equal(f.cleared(), 0);
});
test('same-session logout always clears local identity and data after server failure', async () => {
  const f = await sessionFixture();
  f.context.api = async () => { throw new Error('offline'); };
  // The import captures the API function, so resolve with a rejected promise here.
  const pending = f.signOut();
  f.gate.resolve(Promise.reject(new Error('offline')));
  await assert.rejects(pending, /offline/);
  assert.equal(f.session.token, '');
  assert.equal(f.session.user, null);
  assert.equal(f.cleared(), 1);
});
