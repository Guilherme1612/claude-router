import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRANSITION_POLICY_VERSION,
  WORKFLOW_TRANSITIONS,
  nextValidTransitions,
  selectWorkflow,
} from '../src/orchestrator/transitions.mjs';
import { resolveDependencies, selectCapabilities } from '../src/orchestrator/select.mjs';

function evidence(overrides = {}) {
  return {
    status: 'active',
    freshness: 'fresh',
    position: { family: 'gsd', state: 'planned' },
    gates: { plan_approved: true },
    dependencies_safe: true,
    ...overrides,
  };
}

function selectedWorkflow(overrides = {}) {
  return {
    status: 'selected',
    dispatch_eligible: true,
    reason_code: 'unique_valid_transition',
    selection: {
      transition_id: 'gsd.execute', workflow_id: 'gsd-execute-phase',
      family: 'gsd', from: 'planned', to: 'execute',
    },
    ...overrides,
  };
}

test('malformed dependency and capability selection input fails closed without throwing', () => {
  assert.doesNotThrow(() => resolveDependencies(null));
  assert.equal(resolveDependencies(null).reason_code, 'registry_invalid');
  assert.doesNotThrow(() => selectCapabilities(null));
  assert.equal(selectCapabilities(null).reason_code, 'workflow_not_dispatch_eligible');
});

function workflowDeclaration(overrides = {}) {
  return {
    workflow_id: 'gsd-execute-phase',
    owners: ['router/executor', 'router/execute-command'],
    compatible: ['router/executor', 'router/execute-command'],
    ...overrides,
  };
}

function capabilityRecord(id, type, dependencies = [], overrides = {}) {
  return {
    id, type, lifecycle: 'ready', dispatchable: true, available: true,
    scope: { kind: 'global' },
    dependencies: { state: dependencies.length ? 'declared' : 'unknown', items: dependencies.map(value => ({ id: value, available: true })) },
    permissions: { required: [], grants: [], denied: [] }, conflicts: [], provenance: [],
    ...overrides,
  };
}

test('canonical transition policy is frozen, versioned, and covers every workflow family', () => {
  assert.equal(TRANSITION_POLICY_VERSION, 'workflow-transitions-v1');
  assert.equal(Object.isFrozen(WORKFLOW_TRANSITIONS), true);
  assert.deepEqual(
    [...new Set(WORKFLOW_TRANSITIONS.map(row => row.family))].sort(),
    ['brainstorm', 'gsd', 'interrupted', 'milestone', 'verification-gap'],
  );

  const rows = [
    [evidence({ position: { family: 'brainstorm', state: 'design_approved' }, gates: { design_approved: true } }), 'brainstorm.plan-implementation'],
    [evidence(), 'gsd.execute'],
    [evidence({ position: { family: 'interrupted', state: 'interrupted' }, gates: { resumable_execution: true } }), 'interrupted.resume'],
    [evidence({ position: { family: 'verification-gap', state: 'gaps_found' }, gates: { gap_plan_ready: true } }), 'verification-gap.close'],
    [evidence({ position: { family: 'milestone', state: 'verified' }, gates: { milestone_verified: true } }), 'milestone.close'],
  ];
  for (const [input, transitionId] of rows) {
    const result = nextValidTransitions(input);
    assert.equal(result.status, 'candidates_available');
    assert.equal(result.reason_code, 'valid_transitions');
    assert.equal(result.dispatch_eligible, false);
    assert.deepEqual(result.candidates.map(row => row.transition_id), [transitionId]);
  }
});

test('invalid, stale, terminal, unsafe, gated, and unknown states fail closed', () => {
  const rows = [
    [{}, 'invalid_authoritative_evidence'],
    [evidence({ freshness: 'stale' }), 'authoritative_evidence_stale'],
    [evidence({ status: 'completed' }), 'terminal_workflow'],
    [evidence({ dependencies_safe: false }), 'dependency_unsafe'],
    [evidence({ gates: {} }), 'required_gate_missing'],
    [evidence({ position: { family: 'gsd', state: 'unknown' } }), 'no_valid_transition'],
  ];
  for (const [input, reason] of rows) {
    const result = nextValidTransitions(input);
    assert.equal(result.status, 'blocked');
    assert.equal(result.reason_code, reason);
    assert.equal(result.dispatch_eligible, false);
    assert.deepEqual(result.candidates, []);
  }
});

