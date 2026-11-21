import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createSSRApp, reactive, ref, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { parse, compileScript } from '@vue/compiler-sfc';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function page(name, options = {}) {
  const key = randomUUID(), filename = resolve(root, `src/pages/${name}/${name}.vue`);
  let calls = 0;
  const context = {
    store: reactive({ crafts: [{ id: 'old', name: 'STALE_CARD', status: 'draft' }], recentIds: ['old'] }),
    authenticated: ref(true), navigate() {}, setReviewMode() {},
    onLoad(callback) { context.load = callback; }, onShow(callback) { context.show = callback; },
    notify() {}, session: reactive({ user: { id: 103 } }),
    shares: [], async createShare(craft) { context.shares.push(craft.id); return { url: 'https://qa.invalid/shared' }; },
    async refreshCrafts() { calls++; await options.refresh?.(context); },
    CraftCard: { props: ['craft'], setup: props => () => h('p', props.craft.name) },
    AccessEmpty: { props: ['title', 'description'], setup: props => () => h('p', props.title || props.description || 'LOGIN_REQUIRED') },
  };
  globalThis.__listPageTests ||= {};
  globalThis.__listPageTests[key] = context;
  const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename });
  let code = compileScript(descriptor, {
    id: key, inlineTemplate: !!options.render,
    ...(options.render ? { templateOptions: { ssr: true, compilerOptions: { isCustomElement: tag => ['view', 'text'].includes(tag) } } } : {}),
  }).content;
  code = code.replace(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm, (line, binding, specifier) => {
    if (specifier.endsWith('.vue')) return `const ${binding} = globalThis.__listPageTests[${JSON.stringify(key)}][${JSON.stringify(binding.trim())}] || {render:()=>null};`;
    if (['@dcloudio/uni-app', '../../lib/store.js', '../../lib/session.js', '../../lib/sharing.js'].includes(specifier)) return `const ${binding} = globalThis.__listPageTests[${JSON.stringify(key)}];`;
    const target = specifier.startsWith('.') ? pathToFileURL(resolve(dirname(filename), specifier)).href : import.meta.resolve(specifier);
    return `import ${binding} from ${JSON.stringify(target)};`;
  });
  const component = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
  const state = component.setup({}, { expose() {} });
  return { state, context, calls: () => calls, html: () => renderToString(createSSRApp({ ...component, setup: () => state })) };
}

for (const name of ['index', 'crafts', 'library', 'share']) {
  test(`${name}: pending request coalesces repeated refresh and always clears busy`, async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const p = await page(name, { refresh: () => gate });
    const first = p.state.reload();
    assert.equal(p.state.loading.value, true);
    await p.state.reload();
    assert.equal(p.calls(), 1);
    release(); await first;
    assert.equal(p.state.loading.value, false);
    assert.equal(p.state.loadError.value, '');
  });
  test(`${name}: failed refresh hides stale cards with durable error then retry reveals fresh data`, async () => {
    let failures = 1;
    const p = await page(name, { render: true, refresh: async c => {
      if (failures--) throw new Error('服务暂时不可用，请稍后重试');
      c.store.crafts = [{ id: 'old', name: 'FRESH_CARD', status: 'draft' }];
    } });
    assert.match(await p.html(), /STALE_CARD/);
    await p.context.show();
    const failed = await p.html();
    assert.match(failed, /服务暂时不可用，请稍后重试/);
    assert.match(failed, /重新加载/);
    assert.doesNotMatch(failed, /STALE_CARD|暂无数据/);
    assert.match(await p.html(), /重新加载/);
    await p.context.show();
    const recovered = await p.html();
    assert.match(recovered, /FRESH_CARD/);
    assert.doesNotMatch(recovered, /服务暂时不可用|重新加载|STALE_CARD/);
    assert.equal(p.calls(), 2);
  });
}

for (const name of ['crafts', 'library']) test(`${name} retry preserves query and filter instead of resetting user selection`, async () => {
  let failure = true;
  const p = await page(name, { refresh: async () => { if (failure) throw new Error('offline'); } });
  p.state.query.value = '保留查询'; p.state.filter.value = '已驳回';
  await p.state.reload(); failure = false; await p.state.reload();
  assert.equal(p.state.query.value, '保留查询');
  assert.equal(p.state.filter.value, '已驳回');
  assert.equal(p.state.loadError.value, '');
});

test('unauthorized refresh shows login access instead of stale private cards', async () => {
  const p = await page('crafts', { render: true, refresh: async c => {
    c.authenticated.value = false; throw new Error('登录已失效，请重新登录');
  } });
  await p.context.show();
  const html = await p.html();
  assert.doesNotMatch(html, /STALE_CARD/);
  assert.match(html, /登录后可查看账号中的工艺单/);
});

test('share first entry loads once and never creates a snapshot after a failed read', async () => {
  const oldUni = globalThis.uni;
  globalThis.uni = { pageScrollTo() {} };
  try {
    let failed = true;
    const p = await page('share', { refresh: async () => { if (failed) throw new Error('offline'); } });
    p.context.load({ id: 'old' });
    assert.equal(p.calls(), 0);
    await p.context.show();
    assert.equal(p.calls(), 1);
    assert.deepEqual(p.context.shares, []);
    await p.state.select(p.context.store.crafts[0]);
    assert.deepEqual(p.context.shares, []);
    failed = false;
    await p.state.reload();
    assert.deepEqual(p.context.shares, ['old']);
    assert.equal(p.state.selection.value.id, 'old');
    await p.context.show();
    assert.deepEqual(p.context.shares, ['old']);
  } finally { globalThis.uni = oldUni; }
});

test('share hides the previous QR and choice list on read failure without discarding the existing link', async () => {
  const oldUni = globalThis.uni;
  globalThis.uni = { pageScrollTo() {} };
  try {
    let failure = false;
    const q = await page('share', { render: true, refresh: async () => { if (failure) throw new Error('offline'); } });
    q.context.load({ id: 'old' }); await q.context.show();
    assert.match(await q.html(), /分享链接|https:\/\/qa.invalid\/shared/);
    failure = true; await q.context.show();
    const html = await q.html();
    assert.match(html, /offline|重新加载/);
    assert.doesNotMatch(html, /STALE_CARD|https:\/\/qa.invalid\/shared|复制链接/);
    failure = false; await q.context.show();
    assert.match(await q.html(), /https:\/\/qa.invalid\/shared/);
    assert.deepEqual(q.context.shares, ['old']);
  } finally { globalThis.uni = oldUni; }
});
