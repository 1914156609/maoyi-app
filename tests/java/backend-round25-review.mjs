// Real local HTTP regressions; every row is tracked and removed by exact ID.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

const origin = process.env.MAOYI_TEST_ORIGIN || 'http://127.0.0.1:8081';
assert.match(origin, /^http:\/\/127\.0\.0\.1:808[124]$/);
const out = '.data/qa/current-review/round25/backend';
mkdirSync(out, {recursive: true});
const {accounts} = JSON.parse(readFileSync('.secrets/qa-accounts.json'));
const ids = [], charts = [], tokens = [], requests = [], checks = [];
const suffix = randomUUID().slice(0, 8), name = 'QA25-' + suffix;
const sql = query => execFileSync('mysql', ['--protocol=socket', '-uroot', '--default-character-set=utf8mb4', '-N', 'maoyi_ruoyi'], {input: query, encoding: 'utf8'}).trim();

async function call(path, {token, method = 'GET', body} = {}) {
  const response = await fetch(origin + path, {
    method, signal: AbortSignal.timeout(15000),
    headers: {'content-type': 'application/json', ...(token ? {Authorization: 'Bearer ' + token} : {})},
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  const status = typeof data.code === 'number' && data.code >= 400 ? data.code : response.status;
  requests.push({path, method, httpStatus: response.status, status, message: data.msg || data.message});
  return {status, data};
}
async function login(lane) {
  const account = accounts[lane];
  const result = await call('/api/auth/login', {method: 'POST', body: {type: 'employee', account: account.account, password: account.password}});
  assert.equal(result.status, 200, result.data.msg || result.data.message);
  tokens.push(result.data.token);
  return result.data.token;
}
function check(label, assertion) {
  try { assertion(); checks.push({label, passed: true}); }
  catch (error) { checks.push({label, passed: false, message: error.message}); }
}

let failure;
try {
  const maker = await login('api'), manager = await login('admin'), peer = await login('peer');
  // Missing chart rows must not deadlock on two simultaneous saves.
  for (let round = 0; round < 10; round++) {
    const id = 'qa25-chart-' + randomUUID(); charts.push(id);
    const results = await Promise.all([true, false].map(locked => call('/api/charts', {token: maker, method: 'POST', body: {id, locked}})));
    check('same chart concurrent first saves ' + round, () => assert.ok(results.every(result => [200, 409].includes(result.status)), JSON.stringify(results.map(x => x.status))));
    check('one durable chart row ' + round, () => assert.equal(sql(`SELECT COUNT(*) FROM maoyi_chart WHERE id='${id}' AND owner_id=${accounts.api.id}`), '1'));
  }
  const contested = 'qa25-chart-' + randomUUID(); charts.push(contested);
  const competing = await Promise.all([maker, peer].map(token => call('/api/charts', {token, method: 'POST', body: {id: contested, locked: true}})));
  check('different owners competing for a new chart remain isolated', () => assert.deepEqual(competing.map(x => x.status).sort(), [200, 404]));
  const winner = Number(sql(`SELECT owner_id FROM maoyi_chart WHERE id='${contested}'`));
  const visibility = await Promise.all([maker, peer].map(async token => (await call('/api/charts', {token})).data.charts.some(chart => chart.id === contested)));
  check('only the winning owner can read the contested chart', () => assert.deepEqual(visibility, [Number(accounts.api.id) === winner, Number(accounts.peer.id) === winner]));
  const input = {name, style: '套头', neck: '圆领', sleeve: '长袖', length: '常规', density: 30, rowDensity: 40, sizes: {chest: 50}, measurementBasis: 'flat', calculationVersion: 'video-v1'};
  for (let i = 0; i < 15; i++) {
    const result = await call('/api/crafts', {token: maker, method: 'POST', body: {...input, name: name + '-' + i}});
    assert.equal(result.status, 200); ids.push(result.data.craft.id);
  }
  for (const id of ids) assert.match(id, /^GY-\d{8}-[A-F0-9]{16}$/);
  sql(`UPDATE maoyi_craft SET updated_at=1893456000000 WHERE owner_id=${accounts.api.id} AND id IN (${ids.map(id => "'" + id + "'").join(',')})`);
  const path = '/maoyi/craft/list?name=' + encodeURIComponent(name);
  const all = await call(path + '&pageNum=1&pageSize=100', {token: manager});
  const pages = [];
  for (let page = 1; page <= 3; page++) pages.push(...(await call(path + '&pageNum=' + page + '&pageSize=5', {token: manager})).data.rows.map(row => row.id));
  check('management pagination visits tied rows once', () => assert.deepEqual([...pages].sort(), [...ids].sort()));
  check('management pagination order independent of page size', () => assert.deepEqual(pages, all.data.rows.map(row => row.id)));
} catch (error) { failure = {name: error.name, message: error.message}; }
finally {
  for (const token of tokens) await call('/api/auth/logout', {token, method: 'POST', body: {}}).catch(() => {});
  for (const id of charts) { assert.match(id, /^qa25-chart-[a-f0-9-]{36}$/); sql(`DELETE FROM maoyi_chart WHERE id='${id}' AND owner_id IN (${accounts.api.id},${accounts.peer.id})`); }
  for (const id of ids) sql(`DELETE FROM maoyi_craft WHERE id='${id}' AND owner_id=${accounts.api.id}`);
  const result = {at: new Date().toISOString(), origin, release: process.env.QA_RELEASE_ID || 'unfrozen', kind: 'actual local HTTP + exact-ID SQL fixtures; no UI claim', passed: !failure && checks.every(x => x.passed), checks, requests, failure, cleanup: {chartIds: charts, craftIds: ids, remaining: sql(`SELECT COUNT(*) FROM maoyi_craft WHERE owner_id=${accounts.api.id} AND name LIKE '${name}%'`)}};
  const file = out + '/business-concurrency-' + (process.env.QA_RELEASE_ID || 'unfrozen') + '.json';
  writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({file, passed: result.passed, checks: checks.length, failed: checks.filter(x => !x.passed), failure, cleanupRemaining: result.cleanup.remaining}));
  if (!result.passed) process.exitCode = 1;
}
