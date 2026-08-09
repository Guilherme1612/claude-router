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
  appendFileSync, chmodSync, closeSync, existsSync, fsyncSync, mkdirSync,
  openSync, readFileSync, renameSync, writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { normalizeExecutionContract, RECEIPT_STATES } from './contract.mjs';

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

const IDENTITY_FIELDS = [
  'project_id', 'goal_id', 'route_id', 'action_id', 'mapping_generation',
  'capability_fingerprint', 'authority', 'risk', 'idempotency_key',
  'lease_id',
];
const OMIT_KEYS = new Set([
  'prompt', 'raw_prompt', 'content', 'stdout', 'stderr', 'env', 'environment',
  'secret', 'secrets', 'token', 'tokens',
]);
const SAFE_ID_KEYS = new Set([
  'receipt_id', 'project_id', 'goal_id', 'route_id', 'action_id',
  'mapping_generation', 'capability_fingerprint', 'idempotency_key',
  'lease_id',
  'invocation_id', 'verification_id', 'reference', 'actual_route_id',
]);
const SAFE_TECHNICAL_KEYS = new Set([
  'state', 'reason', 'reason_code', 'reason_codes', 'stdout_sha256',
  'artifact_ref', 'verification_ref', 'exit_code', 'wall_ms', 'signal',
  'observed_at_ms', 'quality', 'latency_ms', 'negative_control', 'negative_control_pass',
]);
const ATTRIBUTION_FIELDS = new Set([
  'identity', 'selected', 'actual', 'alternatives', 'bounded_evidence',
  'invocation_evidence', 'postcondition_evidence', 'corrections',
  'substitution', 'strategy_plan', 'work_id', 'provenance', 'route_state',
]);

function bounded(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') return redact(value).slice(0, 256);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 32).map((item) => bounded(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !OMIT_KEYS.has(key.toLowerCase()))
      .slice(0, 64)
      .map(([key, item]) => [
        key,
        SAFE_ID_KEYS.has(key) || SAFE_TECHNICAL_KEYS.has(key)
          ? (Array.isArray(item)
            ? item.slice(0, 32).map((entry) => typeof entry === 'number' || typeof entry === 'boolean'
              ? entry : String(entry ?? '').slice(0, 256))
            : typeof item === 'number' || typeof item === 'boolean'
              ? item : String(item ?? '').slice(0, 256))
          : bounded(item, depth + 1),
      ]));
  }
  return String(value).slice(0, 256);
}

function normalizeIdentity(identity = {}) {
  return Object.fromEntries(IDENTITY_FIELDS
    .filter((field) => field !== 'lease_id' || identity?.lease_id)
    .map((field) => [
    field,
    SAFE_ID_KEYS.has(field)
      ? String(identity?.[field] ?? '').slice(0, 256)
      : bounded(identity?.[field] ?? ''),
    ]));
}

// Stable route identity deliberately excludes PID and process timing. It is
// the causal anchor shared by pending, invoked, and terminal records.
export function receiptIdentityId({ adapter, runtime, identity = {} } = {}) {
  const tuple = JSON.stringify({
    adapter: String(adapter || ''),
    runtime: String(runtime || ''),
    identity: normalizeIdentity(identity),
  });
  return createHash('sha256').update(tuple, 'utf8').digest('hex');
}

export function receiptIdentityFromAction(action = {}) {
  action = action || {};
  return {
    project_id: action.project_id ?? action.projectId ?? '',
    goal_id: action.goal_id ?? action.goalId ?? '',
    route_id: action.route_id ?? action.routeId ?? '',
    action_id: action.action_id ?? action.actionId ?? '',
    mapping_generation: action.mapping_generation ?? action.mappingGeneration ?? '',
    capability_fingerprint: action.capability_fingerprint ?? action.capabilityFingerprint ?? '',
    authority: action.authority ?? '',
    risk: action.risk ?? '',
    idempotency_key: action.idempotency_key ?? '',
    lease_id: action.lease_id ?? '',
    execution_contract: action.execution_contract ?? action.executionContract ?? null,
  };
}