test('candidate outcomes are byte-stable across policy permutations and semantic duplicates', () => {
  const custom = [
    { id: 'gsd.verify', family: 'gsd', from: 'executed', to: 'verify', workflow_id: 'gsd-verify-work', requires: ['execution_complete'] },
    { id: 'gsd.audit', family: 'gsd', from: 'executed', to: 'audit', workflow_id: 'gsd-audit-uat', requires: ['execution_complete'] },
    { id: 'gsd.verify', family: 'gsd', from: 'executed', to: 'verify', workflow_id: 'gsd-verify-work', requires: ['execution_complete'] },
  ];
  const input = evidence({ position: { family: 'gsd', state: 'executed' }, gates: { execution_complete: true } });
  assert.equal(
    JSON.stringify(nextValidTransitions(input, custom)),
    JSON.stringify(nextValidTransitions(input, [...custom].reverse())),
  );
  assert.equal(nextValidTransitions(input, custom).candidates.length, 2);
});

test('transition evaluation never observes capability, registry, tool, MCP, hook, or prompt fields', () => {
  const forbidden = ['capabilities', 'registry', 'tools', 'mcps', 'hooks', 'prompt', 'raw_prompt'];
  const input = evidence();
  for (const key of forbidden) {
    Object.defineProperty(input, key, { enumerable: true, get() { throw new Error(`observed ${key}`); } });
  }
  const result = nextValidTransitions(input);
  assert.deepEqual(result.candidates.map(row => row.transition_id), ['gsd.execute']);
  assert.doesNotMatch(JSON.stringify(result), /capabilit|registry|\btool\b|mcp|hook|prompt/i);
});

test('one valid transition selects automatically and complete explicit intent supersedes stale intent', () => {
  const candidates = nextValidTransitions(evidence());
  const automatic = selectWorkflow(candidates);
  assert.deepEqual(automatic, {
    status: 'selected', dispatch_eligible: true, reason_code: 'unique_valid_transition',
    selection: candidates.candidates[0],
  });

  const explicit = selectWorkflow(candidates, {
    present: true, complete: true, transition_id: 'gsd.execute',
    stale_intent: 'gsd.plan', raw_prompt: 'do not expose this',
  });
  assert.equal(explicit.status, 'selected');
  assert.equal(explicit.reason_code, 'explicit_valid_transition');
  assert.equal(explicit.dispatch_eligible, true);
  assert.equal(explicit.selection.transition_id, 'gsd.execute');
  assert.doesNotMatch(JSON.stringify(explicit), /stale_intent|raw_prompt|do not expose/i);
});

test('explicit intent cannot bypass terminal, gate, or dependency safety', () => {
  const intent = { present: true, complete: true, transition_id: 'gsd.execute' };
  const rows = [
    nextValidTransitions(evidence({ status: 'completed' })),
    nextValidTransitions(evidence({ gates: {} })),
    nextValidTransitions(evidence({ dependencies_safe: false })),
  ];
  for (const transitionResult of rows) {
    const selected = selectWorkflow(transitionResult, intent);
    assert.equal(selected.status, 'blocked');
    assert.equal(selected.dispatch_eligible, false);
    assert.equal(selected.reason_code, transitionResult.reason_code);
    assert.equal('selection' in selected, false);
  }
});

