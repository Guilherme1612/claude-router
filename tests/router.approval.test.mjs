// Phase 23 Plan 03 — Task 23-03-01 (RED)
// Approval gate: needsApproval / bindApproval / verifyApproval
// (EXEC-07/08/09). Fail-closed on missing/stale/mismatch; success
// reason_code is 'approval_bound'. Token binds
// contentFingerprint(capability) + stableStringify(args) +
// sorted targets + stableStringify(effects) + String(proposalVersion)
// through createHash('sha256') (ASVS V6 — never hand-roll).

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { stableCapabilityId, contentFingerprint } from '../src/registry/identity.mjs';
import { buildClaudeHeavyProfile, contractEvidence } from './helpers/inventory-fixture.mjs';

const approvalModule = import('../src/orchestrator/approval.mjs');
const actionsModule = import('../src/orchestrator/actions.mjs');
const classifyModule = import('../src/intent/classify.mjs');

// Fixture: a capability whose contract surface can be overridden to
// destructive / irreversible / high-risk via the side_effects /
// reversibility / risk envelopes. Follows the safeRecord +
// contractEvidence pattern from router.contract-eligibility.test.mjs:13-23.
function makeCapability({ name = 'atlas', sideEffects, reversibility, risk, ...rest } = {}) {
  const base = buildClaudeHeavyProfile()[0];
  const record = {
    ...base,
    name,
    canonical_identity: `router/${name}`,
    dependencies: { state: 'declared', items: [] },
    ...rest,
  };
  const evidence = contractEvidence(record, 'workflow-transitions');
  evidence.reversibility[0].value = reversibility ?? 'reversible';
  evidence.risk[0].value = risk ?? 'low';
  if (sideEffects !== undefined) evidence.side_effects[0].value = sideEffects;
  else evidence.side_effects[0].value = [];
  evidence.workflow_transitions[0].value = ['gsd.execute'];
  return { ...record, contract: buildCapabilityContract(record, evidence) };
}

function freshPlannedGsdState(overrides = {}) {
  return {
    status: 'active',
    freshness: 'fresh',
    position: { family: 'gsd', state: 'planned' },
    gates: { plan_approved: true },
    dependencies_safe: true,
    ...overrides,
  };
}

function registryWith(records, eligibilityById = null) {
  const eligibility = eligibilityById ?? Object.fromEntries(
    records.map(record => {
      let id;
      try { id = stableCapabilityId(record); } catch { id = ''; }
      return [id, {
        schema_version: 1, policy_version: 'eligibility-policy-v1',
        eligible: true, recommendation_only: false, gates: {},
        reason_codes: ['eligibility_all_gates_passed'],
      }];
    }),
  );
  return { records, eligibility };
}

test('[phase23-red:approval] needsApproval false for safe contract (reversible + low risk + no destructive side effects)', async () => {
  const { needsApproval } = await approvalModule;
  const safe = makeCapability({ name: 'safe-cap' });
  assert.equal(needsApproval(safe.contract), false);
});

test('[phase23-red:approval] needsApproval true when side_effects contains destructive (EXEC-07)', async () => {
  const { needsApproval } = await approvalModule;
  const destructive = makeCapability({ name: 'destructive-cap', sideEffects: ['destructive'] });
  assert.equal(needsApproval(destructive.contract), true);
});

test('[phase23-red:approval] needsApproval true for unbounded / external / privileged side effects', async () => {
  const { needsApproval } = await approvalModule;
  for (const token of ['unbounded', 'external', 'privileged']) {
    const cap = makeCapability({ name: `${token}-cap`, sideEffects: [token] });
    assert.equal(needsApproval(cap.contract), true, `expected true for side_effects=${token}`);
  }
});

test('[phase23-red:approval] needsApproval true when reversibility is irreversible (EXEC-07)', async () => {
  const { needsApproval } = await approvalModule;
  const irreversible = makeCapability({ name: 'irreversible-cap', reversibility: 'irreversible' });
  assert.equal(needsApproval(irreversible.contract), true);
});

test('[phase23-red:approval] needsApproval true when risk is high / critical / unacceptable (EXEC-07)', async () => {
  const { needsApproval } = await approvalModule;
  for (const token of ['high', 'critical', 'unacceptable']) {
    const cap = makeCapability({ name: `${token}-risk-cap`, risk: token });
    assert.equal(needsApproval(cap.contract), true, `expected true for risk=${token}`);
  }
});

