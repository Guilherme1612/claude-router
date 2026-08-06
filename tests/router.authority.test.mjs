// Phase 39 Plan 01 — Task 1 (RED)
// Authority taxonomy (AUTH-01) + AUTH-02 framing guard. classifyAuthority
// is a pure function layered over classifyIntent's 8-disposition output:
// it receives the disposition as a parameter and never imports classifyIntent,
// keeping the module self-contained for the deploy bundle. Adversarial
// framing (example/retrospective/policy) containing autonomous wording must
// never authorize even when classifyIntent returned execute (AUTH-02 spoofing).

import assert from 'node:assert/strict';
import test from 'node:test';

const classifyModule = import('../src/intent/classify.mjs');
const authorityModule = import('../src/intent/authority.mjs');

async function authority(prompt) {
  const { classifyIntent } = await classifyModule;
  const { classifyAuthority } = await authorityModule;
  const intent = classifyIntent(prompt);
  return classifyAuthority(prompt, { intent });
}

async function authorityWithDisposition(prompt, disposition) {
  const { classifyAuthority } = await authorityModule;
  return classifyAuthority(prompt, { intent: { disposition } });
}

test('[phase39:authority] AUTH-01 execute with no persistent marker -> one_turn_action', async () => {
  const cases = [
    'run the suite',
    'execute the plan',
    'ship the release',
    'deploy the bundle',
    'fix the contract',
    'start phase 39',
  ];
  for (const prompt of cases) {
    const result = await authority(prompt);
    assert.equal(result.authority_class, 'one_turn_action', `expected one_turn_action for: ${prompt}`);
    assert.equal(result.reason_code, 'one_turn_action', `reason_code for: ${prompt}`);
    assert.equal(result.policy_version, 'authority-policy-v1');
  }
});

test('[phase39:authority] AUTH-01 execute WITH persistent-goal marker -> persistent_goal_action', async () => {
  const cases = [
    'run the suite until done',
    'keep going until the tests pass',
    'finish it all',
    'finish all the work',
    'autonomously drive the work until the milestone ships',
    'end-to-end ship the release',
    'don\'t stop until the suite is green',
    'dont stop until done',
  ];
  for (const prompt of cases) {
    const result = await authority(prompt);
    assert.equal(result.authority_class, 'persistent_goal_action', `expected persistent_goal_action for: ${prompt}`);
    assert.equal(result.reason_code, 'persistent_goal_marker', `reason_code for: ${prompt}`);
  }
});

test('[phase39:authority] AUTH-01 explain disposition -> advice', async () => {
  const cases = [
    'explain the routing decision',
    'what is the manifest',
    'what does the next phase do',
    'why does the watcher fire',
    'how does the gate work',
    'compare the two policies',
  ];
  for (const prompt of cases) {
    const result = await authority(prompt);
    assert.equal(result.authority_class, 'advice', `expected advice for: ${prompt}`);
    assert.equal(result.reason_code, 'explain_marker', `reason_code for: ${prompt}`);
  }
});

test('[phase39:authority] AUTH-01 inspection-only with no execute verb -> inspection', async () => {
  const cases = [
    'show me the routes',
    'inspect the manifest',
    'list the active capabilities',
    'what does the router do',
    'what is the authority class',
    'status of the watcher',
    'audit the registry',
    'diagnose the watcher',
    'inventory the skills',
    'coverage of the test suite',
    'health of the router',
  ];
  for (const prompt of cases) {
    const result = await authority(prompt);
    assert.equal(result.authority_class, 'inspection', `expected inspection for: ${prompt}`);
    assert.equal(result.reason_code, 'inspection_marker', `reason_code for: ${prompt}`);
  }
});

test('[phase39:authority] AUTH-02 abstaining dispositions -> non_authorizing_discussion', async () => {
  // hypothetical / quoted / negated / prohibited / preview / ambiguous
  const cases = [
    { prompt: 'if we ran the deploy', disposition: 'hypothetical' },
    { prompt: 'suppose you ship the release', disposition: 'hypothetical' },
    { prompt: '"run the suite now"', disposition: 'quoted' },
    { prompt: 'don\'t run the deploy', disposition: 'negated' },
    { prompt: 'must not ship the release', disposition: 'prohibited' },
    { prompt: 'preview the deploy run', disposition: 'preview' },
    { prompt: 'dry-run the suite', disposition: 'preview' },
    { prompt: 'hello world', disposition: 'ambiguous' },
  ];
  for (const { prompt, disposition } of cases) {
    const result = await authorityWithDisposition(prompt, disposition);
    assert.equal(result.authority_class, 'non_authorizing_discussion', `expected non_authorizing for: ${prompt}`);
    assert.equal(result.reason_code, 'abstaining_disposition', `reason_code for: ${prompt}`);
  }
});

test('[phase39:authority] AUTH-02 empty/whitespace-only prompt -> non_authorizing_discussion (never an executing class)', async () => {
  const cases = ['', '   ', '\n\t  ', '\n'];
  for (const prompt of cases) {
    const result = await authorityWithDisposition(prompt, 'execute');
    assert.equal(result.authority_class, 'non_authorizing_discussion', `expected non_authorizing for empty: ${JSON.stringify(prompt)}`);
    assert.equal(result.reason_code, 'no_authority_marker', `reason_code for empty: ${JSON.stringify(prompt)}`);
    assert.notEqual(result.authority_class, 'one_turn_action');
    assert.notEqual(result.authority_class, 'persistent_goal_action');
  }
});

