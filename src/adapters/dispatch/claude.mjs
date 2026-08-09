// src/adapters/dispatch/claude.mjs — Phase 38 Claude NativeDispatchAdapter.
//
// Implements the createDispatchAdapter contract for the Claude runtime. The
// adapter has TWO entry points:
//
//   1. As a MODULE (imported by tests or the receipt observer): the factory
//      createClaudeDispatchAdapter() returns the adapter object whose
//      invoke(action) spawns the fixture IN-PROCESS with stdio:'pipe',
//      registers a child 'exit' handler, and writes the completion receipt
//      when the child exits. The calling process must stay alive long enough
//      for the 'exit' event to fire (tests poll observe() until 'completed').
//
//   2. As a WORKER (run directly via `node claude.mjs`): the hook trigger
//      spawns this file as a detached, unref'd subprocess (analog:
//      router.mjs:2307-2343 bumpEvolveTrigger spawning the evolve worker).
//      The worker reads the dispatch-lease.json marker, calls invoke(),
//      waits for the completion receipt, and exits. This keeps the hook
//      prompt path fire-and-forget (<100ms) while still producing a
//      'completed' receipt — the completion capture happens in the worker
//      process, not the hook process.
//
// canDispatch() — { ok: true } when the fixture path is contained (reject
//   '..', root escape; must resolve inside the repo or ~/.claude/router/)
//   and the node binary is present; { ok:false, reason } otherwise.
// Empty/null/missing action → 'recommendation_only' receipt, no spawn
//   (Test 5 / T-38-02). stdlib-only.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createDispatchAdapter, RECEIPT_SCHEMA_VERSION, validateInvocation, validateStrategyBounds, preDispatchGate, runBoundedChild } from './contract.mjs';
import {
  ReceiptStore, attributionFromAction, buildPendingReceipt, defaultReceiptRoot,
  hashBytes, outcomeCredit, receiptIdentityFromAction,
  transitionReceipt,
} from './receipt.mjs';
// Phase 39 AUTH-04/05: authority taxonomy + policy evaluator used to
// populate the receipt's intent/authority/risk string fields from the
// policy output rather than fixture defaults. Pure functions; no I/O.
import {
  classifyAuthority,
  evaluateAuthorityPolicy,
} from '../../intent/authority.mjs';
import { planProductionDispatch, replanStrategy } from '../../orchestrator/strategy.mjs';

export const CLAUDE_DISPATCH_VERSION = 'claude-dispatch/1';

/**
 * Derive the receipt's intent/authority/risk string fields from the
 * authority-policy output when the lease carries a prompt. Falls back to
 * the lease's explicit fields, then to the fixture defaults. buildReceipt
 * shape is unchanged (contract.mjs untouched) — only the source of the
 * three string values changes. AUTH-02: classifyAuthority's framing guard
 * demotes autonomous wording inside example/retrospective/policy framing
 * to non_authorizing_discussion even when the lease's prompt carries it.
 */
function deriveReceiptStrings(lease) {
  const prompt = lease && typeof lease.prompt === 'string' ? lease.prompt : '';
  const fallback = {
    intent: String(lease?.intent || 'host-01-feasibility'),
    authority: String(lease?.authority || 'operator-authorized'),
    risk: String(lease?.risk || 'harmless-fixture'),
  };
  if (!prompt) return fallback;
  try {
    const authority = classifyAuthority(prompt, { intent: { disposition: 'execute' } });
    const policy = evaluateAuthorityPolicy({
      confidence: lease?.confidence || 'medium',
      authority: {
        authGranted: lease?.authGranted !== false,
        protected_: Boolean(lease?.protected_),
      },
      risk: {
        reversible: lease?.reversible !== false,
        local: lease?.local !== false,
      },
      compatibility: {
        eligible: lease?.eligible !== false,
        disposition: lease?.dispatch_candidate !== false ? 'dispatch-candidate' : 'non-dispatch',
      },
    });
    return {
      intent: String(lease?.intent || authority.authority_class || fallback.intent),
      authority: String(authority.authority_class || fallback.authority),
      risk: String(policy.decision === 'pause' ? 'protected-effect' : policy.decision || fallback.risk),
    };
  } catch {
    return fallback; // fail-open: never block the worker on a policy throw
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const DEFAULT_FIXTURE = join(REPO_ROOT, 'tests', 'phase-38', 'fixtures', 'harmless.mjs');
const LEASE_MARKER = join(homedir(), '.claude', 'router', 'dispatch-lease.json');

function isMain() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href
      || String(process.argv[1] || '').endsWith('/adapters/dispatch/claude.mjs');
  } catch { return false; }
}

