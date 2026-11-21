import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { parse, compileScript } from '@vue/compiler-sfc';

const filename = resolve(dirname(fileURLToPath(import.meta.url)), '../src/components/CraftCard.vue');
const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename });
let code = compileScript(descriptor, {
  id: 'qa-craft-card', inlineTemplate: true,
  templateOptions: { ssr: true, compilerOptions: { isCustomElement: tag => ['view', 'text'].includes(tag) } },
}).content;
code = code.replace(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm, (line, binding, specifier) => {
  if (specifier.endsWith('/store.js')) return 'const navigate = () => {};';
  const target = specifier.startsWith('.') ? pathToFileURL(resolve(dirname(filename), specifier)).href : import.meta.resolve(specifier);
  return `import ${binding} from ${JSON.stringify(target)};`;
});
const Card = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
const render = craft => renderToString(createSSRApp(Card, { craft, recent: true }));

test('new flat craft summary uses the same chest width as the saved drawing', async () => {
  const html = await render({ id: 'new', name: 'A'.repeat(60), measurementBasis: 'flat', sizes: { chest: 52 }, calculation: { input: { sizes: { chest: 52 } } } });
  assert.ok(html.includes('胸宽（平铺） 52cm'));
  assert.ok(html.includes('A'.repeat(60)), 'full title remains in DOM while CSS truncates only visual summary');
  assert.equal(html.includes('胸围 52cm'), false);
});

test('legacy circumference summary normalizes once with or without cached calculation', async () => {
  const craft = { id: 'legacy', name: '旧工艺', sizes: { chest: 100 } };
  assert.ok((await render(craft)).includes('胸宽（平铺） 50cm'));
  assert.ok((await render({ ...craft, calculation: { input: { sizes: { chest: 50 } } } })).includes('胸宽（平铺） 50cm'));
});

test('incomplete drafts and explicit flat inputs stay readable without fabricated circumference', async () => {
  assert.ok((await render({ id: 'draft', sizes: {}, measurementBasis: 'flat' })).includes('胸宽（平铺） 0cm'));
  assert.ok((await render({ id: 'draft', sizes: { chest: '52.5' }, measurementBasis: 'flat' })).includes('胸宽（平铺） 52.5cm'));
});
