// src/adapters/dispatch/receipt.mjs — Phase 38 receipt store + integrity.
//
// Two operations compose (analog: ~/.claude/hooks/router.mjs saveCache +
// logTelemetry):
//   1. publishAtomic(receipt, dir)  — single-receipt JSON file via temp+rename
//      (POSIX-atomic, fail-open try/catch).
//   2. append(receipt, logPath)     — append-only jsonl line, chmod 0o600 on
//      first create, fail-open try/catch.
//
// Receipt integrity (T-38-04): receipts store ONLY hashes, command, args,
// exit code, wall time, and route metadata — NEVER raw prompt text, secrets,
// env vars, or file contents. redact() (analog: router.mjs:1965-1977) is
// applied before hashing any prompt-derived field. stdout_sha256 is computed
// over raw stdout bytes (Buffer), not over normalized/stringified code points.
//
// Cross-runtime partition (T-38-07): the receipts dir resolves via
// os.homedir() (~/.claude/router/receipts/ for the claude runtime,
// ~/.codex/router/receipts/ for codex) — never hardcoded /Users/guilherme.

import { createHash } from 'node:crypto';
import {
  appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync,
  renameSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Secret/PII redaction BEFORE hashing (analog: router.mjs:1965-1977).
// Same regex + case-insensitivity so the hash input never includes raw
// secrets even though the hash itself is irreversible.
const SECRET_RE = /(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|xoxb-[0-9-Za-z]+|gho_[A-Za-z0-9]{36}|glpat-[A-Za-z0-9_-]{20}|[A-Za-z0-9_\-]{32,}={0,2})/gi;

export function redact(value) {
  return String(value ?? '').replace(SECRET_RE, '[REDACTED]');
}

// sha256 over a UTF-8 string, with redaction applied first. Used for any
// prompt-derived field. Receipts MUST NOT store the unredacted source.
export function hashPromptDerived(value) {
  return createHash('sha256').update(redact(value), 'utf8').digest('hex');
}

// sha256 over raw bytes (Buffer). Used for stdout_sha256 — byte-exact over the
// child's actual stdout, NOT over a normalized/stringified form (Test 6).
export function hashBytes(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

// Stable receipt_id: sha256 over the canonical receipt identity tuple. The
// tuple is the adapter-issued invocation_identity fields that uniquely
// identify the invocation: adapter, runtime, pid, command, args, lease_id,
// idempotency_key. Stable across reruns for the same invocation; never
// includes raw prompt text.
export function receiptId({ adapter, runtime, pid, command, args, lease_id, idempotency_key }) {
  const tuple = JSON.stringify({
    adapter, runtime, pid, command,
    args: Array.isArray(args) ? args.map(String) : [],
    lease_id: String(lease_id || ''),
    idempotency_key: String(idempotency_key || ''),
  });
  return createHash('sha256').update(tuple, 'utf8').digest('hex');
}

// Resolve the per-runtime receipts root. claude → ~/.claude/router/receipts/,
// codex → ~/.codex/router/receipts/ (T-38-07 cross-runtime partition).
export function defaultReceiptRoot(runtime) {
  const dir = runtime === 'codex' ? '.codex' : '.claude';
  return join(homedir(), dir, 'router', 'receipts');
}

// Atomic publish (analog: router.mjs:1938-1943 saveCache temp+rename).
// Writes one receipt JSON file named <receipt_id>.json. POSIX-atomic on
// renameSync; wrapped in try/catch so a receipt write failure NEVER blocks
// the hook (fail-open). Returns the written path on success, null on
// failure.
export function publishAtomic(receipt, dir) {
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const finalPath = join(dir, `${receipt.receipt_id}.json`);
    const tmp = `${finalPath}.tmp.${process.pid}`;
    writeFileSync(tmp, JSON.stringify(receipt, null, 2) + '\n');
    renameSync(tmp, finalPath);
    return finalPath;
  } catch {
    return null;
  }
}

// Append-only jsonl log (analog: router.mjs:1979-1996 logTelemetry). Each line
// < 4KB (well under macOS PIPE_BUF 4096) so concurrent sessions don't
// interleave. chmod 0o600 on first create (owner read/write only). Fail-open
// try/catch — a log write error MUST NOT block the hook.
export function append(receipt, logPath) {
  try {
    const line = JSON.stringify(receipt) + '\n';
    const existedBefore = existsSync(logPath);
    appendFileSync(logPath, line, { flag: 'a' });
    if (!existedBefore) {
      try { chmodSync(logPath, 0o600); } catch { /* perms best-effort */ }
    }
  } catch {
    // Never block on a receipt log write failure (fail-open).
  }
}

// Read a single receipt by id from a receipts dir. Returns null if absent or
// corrupt (fail-open — observe() never throws).
export function read(receiptId, dir) {
  try {
    const path = join(dir, `${receiptId}.json`);
    if (!existsSync(path)) return null;
    const data = JSON.parse(readFileSync(path, 'utf8'));
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

// ReceiptStore — minimal class wrapping the dir + log path. observe(receiptId)
// is the public read surface used by the adapter.
export class ReceiptStore {
  constructor({ dir, logPath } = {}) {
    this.dir = dir;
    this.logPath = logPath;
  }
  publish(receipt) {
    const written = publishAtomic(receipt, this.dir);
    if (written) append(receipt, this.logPath);
    return written;
  }
  observe(receiptId) {
    return read(receiptId, this.dir);
  }
}