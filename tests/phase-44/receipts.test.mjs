import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createClaudeDispatchAdapter } from '../../src/adapters/dispatch/claude.mjs';
import { createCodexDispatchAdapter } from '../../src/adapters/dispatch/codex.mjs';

import {
  RECEIPT_STATES,
} from '../../src/adapters/dispatch/contract.mjs';
import {
  buildPendingReceipt,
  inspectReceipt,
  outcomeCredit,
  receiptIdentityId,
  transitionReceipt,
} from '../../src/adapters/dispatch/receipt.mjs';

const REPO_ROOT = resolve(new URL('../..', import.meta.url).pathname);

const IDENTITY = {
  project_id: 'router-build',
  goal_id: 'goal-receipts',
  route_id: 'route-44',
  action_id: 'action-1',
  mapping_generation: 'map-17',
  capability_fingerprint: 'cap-abc',
  authority: 'operator-authorized',
  risk: 'harmless-fixture',
  idempotency_key: 'idem-1',
};

function pending() {
  return buildPendingReceipt({
    adapter: 'claude-dispatch/1',
    runtime: 'claude',
    identity: IDENTITY,
    intent: 'execute',
    selected: { route_id: 'route-44', capability: 'fixture' },
    alternatives: [{ route_id: 'route-fallback', rejection_reason: 'lower_fit' }],
    bounded_evidence: {
      permissions: ['local'],
      checkpoints: ['lease-1'],
      verification_refs: ['verify-1'],
      wall_ms: 8,
      cached_tokens: 2,
      uncached_tokens: 4,
      calls: 1,
      retries: 0,
      failures: 0,
      coordination_cost: 0,
    },
  });
}

test('RCPT-01: stable receipt identity is independent of PID', () => {
  const first = receiptIdentityId({ adapter: 'claude-dispatch/1', runtime: 'claude', identity: IDENTITY });
  const second = receiptIdentityId({
    adapter: 'claude-dispatch/1',
    runtime: 'claude',
    identity: { ...IDENTITY, pid: 12345 },
  });
  assert.equal(first, second);
  assert.equal(pending().receipt_id, first);
  assert.deepEqual(pending().invocation_identity.identity, IDENTITY);
});

test('RCPT-02: transitions preserve identity and cover explicit route states', () => {
  for (const state of ['invoked', 'ignored', 'rejected', 'substituted', 'blocked', 'partial', 'failed', 'completed', 'preserved-unknown']) {
    assert.ok(RECEIPT_STATES.includes(state), `missing state ${state}`);
  }
  const invoked = transitionReceipt(pending(), 'invoked', { invocation_identity: { pid: 123 } });
  assert.equal(invoked.receipt_id, pending().receipt_id);
  assert.equal(invoked.completion_evidence.state, 'invoked');
  assert.throws(() => transitionReceipt(invoked, 'made-up-state'), /state/i);
});

test('RCPT-03 and RCPT-05: compact inspection is bounded and explains divergence', () => {
  const receipt = transitionReceipt(pending(), 'completed', {
    selected: { route_id: 'route-44' },
    actual: { route_id: 'route-fallback', capability: 'fixture-substitute' },
    corrections: ['operator-correction-1'],
    substitution: { from: 'route-44', to: 'route-fallback', reason: 'selected_unavailable' },
    raw_prompt: 'do not persist this prompt',
  });
  const compact = inspectReceipt(receipt);
  assert.equal(compact.receipt_id, receipt.receipt_id);
  assert.equal(compact.divergence.selected_route_id, 'route-44');
  assert.equal(compact.divergence.actual_route_id, 'route-fallback');
  assert.deepEqual(compact.substitution, receipt.substitution);
  assert.equal('raw_prompt' in compact, false);
  assert.equal(JSON.stringify(compact).includes('do not persist'), false);
});