// --- Path containment (T-38-01 / T-38-06) -----------------------------------
// The fixture command must resolve inside the repo or ~/.claude/router/.
// Reject '..', root escape. Analog of the discovery adapter's
// within()/portableTarget() (src/adapters/claude.mjs:10, :246-289) but
// reimplemented locally so the dispatch contract does not mutate the
// discovery adapter (the plan's files_modified list does not include
// src/adapters/claude.mjs).
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
  return [REPO_ROOT, join(homedir(), '.claude', 'router')];
}

// --- Idempotent checkpoint (minimal Phase 40 LEASE-05 primitive) ----------
// The in-memory _idempotencySeen Set is the HOT-PATH FAST-PATH only. The
// AUTHORITATIVE at-most-once gate is the durable claimCheckpoint on the
// lease record (src/lease/store.mjs) — it survives compaction/restart;
// this Set does not. resumeImpl consults the durable claim first; this
// Set remains only so invokeImpl's direct-second-invoke guard stays O(1)
// on the hot path (Pitfall 2 — Phase 38 in-memory Set is lost on re-spawn).
const _idempotencySeen = new Set();
function claimIdempotency(key) {
  if (!key) return true;
  if (_idempotencySeen.has(key)) return false;
  _idempotencySeen.add(key);
  return true;
}
// resume() releases the key before re-spawning so the same idempotency_key
// can drive a resume (a controlled continuation, not a duplicate invocation).
// A direct second invoke() with the same key is still rejected because
// resume re-claims the key after spawning (Phase 40 LEASE-05 primitive).
function releaseIdempotency(key) {
  if (key) _idempotencySeen.delete(key);
}

// --- LEASE-05 durable lease store (memoized, fail-open null sentinel) ----
// Mirrors the getAuthorityMod/getReceiptStore pattern: module-level cached,
// deployed modules/lease/ path searched first, dev src/lease/ second, fail-open
// null sentinel. If the lease module is unavailable (null), resumeImpl falls
// back to the existing in-memory path so Phase 38 behavior is preserved.
function resolveLeaseModulePath(name) {
  const deployed = join(homedir(), '.claude', 'router', 'modules', 'lease', name);
  if (existsSync(deployed)) return deployed;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const dev = join(here, '..', '..', 'lease', name);
    if (existsSync(dev)) return dev;
  } catch { /* fall through */ }
  return deployed;
}
let _leaseMod = null;
let _leaseStore = null;
async function _loadLeaseMod() {
  if (_leaseMod !== null) return _leaseMod || null;
  try {
    _leaseMod = {
      store: await import(pathToFileURL(resolveLeaseModulePath('store.mjs')).href),
    };
  } catch (_) { _leaseMod = false; }
  return _leaseMod || null;
}
function getLeaseStore() {
  if (_leaseStore === null) {
    const mod = _leaseMod && _leaseMod.store ? _leaseMod : null;
    if (!mod || typeof mod.store.createLeaseStore !== 'function') {
      _leaseStore = false;
      return null;
    }
    try { _leaseStore = mod.store.createLeaseStore({ runtime: 'claude' }); }
    catch { _leaseStore = false; return null; }
  }
  return _leaseStore || null;
}
// Eager-load the lease module at import time (top-level await, ESM-safe) so
// getLeaseStore() is synchronous on the hot path. Mirrors router.mjs's
// authority-module load pattern.
await _loadLeaseMod();

