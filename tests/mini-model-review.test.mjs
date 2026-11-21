import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parse, compileScript } from '@vue/compiler-sfc';

const filename = resolve(dirname(fileURLToPath(import.meta.url)), '../src/pages/model/model.vue');
async function fixture(craft) {
  const key = randomUUID();
  const context = {
    fetchCraft: async () => craft,
    onLoad(callback) { context.load = callback; },
  };
  globalThis.__miniModelReview ||= {};
  globalThis.__miniModelReview[key] = context;
  const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename });
  const source = compileScript(descriptor, { id: key }).content.replace(
    /^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm,
    (line, binding, specifier) => {
      if (specifier.endsWith('.vue')) return `const ${binding} = {};`;
      if (['@dcloudio/uni-app', '../../lib/store.js'].includes(specifier))
        return `const ${binding} = globalThis.__miniModelReview[${JSON.stringify(key)}];`;
      return `import ${binding} from ${JSON.stringify(import.meta.resolve(specifier))};`;
    },
  );
  const component = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
  const state = component.setup({}, { expose() {} });
  await context.load({ id: craft.id });
  return state;
}

test('the model page echoes every provided craft dimension and converts flat chest to its circumference label', async () => {
  const dimensions = { bodyLength: 67.5, chest: 54.5, shoulder: 43, armhole: 24,
    neckWidth: 19.5, frontNeckDepth: 8.5, backNeckDepth: 3,
    sleeveLength: 59, sleeveCapHeight: 16.5, sleeveCapWidth: 20 };
  const page = await fixture({ id: 'model-source', style: '开衫', neck: 'V领', sleeve: '短袖',
    length: '加长', measurementBasis: 'flat', sizes: dimensions });
  assert.deepEqual({ ...page.sizes }, { ...dimensions, chest: 109 });
  assert.equal(page.values.style, '开衫');
  assert.equal(page.values.neck, 'V领');
  assert.equal(page.values.sleeve, '短袖');
  assert.equal(page.values.length, '加长');
});

test('legacy circumference values do not double again and zero dimensions are preserved', async () => {
  const page = await fixture({ id: 'legacy-model', sizes: { chest: '118', backNeckDepth: 0 } });
  assert.equal(page.sizes.chest, 118);
  assert.equal(page.sizes.backNeckDepth, 0);
});

test('saved dimensions outside the default slider range remain truthful and reachable', async () => {
  const page = await fixture({ id: 'large-model', measurementBasis: 'flat',
    sizes: { chest: 90, bodyLength: 130 } });
  assert.equal(page.sizes.chest, 180);
  assert.equal(page.sizes.bodyLength, 130);
  assert.ok(page.dimensions.find(field => field.key === 'chest').max >= 180);
  assert.ok(page.dimensions.find(field => field.key === 'bodyLength').max >= 130);
});

test('source metadata never shows a different default fabric, colour or gauge as selected', async () => {
  const page = await fixture({ id: 'metadata-model', material: '未指定', color: '墨绿色', gauge: '9针', sizes: {} });
  assert.equal(page.values.material, '未指定');
  assert.equal(page.values.color, '墨绿色');
  assert.equal(page.values.gauge, '9针');
});

test('an incomplete saved craft does not show invented default dimensions', async () => {
  const page = await fixture({ id: 'incomplete-model', sizes: { chest: '' }, baseSizes: { bodyLength: 63 } });
  assert.equal(page.sizes.bodyLength, 63);
  assert.equal(page.sizes.chest, 0);
  assert.equal(page.sizes.shoulder, 0);
  assert.equal(page.values.material, '');
});
