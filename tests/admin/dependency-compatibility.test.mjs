import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import createSvgIcon from '../../../maoyi-admin/vite/plugins/svg-icon.js';
import createAutoImport from '../../../maoyi-admin/vite/plugins/auto-import.js';

const adminRoot = fileURLToPath(new URL('../../../maoyi-admin/', import.meta.url));
const require = createRequire(new URL('../../../maoyi-admin/package.json', import.meta.url));
const viteRoot = path.dirname(require.resolve('vite/package.json'));
const { build } = await import(pathToFileURL(path.join(viteRoot, 'dist/node/index.js')).href);
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc');
const { transformSync } = require('esbuild');
const beautifier = require('js-beautify');
const utilities = { exports: {} };
Function('module', 'exports', 'require', transformSync(fs.readFileSync(new URL('../../../maoyi-admin/src/utils/index.js', import.meta.url), 'utf8'), { format: 'cjs' }).code)(utilities, utilities.exports, () => ({ parseTime() {} }));
const { beautifierConf } = utilities.exports;

// Run the actual installed Vite plugins without a server or on-disk build output.
async function bundle(source, { plugins = [], external = [], root = adminRoot } = {}) {
  const entry = path.join(root, '__qa_dependency_fixture__.js');
  const result = await build({
    configFile: false, root, logLevel: 'silent',
    plugins: [{ name: 'qa-dependency-fixture', resolveId: id => id === entry ? entry : undefined, load: id => id === entry ? source : undefined }, ...plugins],
    build: { write: false, minify: false, rollupOptions: { input: entry, external, preserveEntrySignatures: 'strict', output: { format: 'cjs' } } }
  });
  const code = result.output.find(item => item.type === 'chunk' && item.isEntry).code;
  return {
    code,
    execute(deps = {}) {
      const module = { exports: {} };
      Function('module', 'exports', 'require', code)(module, module.exports, id => {
        assert.ok(id in deps, 'unexpected external dependency: ' + id);
        return deps[id];
      });
      return module.exports;
    }
  };
}

function svgFiles(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) return svgFiles(path.join(dir, entry.name), relative);
    return entry.name.endsWith('.svg') ? [relative] : [];
  });
}

test('replacement SVG plugin keeps every existing icon id, valid symbol markup and one runtime sprite registration', async () => {
  const plugin = createSvgIcon();
  const result = await bundle("import sprite from 'virtual:svg-icons/sprite'; import ids from 'virtual:svg-icons/ids'; import 'virtual:svg-icons/register'; export { sprite, ids };", { plugins: [plugin] });
  const { sprite, ids } = result.execute();
  const expected = svgFiles(path.join(adminRoot, 'src/assets/icons/svg')).map(file => 'icon-' + file.slice(0, -4).split(path.sep).join('-')).sort();
  assert.deepEqual([...ids].sort(), expected);
  assert.equal(new Set(ids).size, expected.length);
  assert.equal(XMLValidator.validate(sprite), true);
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(sprite);
  assert.equal(parsed.svg['@_id'], '__svg__icons__dom__');
  assert.equal(String(parsed.svg['@_width']), '0');
  assert.equal(String(parsed.svg['@_height']), '0');
  assert.deepEqual(parsed.svg.symbol.map(symbol => symbol['@_id']).sort(), expected);
  assert.ok(parsed.svg.symbol.every(symbol => typeof symbol['@_viewBox'] === 'string' && symbol['@_viewBox'].split(/\s+/).length === 4));
  assert.ok(result.code.includes('DOMParser'), 'the entry retains runtime registration');
  const html = '<html><body><div id="app"></div></body></html>';
  assert.equal(await plugin.transformIndexHtml.handler(html), html, 'runtime registration must not be accompanied by duplicate inline injection');
});

