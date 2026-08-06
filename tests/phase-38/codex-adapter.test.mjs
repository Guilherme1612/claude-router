// tests/phase-38/codex-adapter.test.mjs — Phase 38 Codex adapter path + partition
// + anti-cheat + encoding (HOST-02).
//
// Mirrors tests/phase-38/claude-adapter.test.mjs structure. The dispatch
// MECHANISM is identical to the Claude adapter (Pitfall 3); the only
// differences are:
//   - runtime='codex', adapter='codex-dispatch/1'
//   - receipts partition to ~/.codex/router/receipts/ (via os.homedir())
//   - canDispatch() additionally probes ~/.codex/router/installed.json marker
//
// TDD: RED first against the no-adapter baseline (import fails), then GREEN
// against the codex adapter. MVP_MODE=false so the MVP+TDD gate is not
// enforced; TDD is task discipline only.
//
// Test isolation follows tests/router.adapters.test.mjs:19-22 and
// tests/router.perf.test.mjs:21-22: mkdtempSync TEST_HOME + after() rmSync.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createCodexDispatchAdapter } from '../../src/adapters/dispatch/codex.mjs';

const FIXTURE_STDOUT = 'router-dispatch-ok 38a1b2c3 ☕\n';
const EXPECTED_STDOUT_SHA = createHash('sha256').update(Buffer.from(FIXTURE_STDOUT, 'utf8')).digest('hex');

function newTestHome() {
  return mkdtempSync(join(tmpdir(), 'router-38-codex-'));
}

