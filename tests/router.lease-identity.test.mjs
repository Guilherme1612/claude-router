// Phase 40 — Plan 01, Task 1 (LEASE-01): Lease identity + durable store.
// RED phase: failing tests asserting six-axis fingerprint independence,
// per-runtime partition, atomic + private write, fail-closed read, and
// exact-fingerprint lookup. No unredacted operator-prompt content in any
// fixture.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdirSync, readdirSync, statSync, writeFileSync,
} from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { computeLeaseFingerprint } from '../src/lease/identity.mjs';
import { createLeaseStore, defaultLeaseRoot } from '../src/lease/store.mjs';

const BASE_AXES = {
  repo: 'repo-A',
  worktree: 'worktree-W',
  runtime: 'claude',
  goal: 'ship-router-v1',
  schemaGeneration: 1,
  projectFingerprint: 'pf1',
};

function fingerprint(overrides) {
  return computeLeaseFingerprint({ ...BASE_AXES, ...overrides });
}

test('computeLeaseFingerprint changes when each of the six axes changes independently', () => {
  const baseline = fingerprint({});
  assert.equal(baseline, fingerprint({}));
  assert.notEqual(baseline, fingerprint({ repo: 'repo-B' }));
  assert.notEqual(baseline, fingerprint({ worktree: 'worktree-X' }));
  assert.notEqual(baseline, fingerprint({ runtime: 'codex' }));
  assert.notEqual(baseline, fingerprint({ goal: 'ship-router-v2' }));
  assert.notEqual(baseline, fingerprint({ schemaGeneration: 2 }));
  assert.notEqual(baseline, fingerprint({ projectFingerprint: 'pf2' }));
});

test('computeLeaseFingerprint rejects null/undefined projectFingerprint', () => {
  assert.throws(() => computeLeaseFingerprint({ ...BASE_AXES, projectFingerprint: null }), /invalid_project_fingerprint/);
  assert.throws(() => computeLeaseFingerprint({ ...BASE_AXES, projectFingerprint: undefined }), /invalid_project_fingerprint/);
});

test('defaultLeaseRoot partitions per runtime under ~/.claude and ~/.codex', () => {
  assert.ok(defaultLeaseRoot('claude').endsWith('.claude/router/leases'));
  assert.ok(defaultLeaseRoot('codex').endsWith('.codex/router/leases'));
  assert.ok(defaultLeaseRoot('claude').startsWith(homedir()));
  assert.ok(defaultLeaseRoot('codex').startsWith(homedir()));
  assert.notEqual(defaultLeaseRoot('claude'), defaultLeaseRoot('codex'));
});

function fixture() {
  const owned = mkdtempSync(join(tmpdir(), 'router-lease-identity-'));
  return { owned, root: join(owned, 'leases') };
}

function sampleRecord(fp) {
  return {
    schema_version: 1,
    policy_version: 'lease-policy-v1',
    lease_id: fp,
    project_fingerprint: fp,
    goal: 'ship-router-v1',
    scope: { repo: 'repo-A', worktree: 'worktree-W', runtime: 'claude', schema_generation: 1 },
    allowed_effects: [],
    confirmation_effects: [],
    resource_bounds: { max_wall_ms: 0, max_invocations: 0, max_tokens: 0 },
    status: 'active',
    expiry: { deterministic_at_ms: 0, tz: 'UTC' },
    authority_source: { kind: 'operator', instruction: 'persist', class: 'persistent_goal_action' },
    last_safe_checkpoint: null,
    freshness_evidence: { lease_mtime_ms: 0, fingerprint_match: true },
    claimed_actions: [],
  };
}

test('createLeaseStore creates a 0o700 root and 0o600 file; create/read round-trip', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    assert.equal(statSync(f.root).mode & 0o777, 0o700);
    const fp = fingerprint({});
    const record = sampleRecord(fp);
    const created = store.createLease(record);
    assert.equal(created.status, 'stored');
    assert.equal(created.lease_id, fp);
    const file = join(f.root, `${fp}.json`);
    assert.ok(existsSync(file));
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const readBack = store.readLease(fp);
    assert.equal(readBack.lease_id, fp);
    assert.equal(readBack.goal, 'ship-router-v1');
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('createLease is idempotent: second create returns unchanged (LEASE-03 adjacency)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const fp = fingerprint({});
    const first = store.createLease(sampleRecord(fp));
    assert.equal(first.status, 'stored');
    const second = store.createLease(sampleRecord(fp));
    assert.equal(second.status, 'unchanged');
    assert.equal(second.lease_id, fp);
    const files = readdirSync(f.root).filter((name) => name.endsWith('.json'));
    assert.equal(files.length, 1);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('readLease returns null on missing or corrupt file (fail-closed)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    assert.equal(store.readLease('nonexistent-lease-id'), null);
    const fp = fingerprint({});
    store.createLease(sampleRecord(fp));
    writeFileSync(join(f.root, `${fp}.json`), '{bad', { mode: 0o600 });
    assert.equal(store.readLease(fp), null);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('findByFingerprint matches only the exact six-axis fingerprint', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const fpClaude = fingerprint({ runtime: 'claude' });
    const fpCodex = fingerprint({ runtime: 'codex' });
    store.createLease(sampleRecord(fpClaude));
    store.createLease(sampleRecord(fpCodex));
    const hit = store.findByFingerprint(fpClaude);
    assert.ok(hit);
    assert.equal(hit.lease_id, fpClaude);
    const miss = store.findByFingerprint(fingerprint({ repo: 'repo-B' }));
    assert.equal(miss, null);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('no unredacted operator-prompt content is stored in any lease field', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const fp = fingerprint({});
    store.createLease(sampleRecord(fp));
    const readBack = store.readLease(fp);
    const serialized = JSON.stringify(readBack);
    assert.ok(!serialized.includes('unredactedOperatorPrompt'));
    assert.ok(!serialized.includes('hey claude please'));
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('no .tmp- files remain after writes', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    store.createLease(sampleRecord(fingerprint({})));
    const tmp = readdirSync(f.root).filter((name) => name.includes('.tmp-'));
    assert.deepEqual(tmp, []);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});