test('incomplete intent and material ties yield exactly one smallest non-dispatchable question', () => {
  const tiedPolicy = [
    { id: 'gsd.verify', family: 'gsd', from: 'executed', to: 'verify', workflow_id: 'gsd-verify-work', requires: ['execution_complete'] },
    { id: 'gsd.audit', family: 'gsd', from: 'executed', to: 'audit', workflow_id: 'gsd-audit-uat', requires: ['execution_complete'] },
  ];
  const candidates = nextValidTransitions(
    evidence({ position: { family: 'gsd', state: 'executed' }, gates: { execution_complete: true } }),
    tiedPolicy,
  );
  const incomplete = selectWorkflow(candidates, { present: true, complete: false });
  assert.equal(incomplete.reason_code, 'explicit_transition_incomplete');
  assert.deepEqual(Object.keys(incomplete).filter(key => key === 'question'), ['question']);
  assert.equal(incomplete.question, 'Should I audit or verify next?');

  const tied = selectWorkflow(candidates);
  assert.equal(tied.status, 'clarification_required');
  assert.equal(tied.reason_code, 'material_transition_tie');
  assert.equal(tied.dispatch_eligible, false);
  assert.equal(tied.question, 'Should I audit or verify next?');
  assert.equal((JSON.stringify(tied).match(/\?/g) || []).length, 1);
});

test('invalid explicit selection blocks and selection is permutation-stable without input mutation', () => {
  const policy = [
    { id: 'gsd.verify', family: 'gsd', from: 'executed', to: 'verify', workflow_id: 'gsd-verify-work', requires: ['execution_complete'] },
    { id: 'gsd.audit', family: 'gsd', from: 'executed', to: 'audit', workflow_id: 'gsd-audit-uat', requires: ['execution_complete'] },
  ];
  const source = evidence({ position: { family: 'gsd', state: 'executed' }, gates: { execution_complete: true } });
  const forward = nextValidTransitions(source, policy);
  const reverse = nextValidTransitions(source, [...policy].reverse());
  const before = JSON.stringify(forward);
  const intent = { present: true, complete: true, transition_id: 'gsd.verify' };
  assert.equal(JSON.stringify(selectWorkflow(forward, intent)), JSON.stringify(selectWorkflow(reverse, intent)));
  assert.equal(JSON.stringify(forward), before);

  const invalid = selectWorkflow(forward, { present: true, complete: true, transition_id: 'gsd.execute' });
  assert.deepEqual(invalid, {
    status: 'blocked', dispatch_eligible: false, reason_code: 'explicit_transition_invalid',
  });

  const conflicting = selectWorkflow(forward, {
    present: true,
    complete: true,
    transition_id: 'gsd.verify',
    workflow_id: 'gsd-audit-uat',
  });
  assert.deepEqual(conflicting, {
    status: 'blocked', dispatch_eligible: false, reason_code: 'explicit_transition_invalid',
  });
});

test('capability selection rejects before registry access unless one workflow token is dispatch eligible', () => {
  const invalid = [
    null,
    { status: 'blocked', dispatch_eligible: false, reason_code: 'required_gate_missing' },
    { status: 'clarification_required', dispatch_eligible: false, reason_code: 'material_transition_tie' },
    selectedWorkflow({ dispatch_eligible: false }),
    selectedWorkflow({ selection: { transition_id: 'gsd.execute', workflow_id: 'gsd-execute-phase' } }),
  ];
  for (const workflow of invalid) {
    let accesses = 0;
    const result = selectCapabilities({
      workflow,
      workflowDeclarations: [workflowDeclaration()],
      getRegistry() { accesses += 1; throw new Error('registry must not be read'); },
    });
    assert.equal(result.dispatch_eligible, false);
    assert.equal(accesses, 0);
  }
});