export function attributionFromAction(action = {}) {
  action = action || {};
  const result = {
    selected: action.selected ?? action.selected_route ?? null,
    actual: action.actual ?? action.actual_composition ?? action.composition ?? null,
    alternatives: action.alternatives ?? [],
    bounded_evidence: action.bounded_evidence ?? action.evidence ?? {},
    corrections: action.corrections ?? [],
    substitution: action.substitution ?? action.substitution_evidence ?? null,
    postcondition_evidence: action.postcondition_evidence ?? null,
  };
  if (action.strategy_plan !== undefined) result.strategy_plan = action.strategy_plan;
  if (action.work_id !== undefined) result.work_id = action.work_id;
  return result;
}

export function buildPendingReceipt({
  schema_version = 1,
  adapter,
  runtime,
  identity = {},
  intent = '',
  selected = null,
  alternatives = [],
  bounded_evidence = {},
  provenance = null,
  execution_contract = undefined,
  executionContract = undefined,
  strategy_plan = undefined,
  work_id = undefined,
} = {}) {
  if (!adapter || !runtime) throw new TypeError('adapter and runtime are required');
  const normalized = normalizeIdentity(identity);
  const receipt_id = receiptIdentityId({ adapter, runtime, identity: normalized });
  const contractInput = execution_contract ?? executionContract;
  const contractResult = contractInput === undefined || contractInput === null
    ? null
    : normalizeExecutionContract({ execution_contract: contractInput });
  if (contractResult && !contractResult.ok) {
    throw new TypeError(contractResult.reason);
  }
  return {
    schema_version,
    receipt_id,
    invocation_identity: {
      adapter: String(adapter),
      runtime: String(runtime),
      pid: null,
      command: null,
      args: [],
      lease_id: String(identity.lease_id || ''),
      idempotency_key: String(normalized.idempotency_key || ''),
      spawned_at: null,
      native_identity: null,
      identity: normalized,
    },
    completion_evidence: { state: 'pending' },
    route_state: 'pending',
    intent: redact(String(intent || '')).slice(0, 256),
    authority: String(normalized.authority || ''),
    risk: String(normalized.risk || ''),
    selected: bounded(selected),
    actual: null,
    alternatives: bounded(alternatives),
    bounded_evidence: bounded(bounded_evidence),
    provenance: bounded(provenance || { adapter: String(adapter) }),
    ...(contractResult ? { execution_contract: contractResult.value } : {}),
    ...(strategy_plan !== undefined ? { strategy_plan: bounded(strategy_plan), work_id: work_id ?? null } : {}),
  };
}

function claimIdentity({ runtime, stage, identity }) {
  return {
    runtime: String(runtime || ''),
    stage: String(stage || ''),
    work_identity: normalizeIdentity(identity || {}),
  };
}

