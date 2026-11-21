import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createI18n } from 'vue-i18n';
import { ssrRenderAttrs } from '@vue/server-renderer';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const resultMarker = '__MINI_COMPAT_RESULT__';

// Independent PNG fixture: 2 × 1 RGBA, red then translucent blue.
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8Dwn6HhfwMAEPoD/o3Nc3sAAAAASUVORK5CYII=';
// The upstream file-type regression fixture has a zero-size ASF sub-header.
const malformedAsf = '3026b2758e66cf11a6d9000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

function runIsolated(source, { env = {}, timeout = 10000 } = {}) {
  const childEnv = { ...process.env };
  for (const key of Object.keys(childEnv)) {
    if (key.startsWith('UNI_') || key.startsWith('VITE_')) delete childEnv[key];
  }
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    cwd: root,
    env: { ...childEnv, ...env },
    encoding: 'utf8',
    timeout,
    maxBuffer: 1024 * 1024,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, `child terminated: ${result.signal}`);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const line = result.stdout.split('\n').findLast(value => value.startsWith(resultMarker));
  assert.ok(line, `child must report a completed result: ${result.stdout}\n${result.stderr}`);
  return JSON.parse(line.slice(resultMarker.length));
}

for (const platform of ['h5', 'mp-weixin']) {
  test(`${platform} final Uni configuration keeps maintained i18n aliases and strict file access`, () => {
    const output = mkdtempSync(join(tmpdir(), 'maoyi-uni-config-'));
    try {
      for (const command of ['build', 'serve']) {
        const mode = command === 'build' ? 'production' : 'development';
        const result = runIsolated(`
          import assert from 'node:assert/strict';
          import { readFileSync } from 'node:fs';
          import { dirname, resolve } from 'node:path';
          import { resolveConfig } from 'vite';
          const config = await resolveConfig({
            configFile: resolve(process.cwd(), 'vite.config.js'),
            logLevel: 'silent',
          }, ${JSON.stringify(command)}, ${JSON.stringify(mode)});
          const resolver = config.createResolver();
          const importer = resolve(process.cwd(), 'src/main.js');
          const ids = await Promise.all(['vue-i18n', 'vue-i18n/runtime'].map(id => resolver(id, importer)));
          assert.ok(ids.every(Boolean), 'both public imports must resolve');
          const vuePlugin = config.plugins.find(value => value.name === 'vite:vue');
          const start = typeof vuePlugin.buildStart === 'function' ? vuePlugin.buildStart : vuePlugin.buildStart.handler;
          await start.call({});
          const sharedId = await resolver('@vue/shared', importer);
          let runtimeId;
          const h5Resolver = config.plugins.find(value => value.name === 'uni:h5-resolve-id');
          if (h5Resolver) {
            const hook = typeof h5Resolver.resolveId === 'function' ? h5Resolver.resolveId : h5Resolver.resolveId.handler;
            runtimeId = await hook.call({}, 'vue', importer, {});
          } else runtimeId = await resolver('vue', importer);
          const runtimeVersion = readFileSync(runtimeId, 'utf8').match(/const version = ["']([^"']+)["']/)?.[1];
          const sharedVersion = JSON.parse(readFileSync(resolve(dirname(sharedId), '../package.json'), 'utf8')).version;
          const aliases = config.resolve.alias.map(({ find, replacement }) => ({ find: String(find), replacement }));
          process.stdout.write(${JSON.stringify(resultMarker)} + JSON.stringify({
            ids, aliases, fsStrict: config.server.fs.strict, sharedId, sharedVersion, runtimeId, runtimeVersion,
            compilerVersion: vuePlugin.api.options.compiler.version,
          }) + '\\n');
          process.exit(0);
        `, {
          env: {
            NODE_ENV: mode,
            UNI_PLATFORM: platform,
            UNI_APP_X: 'false',
            UNI_INPUT_DIR: join(root, 'src'),
            UNI_OUTPUT_DIR: output,
          },
          timeout: 20000,
        });
        const runtime = realpathSync(require.resolve('vue-i18n/dist/vue-i18n.runtime.esm-bundler.js'));
        assert.deepEqual(result.ids.map(id => realpathSync(id)), [runtime, runtime]);
        assert.equal(result.fsStrict, true, `${platform}/${command} must retain the final filesystem boundary`);
        assert.equal(typeof result.runtimeVersion, 'string', 'read the actual platform runtime version');
        assert.equal(result.compilerVersion, result.runtimeVersion, `${platform}/${command} compiler must match its runtime`);
        assert.equal(result.sharedVersion, result.runtimeVersion, `${platform}/${command} shared helpers must match its runtime`);
        assert.ok(result.aliases.length > 0, 'exercise merged platform config, not an isolated alias fixture');
        for (const id of result.ids) {
          assert.equal(id.replaceAll('\\', '/').includes('/uni-cli-shared/lib/vue-i18n/'), false);
        }
      }
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });
}

test('the production Uni compiler and runtime keep login tab classes and employee fields synchronized', t => {
  const output = mkdtempSync(join(tmpdir(), 'maoyi-login-render-'));
  try {
    const result = runIsolated(`
      import assert from 'node:assert/strict';
      import { readFileSync } from 'node:fs';
      import { dirname, resolve } from 'node:path';
      import { transformSync } from 'esbuild';
      import { resolveConfig } from 'vite';
      const config = await resolveConfig({
        configFile: resolve(process.cwd(), 'vite.config.js'), logLevel: 'silent',
      }, 'build', 'production');
      const plugin = config.plugins.find(value => value.name === 'vite:vue');
      const buildStart = typeof plugin.buildStart === 'function' ? plugin.buildStart : plugin.buildStart.handler;
      await buildStart.call({});
      const options = plugin.api.options;
      const compiler = options.compiler;
      const resolveAlias = config.createResolver();
      async function resolveRuntimeImport(id, importer) {
        const alias = config.resolve.alias.find(value => typeof value.find === 'string'
          ? value.find === id || id.startsWith(value.find + '/') : value.find.test(id));
        if (alias) return resolveAlias(id, importer);
        for (const entry of config.plugins) {
          if (!['uni:h5-resolve-id', 'uni:resolve-id'].includes(entry.name)) continue;
          const hook = typeof entry.resolveId === 'function' ? entry.resolveId : entry.resolveId?.handler;
          const result = await hook?.call({}, id, importer, {});
          if (result) return typeof result === 'string' ? result : result.id;
        }
        return resolveAlias(id, importer);
      }
      const filename = resolve(process.cwd(), 'src/pages/login/login.vue');
      const runtimeId = await resolveRuntimeImport('vue', filename);
      const sharedId = await resolveRuntimeImport('@vue/shared', runtimeId);
      const uniSharedId = await resolveRuntimeImport('@dcloudio/uni-shared', runtimeId);
      assert.match(runtimeId.replaceAll('\\\\', '/'), /\\/uni-h5-vue\\//);
      const modules = new Map();
      function executeModule(source, load) {
        const module = { exports: {} };
        const code = transformSync(source, { format: 'cjs' }).code;
        new Function('require', 'module', 'exports', code)(load, module, module.exports);
        return module.exports;
      }
      function loadRuntime(file) {
        if (modules.has(file)) return modules.get(file);
        const module = executeModule(readFileSync(file, 'utf8'), id => {
          if (id === '@vue/shared') return loadRuntime(sharedId);
          if (id === '@dcloudio/uni-shared') return loadRuntime(uniSharedId);
          throw Error('Unexpected Uni runtime dependency: ' + id);
        });
        modules.set(file, module);
        return module;
      }
      const Vue = loadRuntime(runtimeId);
      const descriptor = compiler.parse(readFileSync(filename, 'utf8'), { filename }).descriptor;
      const compiled = compiler.compileTemplate({
        source: descriptor.template.content, filename, id: 'qa-login-dependency-contract',
        compiler: options.template.compiler, compilerOptions: options.template.compilerOptions,
      });
      assert.deepEqual(compiled.errors, []);
      const { render } = executeModule(compiled.code, id => {
        assert.equal(id, 'vue');
        return Vue;
      });
      const node = (tag, text = '') => ({ tag, text, props: {}, children: [], parent: null });
      function remove(element) {
        if (!element.parent) return;
        const siblings = element.parent.children;
        siblings.splice(siblings.indexOf(element), 1);
        element.parent = null;
      }
      const renderer = Vue.createRenderer({
        createElement: tag => node(tag), createText: text => node('#text', text),
        createComment: text => node('#comment', text),
        setText: (element, text) => { element.text = text; },
        setElementText: (element, text) => { element.text = text; element.children = []; },
        patchProp: (element, key, oldValue, value) => { element.props[key] = value; },
        parentNode: element => element.parent,
        nextSibling: element => element.parent?.children[element.parent.children.indexOf(element) + 1] || null,
        insert(element, parent, anchor = null) {
          remove(element);
          element.parent = parent;
          const index = anchor ? parent.children.indexOf(anchor) : -1;
          if (index < 0) parent.children.push(element);
          else parent.children.splice(index, 0, element);
        },
        remove,
      });
      const errors = [];
      const app = renderer.createApp({
        setup: () => ({
          mode: Vue.ref('微信授权登录'), account: Vue.ref(''), password: Vue.ref(''),
          busy: Vue.ref(false), agreed: Vue.ref(false), navigate() {}, login() {},
        }),
        render,
      });
      app.config.errorHandler = error => errors.push(String(error));
      // Pass-through hosts retain the real Vue component/slot/attribute update path.
      // DOM behavior inside Uni's platform widgets is verified in the browser.
      for (const name of ['AppHeader', 'view', 'text', 'button', 'input', 'checkbox', 'checkbox-group']) {
        const tag = name === 'AppHeader' ? 'app-header' : 'uni-' + name;
        app.component(name === 'AppHeader' ? name : 'v-uni-' + name, {
          setup: (_, { slots }) => () => Vue.h(tag, null, slots.default?.()),
        });
      }
      const host = node('root');
      app.mount(host);
      const descendants = element => [element, ...element.children.flatMap(descendants)];
      const text = element => element.text + element.children.map(text).join('');
      const snapshot = () => {
        const elements = descendants(host);
        const tabs = elements.filter(element => element.tag === 'uni-button' &&
          ['微信授权登录', '员工登录'].includes(text(element)));
        return {
          tabs: tabs.map(element => ({ text: text(element), class: element.props.class || '' })),
          fields: elements.filter(element => element.tag === 'uni-input').map(element => element.props['aria-label']),
        };
      };
      const states = [snapshot()];
      for (const title of ['员工登录', '微信授权登录', '员工登录']) {
        const button = descendants(host).find(element => element.tag === 'uni-button' && text(element) === title);
        assert.equal(typeof button?.props.onClick, 'function');
        button.props.onClick({});
        await Vue.nextTick();
        states.push(snapshot());
      }
      assert.deepEqual(errors, [], 'slot/renderer errors must not be swallowed');
      app.unmount();
      process.stdout.write(${JSON.stringify(resultMarker)} + JSON.stringify({
        compilerVersion: compiler.version, runtimeVersion: Vue.version,
        sharedVersion: JSON.parse(readFileSync(resolve(dirname(sharedId), '../package.json'), 'utf8')).version,
        runtimeId, sharedId, states,
      }) + '\\n');
      process.exit(0);
    `, {
      env: {
        NODE_ENV: 'production', UNI_PLATFORM: 'h5', UNI_APP_X: 'false',
        UNI_INPUT_DIR: join(root, 'src'), UNI_OUTPUT_DIR: output,
      },
      timeout: 20000,
    });
    assert.equal(result.compilerVersion, result.runtimeVersion);
    assert.equal(result.sharedVersion, result.runtimeVersion);
    const wechat = { tabs: [{ text: '微信授权登录', class: 'active' }, { text: '员工登录', class: '' }], fields: [] };
    const employee = { tabs: [{ text: '微信授权登录', class: '' }, { text: '员工登录', class: 'active' }], fields: ['员工账号', '密码'] };
    assert.deepEqual(result.states, [wechat, employee, wechat, employee]);
    t.diagnostic(JSON.stringify({
      compiler: result.compilerVersion, runtime: result.runtimeVersion, shared: result.sharedVersion,
      runtimeId: result.runtimeId, sharedId: result.sharedId,
    }));
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test('Uni automator Jimp read(buffer).bitmap preserves real PNG pixels', () => {
  const automator = require.resolve('@dcloudio/uni-mp-weixin/lib/uni.automator.js');
  const result = runIsolated(`
    import { createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(automator)});
    const image = await require('jimp').read(Buffer.from(${JSON.stringify(png)}, 'base64'));
    process.stdout.write(${JSON.stringify(resultMarker)} + JSON.stringify({
      width: image.bitmap.width, height: image.bitmap.height, pixels: [...image.bitmap.data],
    }) + '\\n');
  `);
  assert.deepEqual(result, { width: 2, height: 1, pixels: [255, 0, 0, 255, 0, 128, 255, 128] });
});

test('Uni automator Jimp rejects malformed ASF without stalling the process', () => {
  const automator = require.resolve('@dcloudio/uni-mp-weixin/lib/uni.automator.js');
  const result = runIsolated(`
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(automator)});
    const data = Buffer.from(${JSON.stringify(malformedAsf)}, 'hex');
    let rejected = false;
    try { await require('jimp').read(data); }
    catch (error) {
      rejected = true;
      assert.match(String(error), /Unsupported MIME type|Could not find MIME|End.Of.Stream/i);
    }
    assert.ok(rejected, 'non-image input must not become a successful bitmap');
    process.stdout.write(${JSON.stringify(resultMarker)} + JSON.stringify({ rejected }) + '\\n');
  `, { timeout: 5000 });
  assert.equal(result.rejected, true);
});

test('Jimp installation bridge is idempotent and refuses unknown source and versions', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'maoyi-jimp-patch-'));
  try {
    const packageDirectory = join(fixture, 'node_modules/@jimp/core');
    const sourceFile = join(packageDirectory, 'dist/utils/image-bitmap.js');
    const packageFile = join(packageDirectory, 'package.json');
    const script = join(fixture, 'patch-jimp-file-type.mjs');
    const installedPackage = require.resolve('@jimp/core/package.json');
    const source = readFileSync(join(dirname(installedPackage), 'dist/utils/image-bitmap.js'), 'utf8');
    const metadata = readFileSync(installedPackage, 'utf8');
    mkdirSync(dirname(sourceFile), { recursive: true });
    writeFileSync(packageFile, metadata);
    writeFileSync(sourceFile, source);
    writeFileSync(script, readFileSync(join(root, 'scripts/patch-jimp-file-type.mjs')));
    const runPatch = () => spawnSync(process.execPath, [script], {
      cwd: fixture, encoding: 'utf8', timeout: 5000,
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = runPatch();
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(sourceFile, 'utf8'), source, 're-running must preserve every installed byte');
    }
    const changed = source + '\n// unexpected upstream change\n';
    writeFileSync(sourceFile, changed);
    const unknownSource = runPatch();
    assert.notEqual(unknownSource.status, 0);
    assert.match(unknownSource.stderr, /Unexpected Jimp source/);
    assert.equal(readFileSync(sourceFile, 'utf8'), changed, 'refusal must leave unknown bytes untouched');
    writeFileSync(sourceFile, source);
    writeFileSync(packageFile, JSON.stringify({ ...JSON.parse(metadata), version: '99.0.0' }));
    const unknownVersion = runPatch();
    assert.notEqual(unknownVersion.status, 0);
    assert.match(unknownVersion.stderr, /Review the Jimp compatibility patch/);
    assert.equal(readFileSync(sourceFile, 'utf8'), source);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('i18n escapes simultaneous list and named parameters without mutating caller data', () => {
  const i18n = createI18n({
    legacy: false, locale: 'zh', escapeParameter: true,
    messages: { zh: { craft: '{0} {name}' } },
  });
  try {
    const list = ['<i>针数</i>'];
    const named = { name: '<b>衣服&</b>' };
    const first = i18n.global.t('craft', list, { named });
    assert.equal(first, '&lt;i&gt;针数&lt;&#x2F;i&gt; &lt;b&gt;衣服&amp;&lt;&#x2F;b&gt;');
    assert.equal(i18n.global.t('craft', list, { named }), first);
    assert.deepEqual(list, ['<i>针数</i>']);
    assert.deepEqual(named, { name: '<b>衣服&</b>' });
  } finally {
    i18n.dispose();
  }
});

test('i18n disables SVG javascript links and animation markup', t => {
  t.mock.method(console, 'warn', () => {});
  const i18n = createI18n({
    legacy: false, locale: 'zh', escapeParameter: true, warnHtmlMessage: false,
    messages: {
      zh: {
        link: '<svg><a xlink:href="{url}">衣服</a></svg>',
        animation: '<svg><a><set attributeName="href" to="javascript:alert(1)"/>衣服</a></svg>',
      },
    },
  });
  try {
    const link = i18n.global.t('link', { url: 'javascript:alert(1)' });
    assert.match(link, /xlink:href="about:blank"/);
    assert.doesNotMatch(link, /javascript:/i);
    const animation = i18n.global.t('animation');
    assert.doesNotMatch(animation, /<(?:set|animate)\b/i);
    assert.match(animation, /&lt;set\b/);
  } finally {
    i18n.dispose();
  }
});

test('Vue SSR rejects carriage-return attribute names and preserves escaped business values', t => {
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  const html = ssrRenderAttrs({
    ['x\rautofocus\ronfocus']: 'alert(1)',
    title: '"<衣>&',
    'data-craft-id': 'GY-123',
  });
  assert.doesNotMatch(html, /\r|autofocus|onfocus|alert/);
  assert.match(html, / title="&quot;&lt;衣&gt;&amp;"/);
  assert.match(html, / data-craft-id="GY-123"/);
});