test('declared ownership alone seeds roots and explicit capability only narrows compatibly', () => {
  const records = [
    capabilityRecord('router/executor', 'agent'),
    capabilityRecord('router/execute-command', 'command'),
    capabilityRecord('router/github-mcp', 'mcp'),
  ];
  const base = {
    workflow: selectedWorkflow(), workflowDeclarations: [workflowDeclaration()],
    getRegistry: () => ({ records }), prompt: 'please use github mcp tool',
  };
  const automatic = selectCapabilities(base);
  assert.deepEqual(automatic.roots, ['router/execute-command', 'router/executor']);
  assert.doesNotMatch(JSON.stringify(automatic), /github-mcp/);

  const narrowed = selectCapabilities({ ...base, explicitCapability: 'router/executor' });
  assert.deepEqual(narrowed.roots, ['router/executor']);
  assert.equal(narrowed.workflow_id, 'gsd-execute-phase');

  const incompatible = selectCapabilities({ ...base, explicitCapability: 'router/github-mcp' });
  assert.deepEqual(incompatible, {
    status: 'blocked', dispatch_eligible: false, reason_code: 'explicit_capability_incompatible',
    workflow_id: 'gsd-execute-phase', capability_id: 'router/github-mcp',
  });
});

test('compatible non-owner capability narrows while retaining declared requirements', () => {
  const records = [
    capabilityRecord('router/executor', 'agent'),
    capabilityRecord('router/required-policy', 'permission'),
    capabilityRecord('router/compatible-tool', 'tool', ['router/tool-dependency']),
    capabilityRecord('router/tool-dependency', 'mcp'),
    capabilityRecord('router/incompatible-tool', 'tool'),
  ];
  const declaration = workflowDeclaration({
    owners: ['router/executor'],
    requirements: ['router/required-policy'],
    compatible: ['router/executor', 'router/compatible-tool'],
  });
  const run = (workflowDeclarations, registryRecords) => selectCapabilities({
    workflow: selectedWorkflow(), workflowDeclarations,
    registry: { records: registryRecords }, explicitCapability: 'router/compatible-tool',
  });

  const narrowed = run([declaration], records);
  assert.equal(narrowed.status, 'resolved');
  assert.deepEqual(narrowed.roots, ['router/compatible-tool', 'router/required-policy']);
  assert.deepEqual(
    narrowed.closure.map(value => value.canonical_id),
    ['router/tool-dependency', 'router/compatible-tool', 'router/required-policy'],
  );
  assert.equal(
    JSON.stringify(narrowed),
    JSON.stringify(run([declaration], [...records].reverse())),
  );

  const incompatible = selectCapabilities({
    workflow: selectedWorkflow(), workflowDeclarations: [declaration],
    registry: { records }, explicitCapability: 'router/incompatible-tool',
  });
  assert.equal(incompatible.reason_code, 'explicit_capability_incompatible');
  assert.equal(incompatible.dispatch_eligible, false);
});

test('capability ownership selection is byte-stable across declaration and registry permutations', () => {
  const declarations = [
    workflowDeclaration(),
    workflowDeclaration({ workflow_id: 'gsd-plan-phase', owners: ['router/planner'], compatible: ['router/planner'] }),
  ];
  const records = [capabilityRecord('router/executor', 'agent'), capabilityRecord('router/execute-command', 'command')];
  const run = (workflowDeclarations, registryRecords) => selectCapabilities({
    workflow: selectedWorkflow(), workflowDeclarations,
    getRegistry: () => ({ records: registryRecords }),
  });
  assert.equal(JSON.stringify(run(declarations, records)), JSON.stringify(run([...declarations].reverse(), [...records].reverse())));
});

test('dependency closure traverses every kind and separates invocations, models, permissions, and hooks', () => {
  const records = [
    capabilityRecord('router/skill', 'skill', ['router/command', 'router/hook']),
    capabilityRecord('router/command', 'command', ['router/agent']),
    capabilityRecord('router/agent', 'agent', ['router/mcp']),
    capabilityRecord('router/mcp', 'mcp', ['router/tool']),
    capabilityRecord('router/tool', 'tool', ['router/model', 'router/permission']),
    capabilityRecord('router/model', 'model'),
    capabilityRecord('router/permission', 'permission'),
    capabilityRecord('router/hook', 'hook', [], { dispatchable: false, event: 'PreToolUse' }),
  ];
  const result = resolveDependencies({ roots: ['router/skill'], registry: { records } });
  assert.equal(result.status, 'resolved');
  assert.equal(result.dispatch_eligible, true);
  assert.deepEqual(result.invokable_capabilities.map(value => value.canonical_id), [
    'router/skill', 'router/command', 'router/agent', 'router/mcp', 'router/tool',
  ]);
  assert.deepEqual(result.required_models, ['router/model']);
  assert.deepEqual(result.required_permissions, ['router/permission']);
  assert.deepEqual(result.lifecycle_bindings, [{ canonical_id: 'router/hook', event: 'PreToolUse' }]);
  assert.equal(result.invokable_capabilities.some(value => value.kind === 'hook'), false);
  assert.doesNotMatch(JSON.stringify(result), /source content|raw_prompt/);
});