// Test-only helpers: reset the in-memory idempotency Set and the cached
// lease store so tests can simulate a restart (the durable lease record on
// disk is the authoritative gate; these reset only the in-process caches).
export function _resetIdempotencyForTest() { _idempotencySeen.clear(); }
export function _resetLeaseStoreForTest() { _leaseStore = null; }

// --- Adapter factory --------------------------------------------------------
export function createClaudeDispatchAdapter({
  receiptRoot,
  fixture,
  allowedRoots,
} = {}) {
  const runtime = 'claude';
  const resolvedReceiptRoot = receiptRoot || defaultReceiptRoot(runtime);
  const logPath = join(resolvedReceiptRoot, 'receipts.jsonl');
  const store = new ReceiptStore({ dir: resolvedReceiptRoot, logPath });
  const roots = allowedRoots || defaultAllowedRoots();
  const fixturePath = fixture || DEFAULT_FIXTURE;

  function canDispatchImpl() {
    const v = validateFixturePath(fixturePath, roots);
    if (!v.ok) return { ok: false, reason: v.reason };
    if (!process.execPath) return { ok: false, reason: 'no_node_binary' };
    return { ok: true };
  }

  function recommendationOnly(action, reason, state = 'recommendation_only') {
    const pending = buildPendingReceipt({
      schema_version: RECEIPT_SCHEMA_VERSION,
      adapter: CLAUDE_DISPATCH_VERSION,
      runtime,
      identity: receiptIdentityFromAction(action),
      intent: action?.intent,
      selected: action?.selected,
      alternatives: action?.alternatives,
      bounded_evidence: action?.bounded_evidence,
      provenance: { adapter: CLAUDE_DISPATCH_VERSION, source_fingerprint: null },
    });
    const route_state = state === 'blocked' ? 'blocked'
      : ['empty_action', 'already_claimed'].includes(reason) ? 'ignored' : 'rejected';
    const receipt = transitionReceipt(pending, state, {
      route_state,
      completion_evidence: reason
        ? (state === 'blocked' || reason === 'already_claimed'
          ? { reason_codes: [reason] } : { reason })
        : {},
      ...attributionFromAction(action),
    });
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

    const identity = receiptIdentityFromAction(action);
    const claim = action.__dispatch_claimed
      ? { claimed: true }
      : store.claim({
        runtime,
        stage: action.__dispatch_stage || 'initial',
        identity,
      });
    if (claim.claimed !== true) return recommendationOnly(action, 'already_claimed');

    const pendingReceipt = buildPendingReceipt({
      schema_version: RECEIPT_SCHEMA_VERSION,
      adapter: CLAUDE_DISPATCH_VERSION,
      runtime,
      identity: receiptIdentityFromAction(action),
      intent: action.intent,
      ...attributionFromAction(action),
      provenance: { adapter: CLAUDE_DISPATCH_VERSION, source_fingerprint: null },
      execution_contract: gate.value,
    });
    store.publish(pendingReceipt);

    if (gate.value) {
      const invokedAt = new Date().toISOString();
      const invokedReceipt = transitionReceipt(pendingReceipt, 'invoked', {
        invocation_identity: {
          adapter: CLAUDE_DISPATCH_VERSION,
          runtime,
          pid: null,
          command: process.execPath,
          args: [fixturePath],
          lease_id: String(action.lease_id || ''),
          idempotency_key: idempotencyKey,
          spawned_at: invokedAt,
          native_identity: adapter.nativeIdentity || null,
        },
        ...attributionFromAction(action),
      });
      store.publish(invokedReceipt);
      runBoundedChild({
        command: process.execPath,
        args: [fixturePath],
        execution_contract: gate.value,
        spawn_options: {
          detached: true,
          env: { ...process.env, ROUTER_RUNTIME: runtime },
        },
      }).then((result) => {
        const terminal = transitionReceipt(pendingReceipt, result.state, {
          invocation_identity: {
            ...invokedReceipt.invocation_identity,
            pid: result.pid ?? null,
          },
          completion_evidence: {
            ...result,
            state: result.state,
          },
          invocation_evidence: { receipt_id: pendingReceipt.receipt_id, observed: true },
          ...attributionFromAction(action),
        });
        terminal.outcome_credit = outcomeCredit(terminal);
        store.publish(terminal);
      }).catch(() => {});
      return invokedReceipt;
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
        adapter: CLAUDE_DISPATCH_VERSION,
        runtime,
        pid: null,
        command: process.execPath,
        args: [fixturePath],
        lease_id: String(action.lease_id || ''),
        idempotency_key: idempotencyKey,
        spawned_at: new Date().toISOString(),
        native_identity: adapter.nativeIdentity || null,
      };
      const receipt = transitionReceipt(pendingReceipt, 'failed', {
        invocation_identity: invocation,
        completion_evidence: { reason: `spawn_failed: ${err?.message || String(err)}` },
        ...attributionFromAction(action),
      });
      store.publish(receipt);
      return receipt;
    }

    child.stdout.on('data', (c) => chunks.push(c));
    child.stderr.on('data', () => { /* captured for diagnostics, not hashed into receipt */ });
    // NOTE: we deliberately do NOT call child.unref() here. The 'exit' handler
    // must fire to write the completion receipt, so the child keeps this
    // process's event loop alive until it exits. In the WORKER entrypoint
    // (below) this is what keeps the worker alive long enough to capture
    // completion. In the hook entrypoint, the hook spawns THIS file as the
    // worker (detached + unref'd) and returns immediately — the hook's own
    // event loop is not affected by the fixture child at all.

    const pid = child.pid;
    const spawnedAt = new Date().toISOString();
    const invokedInvocation = {
      adapter: CLAUDE_DISPATCH_VERSION,
      runtime,
      pid,
      command: process.execPath,
      args: [fixturePath],
      lease_id: String(action.lease_id || ''),
      idempotency_key: idempotencyKey,
      spawned_at: spawnedAt,
      native_identity: adapter.nativeIdentity || null,
    };
    const invokedReceipt = transitionReceipt(pendingReceipt, 'invoked', {
      invocation_identity: invokedInvocation,
      ...attributionFromAction(action),
      ...(action.strategy_plan ? { strategy_plan: action.strategy_plan, work_id: action.work_id || null } : {}),
    });
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
      const completedReceipt = transitionReceipt(pendingReceipt, state, {
        invocation_identity: invokedInvocation,
        completion_evidence: completion,
        invocation_evidence: { receipt_id: pendingReceipt.receipt_id, observed: true },
        ...attributionFromAction(action),
        ...(action.strategy_plan ? { strategy_plan: action.strategy_plan, work_id: action.work_id || null } : {}),
      });
      completedReceipt.outcome_credit = outcomeCredit(completedReceipt);
      store.publish(completedReceipt);
      if (state !== 'completed' && action.replan_context) {
        const leaseStore = getLeaseStore();
        const checkpoints = leaseStore && action.lease_id
          ? leaseStore.inspect(action.lease_id)
          : action.replan_context.checkpoints;
        const current = action.replan_context.current || action.strategy_plan;
        const failure = {
          ...action.replan_context.failure,
          strategy_id: action.replan_context.failure?.strategy_id || current?.strategy_id,
          work_id: action.replan_context.failure?.work_id || action.work_id,
          reason_code: action.replan_context.failure?.reason_code || 'failure',
        };
        const replanned = replanStrategy({ current, failure, replacement: action.replan_context.replacement, checkpoints });
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
    const paused = transitionReceipt(existing, 'paused');
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
      execution_contract: existing.execution_contract,
      __dispatch_stage: 'resume',
    };
    // LEASE-05: durable checkpoint claim. The on-lease claimCheckpoint is the
    // AUTHORITATIVE at-most-once gate — it survives compaction/restart (the
    // in-memory _idempotencySeen Set does not). If the lease store is
    // available and the action carries a lease_id, claim durably first. A
    // claimed:false (already_claimed) result returns the existing paused
    // receipt WITHOUT re-spawning (at-most-once). If the lease store is
    // unavailable (null), fall back to the existing in-memory path so
    // Phase 38 behavior is preserved when the lease module is absent.
    const leaseStore = getLeaseStore();
    if (leaseStore && action.lease_id) {
      // A test/legacy receipt may have no durable lease record. Preserve the
      // Phase 38 in-memory resume path in that case; an existing lease remains
      // authoritative and must explicitly claim before re-spawn.
      if (leaseStore.inspect(action.lease_id)) {
        const claim = leaseStore.claimCheckpoint(action.lease_id, action.idempotency_key);
        if (claim.claimed !== true) {
          return existing;
        }
      }
    }
    const resumeClaim = store.claim({
      runtime,
      stage: 'resume',
      identity: receiptIdentityFromAction(action),
    });
    if (resumeClaim.claimed !== true) return existing;
    // Release the in-memory idempotency claim so resume can re-spawn with
    // the same key (a controlled continuation, not a duplicate invocation).
    // invokeImpl re-claims the key after spawning. The durable claim stays
    // on the lease record — it is NOT released by resume (it is the
    // authoritative gate; a second resume with the same key is rejected).
    releaseIdempotency(action.idempotency_key);
    return invokeImpl({ ...action, __dispatch_claimed: true }, adapter);
  }

  const adapter = createDispatchAdapter({
    runtime,
    adapterVersion: CLAUDE_DISPATCH_VERSION,
    receiptRoot: resolvedReceiptRoot,
    fixture: fixturePath,
    nativeIdentity: 'claude',
    allowedRoots: roots,
    invokeImpl,
    canDispatchImpl,
    pauseImpl,
    resumeImpl,
  });
  adapter._receiptStore = store;
  return adapter;
}

