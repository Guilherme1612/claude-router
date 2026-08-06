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