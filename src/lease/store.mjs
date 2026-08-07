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

// LEASE-03 durable status enum. setStatus validates against this set; an
// unknown status returns {status:'blocked', reason_code:'invalid_status'}
// rather than writing a garbage value (T-40-03 tampering mitigation).
const LEASE_STATUS_SET = new Set([
  'active', 'paused', 'completed', 'blocked', 'expired', 'revoked',
]);

/**
 * LEASE-03 expiry predicate. True when the deterministic wall-clock deadline
 * has passed OR the per-lease invocation budget is exhausted. v1 enforces:
 *   - expiry.deterministic_at_ms <= now
 *   - claimed_actions.length >= resource_bounds.max_invocations (when max_invocations > 0)
 * max_wall_ms and max_tokens enforcement is deferred to Phase 41+ (see PLAN
 * deferred note): the fields are inspectable per LEASE-03 but the runtime
 * guard is partial on purpose.
 */
export function isExpired(lease, now = Date.now()) {
  if (!lease || !lease.expiry) return true;
  if (Number.isSafeInteger(lease.expiry.deterministic_at_ms)
      && lease.expiry.deterministic_at_ms <= now) return true;
  const bounds = lease.resource_bounds;
  const maxInvocations = bounds && bounds.max_invocations;
  if (Number.isSafeInteger(maxInvocations) && maxInvocations > 0) {
    const claimed = Array.isArray(lease.claimed_actions) ? lease.claimed_actions.length : 0;
    if (claimed >= maxInvocations) return true;
  }
  return false;
}

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

  function setStatus(leaseId, status, { now = Date.now() } = {}) {
    if (!LEASE_STATUS_SET.has(status)) {
      return { status: 'blocked', reason_code: 'invalid_status' };
    }
    return mutate(leaseId, (lease) => {
      if (lease.status === status) return { changed: false };
      lease.status = status;
      // Refresh freshness evidence on durable status transitions so callers
      // can observe that the record was touched (LEASE-03 inspectability).
      if (lease.freshness_evidence && typeof lease.freshness_evidence === 'object') {
        lease.freshness_evidence.lease_mtime_ms = now;
      }
      // NOTE: do not put `status` in `data` — the mutate wrapper spreads data
      // over its own `status` field and would overwrite the outer 'stored'.
      return { changed: true, data: { new_status: status } };
    });
  }

  // LEASE-03 inspect: rebuild the record in schema declaration order. The
  // on-disk file is alphabetized by stableStringify, but the inspection
  // contract (PLAN must_haves: LEASE-03 ordering edge) requires the 9-field
  // declaration order.
  function inspect(leaseId, { now = Date.now() } = {}) {
    const lease = readLease(leaseId);
    if (!lease) return null;
    return {
      schema_version: lease.schema_version,
      policy_version: lease.policy_version,
      lease_id: lease.lease_id,
      project_fingerprint: lease.project_fingerprint,
      goal: lease.goal,
      scope: lease.scope,
      allowed_effects: lease.allowed_effects,
      confirmation_effects: lease.confirmation_effects,
      resource_bounds: lease.resource_bounds,
      status: lease.status,
      expiry: lease.expiry,
      authority_source: lease.authority_source,
      last_safe_checkpoint: lease.last_safe_checkpoint,
      freshness_evidence: lease.freshness_evidence,
      claimed_actions: lease.claimed_actions,
      is_expired: isExpired(lease, now),
      is_revoked: lease.status === 'revoked',
    };
  }

  return Object.freeze({
    leaseRoot,
    readLease,
    createLease,
    findByFingerprint,
    mutate,
    setStatus,
    isExpired,
    inspect,
  });
}