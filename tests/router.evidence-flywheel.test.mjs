import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFlywheelChain,
  closeFlywheel,
  proposeShadowImprovement,
  summarizeScopedEvidence,
} from '../src/evolution/flywheel.mjs';

const scope = {
  runtime: 'claude', project_id: 'project:a', workflow_id: 'review-flow',
  framework: 'custom', role: 'review', task_family: 'quality',
};

function event(stage, overrides = {}) {
  return {
    stage,
    correlation_id: 'route:1',
    timestamp_ms: 100,
    ...scope,
    evidence_class: 'live',
    ...overrides,
  };
}

function completeEvents(overrides = {}) {
  return [
    event('recommendation'),
    event('selected', { capability_ids: ['custom:review'] }),
    event('actual_invocation', { actual_capability_ids: ['custom:review'] }),
    event('receipt', { receipt_id: 'receipt:1' }),
    event('completion', { receipt_id: 'receipt:1' }),
    event('verification', { verified: true, receipt_id: 'receipt:1' }),
    event('outcome', { verified: true, outcome_kind: 'success', cost: { actual_tokens: 50, latency_ms: 12 } }),
    event('shadow', { reason_code: 'verified_outcome' }),
    event('canary', { reason_code: 'canary_ready' }),
    event('promotion', { snapshot_epoch: 'epoch:2' }),
    event('refreshed_snapshot', { snapshot_epoch: 'epoch:2' }),
    ...([]),
    ...Object.values(overrides).flatMap(value => Array.isArray(value) ? value : []),
  ];
}

test('EVD-01/02: complete chain distinguishes selected, actual, receipt, completion, verification, outcome, and cost', () => {
  const chain = buildFlywheelChain(completeEvents());
  assert.equal(chain.status, 'complete');
  assert.equal(chain.selected_vs_used, 'match');
  assert.equal(chain.verified_outcomes, 1);
  assert.deepEqual(chain.missing_stages, []);
  assert.equal(chain.cost.actual_tokens, 50);
  assert.deepEqual(chain.evidence_classes, ['live']);
  assert.equal(chain.privacy_safe, true);
});

test('EVD-02: selected-only, missing verification, and stale evidence remain unknown', () => {
  const selected = buildFlywheelChain([event('recommendation'), event('selected', { capability_ids: ['custom:review'] })]);
  assert.equal(selected.status, 'unknown');
  assert.equal(selected.verified_outcomes, 0);
  assert.equal(selected.next_stage, 'actual_invocation');

  const unverified = buildFlywheelChain(completeEvents().map(item => item.stage === 'verification' || item.stage === 'outcome'
    ? { ...item, verified: false, evidence_class: 'unknown' }
    : item));
  assert.equal(unverified.verified_outcomes, 0);
  assert.equal(proposeShadowImprovement({ chain: unverified, proposal: { kind: 'ranking', from: 'a', to: 'b' } }).status, 'denied');
});

test('EVD-01: selected-versus-used mismatch and terminal failure are visible', () => {
  const mismatch = buildFlywheelChain(completeEvents().map(item => item.stage === 'actual_invocation'
    ? { ...item, actual_capability_ids: ['custom:other'] }
    : item));
  assert.equal(mismatch.selected_vs_used, 'mismatch');

  const failure = buildFlywheelChain([
    event('recommendation'), event('selected', { capability_ids: ['custom:review'] }),
    event('failure', { reason_code: 'invocation_failed' }),
  ]);
  assert.equal(failure.status, 'terminal');
  assert.equal(failure.privacy_safe, true);
});

test('EVD-01: duplicate stages, terminal mixing, and receipt mismatches remain unknown', () => {
  const duplicate = buildFlywheelChain([
    ...completeEvents(),
    event('selected', { capability_ids: ['custom:review'] }),
  ]);
  assert.equal(duplicate.status, 'unknown');
  assert.ok(duplicate.reason_codes.includes('duplicate_stage'));

  const terminalMix = buildFlywheelChain([
    ...completeEvents().slice(0, 4),
    event('failure', { reason_code: 'invocation_failed' }),
    ...completeEvents().slice(4),
  ]);
  assert.equal(terminalMix.status, 'unknown');
  assert.ok(terminalMix.reason_codes.includes('terminal_stage_conflict'));

  const receiptMismatch = buildFlywheelChain(completeEvents().map(item => item.stage === 'completion'
    ? { ...item, receipt_id: 'receipt:other' }
    : item));
  assert.equal(receiptMismatch.status, 'unknown');
  assert.ok(receiptMismatch.reason_codes.includes('receipt_mismatch'));
});

test('EVD-02: cyclic event input fails closed without throwing', () => {
  const cyclic = event('recommendation');
  cyclic.loop = cyclic;
  assert.doesNotThrow(() => buildFlywheelChain([cyclic]));
  assert.equal(buildFlywheelChain([cyclic]).status, 'unknown');
});

test('EVD-03: scoped summaries keep runtime/project/framework/role/task dimensions separate', () => {
  const first = buildFlywheelChain(completeEvents());
  const second = buildFlywheelChain(completeEvents().map(item => ({ ...item, correlation_id: 'route:2', project_id: 'project:b', framework: 'gsd-like' })));
  const summary = summarizeScopedEvidence([first, second]);
  assert.equal(summary.length, 2);
  assert.equal(summary[0].verified, 1);
  assert.equal(summary[1].verified, 1);
  assert.notDeepEqual(summary[0].scope, summary[1].scope);
});

test('EVD-04/05: verified evidence can propose only bounded non-authority changes and canary closes reversibly', () => {
  const chain = buildFlywheelChain(completeEvents());
  const shadow = proposeShadowImprovement({ chain, proposal: { kind: 'alias', from: 'custom:review', to: 'custom:inspect' } });
  assert.equal(shadow.status, 'shadow');
  assert.equal(shadow.requires_canary, true);
  assert.equal(shadow.authority_unchanged, true);
  assert.equal(closeFlywheel({ chain, shadow, canary: 'pending' }).status, 'shadow');
  assert.equal(closeFlywheel({ chain, shadow, canary: 'promoted', snapshot_epoch: 'epoch:2' }).status, 'promoted');
  assert.equal(closeFlywheel({ chain, shadow, canary: 'rolled_back', snapshot_epoch: 'epoch:1' }).status, 'rolled_back');

  const denied = proposeShadowImprovement({ chain, proposal: { kind: 'mapping', from: 'a', to: 'b', authority: 'persistent' } });
  assert.equal(denied.status, 'denied');
  assert.equal(denied.authority_unchanged, true);
});

test('EVD-02/05: raw content is rejected before it can enter a chain or learning proposal', () => {
  const chain = buildFlywheelChain([event('recommendation', { prompt_text: 'private prompt' })]);
  assert.equal(chain.status, 'unknown');
  assert.ok(chain.reason_codes.includes('event_privacy_forbidden'));
  assert.doesNotMatch(JSON.stringify(chain), /private prompt/);
});

test('EVD-04/05: null improvement inputs remain denied or unknown without throwing', () => {
  assert.doesNotThrow(() => proposeShadowImprovement(null));
  assert.equal(proposeShadowImprovement(null).status, 'denied');
  assert.doesNotThrow(() => closeFlywheel(null));
  assert.equal(closeFlywheel(null).status, 'unknown');
});
