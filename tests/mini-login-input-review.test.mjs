import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parse, compileScript } from '@vue/compiler-sfc';

const filename = resolve(dirname(fileURLToPath(import.meta.url)), '../src/pages/login/login.vue');
async function fixture() {
  const key = randomUUID(), notices = [], calls = [];
  const context = {
    notify: text => notices.push(text), navigate() {},
    signIn: async credentials => calls.push(credentials), apiBase: '/api',
    uni: { navigateBack() {}, reLaunch() {} },
  };
  globalThis.__miniLoginInputReview ||= {};
  globalThis.__miniLoginInputReview[key] = context;
  const { descriptor } = parse(readFileSync(filename, 'utf8'), { filename });
  const source = `const uni = globalThis.__miniLoginInputReview[${JSON.stringify(key)}].uni; const getCurrentPages=()=>[];\n`
    + compileScript(descriptor, { id: key }).content.replace(
      /^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm,
      (line, binding, specifier) => {
        if (specifier.endsWith('.vue')) return `const ${binding} = {};`;
        if (['../../lib/session.js', '../../lib/store.js'].includes(specifier))
          return `const ${binding} = globalThis.__miniLoginInputReview[${JSON.stringify(key)}];`;
        return `import ${binding} from ${JSON.stringify(import.meta.resolve(specifier))};`;
      },
    );
  const component = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
  const state = component.setup({}, { expose() {} });
  state.mode.value = '员工登录'; state.agreed.value = true;
  return { state, notices, calls };
}

test('employee login rejects empty, short and oversized credentials before sending requests', async () => {
  for (const [account, password, message] of [
    ['   ', 'validpass', /账号和密码/], ['a', 'validpass', /账号长度/],
    ['a'.repeat(21), 'validpass', /账号长度/], ['admin', '1234', /密码长度/],
    ['admin', 'x'.repeat(21), /密码长度/],
  ]) {
    const page = await fixture();
    page.state.account.value = account; page.state.password.value = password;
    await page.state.login();
    assert.equal(page.calls.length, 0);
    assert.match(page.notices.at(-1), message);
    assert.equal(page.state.busy.value, false);
  }
});

test('valid 2-20 character accounts and 5-20 character passwords use the canonical trimmed account', async () => {
  for (const [account, password] of [[' ab ', '12345'], ['u'.repeat(20), 'p'.repeat(20)]]) {
    const page = await fixture();
    page.state.account.value = account; page.state.password.value = password;
    await page.state.login();
    assert.deepEqual(page.calls, [{ type: 'employee', account: account.trim(), password }]);
    assert.equal(page.notices.length, 0);
    assert.equal(page.state.busy.value, false);
  }
});

test('employee input limits match the server login constants without changing form layout', () => {
  const source = readFileSync(filename, 'utf8');
  for (const model of ['account', 'password'])
    assert.match(source, new RegExp(`<input[^>]*v-model="${model}"[^>]*maxlength="20"[^>]*>`));
});
