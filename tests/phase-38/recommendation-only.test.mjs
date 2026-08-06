// tests/phase-38/recommendation-only.test.mjs — Phase 38 parity +
// recommendation-only fallback + cross-runtime isolation (HOST-03).
//
// Codifies HOST-03: both runtimes produce equivalent intent/authority/risk/
// pause/resume/receipt outcomes; an incompatible Codex adapter disables
// autonomous dispatch only for Codex, writes a truthful 'recommendation_only'
// receipt (no silent downgrade), and preserves Claude's autonomy + truthful
// recommendations.
//
// Test isolation follows tests/router.adapters.test.mjs:19-22 and
// tests/router.perf.test.mjs:21-22: mkdtempSync TEST_HOME + after() rmSync.
//
// TDD: RED first against a baseline that treats the two adapters as
// independent (Plan 01 already gives structural independence via the
// promoted contract; this test codifies HOST-03). MVP_MODE=false so the
// MVP+TDD gate is not enforced; TDD is task discipline only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClaudeDispatchAdapter } from '../../src/adapters/dispatch/claude.mjs';
import { createCodexDispatchAdapter } from '../../src/adapters/dispatch/codex.mjs';

function newTestHome() {
  return mkdtempSync(join(tmpdir(), 'router-38-parity-'));
}

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

// Shared action used by both adapters for equivalence tests — the same
// intent/authority/risk/lease_id/idempotency_key drive both runtimes so the
// receipts' intent/authority/risk tuples are structurally equal (HOST-03).
function sharedAction(suffix) {
  return {
    lease_id: `parity-${suffix}`,
    idempotency_key: `parity-${suffix}`,
    intent: 'host-03-equivalence',
    authority: 'operator-authorized',
    risk: 'harmless-fixture',
  };
}