// Write the ~/.codex/router/installed.json marker so canDispatch() passes.
// Marker contents match the verified environment (RESEARCH §Environment
// Availability): {"managed_by":"claude-router","control_authority_root":...}.
function writeInstalledMarker(testHome) {
  const codexRouter = join(testHome, '.codex', 'router');
  mkdirSync(codexRouter, { recursive: true });
  writeFileSync(join(codexRouter, 'installed.json'), JSON.stringify({
    managed_by: 'claude-router',
    control_authority_root: join(testHome, '.claude', 'router'),
  }));
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

// Test 1 (codex adapter path): invoking the Codex adapter with an authorized
// fixture action produces a receipt with invocation_identity.adapter=
// 'codex-dispatch/1', runtime='codex', pid (number > 0), completion_evidence.
// exit_code=0, stdout_sha256 matches the SAME fixture stdout as the Claude
// adapter (shared fixture, byte-identical), state='completed'.
test('Codex adapter: authorized fixture action produces a completed receipt with codex-issued identity', async () => {
  const TEST_HOME = newTestHome();
  process.env.HOME = TEST_HOME;
  try {
    writeInstalledMarker(TEST_HOME);
    const adapter = createCodexDispatchAdapter();
    const can = adapter.canDispatch();
    assert.equal(can.ok, true, `canDispatch must be ok with installed.json marker (got ${JSON.stringify(can)})`);

    const action = {
      lease_id: 'codex-path-1',
      idempotency_key: 'cx1',
      intent: 'host-02-codex-path',
      authority: 'operator-authorized',
      risk: 'harmless-fixture',
    };
    const invoked = adapter.invoke(action);
    assert.equal(invoked.completion_evidence.state, 'invoked', 'invoke() returns an invoked receipt immediately');
    assert.equal(invoked.invocation_identity.adapter, 'codex-dispatch/1');
    assert.equal(invoked.invocation_identity.runtime, 'codex');
    assert.equal(typeof invoked.invocation_identity.pid, 'number');
    assert.ok(invoked.invocation_identity.pid > 0, 'pid must be a positive integer');
    assert.ok(invoked.invocation_identity.command, 'command must be populated');
    assert.ok(invoked.invocation_identity.lease_id, 'lease_id must be populated');
    assert.ok(invoked.invocation_identity.idempotency_key, 'idempotency_key must be populated');
    assert.ok(invoked.invocation_identity.spawned_at, 'spawned_at must be populated');

    const final = await waitForCompletion(adapter, invoked.receipt_id);
    assert.equal(final.completion_evidence.state, 'completed');
    assert.equal(final.completion_evidence.exit_code, 0);
    assert.ok(typeof final.completion_evidence.wall_ms === 'number' && final.completion_evidence.wall_ms >= 0,
      'wall_ms must be a non-negative number');

    // stdout_sha256 byte-identical to the Claude adapter for the same fixture
    // (shared harmless.mjs, raw Buffer hash — Pitfall 3 / T-38-10).
    assert.equal(final.completion_evidence.stdout_sha256, EXPECTED_STDOUT_SHA,
      'stdout_sha256 must byte-match the Claude adapter for the same fixture');

    // The receipt file must be on disk (atomic publish).
    assert.ok(existsSync(join(TEST_HOME, '.codex', 'router', 'receipts', `${invoked.receipt_id}.json`)));
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

// Test 2 (partition): the receipt file is written under
// $TEMP_HOME/.codex/router/receipts/, NOT under .claude/router/receipts/
// (detectRuntime() returns 'codex' via ROUTER_RUNTIME=codex env, but the
// partition is driven by the adapter's receiptRoot = ~/.codex/router/receipts/).
test('Codex adapter: receipt partitioned to ~/.codex/router/receipts/, not ~/.claude/', async () => {
  const TEST_HOME = newTestHome();
  process.env.HOME = TEST_HOME;
  try {
    writeInstalledMarker(TEST_HOME);
    const adapter = createCodexDispatchAdapter();
    const action = {
      lease_id: 'codex-partition-2',
      idempotency_key: 'cx2',
      intent: 'partition',
      authority: 'operator-authorized',
      risk: 'harmless-fixture',
    };
    const invoked = adapter.invoke(action);
    await waitForCompletion(adapter, invoked.receipt_id);

    const codexReceiptsDir = join(TEST_HOME, '.codex', 'router', 'receipts');
    const claudeReceiptsDir = join(TEST_HOME, '.claude', 'router', 'receipts');

    // The codex receipt file MUST exist under .codex/router/receipts/.
    assert.ok(existsSync(join(codexReceiptsDir, `${invoked.receipt_id}.json`)),
      'codex receipt must be published under ~/.codex/router/receipts/');

    // NO codex receipt may exist under .claude/router/receipts/ (partition).
    if (existsSync(claudeReceiptsDir)) {
      for (const f of readdirSync(claudeReceiptsDir).filter((f) => f.endsWith('.json'))) {
        const data = JSON.parse(readFileSync(join(claudeReceiptsDir, f), 'utf8'));
        assert.notEqual(data.invocation_identity?.runtime, 'codex',
          'no codex receipt may be written under ~/.claude/router/receipts/');
        assert.notEqual(data.invocation_identity?.adapter, 'codex-dispatch/1',
          'no codex-dispatch/1 receipt may be written under ~/.claude/router/receipts/');
      }
    }
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

// Test 3 (anti-cheat, test helper alone): running
// tests/phase-38/fixtures/harmless.mjs directly via spawnSync with
// ROUTER_RUNTIME=codex produces NO codex receipt with state 'invoked'/
// 'completed'. A test helper has no adapter-issued invocation_identity
// (T-38-03 / SC1).
test('Codex anti-cheat: test helper running the fixture directly produces no completed codex receipt', () => {
  const TEST_HOME = newTestHome();
  process.env.HOME = TEST_HOME;
  try {
    const FIXTURE = join(process.cwd(), 'tests', 'phase-38', 'fixtures', 'harmless.mjs');
    // Run the fixture directly — NO adapter in the invocation path. Set
    // ROUTER_RUNTIME=codex so any partition logic would route to ~/.codex/.
    const r = spawnSync(process.execPath, [FIXTURE], {
      encoding: 'utf8', timeout: 5000,
      env: { ...process.env, ROUTER_RUNTIME: 'codex' },
    });
    assert.equal(r.status, 0, 'fixture must exit 0 when run directly');

    // Assert NO codex receipt with state 'invoked'/'completed' exists.
    const codexReceiptsDir = join(TEST_HOME, '.codex', 'router', 'receipts');
    if (existsSync(codexReceiptsDir)) {
      for (const f of readdirSync(codexReceiptsDir).filter((f) => f.endsWith('.json'))) {
        const data = JSON.parse(readFileSync(join(codexReceiptsDir, f), 'utf8'));
        assert.notEqual(data.completion_evidence?.state, 'invoked',
          'test helper alone must not produce an invoked codex receipt');
        assert.notEqual(data.completion_evidence?.state, 'completed',
          'test helper alone must not produce a completed codex receipt');
      }
    }
    // The codex receipts dir typically does not exist at all when no adapter ran.
    const codexReceiptsExist = existsSync(codexReceiptsDir)
      && readdirSync(codexReceiptsDir).some((f) => f.endsWith('.json'));
    assert.equal(codexReceiptsExist, false,
      'no codex receipt file must exist when the fixture runs without the adapter');
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

// Test 4 (anti-cheat, recommendation-only): when canDispatch() returns
// { ok: false } (installed.json marker absent in a temp HOME), invoke()
// produces a receipt with state='recommendation_only' and NO pid. The
// adapter truthfully records the decision — no silent text-only downgrade
// (Pattern 2 / T-38-09).
test('Codex anti-cheat: canDispatch=false (installed.json marker absent) yields recommendation_only receipt, no pid, no spawn', () => {
  const TEST_HOME = newTestHome();
  process.env.HOME = TEST_HOME;
  try {
    // NO writeInstalledMarker — canDispatch() must return { ok: false }.
    const adapter = createCodexDispatchAdapter();
    const can = adapter.canDispatch();
    assert.equal(can.ok, false, 'canDispatch must be false without installed.json marker');
    assert.ok(can.reason, 'canDispatch must supply a reason when not ok');

    const receipt = adapter.invoke({
      lease_id: 'codex-reconly-4', idempotency_key: 'cx4',
      intent: 'x', authority: 'y', risk: 'z',
    });
    assert.equal(receipt.completion_evidence.state, 'recommendation_only');
    assert.equal(receipt.invocation_identity.pid, null, 'recommendation_only receipt must have NO pid');
    assert.equal(receipt.invocation_identity.command, null, 'recommendation_only receipt must have NO command');
    assert.equal(receipt.invocation_identity.adapter, 'codex-dispatch/1');
    assert.equal(receipt.invocation_identity.runtime, 'codex');

    // The 'recommendation_only' receipt MUST exist in the store — not a silent
    // text-only downgrade (T-38-09 / Pattern 2).
    const codexReceiptsDir = join(TEST_HOME, '.codex', 'router', 'receipts');
    let foundRecommendationOnly = false;
    let foundInvokedOrCompleted = false;
    if (existsSync(codexReceiptsDir)) {
      for (const f of readdirSync(codexReceiptsDir).filter((f) => f.endsWith('.json'))) {
        const data = JSON.parse(readFileSync(join(codexReceiptsDir, f), 'utf8'));
        if (data.completion_evidence?.state === 'recommendation_only'
            && data.invocation_identity?.adapter === 'codex-dispatch/1') {
          foundRecommendationOnly = true;
        }
        if (data.completion_evidence?.state === 'invoked'
            || data.completion_evidence?.state === 'completed') {
          foundInvokedOrCompleted = true;
        }
      }
    }
    assert.ok(foundRecommendationOnly,
      'a recommendation_only receipt must exist in the codex store (no silent downgrade)');
    assert.equal(foundInvokedOrCompleted, false,
      'no invoked/completed receipt may exist when canDispatch is false');
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

// Test 5 (empty/null action): null/empty/{} action → 'recommendation_only'
// receipt, no spawn, no pid (mirrors the Claude adapter's empty-input
// contract).
test('Codex adapter: empty/null/{} action yields recommendation_only and no spawn', () => {
  const TEST_HOME = newTestHome();
  process.env.HOME = TEST_HOME;
  try {
    writeInstalledMarker(TEST_HOME);
    const adapter = createCodexDispatchAdapter();

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
      assert.equal(receipt.invocation_identity.adapter, 'codex-dispatch/1');
      assert.equal(receipt.invocation_identity.runtime, 'codex');
    }

    // No receipt with state 'invoked'/'completed' may exist.
    const codexReceiptsDir = join(TEST_HOME, '.codex', 'router', 'receipts');
    if (existsSync(codexReceiptsDir)) {
      for (const f of readdirSync(codexReceiptsDir).filter((f) => f.endsWith('.json'))) {
        const data = JSON.parse(readFileSync(join(codexReceiptsDir, f), 'utf8'));
        assert.notEqual(data.completion_evidence.state, 'invoked');
        assert.notEqual(data.completion_evidence.state, 'completed');
      }
    }
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

// Test 6 (encoding): multi-byte UTF-8 fixture stdout → stdout_sha256
// byte-exact over raw Buffer, identical to the Claude adapter's hash for
// the same stdout (Pitfall 3 / T-38-10).
test('Codex adapter: stdout_sha256 is byte-exact over raw multi-byte UTF-8 stdout, identical to Claude adapter', async () => {
  const TEST_HOME = newTestHome();
  process.env.HOME = TEST_HOME;
  try {
    writeInstalledMarker(TEST_HOME);
    const adapter = createCodexDispatchAdapter();
    const action = {
      lease_id: 'codex-encoding-6',
      idempotency_key: 'cx6',
      intent: 'encoding',
      authority: 'operator-authorized',
      risk: 'harmless-fixture',
    };
    const invoked = adapter.invoke(action);
    const final = await waitForCompletion(adapter, invoked.receipt_id);
    assert.equal(final.completion_evidence.state, 'completed');

    const rawBuffer = Buffer.from(FIXTURE_STDOUT, 'utf8');
    const shaFromBuffer = createHash('sha256').update(rawBuffer).digest('hex');
    const shaFromString = createHash('sha256').update(FIXTURE_STDOUT, 'utf8').digest('hex');

    // The receipt's stdout_sha256 must equal the raw-byte hash.
    assert.equal(final.completion_evidence.stdout_sha256, shaFromBuffer,
      'stdout_sha256 must equal the sha256 of the raw UTF-8 bytes (Buffer)');
    // The string-form and Buffer-form must agree, and the receipt must match
    // both — proving it is NOT a normalized form.
    assert.equal(shaFromBuffer, shaFromString,
      'raw Buffer and utf8 string hashes must agree for the deterministic fixture');

    // Sanity: the multi-byte byte sequence is what we expect (0xE2 0x98 0x95).
    const bytes = [...rawBuffer];
    assert.deepEqual(bytes.slice(-4), [0xE2, 0x98, 0x95, 0x0A],
      'fixture stdout must end with the UTF-8 bytes for ☕ + newline');

    // Byte-identical to the Claude adapter: both adapters hash the same
    // fixture stdout via hashBytes(Buffer.concat(chunks)) over raw bytes.
    // The Claude adapter's expected sha is the same constant; this asserts
    // cross-runtime byte-exactness (HOST-03 structural equivalence of the
    // completion_evidence for the same action).
    assert.equal(final.completion_evidence.stdout_sha256, EXPECTED_STDOUT_SHA,
      'codex stdout_sha256 must byte-match the Claude adapter for the same fixture');
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});