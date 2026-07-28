import assert from 'node:assert/strict';
import test from 'node:test';

// Phase 23 Plan 02 — adversarial intent corpus (INT-03/06).
// The corpus is the spec (INT-06): do NOT loosen it. If a case passes as
// execute, fix the classifier precedence/regex in src/intent/classify.mjs.

const classifyModule = import('../src/intent/classify.mjs');
const actionsModule = import('../src/orchestrator/actions.mjs');

async function classify(prompt) {
  const { classifyIntent } = await classifyModule;
  return classifyIntent(prompt);
}

// Minimal pairs: each pair differs by one token and must produce OPPOSITE
// dispatch_eligible (INT-06 minimal pairs). The positive member dispatches,
// the negative member never dispatches.
const MINIMAL_PAIRS = [
  ['go to the next phase', "don't go to the next phase"],
  ['run the tests', 'never run the tests'],
  ['debug this', "don't debug this"],
  ['ship it', "don't ship it"],
  // WR-01: missing contractions must classify as negated (not execute).
  ['run the tests', "won't run the tests"],
  ['ship the release', "can't ship the release"],
  ['deploy the bundle', "shouldn't deploy the bundle"],
  ['fix the branch', "couldn't fix the branch"],
  ['ship the commit', "wouldn't ship the commit"],
  ['verify the work', "isn't verified yet"], // negation anywhere in the prompt
  ['run the suite', "the suite doesn't pass"],
  ['ship the feature', "haven't shipped the feature"],
  ['review the pr', "hasn't reviewed the pr"],
  ['finish the task', "hadn't finished the task"],
  ['start the gate', "mustn't start the gate"],
  ['review the user list', "needn't review the user list"],
  // WR-01: Unicode curly apostrophe (U+2019, macOS/iOS autocorrect) must
  // classify as negated, not execute.
  ['go to the next phase', "don’t go to the next phase"],
  ['run the tests', "can’t run the tests"],
];

// Nested quotations / code blocks → quoted (never execute). INT-06.
const NESTED_QUOTE_CASES = [
  "he said 'run the deploy' yesterday",
  '"execute the plan", she wrote',
  '```rm -rf /```',
];

// Mixed negation: negation wins by precedence. INT-06.
const MIXED_NEGATION_CASES = [
  'run the tests but do not commit',
  'deploy the bundle but never ship it',
];

// Corrections: newest token wins (INT-04). Negation after an execute verb
// still classifies as negated.
const CORRECTION_CASES = [
  'actually, don\'t run the suite',
  'wait, never ship the release',
];

// Conditional language → hypothetical (never execute). INT-06.
const CONDITIONAL_CASES = [
  'if the build passes, deploy',
  'suppose we run the suite, then ship',
];

// Multilingual: Spanish + Portuguese execute-like verbs → ambiguous (abstain),
// NEVER execute. INT-06 multilingual.
const MULTILINGUAL_CASES = [
  'ejecuta la siguiente fase',        // Spanish imperative
  'execute a próxima fase',           // Portuguese (executar conjugated)
  'inicia la fase de verificación',   // Spanish "start the verification phase"
  'verifique o trabalho agora',       // Portuguese "verify the work now"
];

// Unsafe targets: prohibited or ambiguous, dispatch_eligible=false. INT-06.
const UNSAFE_TARGET_CASES = [
  'delete the manifest',
  'rm -rf the registry',
  'drop the database',
];

// All non-execute corpus members (every case above that must NOT dispatch).
const NON_EXECUTE_CASES = [
  ...MINIMAL_PAIRS.map(([, neg]) => neg),
  ...NESTED_QUOTE_CASES,
  ...MIXED_NEGATION_CASES,
  ...CORRECTION_CASES,
  ...CONDITIONAL_CASES,
  ...MULTILINGUAL_CASES,
  ...UNSAFE_TARGET_CASES,
];

test('[phase23-red:intent-adversarial] minimal pairs produce opposite dispatch_eligible', async () => {
  for (const [positive, negative] of MINIMAL_PAIRS) {
    const pos = await classify(positive);
    const neg = await classify(negative);
    assert.equal(
      pos.dispatch_eligible, true,
      `positive member must dispatch: "${positive}" got ${pos.disposition}/${pos.reason_code}`,
    );
    assert.equal(
      neg.dispatch_eligible, false,
      `negative member must not dispatch: "${negative}" got ${neg.disposition}/${neg.reason_code}`,
    );
    assert.notEqual(
      pos.dispatch_eligible, neg.dispatch_eligible,
      `pair "${positive}" vs "${negative}" did not produce opposite dispatch_eligible`,
    );
  }
});

