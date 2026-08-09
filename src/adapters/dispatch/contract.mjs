// src/adapters/dispatch/contract.mjs — Phase 38 NativeDispatchAdapter contract.
//
// Per the plan's assumption_delta_decision: the NativeDispatchAdapter
// CONTRACT is the primary artifact; per-runtime implementations (claude.mjs,
// codex.mjs in Plan 02) are VARIANTS of it. This makes HOST-03's "incompatible
// adapter disables autonomous dispatch only for that runtime" a structural
// property: each variant independently reports canDispatch() and
// recommendation_only without weakening the other.
//
// The Receipt schema is the source of truth for what an adapter-issued
// invocation binds to verifiable completion evidence. The
// invocation_identity.native_identity field references the DISCOVERY
// adapter's native_identity (src/adapters/claude.mjs:449) — Phase 38 does
// NOT invent a parallel identity space (identity continuity).
//
// All files are ESM .mjs, stdlib-only (node:child_process, node:crypto,
// node:fs, node:path, node:os). No npm imports, no native modules.

import { realpathSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { validateStrategyBounds as validateStrategyBoundsFromStrategy } from '../../orchestrator/strategy.mjs';

export const DISPATCH_CONTRACT_VERSION = 1;

// Receipt schema_version is pinned at 1 for Phase 38. Future schema
// evolutions (Phase 44 attribution) bump this and migrate; Phase 38 only
// writes version 1.
export const RECEIPT_SCHEMA_VERSION = 1;

export const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1000;
export const MAX_RETRY_LIMIT = 10;
export const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
export const MAX_OUTPUT_LINES = 1_000_000;

// Receipt state machine (HOST-01 / RCPT-02 preview):
//   pending           — receipt created before invocation (Phase 44)
//   invoked           — child spawned, pid captured, awaiting exit
//   paused            — protected-effect pause (Phase 40 LEASE-05 primitive)
//   completed         — exit_code + stdout_sha256 + wall_ms captured
//   failed            — non-zero exit or spawn failure
//   recommendation_only — canDispatch() false / empty action: NO spawn, text only
export const RECEIPT_STATES = Object.freeze([
  'pending', 'invoked', 'ignored', 'rejected', 'substituted', 'paused',
  'partial', 'completed', 'failed', 'preserved-unknown', 'recommendation_only',
  'blocked',
  'quarantined',
]);

// Build a Receipt object following the schema documented in the plan:
//   schema_version=1
//   receipt_id          — sha256-derived, stable
//   invocation_identity { adapter, runtime, pid?, command, args, lease_id,
//                        idempotency_key, spawned_at, native_identity }
//   completion_evidence { exit_code?, stdout_sha256?, wall_ms?, artifact_ref?,
//                        state }
//   intent, authority, risk — string fields from the action/lease fixture
//   provenance { adapter, source_fingerprint }
//
// Fields are populated by the adapter; buildReceipt is a pure constructor
// that does not IO. The adapter passes the captured pid / stdout_sha256 /
// wall_ms / exit_code after the child exits.
export function buildReceipt({
  schema_version = RECEIPT_SCHEMA_VERSION,
  receipt_id,
  invocation_identity,
  completion_evidence,
  intent = '',
  authority = '',
  risk = '',
  provenance,
} = {}) {
  if (!receipt_id) throw new TypeError('receipt_id is required');
  if (!invocation_identity || typeof invocation_identity !== 'object') {
    throw new TypeError('invocation_identity is required');
  }
  return {
    schema_version,
    receipt_id,
    invocation_identity,
    completion_evidence: completion_evidence || { state: 'pending' },
    intent: String(intent || ''),
    authority: String(authority || ''),
    risk: String(risk || ''),
    provenance: provenance || { adapter: invocation_identity.adapter || '' },
  };
}

// createDispatchAdapter — the factory every per-runtime variant calls.
// Returns { canDispatch, invoke, observe, pause, resume }.
//
// The factory does NOT implement invoke() — each variant supplies its own.
// It only standardizes the shape and the receipt root resolution. The
// variant's invoke() must:
//   - Validate the fixture command is a fixed, contained path (T-38-01).
//   - spawn() with stdio:['ignore','pipe','pipe'] + detached:true + unref().
//   - On child 'exit', build a receipt with pid + stdout_sha256 (raw bytes)
//     + wall_ms and publishAtomic + append.
//   - On empty/null action, return a 'recommendation_only' receipt (no spawn).
//   - NEVER spawn from untrusted prompt text; the command is the fixed
//     fixture path.
export function createDispatchAdapter({
  runtime,
  adapterVersion,
  receiptRoot,
  fixture,
  nativeIdentity,
  allowedRoots,
  invokeImpl,
  canDispatchImpl,
  pauseImpl,
  resumeImpl,
}) {
  if (!runtime) throw new TypeError('runtime is required');
  if (!adapterVersion) throw new TypeError('adapterVersion is required');
  if (typeof invokeImpl !== 'function') throw new TypeError('invokeImpl is required');

  const adapter = {
    runtime,
    adapterVersion,
    receiptRoot,
    fixture,
    nativeIdentity: nativeIdentity || null,
    allowedRoots: allowedRoots || [],

    canDispatch(action) {
      return canDispatchImpl ? canDispatchImpl(action) : { ok: false, reason: 'not_implemented' };
    },

    invoke(action) {
      return invokeImpl(action, adapter);
    },

    observe(receiptId) {
      // Delegated to the variant's receipt store (set by invokeImpl).
      const store = adapter._receiptStore;
      return store ? store.observe(receiptId) : null;
    },

    pause(receiptId) {
      return pauseImpl ? pauseImpl(receiptId, adapter) : null;
    },

    resume(receiptId) {
      return resumeImpl ? resumeImpl(receiptId, adapter) : null;
    },
  };
  return adapter;
}

// --- TRUST-03: validateInvocation -------------------------------------------
// Pure function (no spawn, no I/O beyond realpathSync/statSync for path
// validation). Called inside invokeImpl at dispatch time — NEVER on the prompt
// hot path (router.mjs). Reuses the { ok: false, reason: '<reason_code>' }
// return shape from validateFixturePath (claude.mjs:111-132).
//
// Checks, in order:
//   a. Typed argument contract: action.args is an array of strings.
//   b. Entrypoint identity: adapter.fixture path — '..', realpath, containment,
//      isFile (mirrors validateFixturePath).
//   c. Working directory (cwd): if action.cwd provided, within allowed roots.
//   d. Wrapper injection: shell:false enforced — reject shell:true or wrapper.
//   e. Quoting: args scanned for unescaped shell metacharacters (defense-in-depth;
//      shell:false already prevents interpretation).
//   f. Destructive targets: args scanned for rm -rf /, mkfs, dd, shutdown, etc.
//   g. Runtime scope: action.runtime === adapter.runtime.
function within(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

const SHELL_METACHARS = /[|;&$`!<>()\n]/;
const DESTRUCTIVE_PATTERNS = [
  /rm\s+-rf\s+\/(\s|$)/,
  /rm\s+-rf\s+~/,
  />\s*\/dev\/sd/,
  /mkfs/,
  /dd\s+if=.*of=\/dev\//,
  /shutdown/,
  /reboot/,
];

export function validateInvocation(action, adapter) {
  // a. Typed argument contract
  if (action && action.args !== undefined) {
    if (!Array.isArray(action.args)) return { ok: false, reason: 'arg_type_invalid' };
    for (const arg of action.args) {
      if (typeof arg !== 'string') return { ok: false, reason: 'arg_type_invalid' };
    }
  }

  // b. Entrypoint identity (reuse validateFixturePath logic)
  const fixturePath = adapter?.fixture;
  const allowedRoots = adapter?.allowedRoots || [];
  if (typeof fixturePath === 'string' && fixturePath.trim()) {
    if (fixturePath.includes('..')) return { ok: false, reason: 'path_escape' };
    let resolved;
    try { resolved = realpathSync(resolve(fixturePath)); }
    catch { return { ok: false, reason: 'fixture_not_found' }; }
    if (allowedRoots.length > 0) {
      const contained = allowedRoots.some((root) => {
        try { return within(realpathSync(root), resolved); } catch { return false; }
      });
      if (!contained) return { ok: false, reason: 'path_escape' };
    }
    try {
      const st = statSync(resolved);
      if (!st.isFile()) return { ok: false, reason: 'not_a_file' };
    } catch { return { ok: false, reason: 'fixture_not_found' }; }
  }

  // c. Working directory (cwd)
  if (action && typeof action.cwd === 'string' && action.cwd.trim()) {
    if (action.cwd.includes('..')) return { ok: false, reason: 'cwd_escape' };
    let cwdResolved;
    try { cwdResolved = realpathSync(resolve(action.cwd)); }
    catch { return { ok: false, reason: 'cwd_escape' }; }
    if (allowedRoots.length > 0) {
      const contained = allowedRoots.some((root) => {
        try { return within(realpathSync(root), cwdResolved); } catch { return false; }
      });
      if (!contained) return { ok: false, reason: 'cwd_escape' };
    }
  }

  // d. Wrapper injection
  if (action?.shell === true) return { ok: false, reason: 'wrapper_injection' };
  if (typeof action?.shellWrapper === 'string' && action.shellWrapper.trim()) {
    return { ok: false, reason: 'wrapper_injection' };
  }

  // e. Quoting — scan args for unescaped shell metacharacters
  if (action && Array.isArray(action.args)) {
    for (const arg of action.args) {
      if (SHELL_METACHARS.test(arg)) return { ok: false, reason: 'unquoted_metachar' };
    }
  }

  // f. Destructive targets
  if (action && Array.isArray(action.args)) {
    for (const arg of action.args) {
      for (const pat of DESTRUCTIVE_PATTERNS) {
        if (pat.test(arg)) return { ok: false, reason: 'destructive_target' };
      }
    }
  }

  // g. Runtime scope
  const actionRuntime = action?.runtime;
  if (actionRuntime && adapter?.runtime && actionRuntime !== adapter.runtime) {
    return { ok: false, reason: 'runtime_scope_mismatch' };
  }

  return { ok: true };
}

// Strategy bounds are additive to, and never a replacement for, invocation
// and pre-dispatch validation. Keeping this seam here makes the ordering
// inspectable by every runtime adapter.
export function validateStrategyBounds(action) {
  return validateStrategyBoundsFromStrategy(action);
}

function positiveBound(value, maximum) {
  return Number.isSafeInteger(value) && value > 0 && value <= maximum;
}

function normalizedOutputBounds(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'missing_output_bounds' };
  }
  const bytes = value.max_bytes ?? value.bytes;
  const lines = value.max_lines ?? value.lines;
  if (bytes === undefined && lines === undefined) {
    return { ok: false, reason: 'missing_output_bounds' };
  }
  if (bytes !== undefined && !positiveBound(bytes, MAX_OUTPUT_BYTES)) {
    return { ok: false, reason: Number.isFinite(bytes) && bytes > MAX_OUTPUT_BYTES
      ? 'output_bounds_oversized' : 'invalid_output_bounds' };
  }
  if (lines !== undefined && !positiveBound(lines, MAX_OUTPUT_LINES)) {
    return { ok: false, reason: Number.isFinite(lines) && lines > MAX_OUTPUT_LINES
      ? 'output_bounds_oversized' : 'invalid_output_bounds' };
  }
  return {
    ok: true,
    value: {
      ...(bytes !== undefined ? { max_bytes: bytes } : {}),
      ...(lines !== undefined ? { max_lines: lines } : {}),
    },
  };
}

function normalizedCompletionContract(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'missing_completion_contract' };
  }
  const evidenceType = value.evidence_type;
  const hasExitExpectation = value.expected_exit_code !== undefined
    || value.exit_code !== undefined
    || value.success_exit_codes !== undefined
    || value.exit_codes !== undefined;
  const hasStateExpectation = typeof value.state === 'string' && value.state.length > 0;
  if (evidenceType !== undefined && evidenceType !== 'exit_code' && evidenceType !== 'state') {
    return { ok: false, reason: 'invalid_completion_contract' };
  }
  if (!hasExitExpectation && !hasStateExpectation && evidenceType === undefined) {
    return { ok: false, reason: 'invalid_completion_contract' };
  }
  const expected = value.expected_exit_code ?? value.exit_code;
  if (expected !== undefined && !Number.isSafeInteger(expected)) {
    return { ok: false, reason: 'invalid_completion_contract' };
  }
  const codes = value.success_exit_codes ?? value.exit_codes;
  if (codes !== undefined && (!Array.isArray(codes) || codes.length === 0
    || codes.some((code) => !Number.isSafeInteger(code)))) {
    return { ok: false, reason: 'invalid_completion_contract' };
  }
  if (expected !== undefined && codes !== undefined) {
    return { ok: false, reason: 'invalid_completion_contract' };
  }
  return {
    ok: true,
    value: {
      ...(evidenceType ? { evidence_type: evidenceType } : {}),
      ...(expected !== undefined ? { expected_exit_code: expected } : {}),
      ...(codes !== undefined ? { success_exit_codes: [...codes] } : {}),
      ...(hasStateExpectation ? { state: value.state } : {}),
    },
  };
}

export function normalizeExecutionContract(action = {}) {
  const source = action.execution_contract ?? action.executionContract ?? action;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return { ok: false, reason: 'missing_execution_contract' };
  }
  const timeout = source.timeout_ms ?? source.timeout;
  if (!Number.isSafeInteger(timeout) || timeout <= 0) {
    return { ok: false, reason: 'missing_timeout' };
  }
  if (timeout > MAX_TIMEOUT_MS) return { ok: false, reason: 'timeout_oversized' };
  const retry = source.retry_limit ?? source.retry;
  if (!Number.isSafeInteger(retry) || retry < 0) {
    return { ok: false, reason: 'unbounded_retry' };
  }
  if (retry > MAX_RETRY_LIMIT) return { ok: false, reason: 'retry_oversized' };
  const output = normalizedOutputBounds(source.output_bounds);
  if (!output.ok) return output;
  const completion = normalizedCompletionContract(source.completion_contract);
  if (!completion.ok) return completion;
  return {
    ok: true,
    value: {
      timeout_ms: timeout,
      retry_limit: retry,
      output_bounds: output.value,
      completion_contract: completion.value,
    },
  };
}

function completionMatches(contract, code, state) {
  if (contract.state !== undefined) return contract.state === state;
  if (contract.expected_exit_code !== undefined) return code === contract.expected_exit_code;
  if (contract.success_exit_codes !== undefined) return contract.success_exit_codes.includes(code);
  return code === 0;
}

function killChild(child, signal) {
  try { if (child && child.exitCode === null) child.kill(signal); } catch { /* already closed */ }
}

function runOneChild({ command, args, options, contract }) {
  return new Promise((resolveOutcome) => {
    let child;
    try {
      child = spawn(command, args, options);
    } catch {
      resolveOutcome({ spawned: false });
      return;
    }
    const started = process.hrtime.bigint();
    const hash = createHash('sha256');
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let outputLines = 0;
    let overflow = false;
    let timedOut = false;
    let terminated = false;
    let closed = false;
    let timeoutTimer;
    let killTimer;
    const terminate = (reason) => {
      if (terminated) return;
      terminated = true;
      if (reason === 'timeout_exceeded') timedOut = true;
      if (reason === 'output_bound_exceeded') overflow = true;
      killChild(child, 'SIGTERM');
      killTimer = setTimeout(() => killChild(child, 'SIGKILL'), 100);
      killTimer.unref?.();
    };
    const count = (chunk, stream) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
      if (stream === 'stdout') {
        stdoutBytes += bytes;
        hash.update(chunk);
      } else {
        stderrBytes += bytes;
      }
      outputLines += (Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))).reduce(
        (total, byte) => total + (byte === 10 ? 1 : 0), 0,
      );
      if ((contract.output_bounds.max_bytes !== undefined
        && stdoutBytes + stderrBytes > contract.output_bounds.max_bytes)
        || (contract.output_bounds.max_lines !== undefined
          && outputLines > contract.output_bounds.max_lines)) {
        terminate('output_bound_exceeded');
      }
    };
    child.stdout?.on('data', (chunk) => count(chunk, 'stdout'));
    child.stderr?.on('data', (chunk) => count(chunk, 'stderr'));
    child.once('error', () => {
      if (!Number.isSafeInteger(child.pid) || child.pid <= 0) {
        clearTimeout(timeoutTimer);
        clearTimeout(killTimer);
        resolveOutcome({ spawned: false });
      }
    });
    const grace = () => clearTimeout(killTimer);
    child.once('close', (code, signal) => {
      closed = true;
      clearTimeout(timeoutTimer);
      grace();
      const wallMs = Number(process.hrtime.bigint() - started) / 1e6;
      const state = completionMatches(contract.completion_contract, code, 'completed')
        ? 'completed' : 'failed';
      const reason_codes = [];
      if (timedOut) reason_codes.push('timeout_exceeded');
      if (overflow) reason_codes.push('output_bound_exceeded');
      if (!timedOut && !overflow && state !== 'completed') reason_codes.push('completion_contract_failed');
      resolveOutcome({
        spawned: Number.isSafeInteger(child.pid) && child.pid > 0,
        pid: child.pid,
        state,
        code,
        signal,
        wall_ms: wallMs,
        stdout_sha256: hash.digest('hex'),
        captured_bytes: stdoutBytes + stderrBytes,
        captured_lines: outputLines,
        timed_out: timedOut,
        output_truncated: overflow,
        reason_codes,
      });
    });
    timeoutTimer = setTimeout(() => terminate('timeout_exceeded'), contract.timeout_ms);
    timeoutTimer.unref?.();
    if (closed) clearTimeout(timeoutTimer);
  });
}

export async function runBoundedChild({
  command = process.execPath,
  args = [],
  cwd,
  env,
  execution_contract,
  spawn_options = {},
} = {}) {
  const normalized = normalizeExecutionContract({ execution_contract });
  if (!normalized.ok) return { state: 'failed', reason_codes: [normalized.reason], attempt_count: 0 };
  const contract = normalized.value;
  let attempt_count = 0;
  let last;
  while (attempt_count <= contract.retry_limit) {
    attempt_count += 1;
    last = await runOneChild({
      command,
      args,
      contract,
      options: {
        ...spawn_options,
        ...(cwd ? { cwd } : {}),
        ...(env ? { env } : {}),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    });
    if (last.spawned) return { ...last, attempt_count, retry_limit: contract.retry_limit };
  }
  return {
    state: 'failed',
    reason_codes: ['retry_exhausted'],
    attempt_count,
    retry_limit: contract.retry_limit,
  };
}

// --- TRUST-04: preDispatchGate ----------------------------------------------
// Pure function validating the invocation contract (not the capability record).
// Called inside invokeImpl at dispatch time after validateInvocation and
// before spawn — NEVER on the prompt hot path. The context argument provides
// dependency availability and permission/effect state from the build-time
// eligibility evaluation (if available; default to permissive — fail-open for
// the gate itself, but the gate still checks declared contracts).
//
// Checks, in order:
//   a. Dependency availability: if action.dependencies declared and
//      context.dependencies provided, verify each is available.
//   b. Permission/effect class: if action.permission_effect declared and
//      context.permission_effect provided, verify it is in the allowed set.
//   c. Timeout contract: action.timeout is a positive integer (milliseconds).
//   d. Retry policy: action.retry is a non-negative finite integer (bounded).
//   e. Output bounds: action.output_bounds is declared (max bytes or max lines).
//   f. Completion contract: action.completion_contract is declared.
export function preDispatchGate(action, adapter, context) {
  // Determine if any contract field is declared. If none are declared, this
  // is a legacy action that does not participate in the dispatch contract —
  // permissive (backward compatible with pre-TRUST-04 actions).
  const hasAnyContract = action?.execution_contract !== undefined
    || action?.executionContract !== undefined
    || action?.timeout !== undefined
    || action?.retry !== undefined
    || action?.output_bounds !== undefined
    || action?.completion_contract !== undefined;
  if (!hasAnyContract) return { ok: true };

  // a. Dependency availability
  if (action?.dependencies && context?.dependencies) {
    for (const dep of action.dependencies) {
      if (!context.dependencies[dep]) return { ok: false, reason: 'dependency_missing' };
    }
  }

  // b. Permission/effect class
  if (action?.permission_effect && context?.permission_effect) {
    if (!context.permission_effect.includes(action.permission_effect)) {
      return { ok: false, reason: 'permission_effect_disallowed' };
    }
  }

  return normalizeExecutionContract(action);
}
