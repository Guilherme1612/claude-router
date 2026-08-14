import assert from 'node:assert/strict';
import test from 'node:test';

import { applyPreferences } from '../src/orchestrator/preferences.mjs';
import { resolveSemanticRoute } from '../src/orchestrator/compose.mjs';
import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { parseSemanticIntent } from '../src/intent/semantic.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';
import { buildContinuityDigest } from '../src/steward/continuity.mjs';

function capability(name) {
  const base = {
    ...buildClaudeHeavyProfile()[0], name, canonical_identity: `fixture/${name}`,
    semantic: {
      intents: ['inspect'], subjects: ['database', 'relationship'], operations: ['inspect'],
      outputs: ['relationships'], evidence: ['adapter'], aliases: ['data model map'],
    },
    composition: { roles: ['relationship-analysis'], requires: [], conflicts: [], exclusive: false },
    dependencies: { state: 'declared', items: [] }, effects: ['none'],
    risk: { level: 'low', source: 'declared' }, authority: { ceiling: 'inspect', source: 'declared' },
    cost: { latency: 'low', context_bytes: 128, tool_calls: 1 },
  };
  const evidence = contractEvidence(base);
  evidence.reversibility[0].value = 'reversible';
  evidence.risk[0].value = 'low';
  evidence.authority[0].value = 'inspect';
  evidence.permissions[0].value = ['read'];
  evidence.scope[0].value = base.scope;
  evidence.cost[0].value = 'low';
  return { ...base, contract: buildCapabilityContract(base, evidence) };
}

const candidates = [
  { stable_id: 'anonymous/default', aliases: ['default'], score: 1000, eligibility: { eligible: true } },
  { stable_id: 'anonymous/preferred', aliases: ['preferred'], score: 1000, eligibility: { eligible: true } },
  { stable_id: 'anonymous/ineligible', aliases: ['preferred'], score: 9999, eligibility: { eligible: false } },
];

test('PREF-04: an applicable preference resolves an otherwise ambiguous semantic route', () => {
  const result = resolveSemanticRoute({
    intent: parseSemanticIntent('inspect database relationships'),
    records: [capability('graphify'), capability('equivalent')],
    preferences: [{ preference_id: 'prefer-graphify', scope: 'global-user', alias: 'fixture/graphify' }],
  });
  assert.equal(result.status, 'resolved');
  assert.equal(result.retrieval.selected.stable_id, 'fixture/graphify');
  assert.equal(result.composition.selected[0], 'fixture/graphify');
  assert.deepEqual(result.retrieval.reason_codes, ['preference_tiebreak_resolved']);
});

test('PREF-04: null semantic route input remains safe-empty', () => {
  assert.doesNotThrow(() => resolveSemanticRoute(null));
  assert.equal(resolveSemanticRoute(null).status, 'unresolved');
  assert.equal(resolveSemanticRoute(null).dispatch_eligible, false);
});

test('PREF-01/02: narrower preferences win only among eligible candidates', () => {
  const result = applyPreferences({
    candidates,
    preferences: [
      { preference_id: 'global', scope: 'global-user', alias: 'preferred' },
      { preference_id: 'project', scope: 'project', project_id: 'p1', alias: 'default' },
      { preference_id: 'workflow', scope: 'workflow', workflow_id: 'w1', alias: 'preferred' },
    ],
    scope: { project_id: 'p1', workflow_id: 'w1', runtime: 'claude' },
  });
  assert.equal(result.selected.stable_id, 'anonymous/preferred');
  assert.equal(result.selected.preference.scope, 'workflow');
  assert.equal(result.candidates.some(candidate => candidate.stable_id === 'anonymous/ineligible'), false);
});

test('PREF-03: stale preferences are inert warnings', () => {
  const result = applyPreferences({
    candidates: [{ ...candidates[0], source_fingerprint: 'new' }],
    preferences: [{ preference_id: 'stale', scope: 'runtime', runtime: 'claude', alias: 'default', source_fingerprint: 'old' }],
    scope: { runtime: 'claude' },
  });
  assert.equal(result.selected.preference, null);
  assert.ok(result.warnings.some(warning => warning.reason_code === 'preference_source_stale'));
});

const receipt = {
  receipt_id: 'r1', project_fingerprint: 'p1', source_fingerprint: 's1', action_id: 'a1', completed_at_ms: 2,
  completion_evidence: { state: 'completed' },
  invocation_evidence: { receipt_id: 'r1' }, postcondition_evidence: { receipt_id: 'r1', verified: true },
};

test('STRT-01/04/05: fresh verified evidence yields one deterministic lease-bound digest', () => {
  const result = buildContinuityDigest({
    projectFingerprint: 'p1', sourceFingerprint: 's1', state: {
    project_fingerprint: 'p1', authoritative: true, phase: '53', status: 'active', state_fingerprint: 'state1', next_action: 'verify phase', next_action_effects: ['read'],
      goal_id: 'g1', next_action_id: 'a1', next_action_risk: 'low',
    }, receipts: [receipt], lease: {
      lease_id: 'l1', project_fingerprint: 'p1', goal_id: 'g1', action_id: 'a1', risk_ceiling: 'low', status: 'active', expiry: { deterministic_at_ms: 100 }, allowed_effects: ['read'],
      resource_bounds: { max_invocations: 1, max_tokens: 100, max_wall_ms: 100 },
    }, now: 10,
  });
  assert.equal(result.status, 'digest');
  assert.equal(result.digest.last_verified_outcome.receipt_id, 'r1');
  assert.equal(result.digest.likely_next_action, 'verify phase');
  assert.equal(result.digest.resume.disposition, 'lease_bound_resume');
});

test('STRT-05: a foreign or under-bounded lease stays recommendation-only', () => {
  const result = buildContinuityDigest({
    projectFingerprint: 'p1', sourceFingerprint: 's1', state: {
      project_fingerprint: 'p1', authoritative: true, next_action: 'verify phase', next_action_id: 'a1', goal_id: 'g1',
      next_action_effects: ['read'], next_action_risk: 'low',
    }, receipts: [receipt], lease: {
      lease_id: 'foreign', project_fingerprint: 'other', goal_id: 'g1', action_id: 'a1', risk_ceiling: 'low', status: 'active',
      expiry: { deterministic_at_ms: 100 }, allowed_effects: ['read'],
    }, now: 10,
  });
  assert.equal(result.digest.resume.disposition, 'recommendation_only');
});

test('STRT-02/03/06: first, acknowledged, stale, meaningless, and protected states stay silent or refresh', () => {
  assert.equal(buildContinuityDigest({ projectFingerprint: 'p1', firstVisit: true }).status, 'silent');
  assert.equal(buildContinuityDigest({ projectFingerprint: 'p1', acknowledgedFingerprint: 'p1' }).status, 'silent');
  assert.equal(buildContinuityDigest({ projectFingerprint: 'p1', sourceFingerprint: 's2', receipts: [receipt] }).status, 'refresh');
  const protectedResult = buildContinuityDigest({
    projectFingerprint: 'p1', sourceFingerprint: 's1', state: { project_fingerprint: 'p1', authoritative: true, next_action: 'publish', next_action_effects: ['publication'] }, receipts: [receipt],
    lease: { lease_id: 'l1', status: 'active', expiry: { deterministic_at_ms: 100 }, allowed_effects: ['publication'] }, now: 10,
  });
  assert.equal(protectedResult.digest.resume.disposition, 'recommendation_only');
});
