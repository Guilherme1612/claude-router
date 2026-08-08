// src/adapters/dispatch/codex.mjs — Phase 38 Codex NativeDispatchAdapter.
//
// Implements the createDispatchAdapter contract for the Codex runtime. This
// is a VARIANT of the Claude adapter (Plan 01), NOT a parallel implementation:
// per Pitfall 3 the dispatch MECHANISM (child_process.spawn + child stdout
// capture + child 'exit' handler + atomic receipt publish) is IDENTICAL across
// runtimes. The ONLY differences from claude.mjs are:
//
//   1. runtime='codex', adapterVersion='codex-dispatch/1'.
//   2. Receipt partition path: ~/.codex/router/receipts/ (via os.homedir()).
//   3. canDispatch() ADDITIONALLY probes ~/.codex/router/installed.json
//      marker (RESEARCH §Environment Availability — marker contents:
//      {"managed_by":"claude-router","control_authority_root":...}). Absent
//      the marker, canDispatch returns {ok:false} and invoke() writes a
//      'recommendation_only' receipt (Pattern 2 — truthful, not silent).
//   4. observe() validates receipt.runtime on read — a non-codex receipt
//      is rejected (T-38-08 cross-runtime isolation).
//
// Branch ONLY at these seams. The spawn path, exit handler, receipt schema,
// idempotency checkpoint, and pause/resume minimal state are identical to
// claude.mjs. Both adapters share the NativeDispatchAdapter contract from
// Plan 01 (identity continuity, same Receipt schema).
//
// Worker entrypoint: when run as `node codex.mjs`, reads the
// ~/.codex/router/dispatch-lease.json marker, invokes the adapter, polls
// observe() until 'completed', and exits (analog of claude.mjs's worker
// entrypoint; router.mjs's trigger spawns the claude worker by default but
// an operator can point ROUTER_DISPATCH_WORKER_PATH at this file).

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createDispatchAdapter, RECEIPT_SCHEMA_VERSION, validateInvocation, validateStrategyBounds, preDispatchGate } from './contract.mjs';
import {
  ReceiptStore, defaultReceiptRoot, hashBytes, receiptId,
} from './receipt.mjs';
import { replanStrategy } from '../../orchestrator/strategy.mjs';
import { createLeaseStore } from '../../lease/store.mjs';

export const CODEX_DISPATCH_VERSION = 'codex-dispatch/1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const DEFAULT_FIXTURE = join(REPO_ROOT, 'tests', 'phase-38', 'fixtures', 'harmless.mjs');

// Marker paths resolve against os.homedir() at CALL time (not module load),
// so tests that set process.env.HOME after import see the temp HOME. The
// dispatch-lease.json marker gates the worker entrypoint; installed.json
// gates canDispatch() (RESEARCH §Environment Availability).
function leaseMarkerPath() {
  return join(homedir(), '.codex', 'router', 'dispatch-lease.json');
}
function installedMarkerPath() {
  return join(homedir(), '.codex', 'router', 'installed.json');
}

function isMain() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href
      || String(process.argv[1] || '').endsWith('/adapters/dispatch/codex.mjs');
  } catch { return false; }
}

