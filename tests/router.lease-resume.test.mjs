// Phase 40 — Plan 02, Task 2 (LEASE-05): Durable checkpoint claim +
// at-most-once resume.
//
// RED phase: failing tests asserting claimCheckpoint/releaseCheckpoint on
// createLeaseStore are durable (survive re-read from disk), and the claude.mjs
// resumeImpl uses the durable claim as the authoritative at-most-once gate
// (the in-memory _idempotencySeen Set is demoted to a hot-path fast-path).
//
// Adversarial: a second resume with the same idempotency_key is rejected
// even after a simulated restart clears the in-memory Set — the durable
// claimed_actions array on the lease record is authoritative (LEASE-05,
// Pitfall 2).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { computeLeaseFingerprint } from '../src/lease/identity.mjs';
import { createLeaseStore } from '../src/lease/store.mjs';
import { buildLeaseRecord } from '../src/lease/policy.mjs';
import {
  createClaudeDispatchAdapter,
  _resetIdempotencyForTest,
  _resetLeaseStoreForTest,
} from '../src/adapters/dispatch/claude.mjs';

const NOW = 1_800_000_000_000;

function fixture() {
  const owned = mkdtempSync(join(tmpdir(), 'router-lease-resume-'));
  return { owned, root: join(owned, 'leases') };
}

function makeLease(store, { expiryMs = NOW + 600_000 } = {}) {
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
    resourceBounds: { max_wall_ms: 60_000, max_invocations: 100, max_tokens: 8192 },
    expiryMs,
    authoritySource: { kind: 'operator', instruction: 'persist', class: 'persistent_goal_action' },
    checkpoint: null,
  });
  const created = store.createLease(record);
  assert.equal(created.status, 'stored');
  return { fp, record };
}

// ---------------------------------------------------------------------------
// Direct claimCheckpoint / releaseCheckpoint tests
// ---------------------------------------------------------------------------

