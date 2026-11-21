import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parse, compileScript } from '@vue/compiler-sfc';

const clone = value => JSON.parse(JSON.stringify(value));
const filename = resolve(dirname(fileURLToPath(import.meta.url)), '../src/pages/calculate/calculate.vue');
async function fixture() {
  const key = randomUUID(), storage = {};
  const context = { store: { settings: { unit: 'cm' } }, fetchCraft() {}, notify() {}, onLoad() {},
    uni: { hideToast() {}, setStorageSync(k,v) { storage[k] = v; }, navigateTo(options) { options.complete?.(); } } };
  globalThis.__miniUnitReview ||= {};
  globalThis.__miniUnitReview[key] = context;
  const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename });
  let code = compileScript(descriptor, { id: key }).content;
  code = `const uni = globalThis.__miniUnitReview[${JSON.stringify(key)}].uni;\n` + code;
  code = code.replace(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm, (line, binding, specifier) => {
    if (specifier.endsWith('.vue')) return `const ${binding} = {};`;
    if (['@dcloudio/uni-app', '../../lib/store.js'].includes(specifier)) return `const ${binding} = globalThis.__miniUnitReview[${JSON.stringify(key)}];`;
    const target = specifier.startsWith('.') ? pathToFileURL(resolve(dirname(filename), specifier)).href : import.meta.resolve(specifier);
    return `import ${binding} from ${JSON.stringify(target)};`;
  });
  const component = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
  const state = component.setup({}, { expose() {} });
  Object.assign(state.form, { name:'单位转换验收',style:'背心',neck:'圆领',sleeve:'无袖',measurementBasis:'flat',density:68,rowDensity:40 });
  Object.assign(state.form.sizes,{chest:50.1475,bodyLength:60,shoulder:37,armhole:23,shoulderSlope:3,neckWidth:20,frontNeckDepth:7,frontNeckFlat:4,backNeckDepth:3,backNeckFlat:15,bodyRib:6,underarmFlat:2});
  return { state, storage };
}
test('switching units keeps canonical physical input and the same needle/row counts at rounding boundaries', async () => {
  const { state: p } = await fixture();
  await p.run();
  assert.equal(p.result.value.errors.length, 0);
  const original = clone(p.result.value.input), totals = clone(p.result.value.totals);
  p.setUnit('寸'); await p.run();
  assert.deepEqual(p.result.value.totals, totals);
  assert.deepEqual(p.result.value.input.sizes, original.sizes);
  p.setUnit('cm'); await p.run();
  assert.deepEqual(p.result.value.totals, totals);
  assert.equal(Number(p.form.sizes.chest), 50.1475);
});
test('saving a calculation in 寸 transfers the preserved centimetre values to create without another lossy conversion', async () => {
  const { state: p, storage } = await fixture();
  await p.run(); const expected = clone(p.result.value.input.sizes);
  p.setUnit('寸'); await p.run(); p.saveDraft();
  assert.deepEqual(storage['maoyi-prefill'].sizes, expected);
  assert.equal(storage['maoyi-prefill'].measurementBasis, 'flat');
});
test('editing a converted field discards the old physical cache and computes the newly entered 寸 value', async () => {
  const { state: p } = await fixture();
  p.setUnit('寸'); p.form.sizes.chest = '16'; await p.run();
  assert.equal(p.result.value.input.sizes.chest, 53.28);
});
test('invalid whitespace in an optional 寸 field remains a validation failure', async () => {
  const { state: p } = await fixture();
  p.setUnit('寸'); p.form.sizes.shoulderSlope = ' '; await p.run();
  assert.equal(p.result.value, null);
  assert.ok(p.errors.value.shoulderSlope);
});
