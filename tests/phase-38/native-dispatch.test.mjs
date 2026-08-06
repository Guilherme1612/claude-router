// tests/phase-38/native-dispatch.test.mjs — Phase 38 HOST-01 anti-cheat suite.
//
// Cross-cutting anti-cheat properties (Tests 2-5) PLUS the tracer smoke tests
// (adapter spawn path + hook-triggered worker path). The anti-cheat property
// (SC1/SC2) is the load-bearing HOST-01 invariant: ONLY an adapter spawn
// yields a receipt with state 'invoked'/'completed' + an adapter-issued
// invocation_identity. Recommendation text, a test helper, and empty/null
// input all fail to produce one.
//
// Test isolation follows tests/router.adapters.test.mjs:19-22 and
// tests/router.perf.test.mjs:21-22: mkdtempSync TEST_HOME + after() rmSync.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createClaudeDispatchAdapter } from '../../src/adapters/dispatch/claude.mjs';

const FIXTURE_STDOUT = 'router-dispatch-ok 38a1b2c3 ☕\n';
const EXPECTED_STDOUT_SHA = createHash('sha256').update(Buffer.from(FIXTURE_STDOUT, 'utf8')).digest('hex');

function newTestHome() {
  return mkdtempSync(join(tmpdir(), 'router-38-native-'));
}

function waitForCompletion(adapter, receiptId, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const r = adapter.observe(receiptId);
      if (r && ['completed', 'failed', 'recommendation_only'].includes(r.completion_evidence?.state)) {
        return resolve(r);
      }
      if (Date.now() > deadline) return reject(new Error(`timeout waiting for receipt ${receiptId} (state=${r?.completion_evidence?.state})`));
      setTimeout(tick, 10);
    };
    tick();
  });
}

test('tracer: adapter spawn produces a completed receipt with adapter-issued identity + stdout_sha256', async () => {
  const TEST_HOME = newTestHome();
  process.env.HOME = TEST_HOME;
  try {
    const adapter = createClaudeDispatchAdapter();
    const can = adapter.canDispatch();
    assert.equal(can.ok, true, `canDispatch must be ok (got ${JSON.stringify(can)})`);

    const action = {
      lease_id: 'tracer-lease',
      idempotency_key: 'tracer-1',
      intent: 'host-01-feasibility',
      authority: 'operator-authorized',
      risk: 'harmless-fixture',
    };
    const invoked = adapter.invoke(action);
    assert.equal(invoked.completion_evidence.state, 'invoked', 'invoke() returns an invoked receipt immediately');
    assert.equal(typeof invoked.invocation_identity.pid, 'number');
    assert.ok(invoked.invocation_identity.pid > 0, 'pid must be a positive integer');
    assert.equal(invoked.invocation_identity.adapter, 'claude-dispatch/1');
    assert.equal(invoked.invocation_identity.runtime, 'claude');
    assert.ok(invoked.invocation_identity.command, 'command must be populated');
    assert.ok(invoked.invocation_identity.lease_id, 'lease_id must be populated');
    assert.ok(invoked.invocation_identity.idempotency_key, 'idempotency_key must be populated');

    const final = await waitForCompletion(adapter, invoked.receipt_id);
    assert.equal(final.completion_evidence.state, 'completed');
    assert.equal(final.completion_evidence.exit_code, 0);
    assert.equal(final.completion_evidence.stdout_sha256, EXPECTED_STDOUT_SHA,
      'stdout_sha256 must match the fixture deterministic stdout (raw bytes)');
    assert.ok(typeof final.completion_evidence.wall_ms === 'number' && final.completion_evidence.wall_ms >= 0,
      'wall_ms must be a non-negative number');

    // The receipt file must exist on disk (atomic publish).
    const receiptsDir = join(TEST_HOME, '.claude', 'router', 'receipts');
    assert.ok(existsSync(join(receiptsDir, `${invoked.receipt_id}.json`)),
      'receipt file must be atomically published');
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

test('tracer: hook trigger spawns the worker off the hot path and produces a completed receipt', async () => {
  const TEST_HOME = newTestHome();
  try {
    // Place the lease marker under TEST_HOME/.claude/router/.
    const routerDir = join(TEST_HOME, '.claude', 'router');
    await import('node:fs').then(({ mkdirSync, writeFileSync }) => {
      mkdirSync(routerDir, { recursive: true });
      writeFileSync(join(routerDir, 'dispatch-lease.json'), JSON.stringify({
        lease_id: 'tracer-hook', idempotency_key: 'tracer-hook-1',
      }));
    });

    // Drive the hook via spawnSync. The hook trigger fires the worker
    // (detached + unref'd) and returns; the worker writes the receipt.
    const { spawnSync } = await import('node:child_process');
    const HOOK = join(process.cwd(), 'src', 'runtime', 'router.mjs');
    const CONTEXT = join(process.cwd(), 'src', 'context', 'prompt-route.mjs');
    const r = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ prompt: 'thanks' }),
      encoding: 'utf8', timeout: 5000,
      env: { ...process.env, HOME: TEST_HOME, ROUTER_DEBUG_LATENCY: '1', ROUTER_CONTEXT_MODULE_PATH: CONTEXT },
    });
    assert.equal(r.status, 0, 'hook must exit 0 (fail-open)');

    // The detached worker may still be running; poll for the COMPLETED receipt.
    // The worker writes an 'invoked' receipt immediately, then a 'completed'
    // receipt when the fixture exits — so we must poll for state='completed',
    // not just for any file appearing.
    const receiptsDir = join(TEST_HOME, '.claude', 'router', 'receipts');
    let completed = null;
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (existsSync(receiptsDir)) {
        for (const f of readdirSync(receiptsDir)) {
          if (!f.endsWith('.json')) continue;
          try {
            const data = JSON.parse(readFileSync(join(receiptsDir, f), 'utf8'));
            if (data.completion_evidence?.state === 'completed'
                && data.invocation_identity?.adapter === 'claude-dispatch/1') {
              completed = data;
              break;
            }
          } catch { /* partially-written file; retry next tick */ }
        }
      }
      if (completed) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(completed, 'at least one receipt must be completed with adapter=claude-dispatch/1');
    assert.equal(completed.completion_evidence.exit_code, 0);
    assert.equal(completed.completion_evidence.stdout_sha256, EXPECTED_STDOUT_SHA);
    assert.equal(completed.invocation_identity.runtime, 'claude');
    assert.ok(typeof completed.invocation_identity.pid === 'number' && completed.invocation_identity.pid > 0);
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});
// --- Anti-cheat tests (Tests 2-5) ------------------------------------------
// These tests assert the SC1/SC2 property: ONLY an adapter spawn yields a
// receipt with state 'invoked'/'completed' + an adapter-issued
// invocation_identity. Each test probes a path that MUST NOT produce one.

