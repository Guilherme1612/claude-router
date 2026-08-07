// Phase 40 — Plan 03, Task 1 (LEASE-06): continuity briefing composer.
// RED phase: failing tests asserting first-visit silent, one evidence-backed
// briefing on return, eight invalid states silent, throw paths fail-open to null.
//
// LEASE-06 hard constraint: first visit silent; returning project at most one
// evidence-backed briefing; completed/blocked/expired/revoked/corrupt/stale/
// unauthorized/foreign never auto-run; never inline raw prompt text.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { computeLeaseFingerprint } from '../src/lease/identity.mjs';
import { createLeaseStore } from '../src/lease/store.mjs';
import { buildLeaseRecord } from '../src/lease/policy.mjs';
import { composeBriefing, BRIEFING_POLICY_VERSION } from '../src/lease/briefing.mjs';

const NOW = 1_800_000_000_000;

function fixture() {
  const owned = mkdtempSync(join(tmpdir(), 'router-lease-briefing-'));
  return { owned, root: join(owned, 'leases') };
}

function makeLease(store, { expiryMs = NOW + 60_000, fingerprintMatch = true, checkpoint = null } = {}) {
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
    checkpoint,
  });
  // Force fingerprint_match on the stored record when requested.
  if (!fingerprintMatch && record.freshness_evidence) {
    record.freshness_evidence.fingerprint_match = false;
  }
  const created = store.createLease(record);
  assert.equal(created.status, 'stored');
  return { fp, record };
}

test('BRIEFING_POLICY_VERSION is the v1 string', () => {
  assert.equal(BRIEFING_POLICY_VERSION, 'briefing-policy-v1');
});

test('first Router visit (no lease for fingerprint) → null (LEASE-06 silent)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const result = composeBriefing({ projectFingerprint: 'no-such-fingerprint', leaseStore: store, now: NOW });
    assert.equal(result, null);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('active non-expired fingerprint-matching lease → one evidence-backed briefing', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const checkpoint = { receipt_id: 'rcpt-1', action_id: 'act-1', state: 'paused', at_ms: NOW - 1000 };
    const { fp, record } = makeLease(store, { expiryMs: NOW + 60_000, checkpoint });
    const result = composeBriefing({ projectFingerprint: fp, leaseStore: store, now: NOW });
    assert.ok(result);
    assert.equal(result.briefing, true);
    assert.equal(result.lease_id, fp);
    assert.equal(result.briefing_status, 'active');
    assert.equal(result.policy_version, BRIEFING_POLICY_VERSION);
    // evidence references the last_safe_checkpoint (receipt IDs), not raw prompt text.
    assert.deepEqual(result.evidence, record.last_safe_checkpoint);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('status completed → null (briefing_status completed internally)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    assert.equal(store.setStatus(fp, 'completed', { now: NOW }).status, 'stored');
    assert.equal(composeBriefing({ projectFingerprint: fp, leaseStore: store, now: NOW }), null);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('status blocked → null (briefing_status blocked)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    assert.equal(store.setStatus(fp, 'blocked', { now: NOW }).status, 'stored');
    assert.equal(composeBriefing({ projectFingerprint: fp, leaseStore: store, now: NOW }), null);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('status revoked → null (briefing_status revoked)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    assert.equal(store.setStatus(fp, 'revoked', { now: NOW }).status, 'stored');
    assert.equal(composeBriefing({ projectFingerprint: fp, leaseStore: store, now: NOW }), null);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('status expired (enum) → null (briefing_status expired)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    assert.equal(store.setStatus(fp, 'expired', { now: NOW }).status, 'stored');
    assert.equal(composeBriefing({ projectFingerprint: fp, leaseStore: store, now: NOW }), null);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('isExpired true (status active, deadline passed) → null (briefing_status expired)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store, { expiryMs: NOW - 1 });
    assert.equal(composeBriefing({ projectFingerprint: fp, leaseStore: store, now: NOW }), null);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('fingerprint_match false → null (briefing_status foreign)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store, { fingerprintMatch: false });
    assert.equal(composeBriefing({ projectFingerprint: fp, leaseStore: store, now: NOW }), null);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('corrupt store (bad JSON on lease file) → null (fail-closed readLease → findByFingerprint null)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    // Corrupt the on-disk lease file so readLease fails closed.
    writeFileSync(join(f.root, `${fp}.json`), '{bad json');
    assert.equal(composeBriefing({ projectFingerprint: fp, leaseStore: store, now: NOW }), null);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('status stale (out-of-enum, written directly) → null (briefing_status stale)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp, record } = makeLease(store);
    // Write a status value outside the setStatus enum (tampered record).
    const tampered = { ...record, status: 'stale' };
    writeFileSync(join(f.root, `${fp}.json`), `${JSON.stringify(tampered)}\n`);
    assert.equal(composeBriefing({ projectFingerprint: fp, leaseStore: store, now: NOW }), null);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('status unauthorized (out-of-enum, written directly) → null (briefing_status unauthorized)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp, record } = makeLease(store);
    const tampered = { ...record, status: 'unauthorized' };
    writeFileSync(join(f.root, `${fp}.json`), `${JSON.stringify(tampered)}\n`);
    assert.equal(composeBriefing({ projectFingerprint: fp, leaseStore: store, now: NOW }), null);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('status corrupt (out-of-enum, written directly) → null (briefing_status corrupt)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp, record } = makeLease(store);
    const tampered = { ...record, status: 'corrupt' };
    writeFileSync(join(f.root, `${fp}.json`), `${JSON.stringify(tampered)}\n`);
    assert.equal(composeBriefing({ projectFingerprint: fp, leaseStore: store, now: NOW }), null);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('leaseStore.findByFingerprint throws → null (fail-open)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    const throwingStore = {
      ...store,
      findByFingerprint: () => { throw new Error('store io failure'); },
      isExpired: store.isExpired,
    };
    assert.equal(composeBriefing({ projectFingerprint: fp, leaseStore: throwingStore, now: NOW }), null);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('all eight invalid states produce null (LEASE-06 backstop)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp, record } = makeLease(store);
    const invalid = ['completed', 'blocked', 'expired', 'revoked', 'corrupt', 'stale', 'unauthorized', 'foreign'];
    for (const status of invalid) {
      const tampered = { ...record, status };
      writeFileSync(join(f.root, `${fp}.json`), `${JSON.stringify(tampered)}\n`);
      assert.equal(composeBriefing({ projectFingerprint: fp, leaseStore: store, now: NOW }), null, `status=${status}`);
    }
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('briefing output references receipt IDs, never raw prompt text', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const checkpoint = { receipt_id: 'rcpt-7', action_id: 'act-7', state: 'paused', at_ms: NOW - 500 };
    const { fp } = makeLease(store, { checkpoint });
    const result = composeBriefing({ projectFingerprint: fp, leaseStore: store, now: NOW });
    assert.ok(result);
    const serialized = JSON.stringify(result);
    // The evidence field is the last_safe_checkpoint object referencing receipt_id.
    assert.match(serialized, /rcpt-7/);
    // No raw prompt text leaks into the briefing payload.
    assert.doesNotMatch(serialized, /prompt/i);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});