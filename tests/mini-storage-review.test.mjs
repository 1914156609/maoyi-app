import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ref, nextTick } from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function load(file, context, mocks = [], vue = false) {
  const key = randomUUID(), filename = resolve(root, file);
  globalThis.__miniStorageReview ||= {};
  globalThis.__miniStorageReview[key] = context;
  let source = readFileSync(filename, 'utf8');
  if (vue) { const { descriptor } = parse(source, { filename }); source = compileScript(descriptor, { id: key }).content; }
  source = `const uni = globalThis.__miniStorageReview[${JSON.stringify(key)}].uni; const __MAOYI_REVIEW__=false;\n` + source.replaceAll('import.meta.env', '({})');
  source = source.replace(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm, (line, binding, specifier) => {
    if (specifier.endsWith('.vue')) return `const ${binding} = {};`;
    if (mocks.includes(specifier)) return `const ${binding} = globalThis.__miniStorageReview[${JSON.stringify(key)}];`;
    const target = specifier.startsWith('.') ? pathToFileURL(resolve(dirname(filename), specifier)).href : import.meta.resolve(specifier);
    return `import ${binding} from ${JSON.stringify(target)};`;
  });
  const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  return vue ? module.default.setup({}, { expose() {} }) : module;
}
async function createFixture(options = {}) {
  const notices = [], redirects = [], saves = [];
  const context = { authenticated: ref(true), fetchCraft() {}, navigate() {}, notify: message => notices.push(message),
    async saveCraft(data,id) { saves.push({data,id}); return { id: 'persisted-id', version: saves.length, status:'draft' }; },
    onLoad(callback) { context.load = callback; }, uni: { pageScrollTo() {},
      getStorageSync() { if (options.readFails) throw new Error('storage read unavailable'); return options.prefill; },
      removeStorageSync() { if (options.removeFails) throw new Error('storage remove unavailable'); },
      redirectTo(params) { redirects.push(params); if (options.navigationFails) params.fail?.(); } } };
  const state = await load('src/pages/create/create.vue', context, ['@dcloudio/uni-app', '../../lib/store.js', '../../lib/session.js'], true);
  state.form.name = '存储故障验收';
  return { state, context, notices, redirects, saves };
}
test('server-side save success still navigates when clearing a local prefill cache fails', async () => {
  const p = await createFixture({ removeFails: true });
  await p.state.save();
  assert.equal(p.saves.length, 1);
  assert.equal(p.redirects.length, 1);
  assert.match(p.redirects[0].url, /persisted-id/);
  assert.equal(p.state.editId.value, 'persisted-id');
  assert.ok(p.notices.some(text => /已保存/.test(text)));
  assert.equal(p.state.saving.value, false);
});
test('a failed redirect followed by retry updates the saved craft instead of creating a duplicate', async () => {
  const p = await createFixture({ navigationFails: true });
  await p.state.save(); await p.state.save();
  assert.equal(p.saves[0].id, '');
  assert.equal(p.saves[1].id, 'persisted-id');
  assert.equal(p.saves[1].data.version, 1);
  assert.ok(p.notices.some(text => /已保存.*打开失败/.test(text)));
});
test('blocked prefill storage does not reject the create page load', async () => {
  const p = await createFixture({ readFails: true });
  await assert.doesNotReject(p.context.load({ prefill: '1' }));
  assert.ok(p.notices.some(text => /读取失败/.test(text)));
});
test('prefill cleanup failure keeps the copied form usable', async () => {
  const p = await createFixture({ removeFails: true, prefill: { name:'已复制的工艺',sizes:{chest:'52'} } });
  await assert.doesNotReject(p.context.load({ prefill:'1' }));
  assert.equal(p.state.form.name, '已复制的工艺');
  assert.equal(p.state.form.sizes.chest, '52');
});
async function settingsFixture(options = {}) {
  const notices = [];
  const context = { onShow() {}, navigate() {}, notify: message => notices.push(message),
    uni: { getStorageSync() { if (options.readFails) throw new Error('read denied'); return false; },
      setStorageSync() { if (options.writeFails) throw new Error('quota exceeded'); } } };
  const state = await load('src/pages/settings/settings.vue', context, ['@dcloudio/uni-app', '../../lib/store.js'], true);
  return { state, notices };
}
test('settings remains usable with a readable default when notification preference storage is blocked', async () => {
  const p = await settingsFixture({ readFails: true });
  assert.equal(p.state.notifications.value, true);
});
test('notification preference write failure rolls back the switch and reports that it was not saved', async () => {
  const p = await settingsFixture({ writeFails: true });
  assert.equal(p.state.notifications.value, false);
  await assert.doesNotReject(Promise.resolve().then(() => p.state.setNotifications({ detail: { value: true } })));
  await nextTick();
  assert.equal(p.state.notifications.value, false);
  assert.ok(p.notices.some(text => /未保存|保存失败/.test(text)));
});
test('logout always clears memory and broadcasts data reset even when local storage removal fails', async () => {
  const events = [], notices = [];
  const context = { uni: { getStorageSync: () => '', removeStorageSync() { throw new Error('storage unavailable'); },
    $emit: name => events.push(name), showToast: ({title}) => notices.push(title) } };
  const client = await load('src/lib/client.js', context);
  Object.assign(client.authState, { user:{id:103},token:'old' });
  assert.doesNotThrow(() => client.clearAuth());
  assert.equal(client.authState.token, '');
  assert.equal(client.authState.user, null);
  assert.deepEqual(events, ['maoyi-signed-out']);
});
test('login persistence failure is explicit without turning a successful in-memory login into an exception', async () => {
  const context = { uni: { getStorageSync: () => '', setStorageSync() { throw new Error('quota'); },removeStorageSync() {} } };
  const client = await load('src/lib/client.js', context);
  assert.equal(client.setAuth({ user:{id:103}, token:'valid', expiresAt:Date.now()+60000 }), false);
  assert.equal(client.authState.token, 'valid');
});
test('craft list data remains usable if the unrelated recent-history cache cannot be read', async () => {
  const notices = [];
  const context = { authState:{ user:{id:103},token:'valid',review:false }, reviewEnabled:false,
    api:async()=>({crafts:[{id:'server-craft',ownerId:103,sizes:{}}]}),
    uni: { $on() {},getStorageSync() { throw new Error('read denied'); }, showToast: ({title})=>notices.push(title) } };
  const store = await load('src/lib/store.js', context, ['./client.js']);
  await assert.doesNotReject(store.refreshCrafts());
  assert.equal(store.store.crafts[0].id, 'server-craft');
  assert.deepEqual([...store.store.recentIds], []);
  assert.ok(notices.some(text => /浏览记录读取失败/.test(text)));
});
