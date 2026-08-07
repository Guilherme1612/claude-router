// Phase 40 — Plan 02, Task 1 (LEASE-04): Lease authority resolution +
// hot-path revocation precedence.
//
// RED phase: failing tests asserting resolveLeaseAuthority returns five
// distinct {authGranted, source, reason_code} shapes (active, revoked,
// expired, foreign, absent) + the fail-open 'lease_read_failed' shape; a
// revoked lease overrides high-confidence eligible routes (LEASE-04
// precedence); the protected-effect pause still fires for a leased
// protected effect (Pitfall 1 backstop).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { computeLeaseFingerprint } from '../src/lease/identity.mjs';
import { createLeaseStore } from '../src/lease/store.mjs';
import {
  buildLeaseRecord,
  resolveLeaseAuthority,
} from '../src/lease/policy.mjs';
import { evaluateAuthorityPolicy } from '../src/intent/authority.mjs';

const NOW = 1_800_000_000_000;

function fixture() {
  const owned = mkdtempSync(join(tmpdir(), 'router-lease-revoke-'));
  return { owned, root: join(owned, 'leases') };
}

function makeLease(store, {
  expiryMs = NOW + 60_000,
  fingerprintMatch = true,
} = {}) {
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
  if (!fingerprintMatch) {
    record.freshness_evidence.fingerprint_match = false;
  }
  const created = store.createLease(record);
  assert.equal(created.status, 'stored');
  return { fp, record };
}

// Compose resolveLeaseAuthority → evaluateAuthorityPolicy exactly as the
// router hot path does (mirrors evaluateAuthorityHint's lease consultation).
// Returns the final policy decision.
function leasePolicyDecision({ leaseAuth, confidence = 'high', protected_ = false, eligible = true }) {
  let authGranted = eligible;
  let source = null;
  if (leaseAuth.authGranted === true) {
    authGranted = true;
    source = leaseAuth.source;
  } else if (leaseAuth.reason_code !== 'lease_absent') {
    authGranted = false;
    source = leaseAuth.source;
  }
  return evaluateAuthorityPolicy({
    confidence,
    authority: { authGranted, protected_, ...(source ? { source } : {}) },
    risk: { reversible: true, local: true },
    compatibility: { eligible, disposition: eligible ? 'dispatch-candidate' : 'non-dispatch' },
  });
}

