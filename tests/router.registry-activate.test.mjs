import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import {
  PRODUCTION_GATE_RUNNERS, REQUIRED_ACTIVATION_GATES, createTestActivationVerifier, produceActivationVerification,
} from '../src/registry/validate.mjs';
import { stableStringify } from '../src/registry/schema.mjs';
import {
  activateCandidate, executeRollback, previewRollback, recoverActiveVersion,
  replaceActivePointer, verifyVersion, writeImmutableVersion,
} from '../src/registry/activate.mjs';

function inputs() {
  const candidate = { schema_version: 1, records: [] };
  const reconciliation = { disposition: 'eligible', candidate_fingerprint: null, verdicts: [] };
  const mapping = { schema_version: 1, subjects: [], summary: { disposition: 'complete', ambiguous: 0 }, report_fingerprint: 'mapping' };
  return { candidate, reconciliation, mapping, policy: { version: 'fixture' } };
}

const hash = value => createHash('sha256').update(stableStringify(value)).digest('hex');

function productionVerification(exact, now = 100) {
  const gates = REQUIRED_ACTIVATION_GATES.map(id => {
    const runner = PRODUCTION_GATE_RUNNERS[id];
    const gate = { id, runner_id: runner.id, runner_version: runner.version, passed: true, reason_code: 'passed', threshold: runner.threshold, measured: {} };
    return { ...gate, evidence_fingerprint: hash(gate) };
  });
  const canonical = {
    schema_version: 1, verification_policy_version: 'activation-verification-v1', trusted: true, complete: true,
    generated_at: now, expires_at: now + 300_000, required_gate_ids: [...REQUIRED_ACTIVATION_GATES],
    candidate_fingerprint: hash(exact.candidate), reconciliation_fingerprint: hash(exact.reconciliation),
    mapping_fingerprint: hash(exact.mapping), policy_fingerprint: hash(exact.policy),
    gates, disposition: 'passing', test_only: false,
  };
  return { ...canonical, verification_fingerprint: hash(canonical) };
}

function resealVerification(verification) {
  const { verification_fingerprint: _ignored, ...canonical } = verification;
  return { ...canonical, verification_fingerprint: hash(canonical) };
}

function childResult(child) {
  return new Promise((resolve, reject) => {
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(JSON.parse(stdout)) : reject(new Error(stderr || `child exit ${code}`)));
  });
}

test('trusted verifier is complete, bound, fresh, and fails closed', async () => {
  const now = 1_700_000_000_000;
  const verifier = createTestActivationVerifier(Object.fromEntries(REQUIRED_ACTIVATION_GATES.map(id => [id, async () => ({ passed: true, measured: { samples: 1 }, threshold: { required: true } })])));
  const result = await verifier({ ...inputs(), now, freshnessMs: 1000 });
  assert.equal(result.disposition, 'passing');
  assert.deepEqual(result.required_gate_ids, [...REQUIRED_ACTIVATION_GATES]);
  assert.equal(result.gates.length, 8);
  assert.ok(result.verification_fingerprint);
  const failed = await createTestActivationVerifier({})({ ...inputs(), now });
  assert.equal(failed.disposition, 'non_passing');
  assert.equal(produceActivationVerification.constructor.name, 'AsyncFunction');
  await assert.rejects(() => produceActivationVerification({ ...inputs(), runners: {} }), /injection/i);
});