test('[phase23-red:approval] needsApproval false when envelope state is unknown (uncertain → not auto-blocked; eligibility gate handles unknown)', async () => {
  const { needsApproval } = await approvalModule;
  const cap = makeCapability({ name: 'unknown-cap' });
  // Force the side_effects / reversibility / risk envelopes to unknown —
  // the approval gate must NOT auto-block unknown (eligibility handles it).
  cap.contract.fields.side_effects = {
    state: 'unknown', evidence: [], rejected_evidence: [], provenance: [],
    policy_version: cap.contract.policy_version, freshness: 'unknown',
    confidence_basis_points: 0, reason_codes: ['side_effects_missing'],
  };
  cap.contract.fields.reversibility = {
    state: 'unknown', evidence: [], rejected_evidence: [], provenance: [],
    policy_version: cap.contract.policy_version, freshness: 'unknown',
    confidence_basis_points: 0, reason_codes: ['reversibility_missing'],
  };
  cap.contract.fields.risk = {
    state: 'unknown', evidence: [], rejected_evidence: [], provenance: [],
    policy_version: cap.contract.policy_version, freshness: 'unknown',
    confidence_basis_points: 0, reason_codes: ['risk_missing'],
  };
  assert.equal(needsApproval(cap.contract), false);
});

test('[phase23-red:approval] bindApproval returns schema/policy versions and a hex token (EXEC-08)', async () => {
  const { bindApproval } = await approvalModule;
  const cap = makeCapability({ name: 'bound-cap' });
  const bound = bindApproval({
    capability: cap,
    args: { topic: 'auth' },
    targets: ['phase-24'],
    effects: ['filesystem:write'],
    proposalVersion: 1,
  });
  assert.equal(bound.schema_version, 1);
  assert.equal(typeof bound.token, 'string');
  assert.ok(/^[a-f0-9]{64}$/.test(bound.token), 'token must be sha256 hex');
  assert.equal(bound.capability_fingerprint, contentFingerprint(cap));
});

test('[phase23-red:approval] re-deriving bindApproval twice in the same process yields the same token (hash determinism)', async () => {
  const { bindApproval } = await approvalModule;
  const cap = makeCapability({ name: 'deterministic-cap' });
  const inputs = {
    capability: cap,
    args: { topic: 'routing' },
    targets: ['phase-25', 'phase-24'],
    effects: ['git:commit'],
    proposalVersion: 7,
  };
  const a = bindApproval(inputs);
  const b = bindApproval(inputs);
  assert.equal(a.token, b.token);
  // Different proposalVersion → different token (boundary baseline).
  const c = bindApproval({ ...inputs, proposalVersion: 8 });
  assert.notEqual(a.token, c.token);
});

test('[phase23-red:approval] verifyApproval with no bound → blocked approval_missing (EXEC-08)', async () => {
  const { verifyApproval } = await approvalModule;
  const r = verifyApproval({ presented: { token: 'abc' } });
  assert.equal(r.status, 'blocked');
  assert.equal(r.dispatch_eligible, false);
  assert.equal(r.reason_code, 'approval_missing');
});

test('[phase23-red:approval] verifyApproval with no presented → blocked approval_missing (EXEC-08)', async () => {
  const { verifyApproval } = await approvalModule;
  const r = verifyApproval({ bound: { token: 'abc' } });
  assert.equal(r.status, 'blocked');
  assert.equal(r.reason_code, 'approval_missing');
});

test('[phase23-red:approval] verifyApproval where bound.token !== expected (re-derived) → blocked approval_stale (EXEC-08)', async () => {
  const { bindApproval, verifyApproval } = await approvalModule;
  const cap = makeCapability({ name: 'stale-version-cap' });
  const bound = bindApproval({
    capability: cap, args: { topic: 'auth' }, targets: ['phase-24'],
    effects: ['filesystem:write'], proposalVersion: 1,
  });
  // Re-derive expected with bumped proposalVersion → bound is stale.
  const expected = bindApproval({
    capability: cap, args: { topic: 'auth' }, targets: ['phase-24'],
    effects: ['filesystem:write'], proposalVersion: 2,
  });
  const r = verifyApproval({ bound, presented: { token: bound.token }, expected: expected.token });
  assert.equal(r.status, 'blocked');
  assert.equal(r.reason_code, 'approval_stale');
  assert.equal(r.dispatch_eligible, false);
});

test('[phase23-red:approval] bumping proposalVersion by 1 invalidates the prior bound token (approval_stale, boundary)', async () => {
  const { bindApproval, verifyApproval } = await approvalModule;
  const cap = makeCapability({ name: 'version-bump-cap' });
  const v1 = bindApproval({
    capability: cap, args: { topic: 'auth' }, targets: ['p24'],
    effects: ['fs:write'], proposalVersion: 1,
  });
  const v2 = bindApproval({
    capability: cap, args: { topic: 'auth' }, targets: ['p24'],
    effects: ['fs:write'], proposalVersion: 2,
  });
  // Bound at v1, presented v1 token, but current state is v2 → stale.
  const r = verifyApproval({ bound: v1, presented: { token: v1.token }, expected: v2.token });
  assert.equal(r.reason_code, 'approval_stale');
});

