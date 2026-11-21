import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
async function fixture(t) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'maoyi-release-review-'));
  const dir = path.join(workspace, 'maoyi-app');
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  for (const name of ['scripts', 'src', '../maoyi-admin/vite/plugins', '../maoyi-backend', 'docs']) await fs.mkdir(path.join(dir, name), { recursive: true });
  for (const name of ['package-deliverables.py', 'release_sources.py']) await fs.copyFile(path.join(root, 'scripts', name), path.join(dir, 'scripts', name));
  for (const name of ['package.json', 'package-lock.json', 'README.md', 'PRODUCT.md', 'DESIGN.md', 'index.html', 'vite.config.js', 'shims-uni.d.ts', '.env.example', '.gitignore', '.dockerignore', 'drizzle.config.mjs', '../maoyi-admin/LICENSE', '../maoyi-backend/LICENSE', 'src/App.vue', '../maoyi-admin/vite/plugins/index.js']) await fs.writeFile(path.join(dir, name), '{}\n');
  await fs.writeFile(path.join(workspace, '.dockerignore'), '**/node_modules\n');
  const base = path.join(dir, '.data/qa/releases/qa-review');
  for (const name of ['h5/index.html', 'mp-weixin/app.js', 'admin/index.html', 'ruoyi-admin.jar']) {
    const file = path.join(base, name); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, 'fixture artifact\n');
  }
  execFileSync('python3', ['-c', `import sys,json,hashlib;from pathlib import Path;sys.path.insert(0,'scripts');from release_sources import SOURCE_SCOPE,source_hashes;r=Path.cwd();b=r/'.data/qa/releases/qa-review';m={'id':'qa-review','sourceScope':SOURCE_SCOPE,'sourceFiles':source_hashes(r),'files':{str(p.relative_to(b)):hashlib.sha256(p.read_bytes()).hexdigest() for p in b.rglob('*') if p.is_file()}};(b/'manifest.json').write_text(json.dumps(m))`], { cwd: dir });
  return { dir, base, run: () => spawnSync('python3', ['scripts/package-deliverables.py', '--release', 'qa-review', '--output', path.join(dir, 'output')], { cwd: dir, encoding: 'utf8' }) };
}

test('frozen packaging accepts matching application/build sources and excludes credentials', async t => {
  const f = await fixture(t); await fs.mkdir(path.join(f.dir, '.secrets')); await fs.writeFile(path.join(f.dir, '.secrets', 'private.txt'), 'private fixture');
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  const names = execFileSync('python3', ['-c', "from zipfile import ZipFile;print('\\n'.join(ZipFile('output/maoyi-source.zip').namelist()))"], { cwd: f.dir, encoding: 'utf8' });
  assert.ok(names.includes('maoyi-admin/vite/plugins/index.js')); assert.ok(!names.includes('.secrets/'));
});

test('source drift fails before replacing existing deliverables', async t => {
  const f = await fixture(t); await fs.mkdir(path.join(f.dir, 'output')); await fs.writeFile(path.join(f.dir, 'output/maoyi-source.zip'), 'existing artifact');
  await fs.appendFile(path.join(f.dir, 'src/App.vue'), '\nchanged'); const result = f.run();
  assert.notEqual(result.status, 0); assert.match(result.stderr, /sources differ/); assert.equal(await fs.readFile(path.join(f.dir, 'output/maoyi-source.zip'), 'utf8'), 'existing artifact');
});

test('new build-input files invalidate a freeze, including Vite plugins', async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.dir, '../maoyi-admin/vite/plugins/new.js'), 'changed');
  const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /sources differ/);
});

test('artifact drift and incomplete historical source manifests fail closed', async t => {
  const f = await fixture(t); await fs.appendFile(path.join(f.base, 'ruoyi-admin.jar'), 'changed');
  assert.match(f.run().stderr, /Frozen release contents differ/);
  await fs.writeFile(path.join(f.base, 'ruoyi-admin.jar'), 'fixture artifact\n');
  const file = path.join(f.base, 'manifest.json'), manifest = JSON.parse(await fs.readFile(file)); delete manifest.sourceScope;
  await fs.writeFile(file, JSON.stringify(manifest)); assert.match(f.run().stderr, /no complete runtime\/build source fingerprint/);
});

test('QA documentation may be updated without changing verified runtime inputs', async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.dir, 'docs/qa-review.json'), '{"status":"verified"}'); await fs.appendFile(path.join(f.dir, 'README.md'), '\nQA evidence updated');
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
});

test('renamed backend artifacts are declared, copied exactly and reject ambiguous releases', async t => {
  const f = await fixture(t);
  await fs.rename(path.join(f.base, 'ruoyi-admin.jar'), path.join(f.base, 'maoyi-backend.jar'));
  const file = path.join(f.base, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(file));
  manifest.files['maoyi-backend.jar'] = manifest.files['ruoyi-admin.jar'];
  delete manifest.files['ruoyi-admin.jar'];
  manifest.backendArtifact = 'maoyi-backend.jar';
  await fs.writeFile(file, JSON.stringify(manifest));
  let result = f.run(); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await fs.readFile(path.join(f.dir, 'output/maoyi-backend.jar')), await fs.readFile(path.join(f.base, 'maoyi-backend.jar')));
  await fs.writeFile(path.join(f.base, 'ruoyi-admin.jar'), 'fixture artifact\n');
  manifest.files['ruoyi-admin.jar'] = manifest.files['maoyi-backend.jar'];
  await fs.writeFile(file, JSON.stringify(manifest));
  result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /exactly one supported backend artifact/);
});
