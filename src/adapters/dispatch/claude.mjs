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

import { createDispatchAdapter, RECEIPT_SCHEMA_VERSION } from './contract.mjs';
import {
  ReceiptStore, defaultReceiptRoot, hashBytes, receiptId,
} from './receipt.mjs';

export const CLAUDE_DISPATCH_VERSION = 'claude-dispatch/1';

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
const _idempotencySeen = new Set();
function claimIdempotency(key) {
  if (!key) return true;
  if (_idempotencySeen.has(key)) return false;
  _idempotencySeen.add(key);
  return true;
}

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

  function buildReceiptId(invocation, action) {
    return receiptId({
      adapter: CLAUDE_DISPATCH_VERSION,
      runtime,
      pid: invocation.pid,
      command: invocation.command,
      args: invocation.args,
      lease_id: action?.lease_id || '',
      idempotency_key: action?.idempotency_key || '',
    });
  }

  function recommendationOnly(action, reason) {
    const invocation = {
      adapter: CLAUDE_DISPATCH_VERSION,
      runtime,
      pid: null,
      command: null,
      args: [],
      lease_id: String(action?.lease_id || ''),
      idempotency_key: String(action?.idempotency_key || ''),
      spawned_at: null,
      native_identity: null,
    };
    const receipt = {
      schema_version: RECEIPT_SCHEMA_VERSION,
      receipt_id: buildReceiptId(invocation, action),
      invocation_identity: invocation,
      completion_evidence: { state: 'recommendation_only', ...(reason ? { reason } : {}) },
      intent: String(action?.intent || ''),
      authority: String(action?.authority || ''),
      risk: String(action?.risk || ''),
      provenance: { adapter: CLAUDE_DISPATCH_VERSION, source_fingerprint: null },
    };
    store.publish(receipt);
    return receipt;
  }

  function invokeImpl(action, adapter) {
    // Validate action: null/empty/{} → recommendation_only, no spawn.
    if (!action || typeof action !== 'object' || Object.keys(action).length === 0) {
      return recommendationOnly(action, 'empty_action');
    }
    const can = canDispatchImpl(action);
    if (!can.ok) return recommendationOnly(action, can.reason);

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
      const receipt = {
        schema_version: RECEIPT_SCHEMA_VERSION,
        receipt_id: buildReceiptId(invocation, action),
        invocation_identity: invocation,
        completion_evidence: { state: 'failed', reason: `spawn_failed: ${err?.message || String(err)}` },
        intent: String(action.intent || ''),
        authority: String(action.authority || ''),
        risk: String(action.risk || ''),
        provenance: { adapter: CLAUDE_DISPATCH_VERSION, source_fingerprint: null },
      };
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
    const invokedReceipt = {
      schema_version: RECEIPT_SCHEMA_VERSION,
      receipt_id: buildReceiptId(invokedInvocation, action),
      invocation_identity: invokedInvocation,
      completion_evidence: { state: 'invoked' },
      intent: String(action.intent || ''),
      authority: String(action.authority || ''),
      risk: String(action.risk || ''),
      provenance: { adapter: CLAUDE_DISPATCH_VERSION, source_fingerprint: null },
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
        provenance: { adapter: CLAUDE_DISPATCH_VERSION, source_fingerprint: null },
      };
      store.publish(completedReceipt);
    });

    return invokedReceipt;
  }

  function pauseImpl(receiptIdArg, adapter) {
    const existing = store.observe(receiptIdArg);
    if (!existing) return null;
    if (!['invoked', 'pending'].includes(existing.completion_evidence?.state)) {
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
    };
    return invokeImpl(action, adapter);
  }

  const adapter = createDispatchAdapter({
    runtime,
    adapterVersion: CLAUDE_DISPATCH_VERSION,
    receiptRoot: resolvedReceiptRoot,
    fixture: fixturePath,
    nativeIdentity: 'claude',
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
  const action = {
    lease_id: String(lease.lease_id || 'phase-38-fixture-lease'),
    idempotency_key: String(lease.idempotency_key || lease.lease_id || ''),
    intent: String(lease.intent || 'host-01-feasibility'),
    authority: String(lease.authority || 'operator-authorized'),
    risk: String(lease.risk || 'harmless-fixture'),
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