test('[phase23-red:approval] changing args (different topic for create-phase) invalidates the prior bound token (approval_stale)', async () => {
  const { bindApproval, verifyApproval } = await approvalModule;
  const cap = makeCapability({ name: 'args-change-cap' });
  const bound = bindApproval({
    capability: cap, args: { topic: 'auth' }, targets: ['p24'],
    effects: ['fs:write'], proposalVersion: 1,
  });
  const expected = bindApproval({
    capability: cap, args: { topic: 'routing' }, targets: ['p24'],
    effects: ['fs:write'], proposalVersion: 1,
  });
  const r = verifyApproval({ bound, presented: { token: bound.token }, expected: expected.token });
  assert.equal(r.reason_code, 'approval_stale');
});

test('[phase23-red:approval] verifyApproval where presented.token !== bound.token → blocked approval_mismatch (EXEC-08)', async () => {
  const { bindApproval, verifyApproval } = await approvalModule;
  const cap = makeCapability({ name: 'mismatch-cap' });
  const bound = bindApproval({
    capability: cap, args: { topic: 'auth' }, targets: ['p24'],
    effects: ['fs:write'], proposalVersion: 1,
  });
  // Expected matches bound (not stale), but presented is a different token.
  const r = verifyApproval({
    bound, presented: { token: '0'.repeat(64) }, expected: bound.token,
  });
  assert.equal(r.status, 'blocked');
  assert.equal(r.reason_code, 'approval_mismatch');
  assert.equal(r.dispatch_eligible, false);
});

test('[phase23-red:approval] verifyApproval where all legs match → approved approval_bound (EXEC-08)', async () => {
  const { bindApproval, verifyApproval } = await approvalModule;
  const cap = makeCapability({ name: 'happy-cap' });
  const bound = bindApproval({
    capability: cap, args: { topic: 'auth' }, targets: ['p24'],
    effects: ['fs:write'], proposalVersion: 1,
  });
  const r = verifyApproval({ bound, presented: { token: bound.token }, expected: bound.token });
  assert.equal(r.status, 'approved');
  assert.equal(r.dispatch_eligible, true);
  assert.equal(r.reason_code, 'approval_bound');
});

test('[phase23-fix:approval] verifyApproval fail-closes when expected is omitted — staleness leg must NOT be skipped (CR-01)', async () => {
  const { bindApproval, verifyApproval } = await approvalModule;
  const cap = makeCapability({ name: 'no-expected-cap' });
  const bound = bindApproval({
    capability: cap, args: { topic: 'auth' }, targets: ['p24'],
    effects: ['fs:write'], proposalVersion: 1,
  });
  // Presented token matches bound, but no `expected` is supplied. The gate
  // MUST fail closed — a stale bound token + matching presented token must
  // never approve when the staleness leg cannot be anchored to fresh state.
  const r = verifyApproval({ bound, presented: { token: bound.token } });
  assert.equal(r.status, 'blocked', `expected blocked, got ${r.status}`);
  assert.equal(r.dispatch_eligible, false);
  assert.notEqual(r.reason_code, 'approval_bound', 'must NOT approve without expected');
  assert.ok(r.reason_code, 'must return a non-empty reason_code');
});

test('[phase23-fix:approval] verifyApproval fail-closes when expected is malformed (numeric/object without token) (CR-01)', async () => {
  const { bindApproval, verifyApproval } = await approvalModule;
  const cap = makeCapability({ name: 'malformed-expected-cap' });
  const bound = bindApproval({
    capability: cap, args: { topic: 'auth' }, targets: ['p24'],
    effects: ['fs:write'], proposalVersion: 1,
  });
  for (const malformed of [42, {}, { token: 42 }, null, '']) {
    const r = verifyApproval({ bound, presented: { token: bound.token }, expected: malformed });
    assert.equal(r.status, 'blocked', `expected blocked for malformed expected=${JSON.stringify(malformed)}`);
    assert.equal(r.dispatch_eligible, false);
    assert.notEqual(r.reason_code, 'approval_bound', `must NOT approve for malformed expected=${JSON.stringify(malformed)}`);
  }
});

test('[phase23-red:approval] EXEC-09 invariant — a hook-only registry never reaches bindApproval (resolveAction returns no_eligible_capability)', async () => {
  const { resolveAction } = await actionsModule;
  const { classifyIntent } = await classifyModule;
  const hookRecord = {
    ...makeCapability({ name: 'hook-cap', sideEffects: ['destructive'] }),
    type: 'hook',
    lifecycle: 'ready',
    event: 'UserPromptSubmit',
  };
  const registry = registryWith([hookRecord]);
  const intent = classifyIntent('go to the next phase');
  const action = resolveAction({ intent, state: freshPlannedGsdState(), registry });
  assert.equal(action.status, 'blocked');
  assert.equal(action.reason_code, 'no_eligible_capability');
  assert.equal(action.capability, undefined);
});