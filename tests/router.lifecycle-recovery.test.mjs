import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCompiledIndex } from '../src/prompt/compile-index.mjs';
import { publishCompiledIndex, recoverReleaseTuple } from '../src/prompt/publish-index.mjs';

const NOW = 1_800_000_000_000;
const registry = suffix => ({ schema_version: 1, records: [{ id: `cap-${suffix}`, name: `execute-${suffix}`,
  lifecycle: 'ready', dispatchable: true, scope: { kind: 'global' },
  invocation: { runtime: 'claude', command: `execute-${suffix}`, args: [] }, dependencies: { state: 'ready', items: [] } }] });
const mapping = suffix => ({ schema_version: 1, policy_fingerprint: 'a'.repeat(64), subjects: [{
  subject_id: 'gsd-execute-phase', disposition: 'mapped', target_id: `cap-${suffix}`, reason_code: 'explicit_subject' }] });

test('corrupt active tuple is durably repaired from verified known-good and repeated recovery is idempotent', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-tuple-recovery-'));
  try {
    const old = publishCompiledIndex({ ownedRoot: root, registry: registry('old'), registryVersionId: 'v1-aaaaaaaaaaaaaaaa', mapping: mapping('old'), now: NOW });
    writeFileSync(join(root, 'release-tuples', 'active.json'), '{corrupt');
    assert.equal(recoverReleaseTuple({ ownedRoot: root, now: NOW }).tuple_version_id, old.tuple_version_id);
    const firstBytes = readFileSync(join(root, 'release-tuples', 'active.json'));
    assert.equal(recoverReleaseTuple({ ownedRoot: root, now: NOW }).status, 'already-active');
    assert.deepEqual(readFileSync(join(root, 'release-tuples', 'active.json')), firstBytes);
    assert.equal(loadCompiledIndex({ ownedRoot: root, now: NOW }).tuple_version_id, old.tuple_version_id);
    const newer = publishCompiledIndex({ ownedRoot: root, registry: registry('new'), registryVersionId: 'v1-bbbbbbbbbbbbbbbb', mapping: mapping('new'), now: NOW + 1 });
    assert.notEqual(newer.tuple_version_id, old.tuple_version_id);
    assert.equal(loadCompiledIndex({ ownedRoot: root, now: NOW + 1 }).tuple_version_id, newer.tuple_version_id);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('publication crash before pointer preserves old tuple while crash after pointer exposes only new tuple', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-tuple-crash-'));
  try {
    const old = publishCompiledIndex({ ownedRoot: root, registry: registry('old'), registryVersionId: 'v1-aaaaaaaaaaaaaaaa', mapping: mapping('old'), now: NOW });
    assert.throws(() => publishCompiledIndex({ ownedRoot: root, registry: registry('new'), registryVersionId: 'v1-bbbbbbbbbbbbbbbb', mapping: mapping('new'), now: NOW + 1, crashAt: 'before-active-pointer' }), /injected crash/);
    assert.equal(loadCompiledIndex({ ownedRoot: root, now: NOW + 1 }).tuple_version_id, old.tuple_version_id);
    assert.throws(() => publishCompiledIndex({ ownedRoot: root, registry: registry('new'), registryVersionId: 'v1-bbbbbbbbbbbbbbbb', mapping: mapping('new'), now: NOW + 1, crashAt: 'after-active-pointer' }), /injected crash/);
    const observed = loadCompiledIndex({ ownedRoot: root, now: NOW + 1 });
    assert.equal(observed.dispatch_eligible, true);
    assert.notEqual(observed.tuple_version_id, old.tuple_version_id);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
