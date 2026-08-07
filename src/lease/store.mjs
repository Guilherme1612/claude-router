// src/lease/store.mjs — Phase 40, Plan 01 (LEASE-01 + LEASE-03).
//
// Durable lease store: one-lease-per-file JSON under <root>/<lease_id>.json.
// Reuses the mutationLock (mkdir-based, stale-PID recovery) and durableWrite
// (temp+fsync+rename+dir-fsync) patterns VERBATIM from src/steward/state.mjs
// — copied here so the lease store is self-contained for the deploy bundle
// (does not import state.mjs internals, mirroring authority.mjs).
//
// Per-runtime partition (T-40-07 cross-runtime isolation, mirrors
// receipt.mjs defaultReceiptRoot): claude → ~/.claude/router/leases,
// codex → ~/.codex/router/leases. Never hardcoded /Users/guilherme.
//
// Fail-closed read (T-40-03 tampering mitigation): readLease returns null on
// missing/corrupt JSON — no garbage record ever authorizes work.

import { randomUUID } from 'node:crypto';
import {
  closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync,
  readdirSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { stableStringify } from '../registry/schema.mjs';

const waitArray = new Int32Array(new SharedArrayBuffer(4));

// Resolve the per-runtime lease root. claude → ~/.claude/router/leases,
// codex → ~/.codex/router/leases (T-40-07 cross-runtime partition).
export function defaultLeaseRoot(runtime) {
  const dir = runtime === 'codex' ? '.codex' : '.claude';
  return join(homedir(), dir, 'router', 'leases');
}

function mutationLock(root, { timeout_ms = 2_000, stale_ms = 30_000 } = {}) {
  const path = join(root, '.mutation.lock');
  const deadline = Date.now() + timeout_ms;
  const token = randomUUID();
  while (Date.now() <= deadline) {
    try {
      mkdirSync(path, { mode: 0o700 });
      writeFileSync(join(path, 'owner.json'), JSON.stringify({ token, pid: process.pid, started_at: Date.now() }), { mode: 0o600 });
      return {
        acquired: true,
        release() {
          try {
            const owner = JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8'));
            if (owner.token === token) rmSync(path, { recursive: true, force: true });
          } catch { /* ownership changed */ }
        },
      };
    } catch (error) {
      if (error.code !== 'EEXIST') return { acquired: false, reason_code: 'mutation_lock_failed' };
      try {
        const owner = JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8'));
        let alive = true;
        try { process.kill(owner.pid, 0); } catch { alive = false; }
        if (!alive && Date.now() - owner.started_at > stale_ms) {
          rmSync(path, { recursive: true, force: true });
          continue;
        }
      } catch { /* owner may still be publishing */ }
      Atomics.wait(waitArray, 0, 0, 10);
    }
  }
  return { acquired: false, reason_code: 'mutation_lock_timeout' };
}

function durableWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(tmp, `${stableStringify(value)}\n`, { mode: 0o600 });
  let fd;
  try { fd = openSync(tmp, 'r'); fsyncSync(fd); } finally { if (fd !== undefined) closeSync(fd); }
  renameSync(tmp, path);
  try { fd = openSync(dirname(path), 'r'); fsyncSync(fd); } catch { /* best effort */ } finally { if (fd !== undefined) try { closeSync(fd); } catch { /* best effort */ } }
}

export function createLeaseStore({ root, runtime, lock: lockOptions } = {}) {
  const leaseRoot = root || defaultLeaseRoot(runtime || 'claude');
  mkdirSync(leaseRoot, { recursive: true, mode: 0o700 });

  function readLease(leaseId) {
    try {
      const path = join(leaseRoot, `${leaseId}.json`);
      if (!existsSync(path)) return null;
      const data = JSON.parse(readFileSync(path, 'utf8'));
      return data && typeof data === 'object' ? data : null;
    } catch {
      // T-40-03 fail-closed: corrupt/missing lease never authorizes work.
      return null;
    }
  }

  function createLease(record) {
    const leaseId = record && record.lease_id;
    if (!leaseId) return { status: 'blocked', reason_code: 'invalid_lease_id' };
    const existing = readLease(leaseId);
    if (existing && existing.project_fingerprint === record.project_fingerprint) {
      // LEASE-03 adjacency: identical six-axis fingerprint ⇒ same lease.
      return { status: 'unchanged', lease_id: leaseId };
    }
    durableWrite(join(leaseRoot, `${leaseId}.json`), record);
    return { status: 'stored', lease_id: leaseId };
  }

  function findByFingerprint(fp) {
    // Read-only: no lock. Scans readdirSync for *.json, readLease each.
    let names;
    try { names = readdirSync(leaseRoot); } catch { return null; }
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const lease = readLease(name.slice(0, -5));
      if (lease && lease.project_fingerprint === fp) return lease;
    }
    return null;
  }

  function mutate(leaseId, cb) {
    const lock = mutationLock(leaseRoot, lockOptions);
    if (!lock.acquired) return { status: 'blocked', reason_code: lock.reason_code };
    try {
      const lease = readLease(leaseId);
      if (!lease) return { status: 'blocked', reason_code: 'lease_not_found' };
      const result = cb(lease);
      if (!result.changed) return { status: 'unchanged', ...result.data };
      durableWrite(join(leaseRoot, `${leaseId}.json`), lease);
      return { status: 'stored', ...result.data };
    } finally { lock.release(); }
  }

  return Object.freeze({
    leaseRoot,
    readLease,
    createLease,
    findByFingerprint,
    mutate,
  });
}