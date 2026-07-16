import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const MODULE = '../src/orchestrator/budget.mjs';

function workflow() {
  return {
    status: 'selected', dispatch_eligible: true,
    selection: { transition_id: 'gsd.execute', workflow_id: 'gsd-execute-phase', family: 'gsd', from: 'planned', to: 'execute' },
  };
}

function closure() {
  return {
    status: 'resolved', dispatch_eligible: true, workflow_id: 'gsd-execute-phase', transition_id: 'gsd.execute',
    closure: [{ kind: 'skill', canonical_id: 'skill:gsd-execute-phase', provenance: [] }],
    invokable_capabilities: [{ kind: 'skill', canonical_id: 'skill:gsd-execute-phase', provenance: [] }],
    required_models: [], required_permissions: [], lifecycle_bindings: [{ canonical_id: 'hook:route', event: 'UserPromptSubmit' }],
  };
}

function contract(overrides = {}) {
  return {
    workflow_id: 'gsd-execute-phase', total_max_bytes: 12288,
    sources: [
      { class: 'transition_facts', required: true, max_bytes: 2048, priority: 10 },
      { class: 'dependency_facts', required: true, max_bytes: 2048, priority: 20 },
      { class: 'artifact_summary', required: true, max_bytes: 6144, priority: 30 },
      { class: 'diagnostic', required: false, max_bytes: 2048, priority: 40 },
    ],
    ...overrides,
  };
}

function descriptor(sourceClass, canonicalId, value, extra = {}) {
  return { class: sourceClass, canonical_id: canonicalId, value, ...extra };
}

async function api() { return import(MODULE); }

test('default contract freezes exact Phase 16 ceilings and validates stricter contracts', async () => {
  const { DEFAULT_CONTEXT_CONTRACT, validateContextContract } = await api();
  assert.deepEqual(DEFAULT_CONTEXT_CONTRACT, contract());
  assert.deepEqual(validateContextContract(contract()), { valid: true, reason_code: 'context_contract_valid' });
  assert.equal(validateContextContract(contract({ total_max_bytes: 12289 })).reason_code, 'total_budget_exceeds_phase_maximum');
  const tooLarge = contract(); tooLarge.sources[0].max_bytes = 2049;
  assert.equal(validateContextContract(tooLarge).reason_code, 'source_budget_exceeds_phase_maximum');
  assert.equal(validateContextContract({ ...contract(), sources: [...contract().sources, { class: 'mystery', required: false, max_bytes: 1, priority: 50 }] }).reason_code, 'source_class_forbidden');
});

test('workflow and closure gates block before descriptors are inspected', async () => {
  const { planContextLoad } = await api();
  const poison = new Proxy([], { get() { throw new Error('descriptors touched'); } });
  assert.equal(planContextLoad({ workflow: null, closure: closure(), contract: contract(), sources: poison }).reason_code, 'workflow_not_dispatch_eligible');
  assert.equal(planContextLoad({ workflow: workflow(), closure: { status: 'blocked', dispatch_eligible: false }, contract: contract(), sources: poison }).reason_code, 'dependency_closure_not_dispatch_eligible');
});

test('forbidden broad source classes never enter a default plan', async () => {
  const { planContextLoad } = await api();
  for (const broad of ['full_manifest', 'planning_tree', 'planning_directory', 'conversation_history', 'complete_design_body']) {
    const result = planContextLoad({ workflow: workflow(), closure: closure(), contract: contract(), sources: [descriptor(broad, `bad:${broad}`, 'PRIVATE-CANARY')] });
    assert.equal(result.reason_code, 'source_class_forbidden');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE-CANARY/);
  }
});

test('every required class must have a valid descriptor before dispatch', async () => {
  const { planContextLoad } = await api();
  const required = [
    descriptor('transition_facts', 'transition:a', { transition: 'a' }),
    descriptor('dependency_facts', 'dependency:a', { dependency: 'a' }),
    descriptor('artifact_summary', 'artifact:a', { artifact: 'a' }),
  ];
  for (let missing = 0; missing < required.length; missing += 1) {
    const result = planContextLoad({
      workflow: workflow(), closure: closure(), contract: contract(),
      sources: required.filter((_, index) => index !== missing),
    });
    assert.deepEqual(result, {
      status: 'blocked', dispatch_eligible: false, reason_code: 'required_source_class_missing',
      blocker: { class: required[missing].class },
    });
  }
  assert.deepEqual(
    planContextLoad({ workflow: workflow(), closure: closure(), contract: contract(), sources: [] }),
    {
      status: 'blocked', dispatch_eligible: false, reason_code: 'required_source_class_missing',
      blocker: { class: 'transition_facts' },
    },
  );
});

