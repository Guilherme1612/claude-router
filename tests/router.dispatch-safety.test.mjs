import assert from 'node:assert/strict';
import { mkdtempSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildPendingReceipt,
  claimDurableWork,
} from '../src/adapters/dispatch/receipt.mjs';
import { runBoundedChild } from '../src/adapters/dispatch/contract.mjs';
import {
  createClaudeDispatchAdapter,
  _resetIdempotencyForTest,
} from '../src/adapters/dispatch/claude.mjs';
import { createCodexDispatchAdapter } from '../src/adapters/dispatch/codex.mjs';

const identity = { project_id: 'p', route_id: 'r', action_id: 'a', idempotency_key: 'k' };
const contract = {
  timeout_ms: 500,
  retry_limit: 0,
  output_bounds: { max_bytes: 4096, max_lines: 100 },
  completion_contract: { expected_exit_code: 0 },
};

test('durable work claims are exclusive across fresh callers and private on disk', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-dispatch-'));
  const first = claimDurableWork({ runtime: 'claude', stage: 'initial', identity, dir: root });
  const second = claimDurableWork({ runtime: 'claude', stage: 'initial', identity, dir: root });

  assert.equal(first.claimed, true);
  assert.equal(second.claimed, false);
  assert.equal(second.reason, 'already_claimed');
  assert.equal(statSync(join(root, 'claims')).mode & 0o777, 0o700);
  assert.equal(statSync(first.path).mode & 0o777, 0o600);
});

test('pending receipts retain the immutable execution contract', () => {
  const receipt = buildPendingReceipt({
    adapter: 'claude-dispatch/1',
    runtime: 'claude',
    identity,
    execution_contract: contract,
  });
  assert.deepEqual(receipt.execution_contract, contract);
});

test('bounded child execution terminates a timeout with truthful evidence', async () => {
  const result = await runBoundedChild({
    command: process.execPath,
    args: ['-e', 'setTimeout(() => {}, 1000)'],
    execution_contract: { ...contract, timeout_ms: 40 },
  });
  assert.equal(result.state, 'failed');
  assert.ok(result.reason_codes.includes('timeout_exceeded'));
  assert.equal(result.timed_out, true);
});

test('bounded child execution stops output overflow without retaining raw output', async () => {
  const result = await runBoundedChild({
    command: process.execPath,
    args: ['-e', 'process.stdout.write("x".repeat(100000))'],
    execution_contract: { ...contract, output_bounds: { max_bytes: 64, max_lines: 100 } },
  });
  assert.equal(result.state, 'failed');
  assert.ok(result.reason_codes.includes('output_bound_exceeded'));
  assert.equal(result.output_truncated, true);
  assert.equal(typeof result.stdout_sha256, 'string');
});

test('bounded child execution records completion-contract failure', async () => {
  const result = await runBoundedChild({
    command: process.execPath,
    args: ['-e', 'process.exit(0)'],
    execution_contract: { ...contract, completion_contract: { expected_exit_code: 7 } },
  });
  assert.equal(result.state, 'failed');
  assert.ok(result.reason_codes.includes('completion_contract_failed'));
});

test('fresh runtime workers cannot re-dispatch an already claimed identity', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-dispatch-home-'));
  const previousHome = process.env.HOME;
  process.env.HOME = root;
  try {
    _resetIdempotencyForTest();
    const first = createClaudeDispatchAdapter();
    const action = { lease_id: 'cross-worker-1', idempotency_key: 'cross-worker-key' };
    const invoked = first.invoke(action);
    assert.equal(invoked.completion_evidence.state, 'invoked');

    _resetIdempotencyForTest();
    const second = createClaudeDispatchAdapter();
    const duplicate = second.invoke(action);
    assert.equal(duplicate.completion_evidence.state, 'recommendation_only');
    assert.equal(duplicate.route_state, 'ignored');
    assert.deepEqual(duplicate.completion_evidence.reason_codes, ['already_claimed']);
  } finally {
    process.env.HOME = previousHome;
  }
});

test('runtime adapters enforce a declared execution contract through the shared runner', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-dispatch-contract-home-'));
  const previousHome = process.env.HOME;
  process.env.HOME = root;
  try {
    _resetIdempotencyForTest();
    const adapter = createClaudeDispatchAdapter();
    const invoked = adapter.invoke({
      lease_id: 'bounded-adapter-1',
      idempotency_key: 'bounded-adapter-key',
      execution_contract: contract,
    });
    assert.equal(invoked.completion_evidence.state, 'invoked');
    const deadline = Date.now() + 2_000;
    let terminal = adapter.observe(invoked.receipt_id);
    while (Date.now() < deadline && !['completed', 'failed'].includes(terminal?.completion_evidence?.state)) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      terminal = adapter.observe(invoked.receipt_id);
    }
    assert.equal(terminal.completion_evidence.state, 'completed');
    assert.equal(terminal.execution_contract.timeout_ms, contract.timeout_ms);
    assert.equal(typeof terminal.invocation_identity.pid, 'number');
  } finally {
    process.env.HOME = previousHome;
  }
});

test('Codex uses the same declared execution contract and durable claim seam', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-codex-contract-home-'));
  const previousHome = process.env.HOME;
  process.env.HOME = root;
  try {
    mkdirSync(join(root, '.codex', 'router'), { recursive: true });
    writeFileSync(join(root, '.codex', 'router', 'installed.json'), '{}');
    _resetIdempotencyForTest();
    const adapter = createCodexDispatchAdapter();
    const invoked = adapter.invoke({
      lease_id: 'codex-bounded-1',
      idempotency_key: 'codex-bounded-key',
      execution_contract: contract,
    });
    assert.equal(invoked.completion_evidence.state, 'invoked');
    const deadline = Date.now() + 2_000;
    let terminal = adapter.observe(invoked.receipt_id);
    while (Date.now() < deadline && !['completed', 'failed'].includes(terminal?.completion_evidence?.state)) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      terminal = adapter.observe(invoked.receipt_id);
    }
    assert.equal(terminal.completion_evidence.state, 'completed');
    assert.equal(terminal.execution_contract.timeout_ms, contract.timeout_ms);
  } finally {
    process.env.HOME = previousHome;
  }
});
