import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { createPasswordVault, isRememberedPassword } from '../../../maoyi-admin/src/utils/jsencrypt.js';

const require = createRequire(new URL('../../../maoyi-admin/package.json', import.meta.url));
const Vue = require('vue');
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc');
const { transformSync } = require('esbuild');
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const password = 'test-fixture-only_中文';
function keyStore() {
  let key;
  return { get: async () => key, getOrCreate: async candidate => key ??= structuredClone(candidate) };
}
function vault(store = keyStore()) {
  return createPasswordVault({ crypto: webcrypto, keyStore: store });
}

// Exercise the real compiled login script with mocked transport/cookies, never a real account.
function login({ cookies = {}, crypto = {}, authenticate = async () => {}, blockedCookies = false } = {}) {
  const jar = new Map(Object.entries(cookies));
  const written = [], submitted = [], routes = [];
  let validated, captchaRequests = 0;
  const cookieApi = {
    get: name => jar.get(name),
    set: (name, value, options) => {
      if (blockedCookies) throw new Error('Browser denied cookies');
      written.push({ name, value, options }); jar.set(name, value);
    },
    remove: name => { if (blockedCookies) throw new Error('Browser denied cookies'); jar.delete(name); }
  };
  const deps = {
    vue: Vue,
    '@/api/login': { getCodeImg() {} },
    'js-cookie': cookieApi,
    '@/utils/jsencrypt': { encrypt: async () => null, decrypt: async () => '', isRememberedPassword, ...crypto },
    '@/store/modules/user': () => ({ login: form => { submitted.push(form); return authenticate(form); } }),
    '@/utils/useCaptcha': { useCaptcha: () => ({ codeUrl: Vue.ref(''), codeLoading: Vue.ref(false), codeLoadFailed: Vue.ref(false), captchaEnabled: Vue.ref(true), getCode: () => { captchaRequests++; }, imageFailed() {} }) },
    '@/settings': { footerContent: '' }
  };
  const route = Vue.reactive({ query: { redirect: '/system/user', extra: 'kept' } });
  const globals = { ...Vue, useRoute: () => route, useRouter: () => ({ push: target => routes.push(target) }), getCurrentInstance: () => ({ proxy: { $refs: { loginRef: { validate: callback => { validated = callback(true); } } } } }) };
  const source = fs.readFileSync(new URL('../../../maoyi-admin/src/views/login.vue', import.meta.url), 'utf8').replace('import.meta.env.VITE_APP_TITLE', '"Fixture title"');
  const { descriptor, errors } = parse(source);
  assert.deepEqual(errors, []);
  const script = compileScript(descriptor, { id: 'remember-password-fixture' });
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, id: 'remember-password-fixture', compilerOptions: { bindingMetadata: script.bindings } }).errors, []);
  const module = { exports: {} };
  Function('module', 'exports', 'require', ...Object.keys(globals), transformSync(script.content, { format: 'cjs' }).code)(module, module.exports, name => deps[name], ...Object.values(globals));
  const scope = Vue.effectScope();
  const state = scope.run(() => module.exports.default.setup({}, { expose() {} }));
  return { state, jar, written, submitted, routes, scope, get captchaRequests() { return captchaRequests; }, submit() { state.handleLogin(); return validated; } };
}

test('AES-GCM really round-trips Unicode; random IVs and non-extractable origin keys survive structured clone', async () => {
  const store = keyStore(), first = vault(store);
  const a = await first.encrypt(password, 'fixture-user');
  const b = await first.encrypt(password, 'fixture-user');
  assert.ok(isRememberedPassword(a));
  assert.notEqual(a, b);
  assert.ok(!a.includes(password));
  assert.equal(await vault(store).decrypt(a, 'fixture-user'), password);
  const key = await store.get();
  assert.equal(key.extractable, false);
  await assert.rejects(webcrypto.subtle.exportKey('raw', key));
});

test('authenticated encryption rejects tampering, a different username/key and old RSA cookies', async () => {
  const first = vault(), text = await first.encrypt(password, 'fixture-user');
  const parts = text.split('.');
  parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
  assert.equal(await first.decrypt(parts.join('.'), 'fixture-user'), '');
  assert.equal(await first.decrypt(text, 'other-user'), '');
  assert.equal(await vault().decrypt(text, 'fixture-user'), '');
  let reads = 0;
  const unread = vault({ get: async () => { reads++; } });
  assert.equal(await unread.decrypt('legacy-shared-key-cookie'), '');
  assert.equal(reads, 0);
});

test('real IndexedDB adapter persists a non-extractable CryptoKey and rejects denied storage safely', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  t.after(() => previous ? Object.defineProperty(globalThis, 'indexedDB', previous) : delete globalThis.indexedDB);
  let saved, closes = 0;
  const database = { close() { closes++; }, transaction() {
    const tx = { objectStore: () => ({
      get() { const request = {}; queueMicrotask(() => { request.result = saved; request.onsuccess(); queueMicrotask(() => tx.oncomplete()); }); return request; },
      put(key) { saved = structuredClone(key); }
    }) };
    return tx;
  } };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open() { const request = {}; queueMicrotask(() => { request.result = database; request.onsuccess(); }); return request; } } });
  const first = createPasswordVault({ crypto: webcrypto });
  const text = await first.encrypt(password, 'fixture-user');
  assert.equal(saved.extractable, false);
  assert.equal(await createPasswordVault({ crypto: webcrypto }).decrypt(text, 'fixture-user'), password);
  assert.equal(closes, 2);
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open() { throw new Error('Denied'); } } });
  assert.equal(await first.encrypt(password), null);
  assert.equal(await first.decrypt(text), '');
});

