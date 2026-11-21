// Read-only QA integrity gate. A clean gate is not an end-to-end acceptance claim.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const ledger = JSON.parse(await fs.readFile(path.join(root, 'docs/qa/ledger.json'), 'utf8'));
const release = process.argv[2];
const errors = [];
const counts = {};
const seenCases = new Set();
const seenSteps = new Set();
let businessActions = 0;
let supportingChecks = 0;
const references = new Set();
const image = /\.(png|jpe?g|webp)$/i;
function collect(value, output = references) {
  if (typeof value === 'string' && /^(?:\.data\/qa\/|docs\/)/.test(value) && !/[\n\r]/.test(value) && value.length < 512) output.add(value);
  else if (Array.isArray(value)) value.forEach(v => collect(v, output));
  else if (value && typeof value === 'object') Object.values(value).forEach(v => collect(v, output));
  return output;
}
for (const c of ledger.cases) {
  if (seenCases.has(c.id)) errors.push(`Duplicate case: ${c.id}`);
  seenCases.add(c.id);
  for (const key of ['role', 'prerequisites', 'actions', 'functionalExpected', 'visualExpected', 'apiPersistenceExpected', 'cleanup']) {
    if (c[key] == null) errors.push(`${c.id}: missing ${key}`);
  }
  if (!ledger.resultValues.includes(c.result) || !ledger.queueValues.includes(c.queue)) errors.push(`${c.id}: invalid result/queue`);
  counts[c.result] = (counts[c.result] || 0) + 1;
  if (c.result === '真实页面通过') {
    if (c.queue !== '通过') errors.push(`${c.id}: page pass is outside passed queue`);
    if (![...collect(c.evidence, new Set())].some(v => image.test(v))) errors.push(`${c.id}: page pass has no screenshot reference`);
    if ((c.checkpoints || []).some(s => s.kind !== 'supportingVerification' && s.result !== '真实页面通过')) errors.push(`${c.id}: page pass contains an incomplete action`);
  }
  for (const s of c.checkpoints || []) {
    if (!s.id || seenSteps.has(s.id)) errors.push(`${c.id}: missing/duplicate action ID ${s.id}`);
    seenSteps.add(s.id);
    if (s.kind === 'supportingVerification') {
      supportingChecks++;
      if (s.result !== '仅自动化通过') errors.push(`${c.id}/${s.id}: supporting check must remain automation-only`);
      if (!s.supportsActionIds?.length || s.supportsActionIds.some(id => !(c.checkpoints || []).some(a => a.id === id && a.kind !== 'supportingVerification'))) errors.push(`${c.id}/${s.id}: supporting check has no valid business action`);
    } else {
      businessActions++;
      if (s.kind && s.kind !== 'action') errors.push(`${c.id}/${s.id}: unknown checkpoint kind`);
    }
    if (!ledger.resultValues.includes(s.result) || !ledger.queueValues.includes(s.queue)) errors.push(`${c.id}/${s.id}: invalid result/queue`);
    if (s.result === '真实页面通过' && !s.evidence?.length) errors.push(`${c.id}/${s.id}: action pass has no evidence`);
  }
}
const mapped = new Set();
for (const requirement of ledger.requirements) for (const id of requirement.cases) {
  if (!seenCases.has(id)) errors.push(`${requirement.id}: unknown case ${id}`);
  mapped.add(id);
}
for (const id of seenCases) if (!mapped.has(id)) errors.push(`Unmapped case: ${id}`);
collect(ledger);
for (const ref of references) {
  try { await fs.access(path.resolve(root, ref)); }
  catch { errors.push(`Missing evidence: ${ref}`); }
}
let releaseCheck;
if (release) {
  if (!/^qa-[a-zA-Z0-9-]+$/.test(release)) throw Error('Invalid release ID');
  const base = path.join(root, '.data/qa/releases', release);
  const raw = await fs.readFile(path.join(base, 'manifest.json'));
  const manifest = JSON.parse(raw);
  if (manifest.id !== release) errors.push('Release ID mismatch');
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return (await Promise.all(entries.map(e => e.isDirectory() ? walk(path.join(dir, e.name)) : path.join(dir, e.name)))).flat();
  }
  const actual = (await walk(base)).filter(p => p !== path.join(base, 'manifest.json')).map(p => path.relative(base, p)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(Object.keys(manifest.files).sort())) errors.push('Release file set mismatch');
  for (const [file, expected] of Object.entries(manifest.files)) {
    const absolute = path.resolve(base, file);
    if (!absolute.startsWith(base + path.sep)) { errors.push(`Unsafe release path: ${file}`); continue; }
    try {
      const sha = createHash('sha256').update(await fs.readFile(absolute)).digest('hex');
      if (sha !== expected) errors.push(`Release hash mismatch: ${file}`);
    } catch { errors.push(`Missing release file: ${file}`); }
  }
  releaseCheck = { id: release, files: actual.length, manifestSha256: createHash('sha256').update(raw).digest('hex') };
}
console.log(JSON.stringify({ integrityPassed: !errors.length, acceptanceComplete: false, note: 'Integrity only; outstanding or external cases remain separate.', cases: seenCases.size, actions: businessActions, supportingChecks, checkpoints: seenSteps.size, results: counts, evidenceReferences: references.size, release: releaseCheck, errors }, null, 2));
if (errors.length) process.exitCode = 1;
