import assert from 'node:assert/strict';
import test from 'node:test';

const classifyModule = import('../src/intent/classify.mjs');

async function classify(prompt) {
  const { classifyIntent } = await classifyModule;
  return classifyIntent(prompt);
}

test('[phase23-red:intent] execute verbs dispatch_eligible=true with explicit_execute_verb reason', async () => {
  const cases = [
    'go to the next phase',
    'run the suite',
    'execute the plan',
    'start phase 23',
    'create a new skill',
    'debug the watcher',
    'fix the contract',
    'ship the release',
    'deploy the bundle',
    'plan phase 24',
    'verify the work',
    'review the diff',
    'resume work',
  ];
  for (const prompt of cases) {
    const result = await classify(prompt);
    assert.equal(result.disposition, 'execute', `expected execute for: ${prompt}`);
    assert.equal(result.dispatch_eligible, true);
    assert.equal(result.reason_code, 'explicit_execute_verb');
    assert.equal(result.policy_version, 'intent-policy-v1');
  }
});

test('[phase23-red:intent] explain markers classify as explain and never dispatch', async () => {
  const cases = [
    'explain the routing decision',
    'what is the manifest',
    'what does the next phase do',
    'compare the two contracts',
    'difference between eligibility and approval',
    'why did the watcher pause',
    'how does the cache work',
  ];
  for (const prompt of cases) {
    const result = await classify(prompt);
    assert.equal(result.disposition, 'explain', `expected explain for: ${prompt}`);
    assert.equal(result.dispatch_eligible, false);
    assert.equal(result.policy_version, 'intent-policy-v1');
  }
});

test('[phase23-red:intent] hypothetical markers classify as hypothetical', async () => {
  const cases = [
    'if we were to deploy now',
    'suppose the manifest is stale',
    'imagine a fresh registry',
    'what if we skip the gate',
    'assuming the watcher is healthy',
  ];
  for (const prompt of cases) {
    const result = await classify(prompt);
    assert.equal(result.disposition, 'hypothetical');
    assert.equal(result.dispatch_eligible, false);
  }
});

test('[phase23-red:intent] backtick/quote-wrapped content classifies as quoted', async () => {
  const cases = [
    '`rm -rf /`',
    '"do not run this"',
  ];
  for (const prompt of cases) {
    const result = await classify(prompt);
    assert.equal(result.disposition, 'quoted');
    assert.equal(result.dispatch_eligible, false);
  }
});

test('[phase23-red:intent] negation markers classify as negated and never execute', async () => {
  const cases = [
    "don't run the deploy",
    'do not execute the plan',
    'never ship the release',
    'skip the verification',
  ];
  for (const prompt of cases) {
    const result = await classify(prompt);
    assert.equal(result.disposition, 'negated');
    assert.equal(result.dispatch_eligible, false);
  }
});

test('[phase23-red:intent] prohibition markers classify as prohibited with precedence over execute', async () => {
  const cases = [
    'must not run the destructive command',
    'forbidden to deploy',
    'not allowed to ship',
    'prohibited action',
  ];
  for (const prompt of cases) {
    const result = await classify(prompt);
    assert.equal(result.disposition, 'prohibited');
    assert.equal(result.dispatch_eligible, false);
  }
});

test('[phase23-red:intent] preview markers classify as preview', async () => {
  const cases = [
    'preview the deploy',
    'dry run the plan',
    'simulate the transition',
    'rehearse the release',
  ];
  for (const prompt of cases) {
    const result = await classify(prompt);
    assert.equal(result.disposition, 'preview');
    assert.equal(result.dispatch_eligible, false);
  }
});

test('[phase23-red:intent] empty or whitespace-only prompt abstains with empty_prompt reason', async () => {
  for (const prompt of ['', '   ', '\t\n  ']) {
    const result = await classify(prompt);
    assert.equal(result.disposition, 'ambiguous');
    assert.equal(result.dispatch_eligible, false);
    assert.equal(result.reason_code, 'empty_prompt');
  }
});

test('[phase23-red:intent] minimal pair: go to vs don\'t go to produce opposite dispatch_eligible', async () => {
  const executeCase = await classify('go to the next phase');
  assert.equal(executeCase.disposition, 'execute');
  assert.equal(executeCase.dispatch_eligible, true);

  const negatedCase = await classify("don't go to the next phase");
  assert.equal(negatedCase.disposition, 'negated');
  assert.equal(negatedCase.dispatch_eligible, false);
});

test('[phase23-red:intent] INTENT_DISPOSITIONS is the frozen 8-element set', async () => {
  const { INTENT_DISPOSITIONS } = await classifyModule;
  assert.equal(Object.isFrozen(INTENT_DISPOSITIONS), true);
  assert.deepEqual([...INTENT_DISPOSITIONS].sort(), [
    'ambiguous', 'execute', 'explain', 'hypothetical',
    'negated', 'preview', 'prohibited', 'quoted',
  ]);
});