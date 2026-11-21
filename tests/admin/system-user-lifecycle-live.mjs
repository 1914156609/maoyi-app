// Explicit live HTTP probe. Never imports into the ordinary UI/unit test suite.
// Run only AFTER the coordinator publishes the fixed R22-or-newer runtime, with
// MAOYI_ALLOW_SYSTEM_USER_LIFECYCLE=yes, MAOYI_TEST_ORIGIN and QA_RELEASE_ID.
// This is a defensive regression, not an old-version reproduction. A failed
// assertion immediately stops business writes and enters exact-fixture cleanup.
// Uses only new marked fixtures; raw credentials and tokens are never written to evidence.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

assert.equal(process.env.MAOYI_ALLOW_SYSTEM_USER_LIFECYCLE, 'yes', 'Explicit live-fixture authorization required');
const origin = process.env.MAOYI_TEST_ORIGIN;
const release = process.env.QA_RELEASE_ID;
assert.ok(/^http:\/\/(127\.0\.0\.1|localhost):8081$/.test(origin || ''), 'Only the local primary Java runtime is supported');
const releaseMatch = /^qa-\d{8}-r(\d+)$/.exec(release || '');
assert.ok(releaseMatch && Number(releaseMatch[1]) >= 22, 'R21 and older are prohibited; wait for the fixed R22-or-newer runtime');
const run = randomBytes(3).toString('hex');
const marker = `QA sysval ${run}`;
const out = `.data/qa/admin-evidence/r21-system-user-api-${run}.json`;
const sql = q => execFileSync('mysql', ['--protocol=socket', '-uroot', '--default-character-set=utf8mb4', 'maoyi_ruoyi', '-N', '--raw'], { input: q, encoding: 'utf8' }).trim();
const rows = q => sql(q).split('\n').filter(Boolean).map(JSON.parse);
const quote = s => "'" + String(s).replaceAll("'", "''") + "'";
const hash = s => createHash('sha256').update(s).digest('hex');
const redis = (...args) => execFileSync('redis-cli', ['-p', '6388', '--raw', ...args], { encoding: 'utf8' }).trim();
const account = JSON.parse(readFileSync('.secrets/qa-accounts.json')).accounts.systemAdmin;
assert.equal(Number(account.id), 114);
const manifest = await fetch('http://127.0.0.1:5186/__version').then(r => r.json());
assert.equal(manifest.id, release);
const frozenManifest = JSON.parse(readFileSync(`.data/qa/releases/${release}/manifest.json`, 'utf8'));
assert.equal(frozenManifest.id, release);
const backendArtifact = frozenManifest.backendArtifact || 'ruoyi-admin.jar';
assert.ok(['maoyi-backend.jar', 'ruoyi-admin.jar'].includes(backendArtifact), 'Unsupported backend artifact');
assert.equal(hash(readFileSync(`.data/qa/releases/${release}/${backendArtifact}`)), frozenManifest.files[backendArtifact], 'Frozen fixed backend artifact must match its manifest');
const beforeKeys = redis('--scan', '--pattern', 'login_tokens:*').split('\n').filter(Boolean);
const protectedSQL = 'SELECT user_id,user_name,nick_name,password,status,del_flag,dept_id,email,phonenumber,avatar FROM sys_user WHERE user_id<=115 ORDER BY user_id';
const protectedBefore = hash(sql(protectedSQL));
const rolesBefore = hash(sql('SELECT user_id,role_id FROM sys_user_role WHERE user_id<=115 ORDER BY user_id,role_id'));
const businessBefore = sql('SELECT (SELECT COUNT(*) FROM maoyi_craft),(SELECT COUNT(*) FROM maoyi_share),(SELECT COUNT(*) FROM maoyi_chart)');
const watermark = Number(sql('SELECT COALESCE(MAX(oper_id),0) FROM sys_oper_log'));
const evidence = { release, origin, run, at: new Date().toISOString(), kind: 'Actual HTTP and read-only SQL/BCrypt; NOT real-page testing', requests: [], checks: [], defects: [], fixtures: [], cleanup: {}, sourceContract: { ui: 'username 2–20; creation/reset password 6–20, default type0 excludes angle brackets, double/single quotes, pipe and backslash', login: 'login precheck 5–20 does not define the stricter UI creation/reset contract', role: 'UI role options exclude admin role; rejection must hold at all role-assignment endpoints' } };
const tracked = new Map();
const ownedNames = new Set();
const tokens = new Set();
const sensitive = new Set([account.password]);
let adminToken;
let cleanupPhase = false;
const safeMessage = data => {
  let value = String(data?.msg || data?.message || '');
  for (const secret of sensitive) if (secret) value = value.replaceAll(secret, '[redacted]');
  return value.slice(0, 180);
};
function check(name, passed, actual, expected) {
  evidence.checks.push({ name, passed: !!passed, actual, expected });
  if (!passed) evidence.defects.push({ name, actual, expected });
  save();
  if (!passed && !cleanupPhase) throw new Error('Defensive regression failed; stopping immediately: ' + name);
}
function save() { mkdirSync('.data/qa/admin-evidence', { recursive: true }); writeFileSync(out, JSON.stringify(evidence, null, 2) + '\n'); }
async function request(path, method = 'GET', body, token = adminToken, label = path) {
  if (body?.password) sensitive.add(body.password);
  const response = await fetch(origin + path, { method, signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  const status = typeof data.code === 'number' && data.code >= 400 ? data.code : response.status;
  evidence.requests.push({ at: new Date().toISOString(), label, method, path, httpStatus: response.status, applicationCode: data.code ?? null, effectiveStatus: status, response: { message: safeMessage(data), userId: data.user?.id ?? null, tokenReturned: typeof data.token === 'string' }, input: body ? { account: body.account ?? body.userName, userId: body.userId, passwordLength: body.password?.length, roleIds: body.roleIds } : undefined });
  save(); return { status, data };
}
function getFixture(name) {
  return rows(`SELECT JSON_OBJECT('id',user_id,'account',user_name,'nickname',nick_name,'deleted',del_flag,'status',status,'roles',(SELECT COUNT(*) FROM sys_user_role WHERE user_id=u.user_id),'posts',(SELECT COUNT(*) FROM sys_user_post WHERE user_id=u.user_id)) FROM sys_user u WHERE user_name=${quote(name)}`);
}
const password = n => randomBytes(n).toString('base64url').slice(0, n);
const repo = resolve(process.env.HOME, '.m2/repository');
function jar(base, name) { const v = readdirSync(`${repo}/${base}`).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1); return `${repo}/${base}/${v}/${name}-${v}.jar`; }
const classpath = [jar('org/springframework/security/spring-security-crypto', 'spring-security-crypto'), jar('org/springframework/spring-jcl', 'spring-jcl'), jar('com/alibaba/fastjson2/fastjson2', 'fastjson2')].join(':');
function matches(id, secret) {
  const stored = sql(`SELECT password FROM sys_user WHERE user_id=${Number(id)}`);
  return { bcryptFormat: /^\$2[aby]\$/.test(stored), matches: execFileSync('java', ['-cp', classpath, 'tests/java/ExistingCredentialProbe.java'], { input: JSON.stringify({ password: secret, hash: stored }), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim() === 'true' };
}
async function login(name, secret, label) {
  const r = await request('/api/auth/login', 'POST', { type: 'employee', account: name, password: secret }, null, label);
  if (r.data.token) tokens.add(r.data.token);
  return r;
}
async function create(name, secret, label, shouldAccept, roleIds = []) {
  assert.equal(getFixture(name).length, 0, 'Fixture username must be entirely unused');
  // Retain the exact marker/name before HTTP, so a timeout after a server commit
  // can still be reconciled and cleaned without searching/deleting unrelated data.
  ownedNames.add(name);
  const r = await request('/system/user', 'POST', { userName: name, nickName: marker, password: secret, status: '0', roleIds, postIds: [] }, adminToken, label);
  const found = getFixture(name);
  for (const row of found) {
    assert.equal(row.nickname, marker, 'Never track an unrelated account');
    tracked.set(row.id, { id: row.id, name, secret });
    evidence.fixtures.push({ label, ...row, passwordLength: secret.length, ...matches(row.id, secret) });
  }
  const accepted = r.status === 200 && found.length === 1;
  check(label, shouldAccept ? accepted : r.status >= 400 && found.length === 0, { effectiveStatus: r.status, createdIds: found.map(x => x.id), userNameLength: name.length, passwordLength: secret.length, roleIds }, shouldAccept ? 'accepted exactly one valid fixture' : 'rejected with no new user');
  save(); return found[0];
}
async function remove(id, label = 'cleanup delete') {
  const owned = tracked.get(id); assert.ok(owned);
  const row = getFixture(owned.name).find(r => r.id === id); assert.equal(row.nickname, marker);
  if (row.deleted === '0') await request(`/system/user/${id}`, 'DELETE', undefined, adminToken, label);
  const final = getFixture(owned.name).find(r => r.id === id);
  assert.equal(final.deleted, '2', 'Exact fixture must be logically deleted');
  assert.equal(final.roles, 0); assert.equal(final.posts, 0);
  return final;
}
const roleIds = id => rows(`SELECT JSON_OBJECT('id',role_id) FROM sys_user_role WHERE user_id=${Number(id)} ORDER BY role_id`).map(r => r.id);
async function invalidReset(id, invalidPassword, label) {
  assert.ok(tracked.has(id));
  const before = sql(`SELECT password FROM sys_user WHERE user_id=${id}`);
  const result = await request('/system/user/resetPwd', 'PUT', { userId: id, password: invalidPassword }, adminToken, label);
  const unchanged = sql(`SELECT password FROM sys_user WHERE user_id=${id}`) === before;
  check(label, result.status >= 400 && unchanged, { status: result.status, passwordLength: invalidPassword.length, storedHashUnchanged: unchanged }, 'rejection and byte-identical previous hash');
}
async function protectedRoleMutation(suffix, label, makeRequest) {
  const secret = password(16), name = `qa_sysval_${run}_${suffix}`;
  const fixture = await create(name, secret, label + ' independent prerequisite', true, [211]);
  assert.ok(fixture);
  const before = roleIds(fixture.id);
  assert.deepEqual(before, [211]);
  try {
    const [path, method, body] = makeRequest(fixture.id, name);
    const response = await request(path, method, body, adminToken, label);
    const after = roleIds(fixture.id);
    check(label, response.status >= 400 && JSON.stringify(before) === JSON.stringify(after), { status: response.status, fixtureId: fixture.id, before, after, fixtureNeverLoggedIn: true }, 'reject protected role1 and preserve existing ordinary role211');
  } finally {
    await remove(fixture.id, 'immediate cleanup of protected-role mutation fixture');
  }
}
async function ordinaryEditMustIgnorePassword(id, name, suppliedPassword, label) {
  assert.ok(tracked.has(id));
  const before = sql(`SELECT password FROM sys_user WHERE user_id=${id}`);
  const remark = `QA defensive profile ${run}`;
  const response = await request('/system/user', 'PUT', { userId: id, userName: name, nickName: marker, remark, status: '0', roleIds: [], postIds: [], password: suppliedPassword }, adminToken, label);
  const unchanged = sql(`SELECT password FROM sys_user WHERE user_id=${id}`) === before;
  const ordinaryFieldSaved = sql(`SELECT remark FROM sys_user WHERE user_id=${id}`) === remark;
  check(label, response.status === 200 && unchanged && ordinaryFieldSaved, { status: response.status, suppliedPasswordLength: suppliedPassword.length, storedHashUnchanged: unchanged, ordinaryFieldSaved }, 'ordinary profile remark saves, password remains byte-identical; later original-password login must succeed');
}

try {
  const logged = await login(account.account, account.password, 'independent QA114 HTTP login');
  assert.equal(logged.status, 200); assert.equal(Number(logged.data.user.id), 114); adminToken = logged.data.token;
  const info = await request('/getInfo', 'GET', undefined, adminToken, 'QA114 identity');
  assert.equal(Number(info.data.user.userId), 114);
  evidence.actor = { id: 114, superAdmin: false, roleIds: info.data.user.roles.map(r => r.roleId) };
  assert.ok(!evidence.actor.roleIds.includes(1));
  evidence.sourceContract.observedPwdChrtype = String(info.data.pwdChrtype ?? '0');
  assert.equal(evidence.sourceContract.observedPwdChrtype, '0', 'This scoped probe must follow the current original default UI policy, not change shared config');
  const name = `qa_sysval_${run}_v`, original = password(16), updated = password(20);
  evidence.lifecycleAccount = name;
  const legal = await create(name, original, 'legal user creation', true); assert.ok(legal);
  check('created password BCrypt', matches(legal.id, original).matches, matches(legal.id, original), 'BCrypt matches original');
  const duplicate = await request('/system/user', 'POST', { userName: name, nickName: marker, password: password(16), roleIds: [], postIds: [], status: '0' }, adminToken, 'duplicate username');
  check('duplicate username', duplicate.status >= 400 && getFixture(name).length === 1 && matches(legal.id, original).matches, { status: duplicate.status, rows: getFixture(name).length }, 'reject duplicate, preserve original password');
  const shortName = [...'qzjxvkwybcdghmpst'].find(n => getFixture(n).length === 0); assert.ok(shortName);
  await create(shortName, password(16), 'username length 1', false);
  await create(`qa_sysval_${run}12345`, password(16), 'username length 21', false);
  await create(`qa_sysval_${run}_4`, password(4), 'create password length 4', false);
  await create(`qa_sysval_${run}_l`, password(21), 'create password length 21', false);
  await create(`qa_sysval_${run}_5`, password(5), 'create password length 5 below UI minimum6', false);
  await create(`qa_sysval_${run}_6`, password(6), 'create password boundary 6', true);
  await create(`qa_sysval_${run}_m`, password(20), 'create password boundary 20', true);
  await create(`qa_sysval_${run}_c`, password(8) + '<' + password(4), 'create forbidden password character', false);
  await ordinaryEditMustIgnorePassword(legal.id, name, password(4), 'ordinary edit ignores short raw password');
  await ordinaryEditMustIgnorePassword(legal.id, name, password(16), 'ordinary edit ignores valid-length raw password');
  for (const length of [0, 4, 5, 21]) await invalidReset(legal.id, password(length), 'reset password length ' + length);
  for (const [name, character] of [['less-than', '<'], ['greater-than', '>'], ['double-quote', '"'], ['single-quote', "'"], ['pipe', '|'], ['backslash', '\\']]) {
    await invalidReset(legal.id, password(7) + character + password(5), 'reset forbidden password character ' + name);
  }
  const userLogin = await login(name, original, 'legal new account login'); check('legal created account login', userLogin.status === 200 && Number(userLogin.data.user?.id) === legal.id, { status: userLogin.status, id: userLogin.data.user?.id }, legal.id);
  const sixCharacterPassword = password(6);
  const resetMinimum = await request('/system/user/resetPwd', 'PUT', { userId: legal.id, password: sixCharacterPassword }, adminToken, 'reset boundary6 without username');
  check('reset boundary6 without username', resetMinimum.status === 200 && matches(legal.id, sixCharacterPassword).matches, { status: resetMinimum.status, newCredentialMatches: matches(legal.id, sixCharacterPassword).matches }, 'valid minimum6 accepted without unrelated username');
  const reset = await request('/system/user/resetPwd', 'PUT', { userId: legal.id, password: updated }, adminToken, 'legal resetPwd');
  check('legal reset password', reset.status === 200 && matches(legal.id, updated).matches && !matches(legal.id, original).matches, { status: reset.status, newCredentialMatches: matches(legal.id, updated).matches, originalStillMatches: matches(legal.id, original).matches }, 'new BCrypt only');
  const oldRejected = await login(name, original, 'old password after reset'); check('old password rejected after reset', oldRejected.status >= 400 && !oldRejected.data.token, { status: oldRejected.status }, 'reject');
  const newAccepted = await login(name, updated, 'new password after reset'); check('new password works after reset', newAccepted.status === 200, { status: newAccepted.status }, 200);
  // Negative checks on the fixed release only. These fixtures never log in.
  // Any unexpected association immediately fails into exact cleanup.
  const options = await request('/system/user/', 'GET', undefined, adminToken, 'new-user visible role options');
  evidence.adminRolePolicy = { role1VisibleInUiData: options.data.roles?.some(r => r.roleId === 1) ?? null, fixtureNeverLoggedIn: true };
  check('visible roles exclude protected role1', evidence.adminRolePolicy.role1VisibleInUiData === false, evidence.adminRolePolicy, 'protected role excluded');
  await create(`qa_sysval_${run}_r`, password(16), 'creation rejects protected role1', false, [1]);
  await protectedRoleMutation('e', 'user edit protected role1', (id, name) => ['/system/user', 'PUT', { userId: id, userName: name, nickName: marker, status: '0', roleIds: [1], postIds: [] }]);
  await protectedRoleMutation('a', 'user authRole protected role1', id => [`/system/user/authRole?userId=${id}&roleIds=1`, 'PUT']);
  await protectedRoleMutation('b', 'role batch authorization protected role1', id => [`/system/role/authUser/selectAll?roleId=1&userIds=${id}`, 'PUT']);
  const removed = await remove(legal.id, 'legal lifecycle exact delete');
  check('delete exact legal fixture', removed.deleted === '2' && removed.roles === 0 && removed.posts === 0, removed, 'logical deletion and no associations');
  const deletedRejected = await login(name, updated, 'deleted account login'); check('deleted account login rejected', deletedRejected.status >= 400 && !deletedRejected.data.token, { status: deletedRejected.status }, 'reject');
} catch (error) {
  evidence.fatal = { name: error.name, message: safeMessage({ message: error.message }) };
} finally {
  cleanupPhase = true;
  evidence.cleanupReconciliation = [];
  for (const name of ownedNames) {
    try {
      for (const row of getFixture(name)) {
        assert.equal(row.nickname, marker, 'Never reconcile an unrelated account');
        if (!tracked.has(row.id)) tracked.set(row.id, { id: row.id, name });
      }
    } catch (error) { evidence.cleanupReconciliation.push({ account: name, error: error.name }); }
  }
  // Logout only tokens obtained in this script; never enumerate-and-delete shared sessions.
  const logoutResults = [];
  for (const token of [...tokens].filter(t => t !== adminToken)) {
    try { const r = await request('/api/auth/logout', 'POST', {}, token, 'logout own fixture session'); logoutResults.push(r.status); } catch (e) { logoutResults.push(e.name); }
  }
  const cleaned = [];
  for (const id of tracked.keys()) {
    try { cleaned.push(await remove(id)); } catch (error) { cleaned.push({ id, cleanupError: error.name }); }
  }
  if (adminToken) {
    try { const r = await request('/api/auth/logout', 'POST', {}, adminToken, 'logout own QA114 test session'); logoutResults.push(r.status); } catch (e) { logoutResults.push(e.name); }
  }
  const ids = [...tracked.keys()];
  evidence.audit = rows(`SELECT JSON_OBJECT('id',oper_id,'path',oper_url,'method',request_method,'status',status,'actor',oper_name,'at',oper_time,'code',IF(JSON_VALID(json_result),JSON_EXTRACT(json_result,'$.code'),NULL),'hasError',IF(error_msg IS NOT NULL AND error_msg<>'',1,0),'userName',IF(JSON_VALID(oper_param),JSON_UNQUOTE(JSON_EXTRACT(oper_param,'$.userName')),NULL)) FROM sys_oper_log WHERE oper_id>${watermark} AND oper_name=${quote(account.account)} AND (oper_url IN ('/system/user','/system/user/resetPwd','/system/user/authRole','/system/role/authUser/selectAll')${ids.length ? ' OR oper_url IN (' + ids.map(id => quote('/system/user/' + id)).join(',') + ')' : ''}) ORDER BY oper_id`);
  const failuresInAudit = evidence.audit.filter(a => Number(a.code) >= 400 || a.hasError === 1);
  check('business rejections are not logged as SUCCESS', failuresInAudit.length > 0 && failuresInAudit.every(a => a.status === 1), failuresInAudit.map(a => ({ id: a.id, path: a.path, status: a.status, code: a.code, hasError: a.hasError })), 'all recorded business rejections have FAIL status; BeanValidation before controller may have no operation audit');
  check('duplicate username has failure audit', evidence.audit.some(a => a.path === '/system/user' && a.method === 'POST' && a.userName === evidence.lifecycleAccount && a.status === 1), { matchingFailureCount: evidence.audit.filter(a => a.path === '/system/user' && a.method === 'POST' && a.userName === evidence.lifecycleAccount && a.status === 1).length }, 'logged duplicate rejection, not SUCCESS');
  const ownTokenCacheEntriesRemoved = [...tokens].every(token => {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    assert.match(claims.login_user_key, /^[\w-]+$/);
    return redis('EXISTS', 'login_tokens:' + claims.login_user_key) === '0';
  });
  evidence.cleanup = { exactFixtureIds: ids, logicalRowsRetainedForEvidence: cleaned, noActiveFixture: cleaned.every(r => r.deleted === '2'), noRolePostAssociations: cleaned.every(r => r.roles === 0 && r.posts === 0), logoutResults, ownTokensObtained: tokens.size, ownTokenCacheEntriesRemoved, protectedUserFieldsUnchanged: hash(sql(protectedSQL)) === protectedBefore, protectedUserRolesUnchanged: hash(sql('SELECT user_id,role_id FROM sys_user_role WHERE user_id<=115 ORDER BY user_id,role_id')) === rolesBefore, existingBusinessCountsUnchanged: sql('SELECT (SELECT COUNT(*) FROM maoyi_craft),(SELECT COUNT(*) FROM maoyi_share),(SELECT COUNT(*) FROM maoyi_chart)') === businessBefore, priorSessionKeysPreserved: beforeKeys.every(k => redis('EXISTS', k) === '1'), passwordOrTokenExported: false, sqlWritesByTest: 0 };
  check('exact cleanup and shared-state retention', evidence.cleanupReconciliation.length === 0 && evidence.cleanup.noActiveFixture && evidence.cleanup.noRolePostAssociations && ownTokenCacheEntriesRemoved && logoutResults.length === tokens.size && logoutResults.every(s => s === 200) && evidence.cleanup.protectedUserFieldsUnchanged && evidence.cleanup.protectedUserRolesUnchanged && evidence.cleanup.existingBusinessCountsUnchanged && evidence.cleanup.priorSessionKeysPreserved, { ...evidence.cleanup, logicalRowsRetainedForEvidence: undefined }, 'all owned sessions removed and exact fixtures inactive; unrelated state retained');
  evidence.result = evidence.fatal || evidence.defects.length ? '失败待修' : '仅自动化通过';
  evidence.finishedAt = new Date().toISOString(); save();
}
console.log(JSON.stringify({ file: out, result: evidence.result, run, checks: evidence.checks.length, failures: evidence.defects.map(d => d.name), fatal: evidence.fatal, cleanup: evidence.cleanup }));
if (evidence.result !== '仅自动化通过') process.exitCode = 1;