// --- Path containment (T-38-01 / T-38-06) -----------------------------------
// Identical discipline to claude.mjs: the fixture command must resolve inside
// the repo or ~/.codex/router/. Reject '..', root escape. Reimplemented
// locally so the dispatch contract stays self-contained (does not mutate the
// discovery adapter or the Claude dispatch adapter).
function within(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function validateFixturePath(fixturePath, allowedRoots) {
  if (typeof fixturePath !== 'string' || !fixturePath.trim()) {
    return { ok: false, reason: 'unsupported_command_form' };
  }
  if (fixturePath.includes('..')) return { ok: false, reason: 'path_escape' };
  let resolved;
  try { resolved = realpathSync(resolve(fixturePath)); }
  catch { return { ok: false, reason: 'fixture_not_found' }; }
  const contained = allowedRoots.some((root) => {
    try { return within(realpathSync(root), resolved); } catch { return false; }
  });
  if (!contained) return { ok: false, reason: 'path_escape' };
  try {
    const st = statSync(resolved);
    if (!st.isFile()) return { ok: false, reason: 'not_a_file' };
  } catch { return { ok: false, reason: 'fixture_not_found' }; }
  return { ok: true, resolved };
}

function defaultAllowedRoots() {
  return [REPO_ROOT, join(homedir(), '.codex', 'router')];
}

// --- Idempotent checkpoint (minimal Phase 40 LEASE-05 primitive) ----------
// Identical to claude.mjs: in-memory Set rejects duplicate 'completed' for
// the same idempotency_key. Phase 40 ships durable lease semantics. resume()
// releases the key so the same idempotency_key can drive a resume (a
// controlled continuation, not a duplicate invocation).
const _idempotencySeen = new Set();
function claimIdempotency(key) {
  if (!key) return true;
  if (_idempotencySeen.has(key)) return false;
  _idempotencySeen.add(key);
  return true;
}
function releaseIdempotency(key) {
  if (key) _idempotencySeen.delete(key);
}

// --- Adapter factory --------------------------------------------------------
export function createCodexDispatchAdapter({
  receiptRoot,
  fixture,
  allowedRoots,
} = {}) {
  const runtime = 'codex';
  const resolvedReceiptRoot = receiptRoot || defaultReceiptRoot(runtime);
  const logPath = join(resolvedReceiptRoot, 'receipts.jsonl');
  const store = new ReceiptStore({ dir: resolvedReceiptRoot, logPath });
  const roots = allowedRoots || defaultAllowedRoots();
  const fixturePath = fixture || DEFAULT_FIXTURE;

  function canDispatchImpl() {
    const v = validateFixturePath(fixturePath, roots);
    if (!v.ok) return { ok: false, reason: v.reason };
    if (!process.execPath) return { ok: false, reason: 'no_node_binary' };
    // Codex-specific: probe the installed.json marker (RESEARCH §Environment
    // Availability). Absent the marker, the Codex runtime is not under the
    // router's control authority → canDispatch false → recommendation_only.
    if (!existsSync(installedMarkerPath())) {
      return { ok: false, reason: 'installed_marker_missing' };
    }
    return { ok: true };
  }

  function buildReceiptId(invocation, action) {
    return receiptId({
      adapter: CODEX_DISPATCH_VERSION,
      runtime,
      pid: invocation.pid,
      command: invocation.command,
      args: invocation.args,
      lease_id: action?.lease_id || '',
      idempotency_key: action?.idempotency_key || '',
    });
  }

  function recommendationOnly(action, reason, state = 'recommendation_only') {
    const invocation = {
      adapter: CODEX_DISPATCH_VERSION,
      runtime,
      pid: null,
      command: null,
      args: [],
      lease_id: String(action?.lease_id || ''),
      idempotency_key: String(action?.idempotency_key || ''),
      spawned_at: null,
      native_identity: null,
    };
    const completion_evidence = { state };
    if (reason) {
      if (state === 'blocked') {
        completion_evidence.reason_codes = [reason];
      } else {
        completion_evidence.reason = reason;
      }
    }
    const receipt = {
      schema_version: RECEIPT_SCHEMA_VERSION,
      receipt_id: buildReceiptId(invocation, action),
      invocation_identity: invocation,
      completion_evidence,
      intent: String(action?.intent || ''),
      authority: String(action?.authority || ''),
      risk: String(action?.risk || ''),
      provenance: { adapter: CODEX_DISPATCH_VERSION, source_fingerprint: null },
    };
    store.publish(receipt);
    return receipt;
  }

  function invokeImpl(action, adapter) {
    // Validate action: null/empty/{} → recommendation_only, no spawn.
    if (!action || typeof action !== 'object' || Object.keys(action).length === 0) {
      return recommendationOnly(action, 'empty_action');
    }
    const strategyGate = validateStrategyBounds(action);
    if (!strategyGate.ok) return recommendationOnly(action, strategyGate.reason, 'blocked');
    const can = canDispatchImpl(action);
    if (!can.ok) return recommendationOnly(action, can.reason);

    // TRUST-03: validateInvocation — typed args, entrypoint, cwd, wrapper,
    // quoting, destructive targets, runtime scope before spawn.
    const inv = validateInvocation(action, adapter);
    if (!inv.ok) return recommendationOnly(action, inv.reason, 'blocked');

    // TRUST-04: preDispatchGate — timeout, retry, output bounds, completion
    // contract, dependency availability, permission/effect before spawn.
    const gate = preDispatchGate(action, adapter);
    if (!gate.ok) return recommendationOnly(action, gate.reason, 'blocked');

    const idempotencyKey = String(action.idempotency_key || '');
    if (idempotencyKey && !claimIdempotency(idempotencyKey)) {
      return recommendationOnly(action, 'idempotency_already_claimed');
    }

    const startNs = process.hrtime.bigint();
    const chunks = [];
    let child;
    try {
      child = spawn(process.execPath, [fixturePath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
        env: { ...process.env, ROUTER_RUNTIME: runtime },
      });
    } catch (err) {
      const invocation = {
        adapter: CODEX_DISPATCH_VERSION,
        runtime,
        pid: null,
        command: process.execPath,
        args: [fixturePath],
        lease_id: String(action.lease_id || ''),
        idempotency_key: idempotencyKey,
        spawned_at: new Date().toISOString(),
        native_identity: adapter.nativeIdentity || null,
      };
      const receipt = {
        schema_version: RECEIPT_SCHEMA_VERSION,
        receipt_id: buildReceiptId(invocation, action),
        invocation_identity: invocation,
        completion_evidence: { state: 'failed', reason: `spawn_failed: ${err?.message || String(err)}` },
        intent: String(action.intent || ''),
        authority: String(action.authority || ''),
        risk: String(action.risk || ''),
        provenance: { adapter: CODEX_DISPATCH_VERSION, source_fingerprint: null },
      };
      store.publish(receipt);
      return receipt;
    }

    child.stdout.on('data', (c) => chunks.push(c));
    child.stderr.on('data', () => { /* captured for diagnostics, not hashed into receipt */ });
    // NOTE: we deliberately do NOT call child.unref() here — identical to
    // claude.mjs. The 'exit' handler must fire to write the completion
    // receipt, so the child keeps this process's event loop alive until it
    // exits. The hook spawns THIS file as a detached + unref'd worker (when
    // ROUTER_DISPATCH_WORKER_PATH points here) and returns immediately; the
    // worker captures completion off the hot path.

    const pid = child.pid;
    const spawnedAt = new Date().toISOString();
    const invokedInvocation = {
      adapter: CODEX_DISPATCH_VERSION,
      runtime,
      pid,
      command: process.execPath,
      args: [fixturePath],
      lease_id: String(action.lease_id || ''),
      idempotency_key: idempotencyKey,
      spawned_at: spawnedAt,
      native_identity: adapter.nativeIdentity || null,
    };
    const invokedReceipt = {
      schema_version: RECEIPT_SCHEMA_VERSION,
      receipt_id: buildReceiptId(invokedInvocation, action),
      invocation_identity: invokedInvocation,
      completion_evidence: { state: 'invoked' },
      intent: String(action.intent || ''),
      authority: String(action.authority || ''),
      risk: String(action.risk || ''),
      provenance: { adapter: CODEX_DISPATCH_VERSION, source_fingerprint: null },
      ...(action.strategy_plan ? { strategy_plan: action.strategy_plan, work_id: action.work_id || null } : {}),
    };
    store.publish(invokedReceipt);

    child.on('exit', (code, signal) => {
      const wallMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      const stdoutSha = hashBytes(Buffer.concat(chunks));
      const state = code === 0 ? 'completed' : 'failed';
      const completion = {
        state,
        exit_code: code === null ? undefined : code,
        stdout_sha256: stdoutSha,
        wall_ms: wallMs,
        ...(signal ? { signal } : {}),
      };
      const completedReceipt = {
        schema_version: RECEIPT_SCHEMA_VERSION,
        receipt_id: buildReceiptId(invokedInvocation, action),
        invocation_identity: invokedInvocation,
        completion_evidence: completion,
        intent: String(action.intent || ''),
        authority: String(action.authority || ''),
        risk: String(action.risk || ''),
        provenance: { adapter: CODEX_DISPATCH_VERSION, source_fingerprint: null },
        ...(action.strategy_plan ? { strategy_plan: action.strategy_plan, work_id: action.work_id || null } : {}),
      };
      store.publish(completedReceipt);
      if (state !== 'completed' && action.replan_context) {
        const lease = action.lease_id ? createLeaseStore({ runtime: 'codex' }).inspect(action.lease_id) : null;
        const current = action.replan_context.current || action.strategy_plan;
        const failure = {
          ...action.replan_context.failure,
          strategy_id: action.replan_context.failure?.strategy_id || current?.strategy_id,
          work_id: action.replan_context.failure?.work_id || action.work_id,
          reason_code: action.replan_context.failure?.reason_code || 'failure',
        };
        const replanned = replanStrategy({ current, failure, replacement: action.replan_context.replacement, checkpoints: lease || action.replan_context.checkpoints });
        const resume = replanned.resume_work?.[0];
        const followup = { ...completedReceipt, completion_evidence: resume ? { state: 'paused' } : { state: 'blocked', reason_codes: [replanned.reason_code] }, ...(resume ? { strategy_plan: replanned, work_id: resume.id } : {}) };
        store.publish(followup);
        if (resume) resumeImpl(followup.receipt_id, adapter);
      }
    });

    return invokedReceipt;
  }

  function pauseImpl(receiptIdArg, adapter) {
    const existing = store.observe(receiptIdArg);
    if (!existing) return null;
    // Pause is a router-internal durable state transition (Pitfall 4), not a
    // process pause. Allow pausing 'invoked'/'pending'/'completed' → 'paused'
    // so a completed receipt can be resumed (re-spawned with the same key).
    // 'recommendation_only'/'failed'/'paused' are not resumable.
    if (!['invoked', 'pending', 'completed'].includes(existing.completion_evidence?.state)) {
      return existing;
    }
    const paused = {
      ...existing,
      completion_evidence: { ...existing.completion_evidence, state: 'paused' },
    };
    store.publish(paused);
    return paused;
  }

  function resumeImpl(receiptIdArg, adapter) {
    const existing = store.observe(receiptIdArg);
    if (!existing || existing.completion_evidence?.state !== 'paused') {
      return existing || null;
    }
    const action = {
      lease_id: existing.invocation_identity?.lease_id,
      idempotency_key: existing.invocation_identity?.idempotency_key,
      intent: existing.intent,
      authority: existing.authority,
      risk: existing.risk,
      runtime: existing.invocation_identity?.runtime,
      args: existing.invocation_identity?.args,
      strategy_plan: existing.strategy_plan,
      work_id: existing.work_id,
      timeout: existing.timeout,
      retry: existing.retry,
      output_bounds: existing.output_bounds,
      completion_contract: existing.completion_contract,
    };
    // Release the idempotency claim so resume can re-spawn with the same key
    // (a controlled continuation, not a duplicate invocation). invokeImpl
    // re-claims the key after spawning, so a subsequent direct invoke() with
    // the same key is still rejected.
    if (existing.strategy_plan?.replan_count !== undefined && action.lease_id) {
      const leaseStore = createLeaseStore({ runtime: 'codex' });
      const durable = leaseStore.inspect(action.lease_id);
      if (!durable) return existing;
      const claim = leaseStore.claimCheckpoint(action.lease_id, action.idempotency_key);
      if (claim.claimed !== true) return existing;
    }
    releaseIdempotency(action.idempotency_key);
    return invokeImpl(action, adapter);
  }

  const adapter = createDispatchAdapter({
    runtime,
    adapterVersion: CODEX_DISPATCH_VERSION,
    receiptRoot: resolvedReceiptRoot,
    fixture: fixturePath,
    nativeIdentity: 'codex',
    allowedRoots: roots,
    invokeImpl,
    canDispatchImpl,
    pauseImpl,
    resumeImpl,
  });
  adapter._receiptStore = store;

  // observe() validates receipt.runtime on read — reject cross-runtime
  // receipts (T-38-08). A Claude receipt presented to the Codex observe()
  // path is rejected even if it were somehow published into the codex
  // partition. The default partition isolation (different dirs) is the
  // primary defense; this is defense-in-depth.
  const baseObserve = adapter.observe.bind(adapter);
  adapter.observe = function observe(receiptId) {
    const r = baseObserve(receiptId);
    if (!r) return null;
    if (r.invocation_identity?.runtime && r.invocation_identity.runtime !== 'codex') {
      return null; // cross-runtime receipt rejected
    }
    return r;
  };

  return adapter;
}

// Default singleton adapter for direct probes (the worker builds its own).
export const adapter = createCodexDispatchAdapter();

// --- Worker entrypoint -----------------------------------------------------
// Run as `node src/adapters/dispatch/codex.mjs`. Reads the
// ~/.codex/router/dispatch-lease.json marker, builds a minimal action,
// invokes the adapter, and waits for the completion receipt before exiting.
// Identical structure to claude.mjs's worker; the marker path and the
// adapter factory differ.
async function runAsWorker() {
  let lease = null;
  try {
    const marker = leaseMarkerPath();
    if (existsSync(marker)) {
      lease = JSON.parse(readFileSync(marker, 'utf8'));
    }
  } catch { lease = null; }
  if (!lease) return; // no lease → no dispatch (fail-open)
  const action = {
    lease_id: String(lease.lease_id || 'phase-38-codex-fixture-lease'),
    idempotency_key: String(lease.idempotency_key || lease.lease_id || ''),
    intent: String(lease.intent || 'host-02-feasibility'),
    authority: String(lease.authority || 'operator-authorized'),
    risk: String(lease.risk || 'harmless-fixture'),
  };
  const workerAdapter = createCodexDispatchAdapter({
    fixture: lease.fixture || DEFAULT_FIXTURE,
  });
  const invoked = workerAdapter.invoke(action);
  if (!invoked || !invoked.receipt_id) return;
  // Wait for the completion receipt (poll observe() up to 5s). The fixture
  // exits in <100ms; the 5s ceiling is defense-in-depth against a wedged child.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const r = workerAdapter.observe(invoked.receipt_id);
    if (r && ['completed', 'failed', 'recommendation_only'].includes(r.completion_evidence?.state)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

if (isMain()) {
  runAsWorker().then(() => process.exit(0)).catch(() => process.exit(0));
}