test('required per-source overflow blocks by one byte and optional overflow is omitted', async () => {
  const { planContextLoad } = await api();
  const requiredContract = contract({ total_max_bytes: 100, sources: [{ class: 'transition_facts', required: true, max_bytes: 4, priority: 10 }] });
  const blocked = planContextLoad({ workflow: workflow(), closure: closure(), contract: requiredContract, sources: [descriptor('transition_facts', 'transition:a', '12345', { canonical_bytes: 5 })] });
  assert.equal(blocked.reason_code, 'required_source_budget_exceeded');
  assert.deepEqual(blocked.blocker, { canonical_id: 'transition:a', class: 'transition_facts', actual_bytes: 5, max_bytes: 4 });

  const optionalContract = contract({ total_max_bytes: 100, sources: [{ class: 'diagnostic', required: false, max_bytes: 4, priority: 40 }] });
  const omitted = planContextLoad({ workflow: workflow(), closure: closure(), contract: optionalContract, sources: [descriptor('diagnostic', 'diagnostic:a', '12345', { canonical_bytes: 5 })] });
  assert.equal(omitted.status, 'planned');
  assert.deepEqual(omitted.report.omitted_sources, [{ canonical_id: 'diagnostic:a', class: 'diagnostic', reason_code: 'optional_source_budget_exceeded', canonical_bytes: 5, estimated_tokens: 2, reuse_status: 'not_applicable' }]);
});

test('stable semantic priority and canonical identity make permutations byte-stable', async () => {
  const { planContextLoad } = await api();
  const sources = [
    descriptor('diagnostic', 'diagnostic:z', { z: 1 }),
    descriptor('artifact_summary', 'artifact:b', { b: 1 }),
    descriptor('transition_facts', 'transition:a', { a: 1 }),
    descriptor('dependency_facts', 'dependency:a', { d: 1 }),
    descriptor('artifact_summary', 'artifact:a', { a: 1 }),
  ];
  const left = planContextLoad({ workflow: workflow(), closure: closure(), contract: contract(), sources });
  const right = planContextLoad({ workflow: workflow(), closure: closure(), contract: contract(), sources: [...sources].reverse() });
  assert.deepEqual(left, right);
  assert.deepEqual(left.report.included_sources.map(x => x.canonical_id), ['transition:a', 'dependency:a', 'artifact:a', 'artifact:b', 'diagnostic:z']);
});

test('semantic class order is policy-owned despite caller priority inversion', async () => {
  const { planContextLoad } = await api();
  const inverted = contract({ sources: [
    { class: 'transition_facts', required: true, max_bytes: 2048, priority: 40 },
    { class: 'dependency_facts', required: true, max_bytes: 2048, priority: 30 },
    { class: 'artifact_summary', required: true, max_bytes: 6144, priority: 20 },
    { class: 'diagnostic', required: false, max_bytes: 2048, priority: 10 },
  ] });
  const sources = [
    descriptor('diagnostic', 'diagnostic:a', { diagnostic: 'a' }),
    descriptor('artifact_summary', 'artifact:a', { artifact: 'a' }),
    descriptor('dependency_facts', 'dependency:a', { dependency: 'a' }),
    descriptor('transition_facts', 'transition:a', { transition: 'a' }),
  ];
  const result = planContextLoad({ workflow: workflow(), closure: closure(), contract: inverted, sources });
  assert.deepEqual(result.report.included_sources.map(value => value.class), [
    'transition_facts', 'dependency_facts', 'artifact_summary', 'diagnostic',
  ]);
  assert.equal(
    JSON.stringify(result),
    JSON.stringify(planContextLoad({ workflow: workflow(), closure: closure(), contract: inverted, sources: [...sources].reverse() })),
  );
});

test('utf8-bytes-v1-ceil-div-3 accounts for ASCII, multibyte, and exact boundaries', async () => {
  const { ESTIMATOR_VERSION, estimateRoutingTokens } = await api();
  assert.equal(ESTIMATOR_VERSION, 'utf8-bytes-v1-ceil-div-3');
  assert.deepEqual(estimateRoutingTokens('abc'), { estimator_version: ESTIMATOR_VERSION, canonical_bytes: 3, estimated_tokens: 1 });
  assert.deepEqual(estimateRoutingTokens('abcd'), { estimator_version: ESTIMATOR_VERSION, canonical_bytes: 4, estimated_tokens: 2 });
  assert.deepEqual(estimateRoutingTokens('€'), { estimator_version: ESTIMATOR_VERSION, canonical_bytes: 3, estimated_tokens: 1 });
});

