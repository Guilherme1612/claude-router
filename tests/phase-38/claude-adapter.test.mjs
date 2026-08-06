// tests/phase-38/claude-adapter.test.mjs — Phase 38 Claude adapter path + encoding.
//
// Tests 1 and 6 from the HOST-01 behavior list:
//   Test 1 — invoking the Claude adapter with an authorized fixture action
//            produces a receipt with invocation_identity.adapter=
//            'claude-dispatch/1', runtime='claude', pid (number > 0),
//            completion_evidence.exit_code=0, stdout_sha256 matches the
//            fixture's deterministic stdout, state='completed'.
//   Test 6 — a fixture whose stdout contains multi-byte UTF-8 produces a
//            stdout_sha256 computed over the raw bytes (Buffer.concat), NOT
//            over a normalized/stringified form.
//
// Test isolation follows tests/router.adapters.test.mjs:19-22 and
// tests/router.perf.test.mjs:21-22: mkdtempSync TEST_HOME + after() rmSync.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createClaudeDispatchAdapter } from '../../src/adapters/dispatch/claude.mjs';

const FIXTURE_STDOUT = 'router-dispatch-ok 38a1b2c3 ☕\n';

function newTestHome() {
  return mkdtempSync(join(tmpdir(), 'router-38-claude-'));
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

// Test 1: the Claude adapter path. Invoking with an authorized fixture action
// produces a completed receipt binding an adapter-issued invocation_identity
// to verifiable completion_evidence (HOST-01 acceptance).
test('Claude adapter: authorized fixture action produces a completed receipt with adapter-issued identity', async () => {
  const TEST_HOME = newTestHome();
  process.env.HOME = TEST_HOME;
  try {
    const adapter = createClaudeDispatchAdapter();
    assert.equal(adapter.canDispatch().ok, true);

    const action = {
      lease_id: 'claude-path-1',
      idempotency_key: 'cp1',
      intent: 'host-01-claude-path',
      authority: 'operator-authorized',
      risk: 'harmless-fixture',
    };
    const invoked = adapter.invoke(action);
    assert.equal(invoked.completion_evidence.state, 'invoked');
    assert.equal(invoked.invocation_identity.adapter, 'claude-dispatch/1');
    assert.equal(invoked.invocation_identity.runtime, 'claude');
    assert.equal(typeof invoked.invocation_identity.pid, 'number');
    assert.ok(invoked.invocation_identity.pid > 0);
    assert.ok(invoked.invocation_identity.command);
    assert.deepEqual(invoked.invocation_identity.args.length > 0, true);
    assert.ok(invoked.invocation_identity.lease_id);
    assert.ok(invoked.invocation_identity.idempotency_key);
    assert.ok(invoked.invocation_identity.spawned_at);

    const final = await waitForCompletion(adapter, invoked.receipt_id);
    assert.equal(final.completion_evidence.state, 'completed');
    assert.equal(final.completion_evidence.exit_code, 0);
    assert.ok(typeof final.completion_evidence.wall_ms === 'number' && final.completion_evidence.wall_ms >= 0);

    const expectedSha = createHash('sha256').update(Buffer.from(FIXTURE_STDOUT, 'utf8')).digest('hex');
    assert.equal(final.completion_evidence.stdout_sha256, expectedSha);

    // The receipt file must be the one observed (atomic publish is stable).
    assert.ok(existsSync(join(TEST_HOME, '.claude', 'router', 'receipts', `${invoked.receipt_id}.json`)));
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});

// Test 6: encoding. The fixture's stdout contains multi-byte UTF-8 (☕ =
// U+2615 → 0xE2 0x98 0x95). stdout_sha256 MUST be computed over the raw
// UTF-8 bytes (Buffer.concat of stdout chunks), NOT over a normalized
// (NFC/NFD), string-coerced, or code-point form. This test asserts byte
// exactness against three independent computations of the same bytes.
test('Claude adapter: stdout_sha256 is byte-exact over raw multi-byte UTF-8 stdout', async () => {
  const TEST_HOME = newTestHome();
  process.env.HOME = TEST_HOME;
  try {
    const adapter = createClaudeDispatchAdapter();
    const action = {
      lease_id: 'encoding-6',
      idempotency_key: 'enc6',
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
    // The string-form and Buffer-form must agree (Node's utf8 default), and
    // the receipt must match both — proving it is NOT a normalized form.
    assert.equal(shaFromBuffer, shaFromString,
      'raw Buffer and utf8 string hashes must agree for the deterministic fixture');

    // Sanity: the multi-byte byte sequence is what we expect (0xE2 0x98 0x95).
    const bytes = [...rawBuffer];
    assert.deepEqual(bytes.slice(-4), [0xE2, 0x98, 0x95, 0x0A],
      'fixture stdout must end with the UTF-8 bytes for ☕ + newline');

    // Defense-in-depth: a NFC-normalized or code-point-string hash would
    // differ for some inputs; for the fixed fixture string NFC is a no-op,
    // so we additionally assert the receipt hash equals the direct hash of
    // the exact byte sequence the fixture prints.
    const directSha = createHash('sha256')
      .update(Buffer.from([0x72, 0x6F, 0x75, 0x74, 0x65, 0x72, 0x2D, 0x64, 0x69, 0x73, 0x70, 0x61, 0x74, 0x63, 0x68, 0x2D, 0x6F, 0x6B, 0x20, 0x33, 0x38, 0x61, 0x31, 0x62, 0x32, 0x63, 0x33, 0x20, 0xE2, 0x98, 0x95, 0x0A]))
      .digest('hex');
    assert.equal(final.completion_evidence.stdout_sha256, directSha,
      'stdout_sha256 must equal the sha256 of the exact byte sequence');
  } finally {
    rmSync(TEST_HOME, { recursive: true, force: true });
  }
});