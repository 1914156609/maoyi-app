import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createSSRApp, reactive, ref } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { parse, compileScript } from '@vue/compiler-sfc';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function compile(relativePath, options = {}) {
  const filename = resolve(root, relativePath), id = randomUUID();
  const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename });
  let code = compileScript(descriptor, { id, ...options }).content;
  code = code.replace(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm, (line, binding, specifier) => {
    if (specifier.endsWith('.vue')) return `const ${binding} = { render: () => null };`;
    if (options.context && ['@dcloudio/uni-app', '../../lib/store.js', '../../lib/session.js'].includes(specifier)) return `const ${binding} = globalThis.__approvalPageContexts[${JSON.stringify(options.context)}];`;
    const target = specifier.startsWith('.') ? pathToFileURL(resolve(dirname(filename), specifier)).href : import.meta.resolve(specifier);
    return `import ${binding} from ${JSON.stringify(target)};`;
  });
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}

const History = await compile('src/components/ApprovalHistory.vue', {
  inlineTemplate: true,
  templateOptions: { ssr: true, compilerOptions: { isCustomElement: tag => ['view', 'text'].includes(tag) } },
});
const render = props => renderToString(createSSRApp(History, props));
const history = () => [
  { status: 'pending', version: 4, at: '2026-11-18T01:45:00Z', actor: '验收工艺员', note: '' },
  { status: 'rejected', version: 5, at: '2026-11-18T01:46:00Z', actor: '验收系统管理', note: '衣长请调整为62cm后重新提交。' },
];

test('actual API history shape renders latest rejection and preserves source order', async () => {
  const rows = history(), before = structuredClone(rows);
  const html = await render({ history: rows, status: 'rejected' });
  assert.ok(html.indexOf('已驳回') < html.indexOf('待审核'));
  assert.ok(html.includes('驳回原因：衣长请调整为62cm后重新提交。'));
  assert.ok(html.includes('验收系统管理'));
  assert.ok(html.includes('2026-11-18'));
  assert.deepEqual(rows, before);
});

test('new draft has no invented approval panel; missing rejected history stays honest', async () => {
  assert.equal((await render({ history: [], status: 'draft' })).includes('审批记录'), false);
  assert.ok((await render({ history: null, status: 'rejected' })).includes('暂无可用的驳回记录'));
});

test('long multiline feedback is preserved and HTML is escaped', async () => {
  const note = 'A'.repeat(470) + '\n<img src=x onerror=alert(1)>';
  const html = await render({ history: [{ ...history()[1], note, actor: '<script>bad</script>' }], status: 'rejected' });
  assert.ok(html.includes('A'.repeat(470)));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('&lt;script&gt;bad&lt;/script&gt;'));
  assert.equal(html.includes('<img src=x'), false);
});

test('approved history still shows earlier rejection and latest approval first', async () => {
  const html = await render({ history: [...history(), { status: 'pending', version: 7, actor: '验收工艺员' }, { status: 'approved', version: 8, actor: '验收系统管理' }], status: 'approved' });
  assert.ok(html.indexOf('已通过') < html.indexOf('已驳回'));
  assert.equal(html.split('衣长请调整为62cm后重新提交。').length - 1, 1);
});

test('history loading failure offers a retry without claiming transition failed', async () => {
  const html = await render({ history: [], status: 'pending', error: '审批记录加载失败，请重新加载' });
  assert.ok(html.includes('重新加载'));
  assert.ok(html.includes('<button'));
  assert.equal(html.includes('提交失败'), false);
});

async function detail(options = {}) {
  const key = randomUUID(), calls = [], seed = { id: 'QA-craft', status: 'draft', sizes: {}, history: [], version: 3, ...options.seed };
  const context = {
    store: reactive({ details: { 'QA-craft': seed }, crafts: [] }), authenticated: ref(true),
    navigate() {}, notify: value => calls.push(['notify', value]), recordViewed: id => calls.push(['viewed', id]),
    onLoad: callback => { context.load = callback; }, onShow: callback => { context.show = callback; },
    changeStatus: async (...args) => { calls.push(['transition', ...args]); await options.changeStatus?.(...args); context.store.details['QA-craft'] = { ...seed, status: 'pending', version: 4 }; },
    fetchCraft: async id => { calls.push(['fetch', id]); await options.fetchCraft?.(id); return context.store.details[id] = { ...context.store.details[id], history: [history()[0]] }; },
  };
  globalThis.__approvalPageContexts ||= {};
  globalThis.__approvalPageContexts[key] = context;
  const component = await compile('src/pages/detail/detail.vue', { context: key });
  const state = component.setup({}, { expose() {} });
  context.load({ id: 'QA-craft' });
  return { state, context, calls };
}

test('vest and sleeveless details hide stale sleeve dimensions without altering saved values', async () => {
  for (const choice of [{ style: '背心', sleeve: '长袖' }, { style: '套头', sleeve: '无袖' }]) {
    const { state } = await detail({ seed: { ...choice, sizes: { sleeveLength: 55 } } });
    assert.equal(state.hasSleeve.value, false);
    assert.equal(state.detailGroups.value.some(group => group.label === '袖子尺寸'), false);
    assert.equal(state.craft.value.sizes.sleeveLength, 55);
  }
  const { state } = await detail({ seed: { style: '套头', sleeve: '短袖', sizes: { sleeveLength: 20 } } });
  assert.equal(state.hasSleeve.value, true);
  assert.equal(state.detailGroups.value.some(group => group.label === '袖子尺寸'), true);
});

test('successful submit refreshes actual history before finishing without duplicating transition', async () => {
  const { state, calls } = await detail();
  await state.updateStatus('pending');
  assert.equal(calls.filter(x => x[0] === 'transition').length, 1);
  assert.equal(calls.filter(x => x[0] === 'fetch').length, 1);
  assert.equal(state.craft.value.history[0].version, 4);
  assert.equal(state.busy.value, false);
  assert.equal(state.historyError.value, '');
  assert.ok(calls.some(x => x[0] === 'notify' && x[1] === '已提交审批'));
});

test('failed history GET retains submitted state and retry reloads without resubmitting', async () => {
  let failures = 1;
  const { state, calls } = await detail({ fetchCraft: async () => { if (failures--) throw new Error('network'); } });
  await state.updateStatus('pending');
  assert.equal(state.craft.value.status, 'pending');
  assert.equal(state.historyError.value, '审批记录加载失败，请重新加载');
  assert.equal(state.busy.value, false);
  assert.equal(state.historyLoading.value, false);
  await state.reload();
  assert.equal(state.historyError.value, '');
  assert.equal(state.historyLoading.value, false);
  assert.equal(state.craft.value.history.length, 1);
  assert.equal(calls.filter(x => x[0] === 'transition').length, 1);
});

test('rapid repeated submit is ignored while the first transition awaits response', async () => {
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const { state, calls } = await detail({ changeStatus: () => gate });
  const first = state.updateStatus('pending');
  await state.updateStatus('pending');
  finish(); await first;
  assert.equal(calls.filter(x => x[0] === 'transition').length, 1);
  assert.equal(calls.filter(x => x[0] === 'fetch').length, 1);
});
