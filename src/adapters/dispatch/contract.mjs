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
import { resolve, sep } from 'node:path';

export const DISPATCH_CONTRACT_VERSION = 1;

// Receipt schema_version is pinned at 1 for Phase 38. Future schema
// evolutions (Phase 44 attribution) bump this and migrate; Phase 38 only
// writes version 1.
export const RECEIPT_SCHEMA_VERSION = 1;

// Receipt state machine (HOST-01 / RCPT-02 preview):
//   pending           — receipt created before invocation (Phase 44)
//   invoked           — child spawned, pid captured, awaiting exit
//   paused            — protected-effect pause (Phase 40 LEASE-05 primitive)
//   completed         — exit_code + stdout_sha256 + wall_ms captured
//   failed            — non-zero exit or spawn failure
//   recommendation_only — canDispatch() false / empty action: NO spawn, text only
export const RECEIPT_STATES = Object.freeze([
  'pending', 'invoked', 'paused', 'completed', 'failed', 'recommendation_only',
  'blocked',
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