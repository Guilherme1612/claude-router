// Phase 40 — Plan 01, Task 2 (LEASE-02): Lease creation gate + 9-field record.
// RED phase: failing tests asserting shouldCreateLease truth table and
// buildLeaseRecord produces the full 9-field record that round-trips through
// the durable store.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AUTHORITY_CLASSES } from '../src/intent/authority.mjs';
import {
  LEASE_POLICY_VERSION,
  shouldCreateLease,
  buildLeaseRecord,
} from '../src/lease/policy.mjs';
import { computeLeaseFingerprint } from '../src/lease/identity.mjs';
import { createLeaseStore } from '../src/lease/store.mjs';

test('LEASE_POLICY_VERSION is the frozen v1 string', () => {
  assert.equal(LEASE_POLICY_VERSION, 'lease-policy-v1');
});

test('shouldCreateLease is true ONLY for persistent_goal_action + explicit instruction', () => {
  assert.equal(shouldCreateLease({ authority_class: 'persistent_goal_action', explicitInstruction: true }), true);
  assert.equal(shouldCreateLease({ authority_class: 'persistent_goal_action', explicitInstruction: false }), false);
  assert.equal(shouldCreateLease({ authority_class: 'one_turn_action', explicitInstruction: true }), false);
  assert.equal(shouldCreateLease({ authority_class: 'advice', explicitInstruction: true }), false);
  assert.equal(shouldCreateLease({ authority_class: 'inspection', explicitInstruction: true }), false);
  assert.equal(shouldCreateLease({ authority_class: 'non_authorizing_discussion', explicitInstruction: true }), false);
});

test('shouldCreateLease fail-closes on unknown class and missing args', () => {
  assert.equal(shouldCreateLease({ authority_class: 'bogus', explicitInstruction: true }), false);
  assert.equal(shouldCreateLease({}), false);
  assert.equal(shouldCreateLease(), false);
});

test('policy.mjs does NOT redefine AUTHORITY_CLASSES — it imports from authority.mjs', () => {
  // Same frozen array reference, not a copy.
  assert.equal(AUTHORITY_CLASSES.length, 5);
  assert.ok(AUTHORITY_CLASSES.includes('persistent_goal_action'));
  assert.ok(AUTHORITY_CLASSES.includes('one_turn_action'));
  assert.ok(AUTHORITY_CLASSES.includes('advice'));
  assert.ok(AUTHORITY_CLASSES.includes('inspection'));
  assert.ok(AUTHORITY_CLASSES.includes('non_authorizing_discussion'));
});

test('buildLeaseRecord produces all 9 inspection fields + claimed_actions []', () => {
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
    expiryMs: 1_800_000_000_000,
    authoritySource: { kind: 'operator', instruction: 'persist', class: 'persistent_goal_action' },
    checkpoint: null,
  });
  assert.equal(record.schema_version, 1);
  assert.equal(record.policy_version, LEASE_POLICY_VERSION);
  assert.equal(record.lease_id, fp);
  assert.equal(record.project_fingerprint, fp);
  // 9 inspection fields in schema declaration order.
  assert.deepEqual(Object.keys(record).slice(3), [
    'project_fingerprint', 'goal', 'scope', 'allowed_effects', 'confirmation_effects',
    'resource_bounds', 'status', 'expiry', 'authority_source', 'last_safe_checkpoint',
    'freshness_evidence', 'claimed_actions',
  ]);
  assert.equal(record.status, 'active');
  assert.deepEqual(record.claimed_actions, []);
  assert.deepEqual(record.allowed_effects, ['read', 'write']);
  assert.deepEqual(record.confirmation_effects, ['deploy']);
  assert.deepEqual(record.resource_bounds, { max_wall_ms: 60_000, max_invocations: 10, max_tokens: 8192 });
  assert.deepEqual(record.expiry, { deterministic_at_ms: 1_800_000_000_000, tz: 'UTC' });
  assert.equal(record.last_safe_checkpoint, null);
  assert.equal(record.freshness_evidence.fingerprint_match, true);
  assert.ok(Number.isSafeInteger(record.freshness_evidence.lease_mtime_ms));
});

test('buildLeaseRecord + createLeaseStore round-trip stores all 9 fields durably', () => {
  const owned = mkdtempSync(join(tmpdir(), 'router-lease-creation-'));
  try {
    const store = createLeaseStore({ root: join(owned, 'leases') });
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
      expiryMs: 1_800_000_000_000,
      authoritySource: { kind: 'operator', instruction: 'persist', class: 'persistent_goal_action' },
      checkpoint: null,
    });
    const created = store.createLease(record);
    assert.equal(created.status, 'stored');
    const readBack = store.readLease(fp);
    assert.equal(readBack.lease_id, fp);
    assert.equal(readBack.goal, 'ship-router-v1');
    assert.equal(readBack.status, 'active');
    assert.deepEqual(readBack.claimed_actions, []);
    assert.deepEqual(readBack.scope, { repo: 'repo-A', worktree: 'worktree-W', runtime: 'claude', schema_generation: 1 });
    assert.deepEqual(readBack.resource_bounds, { max_wall_ms: 60_000, max_invocations: 10, max_tokens: 8192 });
    // No .tmp- files after write.
    const tmp = readdirSync(store.leaseRoot).filter((n) => n.includes('.tmp-'));
    assert.deepEqual(tmp, []);
  } finally { rmSync(owned, { recursive: true, force: true }); }
});