// Test 1 (equivalence, intent/authority/risk): driving the same authorized
// action through both the Claude and Codex adapters produces receipts whose
// intent, authority, and risk fields are structurally equal (deepEqual) and
// whose terminal state is both 'completed'.
test('HOST-03 parity: both runtimes produce structurally equal intent/authority/risk and terminal state completed', async () => {
  const TEST_HOME = newTestHome();
  process.env.HOME = TEST_HOME;
  try {
    writeInstalledMarker(TEST_HOME);
    const claudeAdapter = createClaudeDispatchAdapter();
    const codexAdapter = createCodexDispatchAdapter();
    assert.equal(claudeAdapter.canDispatch().ok, true, 'claude canDispatch must be ok');
    assert.equal(codexAdapter.canDispatch().ok, true, 'codex canDispatch must be ok with marker');

    const action = sharedAction('eq1');
    const claudeInvoked = claudeAdapter.invoke({ ...action, idempotency_key: 'parity-eq1-claude' });
    const codexInvoked = codexAdapter.invoke({ ...action, idempotency_key: 'parity-eq1-codex' });

    const claudeFinal = await waitForCompletion(claudeAdapter, claudeInvoked.receipt_id);
    const codexFinal = await waitForCompletion(codexAdapter, codexInvoked.receipt_id);

    assert.equal(claudeFinal.completion_evidence.state, 'completed');
    assert.equal(codexFinal.completion_evidence.state, 'completed');

    // Structural equality of the intent/authority/risk tuple (HOST-03).
    assert.deepEqual(
      { intent: claudeFinal.intent, authority: claudeFinal.authority, risk: claudeFinal.risk },
      { intent: codexFinal.intent, authority: codexFinal.authority, risk: codexFinal.risk },
      'intent/authority/risk must be structurally equal across runtimes',
    );
    assert.equal(claudeFinal.intent, action.intent);
    assert.equal(claudeFinal.authority, action.authority);
    assert.equal(claudeFinal.risk, action.risk);

    // Both completion_evidence have exit_code=0 and the same stdout_sha256
    // (byte-identical for the shared fixture — T-38-10).
    assert.equal(claudeFinal.completion_evidence.exit_code, 0);
    assert.equal(codexFinal.completion_evidence.exit_code, 0);
    assert.equal(claudeFinal.completion_evidence.stdout_sha256, codexFinal.completion_evidence.stdout_sha256,
      'stdout_sha256 must be byte-identical across runtimes for the same fixture');

    // The receipts are partitioned: claude under ~/.claude/, codex under ~/.codex/.
    assert.ok(existsSync(join(TEST_HOME, '.claude', 'router', 'receipts', `${claudeInvoked.receipt_id}.json`)));
    assert.ok(existsSync(join(TEST_HOME, '.codex', 'router', 'receipts', `${codexInvoked.receipt_id}.json`)));
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

// Test 2 (equivalence, pause/resume): pause() on the Claude adapter writes a
// receipt with state='paused' + idempotency_key; resume() with the same key
// re-spawns and produces state='completed'. The same sequence on the Codex
// adapter produces the same state transitions. Both adapters reject a
// duplicate 'invoked'/'completed' state for the same idempotency_key.
test('HOST-03 parity: pause/resume state transitions match across runtimes; duplicate completed rejected', async () => {
  const TEST_HOME = newTestHome();
  process.env.HOME = TEST_HOME;
  try {
    writeInstalledMarker(TEST_HOME);

    async function exercisePauseResume(adapterFactory, label, keyBase) {
      const adapter = adapterFactory();
      const action = {
        lease_id: `${keyBase}-lease`,
        idempotency_key: keyBase,
        intent: 'pause-resume',
        authority: 'operator-authorized',
        risk: 'harmless-fixture',
      };
      const invoked = adapter.invoke(action);
      assert.equal(invoked.completion_evidence.state, 'invoked', `${label}: invoke returns invoked`);

      // Wait for completion, then pause the completed receipt.
      const completed = await waitForCompletion(adapter, invoked.receipt_id);
      assert.equal(completed.completion_evidence.state, 'completed', `${label}: fixture completes`);

      const paused = adapter.pause(invoked.receipt_id);
      assert.ok(paused, `${label}: pause returns a receipt`);
      assert.equal(paused.completion_evidence.state, 'paused', `${label}: pause writes state=paused`);

      // resume() re-spawns with the same key and produces state='completed'.
      const resumed = adapter.resume(invoked.receipt_id);
      assert.ok(resumed, `${label}: resume returns a receipt`);
      // resume triggers a new spawn; wait for its completion.
      const resumedFinal = await waitForCompletion(adapter, resumed.receipt_id);
      assert.equal(resumedFinal.completion_evidence.state, 'completed', `${label}: resume re-spawns and completes`);

      // A SECOND direct invoke with the same idempotency_key is rejected
      // (duplicate 'completed' for the same key — idempotent checkpoint).
      const dup = adapter.invoke(action);
      assert.equal(dup.completion_evidence.state, 'recommendation_only',
        `${label}: duplicate invoke with same key is rejected`);
      assert.equal(dup.completion_evidence.reason, 'idempotency_already_claimed',
        `${label}: rejection reason is idempotency_already_claimed`);

      return resumedFinal;
    }

    const claudeResult = await exercisePauseResume(createClaudeDispatchAdapter, 'claude', 'parity-pr2-claude');
    const codexResult = await exercisePauseResume(createCodexDispatchAdapter, 'codex', 'parity-pr2-codex');

    // Both runtimes produce the same terminal state transition sequence:
    // invoked → completed → paused → completed.
    assert.equal(claudeResult.completion_evidence.state, 'completed');
    assert.equal(codexResult.completion_evidence.state, 'completed');
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

// Test 3 (recommendation-only fallback, Codex incompatible): force the Codex
// adapter's canDispatch() to { ok: false } (missing installed.json marker).
// The Codex adapter writes a receipt with state='recommendation_only' and NO
// autonomous dispatch occurs (no pid). The Claude adapter's canDispatch() and
// invoke() are unaffected (structural independence — the promoted contract
// means each variant reports independently).
test('HOST-03 fallback: incompatible Codex adapter writes recommendation_only; Claude unaffected (structural independence)', () => {
  const TEST_HOME = newTestHome();
  process.env.HOME = TEST_HOME;
  try {
    // NO writeInstalledMarker — Codex canDispatch() must return { ok: false }.
    const codexAdapter = createCodexDispatchAdapter();
    const claudeAdapter = createClaudeDispatchAdapter();

    // Structural independence: Codex incompatible does NOT weaken Claude.
    const codexCan = codexAdapter.canDispatch();
    assert.equal(codexCan.ok, false, 'codex canDispatch must be false without installed.json marker');
    assert.equal(codexCan.reason, 'installed_marker_missing');
    const claudeCan = claudeAdapter.canDispatch();
    assert.equal(claudeCan.ok, true, 'claude canDispatch must still be ok (structural independence)');

    // Codex invoke → recommendation_only, no pid, no spawn.
    const codexReceipt = codexAdapter.invoke({
      lease_id: 'parity-fallback-3', idempotency_key: 'parity-fb3-codex',
      intent: 'codex-incompatible', authority: 'operator-authorized', risk: 'harmless-fixture',
    });
    assert.equal(codexReceipt.completion_evidence.state, 'recommendation_only');
    assert.equal(codexReceipt.invocation_identity.pid, null, 'no pid — no spawn occurred');
    assert.equal(codexReceipt.invocation_identity.adapter, 'codex-dispatch/1');

    // Claude invoke in the SAME temp HOME still completes (autonomy preserved).
    const claudeInvoked = claudeAdapter.invoke({
      lease_id: 'parity-fallback-3', idempotency_key: 'parity-fb3-claude',
      intent: 'claude-still-runs', authority: 'operator-authorized', risk: 'harmless-fixture',
    });
    assert.equal(claudeInvoked.completion_evidence.state, 'invoked',
      'claude invoke still spawns (structural independence)');
    assert.equal(typeof claudeInvoked.invocation_identity.pid, 'number');
    assert.ok(claudeInvoked.invocation_identity.pid > 0);

    // No Codex receipt with state 'invoked'/'completed' exists.
    const codexReceiptsDir = join(TEST_HOME, '.codex', 'router', 'receipts');
    let codexCompleted = false;
    if (existsSync(codexReceiptsDir)) {
      for (const f of readdirSync(codexReceiptsDir).filter((f) => f.endsWith('.json'))) {
        const data = JSON.parse(readFileSync(join(codexReceiptsDir, f), 'utf8'));
        if (data.invocation_identity?.adapter === 'codex-dispatch/1'
            && ['invoked', 'completed'].includes(data.completion_evidence?.state)) {
          codexCompleted = true;
        }
      }
    }
    assert.equal(codexCompleted, false, 'no codex invoked/completed receipt when canDispatch is false');
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

// Test 4 (no silent downgrade): assert that a 'recommendation_only' receipt
// EXISTS in the store (the audit trail records the decision — not a silent
// text-only downgrade). The receipt's completion_evidence.state is exactly
// 'recommendation_only' (Pattern 2 / T-38-09).
test('HOST-03 no silent downgrade: recommendation_only receipt exists in the store', () => {
  const TEST_HOME = newTestHome();
  process.env.HOME = TEST_HOME;
  try {
    // NO writeInstalledMarker → Codex canDispatch is false.
    const codexAdapter = createCodexDispatchAdapter();
    const receipt = codexAdapter.invoke({
      lease_id: 'no-silent-4', idempotency_key: 'parity-ns4',
      intent: 'audit-trail', authority: 'operator-authorized', risk: 'harmless-fixture',
    });
    assert.equal(receipt.completion_evidence.state, 'recommendation_only');

    // The 'recommendation_only' receipt MUST exist on disk (audit trail).
    const codexReceiptsDir = join(TEST_HOME, '.codex', 'router', 'receipts');
    assert.ok(existsSync(codexReceiptsDir), 'codex receipts dir must exist (receipt was published)');
    const receiptPath = join(codexReceiptsDir, `${receipt.receipt_id}.json`);
    assert.ok(existsSync(receiptPath), 'the recommendation_only receipt file must exist on disk');

    const onDisk = JSON.parse(readFileSync(receiptPath, 'utf8'));
    assert.equal(onDisk.completion_evidence.state, 'recommendation_only',
      'on-disk receipt state is exactly recommendation_only');
    assert.equal(onDisk.invocation_identity.adapter, 'codex-dispatch/1');
    assert.equal(onDisk.invocation_identity.runtime, 'codex');
    assert.equal(onDisk.invocation_identity.pid, null, 'no pid — no spawn occurred');
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

// Test 5 (cross-runtime isolation): a Claude receipt presented to the Codex
// observe() path is rejected (runtime mismatch); a Codex receipt presented
// to Claude observe() is rejected. No cross-runtime authorization
// (T-38-08).
test('HOST-03 isolation: cross-runtime observe() rejected (runtime mismatch + partition)', async () => {
  const TEST_HOME = newTestHome();
  process.env.HOME = TEST_HOME;
  try {
    writeInstalledMarker(TEST_HOME);
    const claudeAdapter = createClaudeDispatchAdapter();
    const codexAdapter = createCodexDispatchAdapter();

    // Produce a real Claude receipt and a real Codex receipt.
    const claudeInvoked = claudeAdapter.invoke({
      lease_id: 'x-runtime-5', idempotency_key: 'parity-xr5-claude',
      intent: 'isolation', authority: 'operator-authorized', risk: 'harmless-fixture',
    });
    const codexInvoked = codexAdapter.invoke({
      lease_id: 'x-runtime-5', idempotency_key: 'parity-xr5-codex',
      intent: 'isolation', authority: 'operator-authorized', risk: 'harmless-fixture',
    });
    await waitForCompletion(claudeAdapter, claudeInvoked.receipt_id);
    await waitForCompletion(codexAdapter, codexInvoked.receipt_id);

    // A Codex receipt presented to the Claude observe() path: the Claude
    // adapter looks under ~/.claude/router/receipts/; the Codex receipt was
    // published under ~/.codex/router/receipts/ → not found → null (rejected
    // by partition isolation — T-38-08 primary defense).
    const claudeReadingCodex = claudeAdapter.observe(codexInvoked.receipt_id);
    assert.equal(claudeReadingCodex, null,
      'Claude observe() must reject a Codex receipt (partition isolation)');

    // A Claude receipt presented to the Codex observe() path: partition
    // isolation returns null, AND even if a Claude receipt file were
    // somehow placed in the Codex partition, the Codex adapter's observe()
    // validates receipt.runtime on read → rejects non-codex receipts
    // (defense-in-depth).
    const codexReadingClaude = codexAdapter.observe(claudeInvoked.receipt_id);
    assert.equal(codexReadingClaude, null,
      'Codex observe() must reject a Claude receipt (partition + runtime validation)');

    // Defense-in-depth: copy the Claude receipt file into the Codex partition
    // and verify the Codex adapter rejects it via runtime validation (not
    // just partition absence).
    const claudeReceiptPath = join(TEST_HOME, '.claude', 'router', 'receipts', `${claudeInvoked.receipt_id}.json`);
    const claudeReceiptData = JSON.parse(readFileSync(claudeReceiptPath, 'utf8'));
    assert.equal(claudeReceiptData.invocation_identity.runtime, 'claude',
      'sanity: the Claude receipt runtime is claude');
    const codexReceiptsDir = join(TEST_HOME, '.codex', 'router', 'receipts');
    const plantedPath = join(codexReceiptsDir, `${claudeInvoked.receipt_id}.json`);
    writeFileSync(plantedPath, JSON.stringify(claudeReceiptData, null, 2) + '\n');
    const codexReadingPlantedClaude = codexAdapter.observe(claudeInvoked.receipt_id);
    assert.equal(codexReadingPlantedClaude, null,
      'Codex observe() must reject a Claude receipt even if planted in the codex partition (runtime validation)');
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});