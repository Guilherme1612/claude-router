import assert from 'node:assert/strict';
import test from 'node:test';

import { runBoundedAutonomy, prepareAutonomousExecution } from '../src/orchestrator/autonomy.mjs';
import { reconcileAutonomousReleaseEvidence } from '../src/release/preflight.mjs';

function input(overrides = {}) {
  return {
    runtime: 'claude', idempotency_key: 'run-1',
    intent: { explicit_execute: true, authority_class: 'one_turn_action', disposition: 'execute' },
    target: { capability_id: 'router/fix', runtime: 'claude', available: true, eligible: true, verified: true, quarantine: [] },
    authority: { authGranted: true, current: true },
    risk: { safe: true, current: true, reversible: true },
    lease: { required: false, status: 'absent' },
    strategy: { status: 'planned', dispatch_eligible: true, replan_count: 0, max_replans: 1 },
    receipt: { ready: true }, verification: { ready: true },
    ...overrides,
  };
}

test('execution readiness fails closed for runtime mismatch and required approval', () => {
  const result = prepareAutonomousExecution(input({
    target: { capability_id: 'router/fix', runtime: 'codex', available: true, eligible: true, verified: true, quarantine: [] },
    approval: { required: true, granted: false },
  }));
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.blockers, ['runtime_mismatch', 'approval_required']);
});

test('bounded loop preserves causal evidence and allows one evidence-bound replan', async () => {
  const calls = [];
  const result = await runBoundedAutonomy({
    input: input(),
    execute: async ({ target, attempt }) => {
      calls.push(target.capability_id);
      return attempt === 0
        ? { status: 'failed', reason_code: 'target_changed', actual_capability_id: 'router/old', receipt_id: 'receipt-1', completion: { state: 'failed' } }
        : { status: 'completed', actual_capability_id: 'router/new', receipt_id: 'receipt-2', completion: { state: 'completed' } };
    },
    verify: async ({ result: execution }) => ({ pass: execution.status === 'completed', reason_code: execution.status === 'completed' ? 'verified' : 'failed' }),
    replan: async () => ({ evidence_bound: true, target: { capability_id: 'router/new', runtime: 'claude', available: true, eligible: true, verified: true, quarantine: [] }, strategy: input().strategy }),
  });
  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, ['router/fix', 'router/new']);
  assert.equal(result.attempts.length, 2);
  assert.deepEqual(result.attempts[0], {
    selected: 'router/fix', actual: 'router/old', receipt_id: 'receipt-1',
    completion: { state: 'failed' }, verification: { pass: false, reason_code: 'failed' },
    failure: { reason_code: 'target_changed' },
  });
  assert.equal(result.attempts[1].verification.pass, true);
});

test('idempotency and cancellation stop duplicate or unsafe work', async () => {
  const seen = new Set();
  const first = await runBoundedAutonomy({
    input: input(), idempotency: seen,
    execute: async () => ({ status: 'completed', completion: { state: 'completed' }, verification: { pass: true } }),
  });
  const replay = await runBoundedAutonomy({ input: input(), idempotency: seen, execute: async () => { throw new Error('must not execute'); } });
  const cancelled = await runBoundedAutonomy({ input: input({ idempotency_key: 'run-2' }), cancelled: () => true, execute: async () => { throw new Error('must not execute'); } });
  assert.equal(first.status, 'completed');
  assert.equal(replay.status, 'idempotent_replay');
  assert.equal(cancelled.status, 'cancelled');
});

test('final release evidence keeps direct/pass-through usable in safe-empty state', () => {
  const report = reconcileAutonomousReleaseEvidence({
    source_install_parity: true, mapping: true, feedback: true, privacy: true, safety: true,
    token: true, latency: true, dispatchable_count: 0, direct_pass_through_usable: true,
    installed: { claude: { pass: true }, codex: { pass: true } },
    repository_tests: true, security: true, audit: true,
  });
  assert.equal(report.status, 'ready');
  assert.equal(report.dimensions.adaptive_release.pass, true);
  assert.equal(report.direct_pass_through_usable, true);
  assert.equal(report.no_composite_score, true);
});

test('final release evidence reports each independent missing dimension', () => {
  const report = reconcileAutonomousReleaseEvidence({ raw_prompt: 'private raw prompt /Users/private' });
  assert.equal(report.status, 'blocked');
  for (const name of ['source_install_parity', 'mapping', 'feedback', 'privacy', 'safety', 'token', 'latency', 'claude', 'codex', 'adaptive_release', 'repository']) {
    assert.equal(report.dimensions[name].pass, false, name);
  }
  assert.doesNotMatch(JSON.stringify(report), /private raw prompt|\/Users\/private/);
  assert.equal(Object.hasOwn(report, 'score'), false);
});