test('resolveLeaseAuthority: active lease → authGranted true, source lease:<id>', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store, { expiryMs: NOW + 60_000 });
    const result = resolveLeaseAuthority({ projectFingerprint: fp, leaseStore: store, now: NOW });
    assert.equal(result.authGranted, true);
    assert.equal(result.source, `lease:${fp}`);
    assert.equal(result.reason_code, 'lease_active');
    assert.ok(result.lease, 'active result must carry the lease record');
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('resolveLeaseAuthority: revoked lease → authGranted false, source lease:revoked', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    store.setStatus(fp, 'revoked', { now: NOW });
    const result = resolveLeaseAuthority({ projectFingerprint: fp, leaseStore: store, now: NOW });
    assert.equal(result.authGranted, false);
    assert.equal(result.source, 'lease:revoked');
    assert.equal(result.reason_code, 'revoked');
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('resolveLeaseAuthority: expired lease → authGranted false, source lease:expired', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store, { expiryMs: NOW - 1_000 });
    const result = resolveLeaseAuthority({ projectFingerprint: fp, leaseStore: store, now: NOW });
    assert.equal(result.authGranted, false);
    assert.equal(result.source, 'lease:expired');
    assert.equal(result.reason_code, 'expired');
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('resolveLeaseAuthority: fingerprint mismatch → authGranted false, source lease:foreign', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store, { fingerprintMatch: false });
    const result = resolveLeaseAuthority({ projectFingerprint: fp, leaseStore: store, now: NOW });
    assert.equal(result.authGranted, false);
    assert.equal(result.source, 'lease:foreign');
    assert.equal(result.reason_code, 'fingerprint_mismatch');
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('resolveLeaseAuthority: no lease for fingerprint → lease_absent', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const result = resolveLeaseAuthority({
      projectFingerprint: 'nonexistent-fp',
      leaseStore: store,
      now: NOW,
    });
    assert.equal(result.authGranted, false);
    assert.equal(result.source, 'none');
    assert.equal(result.reason_code, 'lease_absent');
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('resolveLeaseAuthority: corrupt JSON file → lease_absent (readLease fail-closed)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    // Corrupt the lease file on disk. readLease is fail-closed (returns null),
    // so findByFingerprint returns null → lease_absent. The store never throws
    // on corrupt JSON (T-40-03 mitigation in store.mjs).
    writeFileSync(join(f.root, `${fp}.json`), '{bad json', { mode: 0o600 });
    const result = resolveLeaseAuthority({ projectFingerprint: fp, leaseStore: store, now: NOW });
    assert.equal(result.authGranted, false);
    assert.equal(result.reason_code, 'lease_absent');
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('resolveLeaseAuthority: throwing leaseStore → lease_read_failed (fail-open)', () => {
  // A store whose findByFingerprint throws must not propagate the throw;
  // resolveLeaseAuthority catches it and returns lease_read_failed.
  const throwingStore = {
    findByFingerprint() { throw new Error('boom'); },
    isExpired() { return false; },
  };
  const result = resolveLeaseAuthority({
    projectFingerprint: 'any-fp',
    leaseStore: throwingStore,
    now: NOW,
  });
  assert.equal(result.authGranted, false);
  assert.equal(result.source, 'none');
  assert.equal(result.reason_code, 'lease_read_failed');
});

test('resolveLeaseAuthority: null/missing leaseStore → lease_absent (fail-open)', () => {
  const r1 = resolveLeaseAuthority({ projectFingerprint: 'fp', leaseStore: null, now: NOW });
  assert.equal(r1.reason_code, 'lease_absent');
  const r2 = resolveLeaseAuthority({ projectFingerprint: 'fp', now: NOW });
  assert.equal(r2.reason_code, 'lease_absent');
});

test('LEASE-04 precedence: revoked lease + high confidence + eligible route → authority_not_granted (block)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    store.setStatus(fp, 'revoked', { now: NOW });
    const leaseAuth = resolveLeaseAuthority({ projectFingerprint: fp, leaseStore: store, now: NOW });
    assert.equal(leaseAuth.authGranted, false);
    assert.equal(leaseAuth.reason_code, 'revoked');
    // Compose with the policy: high confidence, eligible route, but the lease
    // overrides authGranted=false (LEASE-04 precedence over confidence/eligible).
    const policy = leasePolicyDecision({
      leaseAuth,
      confidence: 'high',
      protected_: false,
      eligible: true,
    });
    assert.equal(policy.decision, 'block');
    assert.equal(policy.reason_code, 'authority_not_granted');
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('LEASE-04 precedence: active lease + eligible → proceeds even on medium confidence', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store, { expiryMs: NOW + 60_000 });
    const leaseAuth = resolveLeaseAuthority({ projectFingerprint: fp, leaseStore: store, now: NOW });
    assert.equal(leaseAuth.authGranted, true);
    const policy = leasePolicyDecision({
      leaseAuth,
      confidence: 'medium',
      protected_: false,
      eligible: true,
    });
    assert.equal(policy.decision, 'proceed');
    assert.equal(policy.reason_code, 'reversible_local_authorized');
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('Pitfall 1 backstop: leased protected effect still pauses (leg 2 unchanged)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store, { expiryMs: NOW + 60_000 });
    const leaseAuth = resolveLeaseAuthority({ projectFingerprint: fp, leaseStore: store, now: NOW });
    assert.equal(leaseAuth.authGranted, true);
    // A leased PROTECTED effect: authGranted=true (from lease) but protected_=true.
    // The protected-effect pause (leg 2) must fire BEFORE the authority leg (leg 3),
    // so the lease does NOT bypass the pause (Pitfall 1).
    const policy = leasePolicyDecision({
      leaseAuth,
      confidence: 'high',
      protected_: true,
      eligible: true,
    });
    assert.equal(policy.decision, 'pause');
    assert.equal(policy.reason_code, 'protected_effect_requires_confirmation');
    assert.equal(policy.authGranted, true);
    assert.equal(policy.protected_, true);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('LEASE-04 precedence: expired lease overrides eligible + high confidence', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store, { expiryMs: NOW - 1_000 });
    const leaseAuth = resolveLeaseAuthority({ projectFingerprint: fp, leaseStore: store, now: NOW });
    assert.equal(leaseAuth.authGranted, false);
    assert.equal(leaseAuth.reason_code, 'expired');
    const policy = leasePolicyDecision({
      leaseAuth,
      confidence: 'high',
      protected_: false,
      eligible: true,
    });
    assert.equal(policy.decision, 'block');
    assert.equal(policy.reason_code, 'authority_not_granted');
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('LEASE-04 precedence: foreign lease overrides eligible + high confidence', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store, { fingerprintMatch: false });
    const leaseAuth = resolveLeaseAuthority({ projectFingerprint: fp, leaseStore: store, now: NOW });
    assert.equal(leaseAuth.authGranted, false);
    assert.equal(leaseAuth.reason_code, 'fingerprint_mismatch');
    const policy = leasePolicyDecision({
      leaseAuth,
      confidence: 'high',
      protected_: false,
      eligible: true,
    });
    assert.equal(policy.decision, 'block');
    assert.equal(policy.reason_code, 'authority_not_granted');
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('LEASE-04 absent lease: no override — eligible route keeps authGranted from eligible', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const leaseAuth = resolveLeaseAuthority({
      projectFingerprint: 'no-such-lease',
      leaseStore: store,
      now: NOW,
    });
    assert.equal(leaseAuth.reason_code, 'lease_absent');
    // lease_absent → no override; authGranted stays from eligible (true).
    const policy = leasePolicyDecision({
      leaseAuth,
      confidence: 'high',
      protected_: false,
      eligible: true,
    });
    assert.equal(policy.decision, 'proceed');
    assert.equal(policy.reason_code, 'reversible_local_authorized');
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});