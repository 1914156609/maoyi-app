import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtemp, mkdir, copyFile, writeFile, readFile, readdir, stat, rm, chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join, delimiter} from 'node:path';
import {createHash, randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const root = resolve(import.meta.dirname, '../..');
const backendJar = resolve(root, '../maoyi-backend/ruoyi-admin/target/maoyi-backend.jar');
async function fixture(t, names) {
  const workspace = await mkdtemp(join(tmpdir(), 'maoyi-credentials-review-'));
  const dir = join(workspace, 'maoyi-app');
  t.after(() => rm(workspace, {recursive: true, force: true}));
  await mkdir(join(dir, 'scripts/java'), {recursive: true});
  await mkdir(join(dir, '.secrets'), {mode: 0o755});
  await chmod(join(dir, '.secrets'), 0o755);
  for (const name of [...names, 'backend-password-hasher.mjs', 'java/HashPassword.java']) await copyFile(join(root, 'scripts', name), join(dir, 'scripts', name));
  await mkdir(join(workspace, 'empty-home'));
  await mkdir(join(workspace, 'scratch'), {mode: 0o700});
  // Build a small fixture from the actual backend's packaged libraries. No
  // Maven repository is consulted, including on a first clone after mvn build.
  const entries = execFileSync('jar', ['tf', backendJar], {encoding: 'utf8'}).split(/\r?\n/);
  const libraries = ['spring-security-crypto', 'commons-logging'].map(name => {
    const found = entries.filter(file => new RegExp(`^BOOT-INF/lib/${name}-[^/]+\\.jar$`).test(file));
    assert.equal(found.length, 1, `expected one packaged ${name}`);
    return found[0];
  });
  const stage = join(workspace, 'library-source');
  await mkdir(stage);
  execFileSync('jar', ['xf', backendJar, ...libraries], {cwd: stage});
  const target = join(workspace, 'maoyi-backend/ruoyi-admin/target');
  await mkdir(target, {recursive: true});
  execFileSync('jar', ['cf', join(target, 'maoyi-backend.jar'), ...libraries], {cwd: stage});
  return dir;
}
const fixtureEnv = dir => ({...process.env, HOME: resolve(dir, '../empty-home'), TMPDIR: resolve(dir, '../scratch')});
async function assertTemporaryLibrariesRemoved(dir) {
  assert.deepEqual(await readdir(resolve(dir, '../scratch')), []);
  assert.deepEqual(await readdir(resolve(dir, '../empty-home')), []);
}
async function verifyPassword(dir, password, hash) {
  const libraries = resolve(dir, '../library-source/BOOT-INF/lib');
  const classpath = (await readdir(libraries)).map(name => join(libraries, name)).join(delimiter);
  const source = join(dir, 'VerifyPassword.java');
  await writeFile(source, `import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
public class VerifyPassword {
  public static void main(String[] args) throws Exception {
    String[] input = new String(System.in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8).split("\\n", -1);
    System.out.print(new BCryptPasswordEncoder().matches(input[0], input[1]));
  }
}
`);
  const matched = execFileSync('java', ['--class-path', classpath, source], {input: password + '\n' + hash, encoding: 'utf8', env: fixtureEnv(dir)});
  assert.equal(matched, 'true');
}
const mode = async file => (await stat(file)).mode & 0o777;
const fingerprint = content => createHash('sha256').update(content).digest('hex');

test('generated deploy credentials fit login policy and MySQL can read its isolated init mount', async t => {
  const dir = await fixture(t, ['prepare-deploy.mjs']);
  const result = spawnSync(process.execPath, ['scripts/prepare-deploy.mjs', 'https://qa.example.test'], {cwd: dir, encoding: 'utf8', env: fixtureEnv(dir)});
  assert.equal(result.status, 0, result.stderr);
  const text = await readFile(join(dir, '.secrets/云端管理员账号.txt'), 'utf8');
  const password = text.match(/密码：([^\n]+)/)?.[1];
  const constants = await readFile(join(root, '../maoyi-backend/ruoyi-common/src/main/java/com/ruoyi/common/constant/UserConstants.java'), 'utf8');
  const max = Number(constants.match(/PASSWORD_MAX_LENGTH\s*=\s*(\d+)/)[1]);
  assert.equal(password?.length, max);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(password));
  assert.equal(await mode(join(dir, '.secrets')), 0o700);
  for (const file of ['deploy.env', '云端管理员账号.txt']) assert.equal(await mode(join(dir, '.secrets', file)), 0o600);
  const sql = await readFile(join(dir, '.secrets/deploy-init.sql'), 'utf8');
  assert.equal(await mode(join(dir, '.secrets/deploy-init.sql')), 0o644);
  assert.ok(!sql.includes(password));
  assert.ok(/password='\$2[aby]\$/.test(sql));
  assert.ok(!result.stdout.includes(password));
  await verifyPassword(dir, password, sql.match(/password='([^']+)'/)[1]);
  await assertTemporaryLibrariesRemoved(dir);
  const before = fingerprint(text);
  const again = spawnSync(process.execPath, ['scripts/prepare-deploy.mjs', 'https://qa.example.test'], {cwd: dir, encoding: 'utf8', env: fixtureEnv(dir)});
  assert.notEqual(again.status, 0);
  assert.equal(fingerprint(await readFile(join(dir, '.secrets/云端管理员账号.txt'), 'utf8')), before);
});

test('local setup generates compliant credentials and seals an existing secrets directory without a real database write', async t => {
  const dir = await fixture(t, ['setup-java-local.mjs', 'java-timezone.mjs']);
  await mkdir(join(dir, 'bin'));
  const mysql = join(dir, 'bin/mysql');
  await writeFile(mysql, `#!${process.execPath}\nlet input='';for await (const part of process.stdin) input+=part;if(input.includes('@@session.time_zone'))process.stdout.write('+00:00\\t0\\n');\n`, {mode: 0o700});
  await mkdir(join(dir, '../maoyi-backend/sql/maoyi'), {recursive: true});
  for (const name of ['ry_fixture.sql', 'quartz.sql', 'maoyi/001_business.sql']) await writeFile(join(dir, '../maoyi-backend/sql', name), '-- isolated fake mysql fixture\n');
  const env = {...fixtureEnv(dir), PATH: join(dir, 'bin') + delimiter + process.env.PATH};
  const result = spawnSync(process.execPath, ['scripts/setup-java-local.mjs'], {cwd: dir, encoding: 'utf8', env});
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(await readFile(join(dir, '.secrets/java-local.json'), 'utf8'));
  assert.equal(config.accounts.length, 3);
  assert.ok(config.accounts.every(account => account.password.length === 20));
  assert.equal(await mode(join(dir, '.secrets')), 0o700);
  for (const name of ['java-local.json', '本地后台账号.txt']) assert.equal(await mode(join(dir, '.secrets', name)), 0o600);
  assert.ok(config.accounts.every(account => !result.stdout.includes(account.password)));
  await assertTemporaryLibrariesRemoved(dir);
  const before = fingerprint(await readFile(join(dir, '.secrets/java-local.json')));
  const again = execFileSync(process.execPath, ['scripts/setup-java-local.mjs'], {cwd: dir, encoding: 'utf8', env});
  assert.ok(again.includes('未覆盖数据库或账号'));
  assert.equal(fingerprint(await readFile(join(dir, '.secrets/java-local.json'))), before);
});

test('actual backend Jar hashes random input with an empty home and BCrypt verifies it', async t => {
  const dir = await fixture(t, []);
  const module = pathToFileURL(join(root, 'scripts/backend-password-hasher.mjs')).href;
  const code = `import {readFileSync} from 'node:fs'; import {hashBackendPasswords} from ${JSON.stringify(module)}; process.stdout.write(hashBackendPasswords([readFileSync(0, 'utf8')])[0]);`;
  const password = randomBytes(15).toString('base64url');
  const hash = execFileSync(process.execPath, ['--input-type=module', '-e', code], {input: password, encoding: 'utf8', env: fixtureEnv(dir)});
  await verifyPassword(dir, password, hash);
  await assertTemporaryLibrariesRemoved(dir);
});

test('hash failure removes extracted libraries and does not create deploy credentials', async t => {
  const dir = await fixture(t, ['prepare-deploy.mjs']);
  await mkdir(join(dir, 'bin'));
  const java = join(dir, 'bin/java');
  await writeFile(java, `#!${process.execPath}\nprocess.exit(17);\n`, {mode: 0o700});
  const env = {...fixtureEnv(dir), PATH: join(dir, 'bin') + delimiter + process.env.PATH};
  const result = spawnSync(process.execPath, ['scripts/prepare-deploy.mjs', 'https://qa.example.test'], {cwd: dir, encoding: 'utf8', env});
  assert.notEqual(result.status, 0);
  assert.deepEqual(await readdir(join(dir, '.secrets')), []);
  await assertTemporaryLibrariesRemoved(dir);
});