// Default singleton adapter for direct probes (the worker builds its own).
export const adapter = createClaudeDispatchAdapter();

// --- Worker entrypoint -----------------------------------------------------
// Run as `node src/adapters/dispatch/claude.mjs`. Reads the dispatch-lease.json
// marker (written by the operator or the hook trigger's caller), builds a
// minimal action, invokes the adapter, and waits for the completion receipt
// before exiting. The hook trigger spawns this worker detached + unref'd so
// the hook returns <100ms; the worker captures completion off the hot path.
async function runAsWorker() {
  let lease = null;
  try {
    if (existsSync(LEASE_MARKER)) {
      lease = JSON.parse(readFileSync(LEASE_MARKER, 'utf8'));
    }
  } catch { lease = null; }
  if (!lease) return; // no lease → no dispatch (fail-open)
  const receiptStrings = deriveReceiptStrings(lease);
  const planned = planProductionDispatch(lease);
  const action = {
    lease_id: String(lease.lease_id || 'phase-38-fixture-lease'),
    idempotency_key: String(lease.idempotency_key || lease.lease_id || ''),
    intent: receiptStrings.intent,
    authority: receiptStrings.authority,
    risk: receiptStrings.risk,
    strategy_plan: planned.strategy_plan,
    ...(planned.strategy_id ? { strategy_id: planned.strategy_id, workflow_id: planned.workflow_id, transition_id: planned.transition_id } : {}),
  };
  const workerAdapter = createClaudeDispatchAdapter({
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