// Test 2 (anti-cheat, recommendation-only): when canDispatch() returns
// { ok: false } (simulated by pointing the fixture at a missing file), invoke()
// produces a receipt with state='recommendation_only' and NO pid — and does
// NOT spawn a child (T-38-02).
test('anti-cheat: canDispatch=false yields recommendation_only receipt, no pid, no spawn', () => {
  const TEST_HOME = newTestHome();
  process.env.HOME = TEST_HOME;
  try {
    const adapter = createClaudeDispatchAdapter({ fixture: '/nonexistent/missing-fixture.mjs' });
    const can = adapter.canDispatch();
    assert.equal(can.ok, false);
    assert.ok(can.reason, 'canDispatch must supply a reason when not ok');

    const receipt = adapter.invoke({ lease_id: 'anti-cheat-2', idempotency_key: 'ac2', intent: 'x', authority: 'y', risk: 'z' });
    assert.equal(receipt.completion_evidence.state, 'recommendation_only');
    assert.equal(receipt.invocation_identity.pid, null, 'recommendation_only receipt must have NO pid');
    assert.equal(receipt.invocation_identity.command, null);
    assert.equal(receipt.invocation_identity.adapter, 'claude-dispatch/1');

    // No receipt with state 'invoked'/'completed' must exist.
    const receiptsDir = join(TEST_HOME, '.claude', 'router', 'receipts');
    if (existsSync(receiptsDir)) {
      for (const f of readdirSync(receiptsDir).filter((f) => f.endsWith('.json'))) {
        const data = JSON.parse(readFileSync(join(receiptsDir, f), 'utf8'));
        assert.notEqual(data.completion_evidence.state, 'invoked',
          'recommendation_only path must not produce an invoked receipt');
        assert.notEqual(data.completion_evidence.state, 'completed',
          'recommendation_only path must not produce a completed receipt');
      }
    }
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

// Test 3 (anti-cheat, test-helper-alone): running the fixture directly via
// spawnSync (no adapter) produces NO receipt with state 'invoked'/'completed'
// under the receipts dir. A test helper cannot forge an adapter-issued
// invocation_identity (T-38-03 / SC1).
test('anti-cheat: test helper running the fixture directly produces no completed receipt', () => {
  const TEST_HOME = newTestHome();
  process.env.HOME = TEST_HOME;
  try {
    const FIXTURE = join(process.cwd(), 'tests', 'phase-38', 'fixtures', 'harmless.mjs');
    // Run the fixture directly — NO adapter in the invocation path.
    const r = spawnSync(process.execPath, [FIXTURE], { encoding: 'utf8', timeout: 5000 });
    assert.equal(r.status, 0, 'fixture must exit 0 when run directly');

    // Assert NO receipt with state 'invoked'/'completed' exists. The test
    // helper has no adapter-issued pid, so the receipts dir must not contain
    // a forged completed receipt.
    const receiptsDir = join(TEST_HOME, '.claude', 'router', 'receipts');
    if (existsSync(receiptsDir)) {
      for (const f of readdirSync(receiptsDir).filter((f) => f.endsWith('.json'))) {
        const data = JSON.parse(readFileSync(join(receiptsDir, f), 'utf8'));
        assert.notEqual(data.completion_evidence?.state, 'invoked',
          'test helper alone must not produce an invoked receipt');
        assert.notEqual(data.completion_evidence?.state, 'completed',
          'test helper alone must not produce a completed receipt');
      }
    }
    // The receipts dir typically does not exist at all when no adapter ran.
    const adapterReceiptsExist = existsSync(receiptsDir)
      && readdirSync(receiptsDir).some((f) => f.endsWith('.json'));
    assert.equal(adapterReceiptsExist, false,
      'no adapter-issued receipt file must exist when the fixture runs without the adapter');
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

// Test 4 (anti-cheat, recommendation-text-alone): driving the hook via
// spawnSync with a routing prompt (so emit() produces recommendation text)
// but NO lease marker produces NO receipt with state 'invoked'/'completed'.
// Recommendation text alone cannot pass HOST-01 (T-38-02 / SC2).
test('anti-cheat: hook recommendation text alone produces no completed receipt (no lease marker)', async () => {
  const TEST_HOME = newTestHome();
  try {
    const HOOK = join(process.cwd(), 'src', 'runtime', 'router.mjs');
    const CONTEXT = join(process.cwd(), 'src', 'context', 'prompt-route.mjs');
    // No dispatch-lease.json marker → triggerNativeDispatch is a no-op.
    const r = spawnSync(process.execPath, [HOOK], {
      input: JSON.stringify({ prompt: 'fix the bug in src/auth.ts and add tests' }),
      encoding: 'utf8', timeout: 5000,
      env: { ...process.env, HOME: TEST_HOME, ROUTER_DEBUG_LATENCY: '1', ROUTER_CONTEXT_MODULE_PATH: CONTEXT },
    });
    assert.equal(r.status, 0, 'hook must exit 0 (fail-open)');

    // The hook may emit recommendation additionalContext on stdout (the
    // prompt routes), but that text MUST NOT produce a receipt.
    const receiptsDir = join(TEST_HOME, '.claude', 'router', 'receipts');
    if (existsSync(receiptsDir)) {
      for (const f of readdirSync(receiptsDir).filter((f) => f.endsWith('.json'))) {
        const data = JSON.parse(readFileSync(join(receiptsDir, f), 'utf8'));
        assert.notEqual(data.completion_evidence?.state, 'invoked',
          'recommendation text alone must not produce an invoked receipt');
        assert.notEqual(data.completion_evidence?.state, 'completed',
          'recommendation text alone must not produce a completed receipt');
      }
    }
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

// Test 5 (anti-cheat, empty/null action): invoking the adapter with
// null/empty/{} action returns a 'recommendation_only' receipt and does NOT
// spawn a child (no pid). HOST-01 edge-probe (empty action).
test('anti-cheat: empty/null/{} action yields recommendation_only and no spawn', () => {
  const TEST_HOME = newTestHome();
  process.env.HOME = TEST_HOME;
  try {
    const adapter = createClaudeDispatchAdapter();

    const cases = [
      ['null', null],
      ['undefined', undefined],
      ['empty object', {}],
      ['empty string', ''],
    ];
    for (const [label, action] of cases) {
      const receipt = adapter.invoke(action);
      assert.equal(receipt.completion_evidence.state, 'recommendation_only',
        `${label} action must produce recommendation_only`);
      assert.equal(receipt.invocation_identity.pid, null,
        `${label} action must produce no pid`);
      assert.equal(receipt.invocation_identity.command, null,
        `${label} action must produce no command`);
    }

    // No receipt with state 'invoked'/'completed' may exist.
    const receiptsDir = join(TEST_HOME, '.claude', 'router', 'receipts');
    if (existsSync(receiptsDir)) {
      for (const f of readdirSync(receiptsDir).filter((f) => f.endsWith('.json'))) {
        const data = JSON.parse(readFileSync(join(receiptsDir, f), 'utf8'));
        assert.notEqual(data.completion_evidence.state, 'invoked');
        assert.notEqual(data.completion_evidence.state, 'completed');
      }
    }
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});
