import {execFileSync} from 'node:child_process';
import {chmodSync, existsSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {delimiter, join, resolve} from 'node:path';

// Use exactly the dependencies packaged by this backend build, never another
// project's Maven cache. The extracted libraries remain private and temporary.
export function hashBackendPasswords(passwords) {
  const artifact = resolve(import.meta.dirname, '../../maoyi-backend/ruoyi-admin/target/maoyi-backend.jar');
  if (!existsSync(artifact)) throw Error('请先构建 maoyi-backend，生成 ruoyi-admin/target/maoyi-backend.jar。');
  const entries = execFileSync('jar', ['tf', artifact], {encoding: 'utf8'}).split(/\r?\n/);
  const libraries = ['spring-security-crypto', 'commons-logging'].map(name => {
    const matches = entries.filter(entry => new RegExp(`^BOOT-INF/lib/${name}-[A-Za-z0-9.+_-]+\\.jar$`).test(entry));
    if (matches.length !== 1) throw Error(`后端 Jar 必须包含唯一的 ${name} 依赖，请重新构建。`);
    return matches[0];
  });
  const directory = mkdtempSync(join(tmpdir(), 'maoyi-password-'));
  try {
    chmodSync(directory, 0o700);
    execFileSync('jar', ['xf', artifact, ...libraries], {cwd: directory});
    const classpath = libraries.map(file => join(directory, file)).join(delimiter);
    const source = resolve(import.meta.dirname, 'java/HashPassword.java');
    return passwords.map(password => execFileSync('java', ['--class-path', classpath, source], {
      input: password,
      encoding: 'utf8',
    }).trim());
  } finally {
    rmSync(directory, {recursive: true, force: true});
  }
}
