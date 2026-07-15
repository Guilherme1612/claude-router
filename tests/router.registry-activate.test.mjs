import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  REQUIRED_ACTIVATION_GATES, createTestActivationVerifier, produceActivationVerification,
} from '../src/registry/validate.mjs';
import {
  activateCandidate, executeRollback, previewRollback, recoverActiveVersion,
  replaceActivePointer, verifyVersion, writeImmutableVersion,
} from '../src/registry/activate.mjs';

function inputs() {
  const candidate = { schema_version: 1, records: [] };
  const reconciliation = { disposition: 'eligible', candidate_fingerprint: null, verdicts: [] };
  const mapping = { schema_version: 1, disposition: 'complete', results: [], report_fingerprint: 'mapping' };
  return { candidate, reconciliation, mapping, policy: { version: 'fixture' } };
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
    const verifier = createTestActivationVerifier(Object.fromEntries(REQUIRED_ACTIVATION_GATES.map(id => [id, async () => ({ passed: true })])));
    const firstInputs = inputs();
    const firstVerification = await verifier({ ...firstInputs, now: 100 });
    const first = activateCandidate({ ownedRoot: root, ...firstInputs, verification: firstVerification, now: 100, reason: 'bootstrap' });
    assert.equal(first.activation_status, 'activated');
    assert.equal(verifyVersion({ ownedRoot: root, versionId: first.version_id }).valid, true);
    const firstManifest = readFileSync(join(root, 'versions', first.version_id, 'manifest.json'), 'utf8');

    const secondInputs = { ...inputs(), candidate: { schema_version: 1, records: [], generation: 2 } };
    const secondVerification = await verifier({ ...secondInputs, now: 200 });
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