export function durableClaimId({ runtime, stage = 'initial', identity = {} } = {}) {
  const canonical = claimIdentity({ runtime, stage, identity });
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

function fsyncDirectory(path) {
  let fd;
  try {
    fd = openSync(path, 'r');
    fsyncSync(fd);
  } catch { /* directory fsync is best effort on unsupported filesystems */ }
  finally { if (fd !== undefined) try { closeSync(fd); } catch { /* closed */ } }
}

// Permanent cross-process work claim. The exclusive create is the authority;
// a successful claim is intentionally never removed or replaced.
export function claimDurableWork({ runtime, stage = 'initial', identity = {}, dir } = {}) {
  const claimId = durableClaimId({ runtime, stage, identity });
  const root = dir || defaultReceiptRoot(runtime);
  const claimsDir = join(root, 'claims');
  const claimPath = join(claimsDir, `${claimId}.json`);
  try {
    mkdirSync(claimsDir, { recursive: true, mode: 0o700 });
    chmodSync(claimsDir, 0o700);
    const fd = openSync(claimPath, 'wx', 0o600);
    try {
      writeFileSync(fd, `${JSON.stringify({
        claim_id: claimId,
        runtime: String(runtime || ''),
        stage: String(stage || ''),
        work_identity: normalizeIdentity(identity || {}),
      })}\n`);
      fsyncSync(fd);
    } finally { closeSync(fd); }
    fsyncDirectory(claimsDir);
    return { claimed: true, claim_id: claimId, path: claimPath };
  } catch (error) {
    if (error?.code === 'EEXIST') {
      return { claimed: false, claim_id: claimId, path: claimPath, reason: 'already_claimed' };
    }
    return { claimed: false, claim_id: claimId, path: claimPath, reason: 'claim_failed' };
  }
}

function routeStateFor(state) {
  return state === 'recommendation_only' ? 'ignored' : state;
}

// Pure transition helper. ReceiptStore remains responsible for persistence.
export function transitionReceipt(receipt, state, patch = {}) {
  if (!receipt || typeof receipt !== 'object' || !receipt.receipt_id) {
    throw new TypeError('receipt is required');
  }
  if (!RECEIPT_STATES.includes(state)) throw new TypeError(`unknown receipt state: ${state}`);
  const next = {
    ...receipt,
    invocation_identity: {
      ...(receipt.invocation_identity || {}),
      ...(patch.invocation_identity ? bounded(patch.invocation_identity) : {}),
    },
    completion_evidence: {
      ...(receipt.completion_evidence || {}),
      ...(patch.completion_evidence ? bounded(patch.completion_evidence) : {}),
      state,
    },
    route_state: patch.route_state || routeStateFor(state),
  };
  for (const field of ATTRIBUTION_FIELDS) {
    if (field in patch && field !== 'route_state' && field !== 'identity') {
      next[field] = bounded(patch[field]);
    }
  }
  if (patch.identity) {
    next.invocation_identity.identity = normalizeIdentity(patch.identity);
  }
  return next;
}

export function outcomeCredit(receipt) {
  if (!receipt || receipt.completion_evidence?.state !== 'completed') return false;
  const invocation = receipt.invocation_evidence || {};
  const postcondition = receipt.postcondition_evidence || {};
  return invocation.receipt_id === receipt.receipt_id
    && postcondition.receipt_id === receipt.receipt_id
    && postcondition.verified === true;
}

export function inspectReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return null;
  const identity = receipt.invocation_identity?.identity || {};
  const selected = bounded(receipt.selected);
  const actual = bounded(receipt.actual);
  const selectedRoute = selected?.route_id || selected?.route || null;
  const actualRoute = actual?.route_id || actual?.route || null;
  return {
    receipt_id: receipt.receipt_id,
    schema_version: receipt.schema_version,
    route_state: receipt.route_state || receipt.completion_evidence?.state,
    completion_state: receipt.completion_evidence?.state || null,
    identity: bounded(identity),
    invocation: bounded({
      adapter: receipt.invocation_identity?.adapter,
      runtime: receipt.invocation_identity?.runtime,
      pid: receipt.invocation_identity?.pid,
      command: receipt.invocation_identity?.command,
      args: receipt.invocation_identity?.args,
      spawned_at: receipt.invocation_identity?.spawned_at,
    }),
    selected,
    actual,
    divergence: {
      selected_route_id: selectedRoute,
      actual_route_id: actualRoute,
      changed: Boolean(selectedRoute && actualRoute && selectedRoute !== actualRoute),
    },
    alternatives: bounded(receipt.alternatives || []),
    corrections: bounded(receipt.corrections || []),
    substitution: bounded(receipt.substitution),
    evidence: bounded(receipt.bounded_evidence || {}),
    completion: bounded(receipt.completion_evidence || {}),
    outcome_credit: outcomeCredit(receipt),
  };
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
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    const finalPath = join(dir, `${receipt.receipt_id}.json`);
    const tmp = `${finalPath}.tmp.${process.pid}`;
    writeFileSync(tmp, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    chmodSync(tmp, 0o600);
    let fd;
    try { fd = openSync(tmp, 'r'); fsyncSync(fd); } finally { if (fd !== undefined) closeSync(fd); }
    renameSync(tmp, finalPath);
    chmodSync(finalPath, 0o600);
    fsyncDirectory(dir);
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
    mkdirSync(dirname(logPath), { recursive: true, mode: 0o700 });
    appendFileSync(logPath, line, { flag: 'a', mode: 0o600 });
    if (!existedBefore) {
      try { chmodSync(logPath, 0o600); } catch { /* perms best-effort */ }
    }
    try { chmodSync(logPath, 0o600); } catch { /* perms best-effort */ }
  } catch {
    // Never block on a receipt log write failure (fail-open).
  }
}

// Read a single receipt by id from a receipts dir. Returns null if absent or
// corrupt (fail-open — observe() never throws).
export function read(receiptId, dir) {
  try {
    if (typeof receiptId !== 'string' || !/^[a-f0-9]{64}$/.test(receiptId)) return null;
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
  inspect(receiptId) {
    return inspectReceipt(this.observe(receiptId));
  }
  claim({ runtime, stage = 'initial', identity = {} } = {}) {
    return claimDurableWork({ runtime, stage, identity, dir: this.dir });
  }
}