test('broken SVG sources fail the build instead of silently dropping an icon', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maoyi-svg-compat-'));
  try {
    const icons = path.join(root, 'src/assets/icons/svg');
    fs.mkdirSync(icons, { recursive: true });
    fs.writeFileSync(path.join(icons, 'broken.svg'), '<svg viewBox="0 0 24 24"><path></svg>');
    await assert.rejects(bundle("import sprite from 'virtual:svg-icons/sprite'; export { sprite };", { root, plugins: [createSvgIcon()] }), /Failed on icon.*broken\.svg/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('updated auto-import plugin resolves Vue, router, Pinia and both existing application helpers in a real Vite build', async () => {
  const externals = ['vue', 'vue-router', 'pinia', '@/utils/dict', '@/utils/ruoyi'];
  const result = await bundle('export function createState(){ const count=ref(3); return {count,total:computed(()=>count.value+2),route:useRoute,store:defineStore,dict:useDict,label:selectDictLabel}; }', { plugins: [createAutoImport()], external: externals });
  const dict = () => [], label = value => value;
  const router = require('vue-router'), pinia = require('pinia');
  const state = result.execute({ vue: require('vue'), 'vue-router': router, pinia, '@/utils/dict': { useDict: dict }, '@/utils/ruoyi': { selectDictLabel: label } }).createState();
  assert.equal(state.count.value, 3); assert.equal(state.total.value, 5);
  state.count.value = 4; assert.equal(state.total.value, 6);
  assert.equal(state.route, router.useRoute); assert.equal(state.store, pinia.defineStore);
  assert.equal(state.dict, dict); assert.equal(state.label, label);
});

test('updated formatter preserves valid Vue fixtures and retains errors in known historic invalid exports', () => {
  const fixtureDir = new URL('./fixtures/', import.meta.url);
  const fixtures = fs.readdirSync(fixtureDir).filter(file => file.endsWith('.vue'));
  assert.ok(fixtures.length > 0);
  for (const file of fixtures) {
    const input = fs.readFileSync(new URL(file, fixtureDir), 'utf8');
    const formatted = beautifier.html(input, beautifierConf.html);
    assert.equal(beautifier.html(formatted, beautifierConf.html), formatted, file + ' formatting is stable');
    const before = parse(input), after = parse(formatted);
    assert.deepEqual(after.errors, [], file);
    if (['r16-builder-regex-valid.vue', 'r16-builder-form-invalid-ref.vue'].includes(file)) {
      assert.throws(() => compileScript(before.descriptor, { id: file }), undefined, file + ' is a known invalid historic export');
      assert.throws(() => compileScript(after.descriptor, { id: file }), undefined, file + ' must not be silently accepted');
      continue;
    }
    let script;
    try { script = compileScript(after.descriptor, { id: file }); }
    catch (error) { error.message = file + ': ' + error.message; throw error; }
    assert.deepEqual(compileTemplate({ source: after.descriptor.template.content, id: file, compilerOptions: { bindingMetadata: script.bindings } }).errors, [], file);
    const minify = text => transformSync(text, { minify: true, format: 'esm' }).code;
    assert.equal(minify(after.descriptor.script?.content || after.descriptor.scriptSetup?.content), minify(before.descriptor.script?.content || before.descriptor.scriptSetup?.content), file + ' script behavior survives HTML formatting');
    assert.equal(after.descriptor.styles.length, before.descriptor.styles.length, file);
    for (let index = 0; index < before.descriptor.styles.length; index++) assert.equal(after.descriptor.styles[index].content.replace(/\s+/g, ''), before.descriptor.styles[index].content.replace(/\s+/g, ''), file + ' CSS declarations survive formatting');
  }
});

test('patched formatter glob and EditorConfig dependencies retain actual CLI matching and per-file indentation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maoyi-beautify-compat-'));
  try {
    fs.writeFileSync(path.join(root, '.editorconfig'), 'root = true\n[*.js]\nindent_style = space\nindent_size = 3\n');
    const file = path.join(root, 'qa-example.js');
    fs.writeFileSync(file, 'function example(){if(true){return "中文";}}');
    execFileSync(process.execPath, [require.resolve('js-beautify/js/bin/js-beautify.js'), '--editorconfig', '--replace', path.join(root, 'qa-*.js')], { encoding: 'utf8', timeout: 15000 });
    const result = fs.readFileSync(file, 'utf8');
    assert.match(result, /\n {3}if \(true\) \{/);
    assert.match(result, /\n {6}return "中文";/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('ECharts security upgrade registers the v5 theme on the real Vite ESM instance and preserves existing cache chart settings', async () => {
  const baseline = JSON.parse(fs.readFileSync(new URL('./fixtures/echarts-v5-cache-baseline.json', import.meta.url), 'utf8'));
  const source = fs.readFileSync(new URL('../../../maoyi-admin/src/views/monitor/cache/index.vue', import.meta.url), 'utf8');
  assert.ok(source.includes("import 'echarts/theme/v5.js'"));
  assert.equal((source.match(/echarts\.init\([^\n]+"v5"\)/g) || []).length, 2);
  const pie = { tooltip: { trigger: 'item', formatter: '{a} <br/>{b} : {c} ({d}%)' }, series: [{ name: '命令', type: 'pie', roseType: 'radius', radius: [15, 95], center: ['50%', '38%'], data: [{ name: 'get', value: 30 }, { name: 'set', value: 10 }, { name: 'other', value: 0 }], animationEasing: 'cubicInOut', animationDuration: 1000 }] };
  const gauge = { tooltip: { formatter: '{b} <br/>{a} : 2.5M' }, series: [{ name: '峰值', type: 'gauge', min: 0, max: 1000, title: { offsetCenter: [0, '20%'], fontSize: 16 }, detail: { offsetCenter: [0, '40%'], fontSize: 30, lineHeight: 30, formatter: '2.5M' }, data: [{ value: 2.5, name: '内存消耗' }] }] };
  const result = await bundle(`import * as echarts from 'echarts'; import 'echarts/theme/v5.js'; export const options={}; export const svg={}; for(const [name,option]of Object.entries(${JSON.stringify({ pie, gauge })})){ const chart=echarts.init(null,'v5',{renderer:'svg',ssr:true,width:600,height:300}); chart.setOption({...option,animation:false}); options[name]=chart.getOption(); svg[name]=chart.renderToSVGString(); chart.dispose(); }`);
  const rendered = result.execute();
  const get = (value, key) => key.split('.').reduce((current, part) => current?.[part], value);
  for (const name of ['pie', 'gauge']) {
    for (const [key, expected] of Object.entries(baseline[name])) assert.deepEqual(get(rendered.options[name], key), expected, name + ': ' + key);
    assert.equal(XMLValidator.validate(rendered.svg[name]), true);
    assert.ok(rendered.svg[name].includes(name === 'pie' ? 'get' : '内存消耗'));
  }
});