test('summary reuse requires exact identity, witness, and contract version', async () => {
  const { planContextLoad } = await api();
  const base = descriptor('artifact_summary', 'artifact:plan', { fallback: 'bounded-reference' }, {
    identity: { phase: '16', plan: '03', ref: '16-03-PLAN.md' },
    witness: { kind: 'sha256', value: 'a'.repeat(64) }, summary_contract_version: 'artifact-summary-v1',
  });
  const exact = { canonical_id: 'artifact:plan', identity: base.identity, witness: base.witness, summary_contract_version: 'artifact-summary-v1', summary: { title: 'safe summary' } };
  const required = [descriptor('transition_facts', 'transition:a', {}), descriptor('dependency_facts', 'dependency:a', {})];
  const hit = planContextLoad({ workflow: workflow(), closure: closure(), contract: contract(), sources: [...required, base], summaryIndex: [exact] });
  assert.equal(hit.report.included_sources[2].reuse_status, 'hit');
  for (const [field, mutate, reason] of [
    ['identity', x => ({ ...x, plan: '02' }), 'summary_identity_mismatch'],
    ['witness', () => ({ kind: 'version', value: 'old' }), 'summary_witness_mismatch'],
    ['summary_contract_version', () => 'artifact-summary-v0', 'summary_contract_version_mismatch'],
  ]) {
    const candidate = { ...exact, [field]: mutate(exact[field]) };
    const miss = planContextLoad({ workflow: workflow(), closure: closure(), contract: contract(), sources: [...required, base], summaryIndex: [candidate] });
    assert.equal(miss.report.included_sources[2].reuse_status, 'miss');
    assert.equal(miss.report.included_sources[2].reuse_reason_code, reason);
    assert.doesNotMatch(JSON.stringify(miss), /safe summary/);
  }
});

test('reports expose exact totals, ceilings, and signed baseline deltas', async () => {
  const { planContextLoad } = await api();
  const result = planContextLoad({
    workflow: workflow(), closure: closure(), contract: contract({ total_max_bytes: 100, sources: [{ class: 'transition_facts', required: true, max_bytes: 100, priority: 10 }] }),
    sources: [descriptor('transition_facts', 'transition:a', 'abc', { canonical_bytes: 3 })],
    baseline: { canonical_bytes: 5, estimated_tokens: 4 },
  });
  assert.equal(result.report.canonical_bytes, 3);
  assert.equal(result.report.estimated_tokens, 1);
  assert.deepEqual(result.report.regression_delta, { canonical_bytes: -2, estimated_tokens: -3 });
  assert.equal(result.report.total_max_bytes, 100);
  assert.equal(result.report.estimator_version, 'utf8-bytes-v1-ceil-div-3');
});

test('total token accounting estimates the canonical aggregate rather than summing rounded sources', async () => {
  const { planContextLoad } = await api();
  const result = planContextLoad({
    workflow: workflow(), closure: closure(), contract: contract({ total_max_bytes: 100, sources: [
      { class: 'transition_facts', required: true, max_bytes: 50, priority: 10 },
      { class: 'dependency_facts', required: true, max_bytes: 50, priority: 20 },
    ] }),
    sources: [
      descriptor('transition_facts', 'transition:a', 'a', { canonical_bytes: 1 }),
      descriptor('dependency_facts', 'dependency:a', 'b', { canonical_bytes: 1 }),
    ],
  });
  assert.equal(result.report.canonical_bytes, 2);
  assert.equal(result.report.estimated_tokens, 1);
  assert.equal(result.report.regression_delta, null);
});

test('pre-accounted descriptors do not expose or inspect bounded source bodies', async () => {
  const { planContextLoad } = await api();
  const source = descriptor('diagnostic', 'diagnostic:safe', undefined, { canonical_bytes: 3 });
  Object.defineProperty(source, 'value', { enumerable: true, get() { throw new Error('body inspected'); } });
  const result = planContextLoad({
    workflow: workflow(), closure: closure(), contract: contract(),
    sources: [descriptor('transition_facts', 'transition:a', {}), descriptor('dependency_facts', 'dependency:a', {}), descriptor('artifact_summary', 'artifact:a', {}), source],
  });
  assert.equal(result.status, 'planned');
  assert.doesNotMatch(JSON.stringify(result), /body inspected/);
});

test('module remains pure and excludes I/O, tokenizer, hook, telemetry, and compilation imports', () => {
  const source = readFileSync(new URL(MODULE, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:fs|node:https|node:http|child_process|tokenizer|installHook|telemetry|compileRegistry|warmLatency/);
});