test('unavailable crypto, insecure contexts and broken storage disable only remembering', async t => {
  assert.equal(await createPasswordVault({ crypto: null }).encrypt(password), null);
  assert.equal(await vault({ getOrCreate: async () => { throw new Error('Denied'); } }).encrypt(password), null);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'isSecureContext');
  t.after(() => previous ? Object.defineProperty(globalThis, 'isSecureContext', previous) : delete globalThis.isSecureContext);
  Object.defineProperty(globalThis, 'isSecureContext', { configurable: true, value: false });
  assert.equal(await vault().encrypt(password), null);
});

test('login clears legacy password cookies without replacing CAPTCHA fields or submitting credentials', async t => {
  let decrypts = 0;
  const page = login({ cookies: { username: 'fixture-user', password: 'legacy-shared-key-cookie', rememberMe: 'true' }, crypto: { decrypt: async () => { decrypts++; return password; } } });
  t.after(() => page.scope.stop());
  await settle();
  assert.equal(page.state.loginForm.value.username, 'fixture-user');
  assert.equal(page.state.loginForm.value.password, '');
  assert.equal(page.state.loginForm.value.code, '');
  assert.equal(page.state.loginForm.value.uuid, '');
  assert.equal(page.jar.has('password'), false);
  assert.equal(decrypts, 0);
  assert.equal(page.submitted.length, 0);
});

test('asynchronous restore never replaces typed credentials and invalid ciphertext is removed', async t => {
  const saved = await vault().encrypt(password, 'fixture-user');
  const pending = deferred();
  const page = login({ cookies: { username: 'fixture-user', password: saved, rememberMe: 'true' }, crypto: { decrypt: () => pending.promise } });
  t.after(() => page.scope.stop());
  page.state.loginForm.value.password = 'new-test-fixture';
  pending.resolve(password); await settle();
  assert.equal(page.state.loginForm.value.password, 'new-test-fixture');
  const invalid = login({ cookies: { username: 'fixture-user', password: saved, rememberMe: 'true' } });
  t.after(() => invalid.scope.stop());
  await settle();
  assert.equal(invalid.state.loginForm.value.password, '');
  assert.equal(invalid.jar.has('password'), false);
});

test('successful login awaits real encryption, remembers ciphertext only and preserves redirect', async t => {
  const first = vault(), pending = deferred();
  const page = login({ crypto: { encrypt: async (...args) => { await pending.promise; return first.encrypt(...args); } } });
  t.after(() => page.scope.stop());
  Object.assign(page.state.loginForm.value, { username: 'fixture-user', password, rememberMe: true, code: 'fixture-code', uuid: 'fixture-uuid' });
  const request = page.submit(); await settle();
  assert.equal(page.submitted.length, 1);
  assert.equal(page.jar.has('password'), false);
  pending.resolve(); await request;
  assert.equal(await first.decrypt(page.jar.get('password'), 'fixture-user'), password);
  assert.ok(page.written.every(item => typeof item.value === 'string' && item.value !== password));
  assert.deepEqual(page.routes, [{ path: '/system/user', query: { extra: 'kept' } }]);
  assert.equal(page.submitted[0].uuid, 'fixture-uuid');
});

test('encryption/storage errors and remember-off never block normal authentication/navigation', async t => {
  for (const scenario of [
    { crypto: { encrypt: async () => null } },
    { crypto: { encrypt: async () => { throw new Error('Crypto denied'); } } },
    { blockedCookies: true, crypto: { encrypt: async () => 'ciphertext-fixture' } },
    { cookies: { username: 'fixture-user', password: 'old-cookie', rememberMe: 'true' }, rememberMe: false }
  ]) {
    const page = login(scenario); t.after(() => page.scope.stop());
    Object.assign(page.state.loginForm.value, { username: 'fixture-user', password, rememberMe: scenario.rememberMe ?? true });
    await page.submit();
    assert.equal(page.submitted.length, 1);
    assert.equal(page.routes.length, 1);
    assert.equal(page.jar.has('password'), false);
  }
});

test('login API rejection retains retry/CAPTCHA behavior without remembering invalid credentials', async t => {
  let encrypts = 0;
  const page = login({ authenticate: async () => { throw new Error('Fixture authentication rejection'); }, crypto: { encrypt: async () => { encrypts++; } } });
  t.after(() => page.scope.stop());
  Object.assign(page.state.loginForm.value, { username: 'fixture-user', password, rememberMe: true });
  await page.submit();
  assert.equal(page.state.loading.value, false);
  assert.equal(page.captchaRequests, 2);
  assert.equal(page.routes.length, 0);
  assert.equal(page.written.length, 0);
  assert.equal(encrypts, 0);
});

test('a valid remembered cookie restores only its matching account and leaves the live challenge intact', async t => {
  const first = vault(), encrypted = await first.encrypt(password, 'fixture-user');
  const page = login({ cookies: { username: 'fixture-user', password: encrypted, rememberMe: 'true' }, crypto: first });
  t.after(() => page.scope.stop());
  page.state.loginForm.value.code = 'current-fixture-answer';
  page.state.loginForm.value.uuid = 'current-fixture-challenge';
  for (let attempt = 0; attempt < 20 && !page.state.loginForm.value.password; attempt++) await settle();
  assert.equal(page.state.loginForm.value.password, password);
  assert.equal(page.state.loginForm.value.code, 'current-fixture-answer');
  assert.equal(page.state.loginForm.value.uuid, 'current-fixture-challenge');
  const pending = deferred();
  const changed = login({ cookies: { username: 'fixture-user', password: encrypted, rememberMe: 'true' }, crypto: { decrypt: () => pending.promise } });
  t.after(() => changed.scope.stop());
  changed.state.loginForm.value.username = 'different-fixture-user';
  pending.resolve(password); await settle();
  assert.equal(changed.state.loginForm.value.password, '');
});
