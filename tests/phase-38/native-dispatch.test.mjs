// tests/phase-38/native-dispatch.test.mjs — Phase 38 HOST-01 tracer smoke test.
//
// Task 1 (tracer) proves the thinnest end-to-end vertical slice of native host
// dispatch on the Claude runtime: an authorized harmless fixture is really
// spawned by a router-owned adapter, and a receipt binds an adapter-issued
// invocation_identity to verifiable completion evidence. This file holds the
// tracer smoke test; Task 2 expands it with the cross-cutting anti-cheat
// properties (Tests 2-5: recommendation-only, test-helper-alone,
// recommendation-text-alone, empty/null action).
//
// Test isolation follows tests/router.adapters.test.mjs:19-22 and
// tests/router.perf.test.mjs:21-22: mkdtempSync TEST_HOME + after() rmSync.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
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