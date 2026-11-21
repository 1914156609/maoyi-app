import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const filename = resolve(dirname(fileURLToPath(import.meta.url)), '../src/lib/store.js');
async function fixture(saved = {}, options = {}) {
  const key = randomUUID(), storage = structuredClone(saved), writes = [], notices = [];
  const context = {
    authState: { user: { id: 103 }, token: 'qa-isolated-token', review: false },
    api: async () => ({ crafts: [] }), reviewEnabled: false,
    uni: {
      $on() {}, getStorageSync(k) { if (options.readFails) throw new Error('qa storage unavailable'); return storage[k]; },
      setStorageSync(k, value) { storage[k] = JSON.parse(JSON.stringify(value)); writes.push(k); },
      showToast: ({ title }) => notices.push(title),
    },
  };
  globalThis.__qaRecentContexts ||= {};
  globalThis.__qaRecentContexts[key] = context;
  let source = `const uni = globalThis.__qaRecentContexts[${JSON.stringify(key)}].uni;\n` + readFileSync(filename, 'utf8');
  source = source.replace(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm, (line, binding, specifier) => {
    if (specifier === './client.js') return `const ${binding} = globalThis.__qaRecentContexts[${JSON.stringify(key)}];`;
    const target = specifier.startsWith('.') ? pathToFileURL(resolve(dirname(filename), specifier)).href : import.meta.resolve(specifier);
    return `import ${binding} from ${JSON.stringify(target)};`;
  });
  const module = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const open = id => { module.store.details[id] = { id }; module.recordViewed(id); };
  return { ...module, context, storage, writes, notices, open };
}

test('cold detail entry hydrates previous account history before recording current craft', async () => {
  const f = await fixture({ 'maoyi-recent-103': ['A', 'B'] });
  assert.deepEqual([...f.store.recentIds], []);
  f.open('C');
  assert.deepEqual([...f.store.recentIds], ['C', 'A', 'B']);
  assert.deepEqual(f.storage['maoyi-recent-103'], ['C', 'A', 'B']);
});

test('reopening an older craft moves it to first without duplicates and retains five latest', async () => {
  const f = await fixture({ 'maoyi-recent-103': ['E', 'D', 'C', 'B', 'A'] });
  f.open('B');
  assert.deepEqual(f.storage['maoyi-recent-103'], ['B', 'E', 'D', 'C', 'A']);
  f.open('F');
  assert.deepEqual(f.storage['maoyi-recent-103'], ['F', 'B', 'E', 'D', 'C']);
});

test('latest persisted events from another tab are retained instead of overwritten by stale memory', async () => {
  const f = await fixture({ 'maoyi-recent-103': ['A'] });
  await f.refreshCrafts();
  f.storage['maoyi-recent-103'] = ['B', 'A'];
  f.open('C');
  assert.deepEqual(f.storage['maoyi-recent-103'], ['C', 'B', 'A']);
});

test('switching accounts loads only that account history and leaves the first account untouched', async () => {
  const f = await fixture({ 'maoyi-recent-103': ['A'], 'maoyi-recent-107': ['X'] });
  f.open('B'); f.clearData(); f.context.authState.user.id = 107; f.open('Y');
  assert.deepEqual(f.storage['maoyi-recent-103'], ['B', 'A']);
  assert.deepEqual(f.storage['maoyi-recent-107'], ['Y', 'X']);
});

test('unknown inaccessible craft cannot enter recent history', async () => {
  const f = await fixture({ 'maoyi-recent-103': ['A'] });
  f.recordViewed('not-loaded');
  assert.equal(f.writes.length, 0);
  assert.deepEqual(f.storage['maoyi-recent-103'], ['A']);
});

test('storage read failure does not overwrite existing history', async () => {
  const f = await fixture({ 'maoyi-recent-103': ['A', 'B'] }, { readFails: true });
  f.open('C');
  assert.equal(f.writes.length, 0);
  assert.deepEqual(f.storage['maoyi-recent-103'], ['A', 'B']);
  assert.match(f.notices[0], /读取失败/);
});

test('malformed history is normalized while valid ids retain their relative order', async () => {
  const f = await fixture({ 'maoyi-recent-103': ['A', null, 'A', 12, '', 'B', ' '] });
  f.open('C');
  assert.deepEqual(f.storage['maoyi-recent-103'], ['C', 'A', 'B']);
});