test('[phase23-red:intent-adversarial] nested quotations and code blocks classify as quoted', async () => {
  for (const prompt of NESTED_QUOTE_CASES) {
    const result = await classify(prompt);
    assert.equal(
      result.disposition, 'quoted',
      `expected quoted for: "${prompt}" got ${result.disposition}/${result.reason_code}`,
    );
    assert.equal(result.dispatch_eligible, false);
  }
});

test('[phase23-red:intent-adversarial] mixed negation classifies as negated (negation wins)', async () => {
  for (const prompt of MIXED_NEGATION_CASES) {
    const result = await classify(prompt);
    assert.equal(
      result.disposition, 'negated',
      `expected negated for: "${prompt}" got ${result.disposition}/${result.reason_code}`,
    );
    assert.equal(result.dispatch_eligible, false);
  }
});

test('[phase23-red:intent-adversarial] corrections classify as negated (newest token wins)', async () => {
  for (const prompt of CORRECTION_CASES) {
    const result = await classify(prompt);
    assert.notEqual(result.disposition, 'execute', `correction must not execute: "${prompt}"`);
    assert.equal(result.dispatch_eligible, false, `correction must not dispatch: "${prompt}"`);
  }
});

test('[phase23-red:intent-adversarial] conditional language classifies as hypothetical', async () => {
  for (const prompt of CONDITIONAL_CASES) {
    const result = await classify(prompt);
    assert.equal(
      result.disposition, 'hypothetical',
      `expected hypothetical for: "${prompt}" got ${result.disposition}/${result.reason_code}`,
    );
    assert.equal(result.dispatch_eligible, false);
  }
});

test('[phase23-red:intent-adversarial] multilingual prompts abstain (ambiguous, never execute)', async () => {
  for (const prompt of MULTILINGUAL_CASES) {
    const result = await classify(prompt);
    assert.notEqual(
      result.disposition, 'execute',
      `multilingual prompt must NEVER classify as execute: "${prompt}"`,
    );
    assert.equal(
      result.dispatch_eligible, false,
      `multilingual prompt must not dispatch: "${prompt}"`,
    );
    assert.equal(
      result.disposition, 'ambiguous',
      `multilingual execute-like verb must abstain as ambiguous: "${prompt}" got ${result.disposition}`,
    );
  }
});

test('[phase23-red:intent-adversarial] unsafe targets never dispatch', async () => {
  for (const prompt of UNSAFE_TARGET_CASES) {
    const result = await classify(prompt);
    assert.notEqual(result.disposition, 'execute', `unsafe target must not execute: "${prompt}"`);
    assert.equal(result.dispatch_eligible, false, `unsafe target must not dispatch: "${prompt}"`);
  }
});

test('[phase23-red:intent-adversarial] no non-execute corpus member has dispatch_eligible=true', async () => {
  for (const prompt of NON_EXECUTE_CASES) {
    const result = await classify(prompt);
    assert.equal(
      result.dispatch_eligible, false,
      `non-execute corpus member dispatched: "${prompt}" got ${result.disposition}/${result.reason_code}`,
    );
  }
});

test('[phase23-red:intent-adversarial] negative invocation assertion — resolveAction never called for non-execute dispositions', async () => {
  const { resolveAction } = await actionsModule;
  let calls = 0;
  const spy = (input) => { calls += 1; return resolveAction(input); };

  // Simulate the dispatch boundary: classify first, only invoke resolveAction
  // when dispatch_eligible === true. The corpus is entirely non-execute, so
  // the spy MUST never be called (INT-06 negative invocation assertion).
  const dummyState = {
    status: 'active', freshness: 'fresh',
    position: { family: 'gsd', state: 'planned' },
    gates: { plan_approved: true }, dependencies_safe: true,
  };
  const dummyRegistry = { records: [], eligibility: {} };

  for (const prompt of NON_EXECUTE_CASES) {
    const intent = await classify(prompt);
    if (intent.dispatch_eligible === true) {
      // Should never happen for this corpus — the prior test already guards it.
      spy({ intent, state: dummyState, registry: dummyRegistry });
    }
  }
  assert.equal(calls, 0, 'resolveAction was invoked for a non-execute disposition');
});