// Phase 40 — Plan 01, Task 3 (LEASE-03): 9-field inspection + status/expiry.
// RED phase: failing tests asserting inspect surfaces all 9 fields + computed
// booleans, setStatus is durable + idempotent, isExpired enforces the
// deterministic wall-clock deadline, missing lease inspects to null.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { computeLeaseFingerprint } from '../src/lease/identity.mjs';
import { createLeaseStore } from '../src/lease/store.mjs';
import { buildLeaseRecord } from '../src/lease/policy.mjs';

const NOW = 1_800_000_000_000;

function fixture() {
  const owned = mkdtempSync(join(tmpdir(), 'router-lease-inspect-'));
  return { owned, root: join(owned, 'leases') };
}

function makeLease(store, { expiryMs = NOW + 60_000 } = {}) {
  const fp = computeLeaseFingerprint({
    repo: 'repo-A', worktree: 'worktree-W', runtime: 'claude',
    goal: 'ship-router-v1', schemaGeneration: 1, projectFingerprint: 'pf1',
  });
  const record = buildLeaseRecord({
    fingerprint: fp,
    goal: 'ship-router-v1',
    scope: { repo: 'repo-A', worktree: 'worktree-W', runtime: 'claude', schema_generation: 1 },
    allowedEffects: ['read', 'write'],
    confirmationEffects: ['deploy'],
    resourceBounds: { max_wall_ms: 60_000, max_invocations: 10, max_tokens: 8192 },
    expiryMs,
    authoritySource: { kind: 'operator', instruction: 'persist', class: 'persistent_goal_action' },
    checkpoint: null,
  });
  const created = store.createLease(record);
  assert.equal(created.status, 'stored');
  return { fp, record };
}

test('inspect returns all 9 fields + is_expired/is_revoked=false on a fresh lease', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store, { expiryMs: NOW + 60_000 });
    const inspected = store.inspect(fp, { now: NOW });
    assert.ok(inspected);
    assert.deepEqual(Object.keys(inspected).slice(3), [
      'project_fingerprint', 'goal', 'scope', 'allowed_effects', 'confirmation_effects',
      'resource_bounds', 'status', 'expiry', 'authority_source', 'last_safe_checkpoint',
      'freshness_evidence', 'claimed_actions', 'is_expired', 'is_revoked',
    ]);
    assert.equal(inspected.status, 'active');
    assert.equal(inspected.is_expired, false);
    assert.equal(inspected.is_revoked, false);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('setStatus persists durable transitions (paused, completed, revoked)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    assert.equal(store.setStatus(fp, 'paused', { now: NOW }).status, 'stored');
    assert.equal(store.readLease(fp).status, 'paused');
    assert.equal(store.inspect(fp, { now: NOW }).status, 'paused');
    assert.equal(store.setStatus(fp, 'completed', { now: NOW }).status, 'stored');
    assert.equal(store.readLease(fp).status, 'completed');
    assert.equal(store.setStatus(fp, 'revoked', { now: NOW }).status, 'stored');
    assert.equal(store.readLease(fp).status, 'revoked');
    assert.equal(store.inspect(fp, { now: NOW }).is_revoked, true);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('setStatus is idempotent — second call with same status returns unchanged', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    assert.equal(store.setStatus(fp, 'paused', { now: NOW }).status, 'stored');
    const second = store.setStatus(fp, 'paused', { now: NOW });
    assert.equal(second.status, 'unchanged');
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('setStatus rejects unknown status with blocked + invalid_status', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    const result = store.setStatus(fp, 'bogus', { now: NOW });
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason_code, 'invalid_status');
    assert.equal(store.readLease(fp).status, 'active');
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('isExpired true when expiry.deterministic_at_ms <= now', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store, { expiryMs: NOW - 1 });
    const inspected = store.inspect(fp, { now: NOW });
    assert.equal(inspected.is_expired, true);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('isExpired true when claimed_actions reaches max_invocations', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store, { expiryMs: NOW + 60_000 });
    // Claim 10 actions to hit max_invocations: 10.
    for (let i = 0; i < 10; i++) {
      const res = store.mutate(fp, (lease) => {
        lease.claimed_actions.push(`action-${i}`);
        return { changed: true, data: { claimed: lease.claimed_actions.length } };
      });
      assert.equal(res.status, 'stored');
    }
    const inspected = store.inspect(fp, { now: NOW });
    assert.equal(inspected.is_expired, true);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('inspect on a missing lease_id returns null', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    assert.equal(store.inspect('nonexistent', { now: NOW }), null);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('no .tmp- files remain in root after mutations', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    store.setStatus(fp, 'paused', { now: NOW });
    store.setStatus(fp, 'completed', { now: NOW });
    const tmp = readdirSync(f.root).filter((n) => n.includes('.tmp-'));
    assert.deepEqual(tmp, []);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});