test('claimCheckpoint first call → claimed:true, changed:true', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    const r = store.claimCheckpoint(fp, 'k1');
    assert.equal(r.claimed, true);
    assert.equal(r.changed, true);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('claimCheckpoint second call same actionId → claimed:false, reason already_claimed', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    store.claimCheckpoint(fp, 'k1');
    const r2 = store.claimCheckpoint(fp, 'k1');
    assert.equal(r2.claimed, false);
    assert.equal(r2.reason, 'already_claimed');
    assert.equal(r2.changed, false);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('claimCheckpoint distinct actionIds are independent — both claim', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    const r1 = store.claimCheckpoint(fp, 'k1');
    assert.equal(r1.claimed, true);
    const r2 = store.claimCheckpoint(fp, 'k2');
    assert.equal(r2.claimed, true);
    // k1 still already_claimed
    const r3 = store.claimCheckpoint(fp, 'k1');
    assert.equal(r3.claimed, false);
    assert.equal(r3.reason, 'already_claimed');
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('claimCheckpoint empty/null actionId → claimed:true no-op (mirrors claimIdempotency)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    assert.equal(store.claimCheckpoint(fp, '').claimed, true);
    assert.equal(store.claimCheckpoint(fp, null).claimed, true);
    assert.equal(store.claimCheckpoint(fp).claimed, true);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('claimCheckpoint null/missing leaseId → claimed:true fail-open (no lease to claim against)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    assert.equal(store.claimCheckpoint(null, 'k1').claimed, true);
    assert.equal(store.claimCheckpoint(undefined, 'k1').claimed, true);
    assert.equal(store.claimCheckpoint('', 'k1').claimed, true);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('claimCheckpoint claimed_actions survives re-read from disk (durable)', () => {
  const f = fixture();
  try {
    const store1 = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store1);
    store1.claimCheckpoint(fp, 'k1');
    // New store instance reading from the same root — the durable
    // claimed_actions array on the lease record persists on disk.
    const store2 = createLeaseStore({ root: f.root });
    const r = store2.claimCheckpoint(fp, 'k1');
    assert.equal(r.claimed, false);
    assert.equal(r.reason, 'already_claimed');
    // A distinct action still claims on the new instance.
    const r2 = store2.claimCheckpoint(fp, 'k2');
    assert.equal(r2.claimed, true);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('releaseCheckpoint removes the actionId from claimed_actions', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    store.claimCheckpoint(fp, 'k1');
    assert.equal(store.claimCheckpoint(fp, 'k1').claimed, false);
    store.releaseCheckpoint(fp, 'k1');
    // After release, the actionId can be claimed again.
    const r = store.claimCheckpoint(fp, 'k1');
    assert.equal(r.claimed, true);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('claimed_actions insertion order is stable across re-read (durable array)', () => {
  const f = fixture();
  try {
    const store1 = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store1);
    store1.claimCheckpoint(fp, 'k1');
    store1.claimCheckpoint(fp, 'k2');
    store1.claimCheckpoint(fp, 'k3');
    const inspected1 = store1.inspect(fp);
    assert.deepEqual(inspected1.claimed_actions, ['k1', 'k2', 'k3']);
    // Re-read from disk — order preserved.
    const store2 = createLeaseStore({ root: f.root });
    const inspected2 = store2.inspect(fp);
    assert.deepEqual(inspected2.claimed_actions, ['k1', 'k2', 'k3']);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// Adapter resumeImpl durable at-most-once test
// ---------------------------------------------------------------------------

function waitForCompletion(adapter, receiptId, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const r = adapter.observe(receiptId);
      if (r && ['completed', 'failed', 'recommendation_only'].includes(r.completion_evidence?.state)) {
        return resolve(r);
      }
      if (Date.now() > deadline) return reject(new Error(`timeout waiting for receipt ${receiptId} (state=${r?.completion_evidence?.state})`));
      setTimeout(tick, 10);
    };
    tick();
  });
}

async function setupLeaseAndAdapter(testHome) {
  // Create a lease under the test HOME's default lease root so the adapter's
  // getLeaseStore() finds the same store.
  const leaseStore = createLeaseStore({ runtime: 'claude' });
  const { fp, record } = makeLease(leaseStore);
  _resetLeaseStoreForTest();
  _resetIdempotencyForTest();
  const adapter = createClaudeDispatchAdapter();
  return { fp, record, adapter, leaseStore };
}

test('LEASE-05 at-most-once: second resume with same key is rejected by the durable claim', async () => {
  const TEST_HOME = mkdtempSync(join(tmpdir(), 'router-lease-resume-adapter-'));
  const savedHome = process.env.HOME;
  process.env.HOME = TEST_HOME;
  try {
    const { fp, adapter } = await setupLeaseAndAdapter(TEST_HOME);
    const action = {
      lease_id: fp,
      idempotency_key: 'k1',
      intent: 'lease-05-test',
      authority: 'operator-authorized',
      risk: 'harmless-fixture',
    };

    // 1. invoke → invoked → completed
    const invoked = adapter.invoke(action);
    assert.equal(invoked.completion_evidence.state, 'invoked');
    const completed = await waitForCompletion(adapter, invoked.receipt_id);
    assert.equal(completed.completion_evidence.state, 'completed');

    // 2. pause → paused
    const paused = adapter.pause(invoked.receipt_id);
    assert.equal(paused.completion_evidence.state, 'paused');

    // 3. first resume → claimCheckpoint returns claimed:true → re-spawn
    const resumed1 = adapter.resume(invoked.receipt_id);
    assert.ok(resumed1, 'first resume must return a receipt');
    const resumed1Final = await waitForCompletion(adapter, resumed1.receipt_id);
    assert.equal(resumed1Final.completion_evidence.state, 'completed');

    // 4. re-pause so the receipt is resumable again
    const paused2 = adapter.pause(invoked.receipt_id);
    assert.equal(paused2.completion_evidence.state, 'paused');

    // 5. second resume with the same key → durable claim returns already_claimed
    //    → resumeImpl returns the existing paused receipt WITHOUT re-spawning.
    const resumed2 = adapter.resume(invoked.receipt_id);
    assert.ok(resumed2, 'second resume must return a receipt');
    assert.equal(resumed2.completion_evidence.state, 'paused',
      'second resume with same key must return the existing paused receipt (at-most-once, no re-spawn)');

    // 6. simulated restart: clear the in-memory _idempotencySeen Set.
    //    The durable claimed_actions array on the lease record is the
    //    authoritative gate — a third resume is still rejected.
    _resetIdempotencyForTest();

    // 7. re-pause and attempt a third resume — still rejected by the durable claim
    const paused3 = adapter.pause(invoked.receipt_id);
    assert.equal(paused3.completion_evidence.state, 'paused');
    const resumed3 = adapter.resume(invoked.receipt_id);
    assert.ok(resumed3, 'third resume must return a receipt');
    assert.equal(resumed3.completion_evidence.state, 'paused',
      'third resume after simulated restart must still be rejected by the durable claim (LEASE-05, Pitfall 2)');

    // Verify the durable claim is on the lease record
    const leaseStore2 = createLeaseStore({ runtime: 'claude' });
    const inspected = leaseStore2.inspect(fp);
    assert.ok(inspected.claimed_actions.includes('k1'),
      'the durable claimed_actions array on the lease must contain k1');
  } finally {
    process.env.HOME = savedHome;
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

test('LEASE-05 adjacency: distinct actionIds claim independently on the resume path', async () => {
  const TEST_HOME = mkdtempSync(join(tmpdir(), 'router-lease-resume-distinct-'));
  const savedHome = process.env.HOME;
  process.env.HOME = TEST_HOME;
  try {
    const { fp, adapter } = await setupLeaseAndAdapter(TEST_HOME);
    // First action with k1
    const action1 = {
      lease_id: fp, idempotency_key: 'k1',
      intent: 'distinct-1', authority: 'operator-authorized', risk: 'harmless-fixture',
    };
    const invoked1 = adapter.invoke(action1);
    await waitForCompletion(adapter, invoked1.receipt_id);
    adapter.pause(invoked1.receipt_id);
    const resumed1 = adapter.resume(invoked1.receipt_id);
    assert.ok(resumed1, 'resume with k1 must succeed (first claim)');
    await waitForCompletion(adapter, resumed1.receipt_id);

    // Second action with k2 — must claim independently
    const action2 = {
      lease_id: fp, idempotency_key: 'k2',
      intent: 'distinct-2', authority: 'operator-authorized', risk: 'harmless-fixture',
    };
    const invoked2 = adapter.invoke(action2);
    await waitForCompletion(adapter, invoked2.receipt_id);
    adapter.pause(invoked2.receipt_id);
    const resumed2 = adapter.resume(invoked2.receipt_id);
    assert.ok(resumed2, 'resume with k2 must succeed (distinct action, independent claim)');
    await waitForCompletion(adapter, resumed2.receipt_id);

    // Both k1 and k2 are on the durable claimed_actions array
    const leaseStore = createLeaseStore({ runtime: 'claude' });
    const inspected = leaseStore.inspect(fp);
    assert.ok(inspected.claimed_actions.includes('k1'));
    assert.ok(inspected.claimed_actions.includes('k2'));
  } finally {
    process.env.HOME = savedHome;
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

test('LEASE-05 empty actionId: claimCheckpoint returns claimed:true (no-op on resume path)', () => {
  const f = fixture();
  try {
    const store = createLeaseStore({ root: f.root });
    const { fp } = makeLease(store);
    // Empty actionId → no-op (mirrors claimIdempotency's `if (!key) return true`)
    const r = store.claimCheckpoint(fp, '');
    assert.equal(r.claimed, true);
    // The claimed_actions array is not modified by a no-op claim
    const inspected = store.inspect(fp);
    assert.deepEqual(inspected.claimed_actions, []);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});