test('immutable activation, recovery and pointer-only rollback preserve history', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-activation-'));
  try {
    const firstInputs = inputs();
    const firstVerification = productionVerification(firstInputs, 100);
    const first = activateCandidate({ ownedRoot: root, ...firstInputs, verification: firstVerification, now: 100, reason: 'bootstrap' });
    assert.equal(first.activation_status, 'activated');
    assert.equal(verifyVersion({ ownedRoot: root, versionId: first.version_id }).valid, true);
    const firstManifest = readFileSync(join(root, 'versions', first.version_id, 'manifest.json'), 'utf8');

    const secondInputs = { ...inputs(), candidate: { schema_version: 1, records: [], generation: 2 } };
    const secondVerification = productionVerification(secondInputs, 200);
    const second = activateCandidate({ ownedRoot: root, ...secondInputs, verification: secondVerification, now: 200, reason: 'update' });
    assert.equal(second.activation_status, 'activated');
    const preview = previewRollback({ ownedRoot: root, destination: first.version_id, now: 300 });
    assert.equal(preview.preview_status, 'ready');
    const rolled = executeRollback({ ownedRoot: root, preview, confirmation: first.version_id, now: 301, reason: 'operator' });
    assert.equal(rolled.rollback_status, 'rolled_back');
    assert.equal(JSON.parse(readFileSync(join(root, 'active.json'), 'utf8')).version_id, first.version_id);
    assert.equal(readFileSync(join(root, 'versions', first.version_id, 'manifest.json'), 'utf8'), firstManifest);
    assert.equal(recoverActiveVersion({ ownedRoot: root }).recovery_status, 'healthy');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('activation independently rejects substituted or unauthenticated production evidence before version creation', async () => {
  const exact = inputs();
  const base = productionVerification(exact, 1_000);
  const cases = [
    ['test_only', resealVerification({ ...base, test_only: true })],
    ['candidate', base, { candidate: { ...exact.candidate, generation: 2 } }],
    ['reconciliation', base, { reconciliation: { ...exact.reconciliation, disposition: 'quarantined' } }],
    ['mapping', base, { mapping: { ...exact.mapping, report_fingerprint: 'substituted' } }],
    ['policy', base, { policy: { version: 'substituted' } }],
    ['evidence', resealVerification({ ...base, gates: base.gates.map((gate, index) => index ? gate : { ...gate, measured: { substituted: true } }) })],
    ['verification_fingerprint', { ...base, verification_fingerprint: '0'.repeat(64) }],
    ['expired', resealVerification({ ...base, expires_at: 999 })],
    ['incomplete', resealVerification({ ...base, complete: false })],
    ['unknown_runner', (() => {
      const gates = base.gates.map((gate, index) => {
        if (index) return gate;
        const { evidence_fingerprint: _ignored, ...evidence } = { ...gate, runner_id: 'unknown' };
        return { ...evidence, evidence_fingerprint: hash(evidence) };
      });
      return resealVerification({ ...base, gates });
    })()],
    ['non_passing', resealVerification({ ...base, disposition: 'non_passing' })],
  ];
  for (const [name, verification, substitutions = {}] of cases) {
    const root = mkdtempSync(join(tmpdir(), `router-activation-${name}-`));
    try {
      const result = activateCandidate({ ownedRoot: root, ...exact, ...substitutions, verification, now: 1_000 });
      assert.equal(result.activation_status, 'blocked', name);
      assert.equal(existsSync(join(root, 'versions')), false, name);
      assert.equal(existsSync(join(root, 'active.json')), false, name);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test('cross-process pointer CAS has exactly one winner for an expected sequence', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-activation-race-'));
  try {
    const version = writeImmutableVersion({ ownedRoot: root, ...inputs(), verification: productionVerification(inputs(), 100), now: 100 });
    const worker = join(root, 'race-worker.mjs');
    const activateUrl = new URL('../src/registry/activate.mjs', import.meta.url).href;
    writeFileSync(worker, `
      import { existsSync, writeFileSync } from 'node:fs';
      import { replaceActivePointer } from ${JSON.stringify(activateUrl)};
      const [root, destination, marker, peer] = process.argv.slice(2);
      const result = replaceActivePointer({ ownedRoot: root, destination, expectedSequence: 0, reason: marker, io: {
        beforeRename() {
          writeFileSync(marker, 'ready');
          const deadline = Date.now() + 250;
          while (!existsSync(peer) && Date.now() < deadline) {}
        },
      }});
      process.stdout.write(JSON.stringify(result));
    `);
    const markerA = join(root, 'writer-a.ready'), markerB = join(root, 'writer-b.ready');
    const spawnWorker = (marker, peer) => spawn(process.execPath, [worker, root, version.version_id, marker, peer], { stdio: ['ignore', 'pipe', 'pipe'] });
    const results = await Promise.all([childResult(spawnWorker(markerA, markerB)), childResult(spawnWorker(markerB, markerA))]);
    assert.equal(results.filter(result => result.pointer_status === 'replaced').length, 1);
    const loser = results.find(result => result.pointer_status !== 'replaced');
    assert.equal(loser.pointer_status, 'blocked');
    assert.equal(loser.reason_code, 'stale_pointer_sequence');
    assert.equal(JSON.parse(readFileSync(join(root, 'active.json'), 'utf8')).sequence, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('invalid verification and stale pointer sequence never replace active authority', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-activation-'));
  try {
    const invalid = activateCandidate({ ownedRoot: root, ...inputs(), verification: { disposition: 'passing' } });
    assert.equal(invalid.activation_status, 'blocked');
    const version = writeImmutableVersion({ ownedRoot: root, ...inputs(), verification: { disposition: 'passing', trusted: true, complete: true, verification_fingerprint: 'v', candidate_fingerprint: 'c', mapping_fingerprint: 'mapping', policy_fingerprint: 'p', expires_at: 9999999999999, gates: REQUIRED_ACTIVATION_GATES.map(id => ({ id, passed: true })) } });
    const pointer = replaceActivePointer({ ownedRoot: root, destination: version.version_id, reason: 'test', expectedSequence: 0 });
    assert.equal(pointer.pointer_status, 'replaced');
    const before = readFileSync(join(root, 'active.json'), 'utf8');
    const stale = replaceActivePointer({ ownedRoot: root, destination: version.version_id, reason: 'stale', expectedSequence: 0 });
    assert.equal(stale.pointer_status, 'blocked');
    assert.equal(readFileSync(join(root, 'active.json'), 'utf8'), before);
    writeFileSync(join(root, 'active.json'), '{bad');
    assert.notEqual(recoverActiveVersion({ ownedRoot: root }).recovery_status, 'healthy');
  } finally { await rm(root, { recursive: true, force: true }); }
});
