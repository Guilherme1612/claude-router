import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createLeaseStore } from '../src/lease/store.mjs';
import { ReceiptStore } from '../src/adapters/dispatch/receipt.mjs';

const leaseId = 'a'.repeat(64);
const record = {
  lease_id: leaseId,
  project_fingerprint: 'b'.repeat(64),
  status: 'active',
  expiry: { deterministic_at_ms: Date.now() + 60_000 },
  freshness_evidence: { fingerprint_match: true },
  claimed_actions: [],
};

test('lease store rejects escaping IDs before constructing a path', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-storage-'));
  const store = createLeaseStore({ root: join(root, 'leases') });
  for (const invalid of ['../escape', '/tmp/escape', '', 'not-hex']) {
    const result = store.createLease({ ...record, lease_id: invalid });
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason_code, 'invalid_lease_id');
  }
});

test('lease creation is covered by the mutation lock transaction', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-storage-lock-'));
  const leases = join(root, 'leases');
  mkdirSync(join(leases, '.mutation.lock'), { recursive: true, mode: 0o700 });
  writeFileSync(join(leases, '.mutation.lock', 'owner.json'), JSON.stringify({
    token: 'held', pid: process.pid, started_at: Date.now(),
  }), { mode: 0o600 });
  const store = createLeaseStore({ root: leases, lock: { timeout_ms: 0 } });
  const result = store.createLease(record);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason_code, 'mutation_lock_timeout');
});

test('lease root and record use private modes', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-storage-mode-'));
  const leases = join(root, 'leases');
  const store = createLeaseStore({ root: leases });
  assert.equal(statSync(leases).mode & 0o777, 0o700);
  assert.equal(store.createLease(record).status, 'stored');
  assert.equal(statSync(join(leases, `${leaseId}.json`)).mode & 0o777, 0o600);
});

test('receipt reads reject escaping IDs at the store boundary', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-receipt-'));
  const outside = join(root, '..', `${root.split('/').pop()}-escape.json`);
  writeFileSync(outside, JSON.stringify({ receipt_id: '../escape' }));
  const store = new ReceiptStore({ dir: root, logPath: join(root, 'receipts.jsonl') });
  assert.equal(store.observe('../escape'), null);
});