test('RCPT-04: only linked verified postconditions receive outcome credit', () => {
  const base = transitionReceipt(pending(), 'completed', {
    completion_evidence: { state: 'completed', exit_code: 0 },
    invocation_evidence: { receipt_id: pending().receipt_id, observed: true },
    postcondition_evidence: {
      receipt_id: pending().receipt_id,
      verified: true,
      reference: 'verify-1',
    },
  });
  assert.equal(outcomeCredit(base), true);
  assert.equal(outcomeCredit({ ...base, completion_evidence: { state: 'completed', exit_code: 0 }, postcondition_evidence: null }), false);
  assert.equal(outcomeCredit({ ...base, postcondition_evidence: { receipt_id: 'other', verified: true } }), false);
  assert.equal(outcomeCredit({ ...base, completion_evidence: { state: 'ignored', exit_code: 0 } }), false);
});

function waitForCompletion(adapter, receiptId) {
  const deadline = Date.now() + 3000;
  return new Promise((resolvePromise, reject) => {
    const poll = () => {
      const receipt = adapter.observe(receiptId);
      if (receipt && ['completed', 'failed', 'recommendation_only', 'blocked'].includes(receipt.completion_evidence?.state)) {
        resolvePromise(receipt);
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error(`timeout waiting for ${receiptId}`));
        return;
      }
      setTimeout(poll, 10);
    };
    poll();
  });
}

function actionFor(runtime, withEvidence = true) {
  const identity = {
    ...IDENTITY,
    project_id: `router-${runtime}`,
    idempotency_key: `idem-${runtime}`,
  };
  const receipt_id = receiptIdentityId({
    adapter: `${runtime}-dispatch/1`,
    runtime,
    identity,
  });
  return {
    ...identity,
    intent: 'execute',
    runtime,
    selected: { route_id: 'route-44', capability: 'fixture' },
    actual: { route_id: 'route-fallback', capability: 'fixture-substitute' },
    alternatives: [{ route_id: 'route-alt', rejection_reason: 'lower_fit' }],
    corrections: ['operator-correction-1'],
    substitution: { from: 'route-44', to: 'route-fallback', reason: 'selected_unavailable' },
    bounded_evidence: { permissions: ['local'], verification_refs: ['verify-1'], calls: 1, retries: 0 },
    ...(withEvidence ? { postcondition_evidence: { receipt_id, verified: true, reference: 'verify-1' } } : {}),
  };
}

test('RCPT-01/02/03/04/05: Claude keeps one pending-to-terminal causal receipt', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-44-claude-'));
  try {
    const adapter = createClaudeDispatchAdapter({ receiptRoot: root });
    const action = actionFor('claude');
    const invoked = adapter.invoke(action);
    const final = await waitForCompletion(adapter, invoked.receipt_id);
    const lines = readFileSync(join(root, 'receipts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(lines[0].completion_evidence.state, 'pending');
    assert.ok(lines.some((line) => line.receipt_id === invoked.receipt_id && line.completion_evidence.state === 'invoked'));
    assert.equal(final.receipt_id, invoked.receipt_id);
    assert.equal(final.invocation_identity.identity.project_id, action.project_id);
    assert.equal(final.divergence, undefined);
    assert.equal(final.outcome_credit, true);
    assert.equal(JSON.stringify(final).includes('operator-correction-1'), true);
    assert.equal(JSON.stringify(final).includes('raw_prompt'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('RCPT-01/02/03/04/05: Codex mirrors attribution and preserves runtime partitioning', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-44-codex-'));
  const home = mkdtempSync(join(tmpdir(), 'router-44-home-'));
  const previousHome = process.env.HOME;
  try {
    process.env.HOME = home;
    mkdirSync(join(home, '.codex', 'router'), { recursive: true });
    writeFileSync(join(home, '.codex', 'router', 'installed.json'), '{}');
    const adapter = createCodexDispatchAdapter({ receiptRoot: root });
    const action = actionFor('codex');
    const invoked = adapter.invoke(action);
    const final = await waitForCompletion(adapter, invoked.receipt_id);
    const lines = readFileSync(join(root, 'receipts.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(lines[0].completion_evidence.state, 'pending');
    assert.equal(final.invocation_identity.runtime, 'codex');
    assert.equal(final.receipt_id, invoked.receipt_id);
    assert.equal(final.outcome_credit, true);
    assert.equal(existsSync(join(home, '.claude', 'router', 'receipts', `${final.receipt_id}.json`)), false);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    rmSync(root, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});
