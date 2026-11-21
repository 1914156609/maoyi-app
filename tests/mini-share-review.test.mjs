import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { reactive, ref, nextTick } from 'vue';
import { parse, compileScript } from '@vue/compiler-sfc';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function load(file, context, mocks, vue = false) {
  const key = randomUUID(), filename = resolve(root, file);
  globalThis.__miniShareReview ||= {};
  globalThis.__miniShareReview[key] = context;
  let source = readFileSync(filename, 'utf8');
  if (vue) { const { descriptor } = parse(source, { filename }); source = compileScript(descriptor, { id: key }).content; }
  source = `const uni = globalThis.__miniShareReview[${JSON.stringify(key)}].uni;\n` + source;
  source = source.replace(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm, (line, binding, specifier) => {
    if (specifier.endsWith('.vue')) return `const ${binding} = {};`;
    if (mocks.includes(specifier)) return `const ${binding} = globalThis.__miniShareReview[${JSON.stringify(key)}];`;
    const target = specifier.startsWith('.') ? pathToFileURL(resolve(dirname(filename), specifier)).href : import.meta.resolve(specifier);
    return `import ${binding} from ${JSON.stringify(target)};`;
  });
  const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  return vue ? module.default.setup({}, { expose() {} }) : module;
}
test('share creation cannot deliver the old account private snapshot link into the new session', async () => {
  let release;
  const gate = new Promise(done => { release = done; });
  const context = { authState: { token: 'old', review: false }, api: () => gate, uid() {}, uni: {} };
  const module = await load('src/lib/sharing.js', context, ['./client.js', './store.js']);
  const request = module.createShare({ id: 'old-private' });
  context.authState.token = 'new'; release({ url: 'https://qa.invalid/private-old' });
  await assert.rejects(request, /登录账号已变化/);
});
async function pageFixture() {
  const notices = [];
  const context = { authenticated: ref(true), session: reactive({ token: 'old', review: false }), store: { crafts: [] },
    notify: text => notices.push(text), refreshCrafts: async () => {}, createShare: async () => ({ url: 'https://qa.invalid/private-old' }), onLoad() {}, onShow() {},
    uni: { pageScrollTo() {}, setClipboardData(options) { options.fail?.({ errMsg: 'clipboard denied' }); } } };
  const state = await load('src/pages/share/share.vue', context, ['@dcloudio/uni-app', '../../lib/session.js', '../../lib/store.js', '../../lib/sharing.js'], true);
  return { state, context, notices };
}
test('switching accounts clears the previous selected craft and QR payload before another read', async () => {
  const { state, context } = await pageFixture();
  await state.select({ id: 'private-old', name: 'previous account craft' });
  assert.equal(state.selection.value.id, 'private-old');
  context.session.token = 'new'; await nextTick();
  assert.equal(state.selection.value, null);
  assert.equal(state.link.value, '');
});
test('clipboard denial gives an actionable failure message without claiming success', async () => {
  const { state, notices } = await pageFixture();
  state.link.value = 'https://qa.invalid/private-old'; state.copy();
  assert.equal(notices.length, 1);
  assert.match(notices[0], /复制.*未完成|复制.*失败/);
  assert.doesNotMatch(notices[0], /已复制/);
});