test('dependency safety matrix blocks with canonical first reason and no dispatchable closure', () => {
  const rows = [
    ['dependency_missing', []],
    ['dependency_unavailable', [capabilityRecord('router/missing', 'tool', [], { available: false })]],
    ['dependency_not_ready', [capabilityRecord('router/missing', 'tool', [], { lifecycle: 'partial' })]],
    ['dependency_not_dispatchable', [capabilityRecord('router/missing', 'tool', [], { dispatchable: false })]],
    ['dependency_out_of_scope', [capabilityRecord('router/missing', 'tool', [], { scope: { kind: 'project', repository: 'repo:other', worktree: 'main' } })]],
    ['dependency_permission_incomplete', [capabilityRecord('router/missing', 'tool', [], { permissions: { required: ['network'], grants: [], denied: [] } })]],
    ['dependency_conflict', [capabilityRecord('router/missing', 'tool', [], { conflicts: [{ severity: 'dispatch-blocking' }] })]],
  ];
  for (const [reason, tail] of rows) {
    const root = capabilityRecord('router/root', 'skill', ['router/missing']);
    const result = resolveDependencies({
      roots: ['router/root'], registry: { records: [root, ...tail].reverse() },
      requestedScope: { kind: 'project', repository: 'repo:router', worktree: 'main' },
    });
    assert.equal(result.reason_code, reason, reason);
    assert.equal(result.dispatch_eligible, false);
    assert.deepEqual(result.closure, []);
  }
});

test('cycles block deterministically and equivalent graph permutations are byte-identical', () => {
  const cycle = [
    capabilityRecord('router/a', 'skill', ['router/b']),
    capabilityRecord('router/b', 'command', ['router/a']),
  ];
  const first = resolveDependencies({ roots: ['router/a'], registry: { records: cycle } });
  const second = resolveDependencies({ roots: ['router/a'], registry: { records: [...cycle].reverse() } });
  assert.equal(first.reason_code, 'dependency_cycle');
  assert.equal(JSON.stringify(first), JSON.stringify(second));

  const safe = [
    capabilityRecord('router/root', 'skill', ['router/z-tool', 'router/a-command']),
    capabilityRecord('router/z-tool', 'tool'), capabilityRecord('router/a-command', 'command'),
  ];
  assert.equal(
    JSON.stringify(resolveDependencies({ roots: ['router/root'], registry: { records: safe } })),
    JSON.stringify(resolveDependencies({ roots: ['router/root'], registry: { records: [...safe].reverse() } })),
  );
});

test('capability selection integrates safe closure and blocks unsafe dependency graphs', () => {
  const records = [
    capabilityRecord('router/executor', 'agent', ['router/model']),
    capabilityRecord('router/execute-command', 'command'), capabilityRecord('router/model', 'model'),
  ];
  const selected = selectCapabilities({
    workflow: selectedWorkflow(), workflowDeclarations: [workflowDeclaration()], registry: { records },
  });
  assert.equal(selected.status, 'resolved');
  assert.deepEqual(selected.required_models, ['router/model']);

  const blocked = selectCapabilities({
    workflow: selectedWorkflow(), workflowDeclarations: [workflowDeclaration()],
    registry: { records: records.filter(value => value.id !== 'router/model') },
  });
  assert.equal(blocked.reason_code, 'dependency_missing');
  assert.equal(blocked.workflow_id, 'gsd-execute-phase');
});