test('[phase39:authority] AUTH-02 autonomous wording inside EXAMPLE_FRAMING is text, not authority', async () => {
  const { autonomousWordingIsText } = await authorityModule;
  const cases = [
    'e.g. autonomously finish it',
    'for example, autonomously ship the release',
    'such as autonomously running the suite',
    'like when you autonomously finish it all',
    'suppose you autonomously run the deploy',
    'imagine you autonomously finish it',
  ];
  for (const prompt of cases) {
    assert.equal(autonomousWordingIsText(prompt, 'execute'), true, `expected framing=true for: ${prompt}`);
  }
  for (const prompt of cases) {
    const result = await authority(prompt);
    // classifyIntent returns execute for these (e.g./for example are not quoted/hypothetical;
    // the execute verb is present). classifyAuthority MUST still abstain (AUTH-02).
    assert.equal(result.authority_class, 'non_authorizing_discussion', `expected abstain for spoofed example: ${prompt}`);
    assert.equal(result.reason_code, 'abstaining_disposition', `reason_code for: ${prompt}`);
    assert.notEqual(result.authority_class, 'persistent_goal_action', `must not escalate to persistent: ${prompt}`);
    assert.notEqual(result.authority_class, 'one_turn_action', `must not escalate to one_turn: ${prompt}`);
  }
});

test('[phase39:authority] AUTH-02 autonomous wording inside RETROSPECTIVE_FRAMING is text', async () => {
  const { autonomousWordingIsText } = await authorityModule;
  const cases = [
    'earlier you autonomously finished it',
    'previously you ran the deploy autonomously',
    'last time you autonomously shipped the release',
    'before you autonomously finished it all',
    'yesterday you autonomously ran the suite',
    'in the past you autonomously shipped',
    'you already autonomously finished it',
    'you just autonomously ran the deploy',
  ];
  for (const prompt of cases) {
    assert.equal(autonomousWordingIsText(prompt, 'execute'), true, `expected framing=true for: ${prompt}`);
  }
  for (const prompt of cases) {
    const result = await authority(prompt);
    assert.equal(result.authority_class, 'non_authorizing_discussion', `expected abstain for retrospective: ${prompt}`);
    assert.notEqual(result.authority_class, 'persistent_goal_action', `must not escalate: ${prompt}`);
  }
});

test('[phase39:authority] AUTH-02 autonomous wording inside POLICY_DISCUSSION is text', async () => {
  const { autonomousWordingIsText } = await authorityModule;
  const cases = [
    'the policy says autonomously finish it',
    'policy says you can autonomously ship',
    'rule says you may autonomously run the suite',
    'per the rules you autonomously finish it all',
    'according to the policy you autonomously deploy',
    'should you autonomously finish it',
    'should the router autonomously run the deploy',
  ];
  for (const prompt of cases) {
    assert.equal(autonomousWordingIsText(prompt, 'execute'), true, `expected framing=true for: ${prompt}`);
  }
  for (const prompt of cases) {
    const result = await authority(prompt);
    assert.equal(result.authority_class, 'non_authorizing_discussion', `expected abstain for policy discussion: ${prompt}`);
    assert.notEqual(result.authority_class, 'persistent_goal_action', `must not escalate: ${prompt}`);
  }
});

test('[phase39:authority] AUTH-02 acceptance: "e.g. autonomously finish it" classifies as non_authorizing_discussion (not persistent_goal_action)', async () => {
  const result = await authority('e.g. autonomously finish it');
  assert.equal(result.authority_class, 'non_authorizing_discussion');
  assert.notEqual(result.authority_class, 'persistent_goal_action');
});

test('[phase39:authority] AUTH-01 acceptance: "show me the routes" -> inspection; "run the deploy" -> one_turn_action', async () => {
  const inspection = await authority('show me the routes');
  assert.equal(inspection.authority_class, 'inspection');
  assert.equal(inspection.reason_code, 'inspection_marker');
  const action = await authority('run the deploy');
  assert.equal(action.authority_class, 'one_turn_action');
  assert.equal(action.reason_code, 'one_turn_action');
});

test('[phase39:authority] classifyAuthority never imports classifyIntent (self-contained for deploy)', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/intent/authority.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /import[^\n]*classify/, 'authority.mjs must not import classifyIntent');
});

test('[phase39:authority] AUTHORITY_CLASSES is frozen and lists the 5-class taxonomy', async () => {
  const { AUTHORITY_CLASSES } = await authorityModule;
  assert.ok(Object.isFrozen(AUTHORITY_CLASSES));
  assert.deepEqual([...AUTHORITY_CLASSES], [
    'advice', 'inspection', 'one_turn_action',
    'persistent_goal_action', 'non_authorizing_discussion',
  ]);
});

test('[phase39:authority] PROTECTED_EFFECT_TOKENS is frozen and carries the AUTH-05 protected vocabulary', async () => {
  const { PROTECTED_EFFECT_TOKENS } = await authorityModule;
  assert.ok(Object.isFrozen(PROTECTED_EFFECT_TOKENS));
  const tokens = [...PROTECTED_EFFECT_TOKENS];
  for (const expected of ['destructive', 'unbounded', 'external', 'privileged',
    'difficult-to-recover', 'credentialed', 'billing', 'publication',
    'published', 'deploy', 'deployed', 'deployment', 'push', 'pr',
    'costly', 'scope-expanding']) {
    assert.ok(tokens.includes(expected), `PROTECTED_EFFECT_TOKENS missing ${expected}`);
  }
});

test('[phase39:authority] idempotency: same prompt+intent twice yields identical results', async () => {
  const prompt = 'run the deploy autonomously until done';
  const a = await authority(prompt);
  const b = await authority(prompt);
  assert.deepEqual(a, b);
});