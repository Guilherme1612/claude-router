import assert from 'node:assert/strict';
import test from 'node:test';

import { parseSemanticIntent } from '../src/intent/semantic.mjs';
import { TASK_FAMILY_CORPUS, TASK_FAMILY_CORPUS_VERSION } from '../src/intent/task-family-corpus.mjs';

const FAMILY_CASES = [
  ['quality-audit', 'audit the whole repository for quality issues and report the findings'],
  ['feature-build', 'build the missing feature in this project and run its tests'],
  ['bug-diagnosis-fix', 'diagnose and fix the failing bug in the application'],
  ['refactor-optimization', 'refactor the slow module and optimize its performance'],
  ['design-review', 'review the interface design and give a usability report'],
  ['browser-interaction-verification', 'verify the user flow by interacting with it in a browser'],
];

test('the local family corpus is versioned, complete, and framework-neutral', () => {
  assert.equal(TASK_FAMILY_CORPUS_VERSION, 'task-family-corpus-v1');
  assert.deepEqual(TASK_FAMILY_CORPUS.map(family => family.id), FAMILY_CASES.map(([family]) => family).sort());
  for (const family of TASK_FAMILY_CORPUS) {
    assert.ok(family.positive_examples.length >= 2, family.id);
    assert.ok(family.safety_negatives.length >= 2, family.id);
    assert.doesNotMatch(JSON.stringify(family), /Claude|Codex|GSD|skill|agent|command/i);
    assert.ok(Object.isFrozen(family), family.id);
  }
});

test('plain language recognizes the six generic task families with bounded fields', () => {
  for (const [family, prompt] of FAMILY_CASES) {
    const result = parseSemanticIntent(prompt);
    assert.equal(result.task_family, family, prompt);
    assert.equal(typeof result.outcome, 'string', prompt);
    assert.equal(typeof result.scope, 'string', prompt);
    assert.ok(Array.isArray(result.constraints), prompt);
    assert.ok(['inspect', 'one-turn', 'persistent', 'none'].includes(result.requested_autonomy), prompt);
    assert.ok(Array.isArray(result.evidence_needs), prompt);
    assert.ok(result.workflow_hints.includes(family), prompt);
    assert.ok(result.token_count <= 96, prompt);
    assert.ok(!Object.hasOwn(result, 'prompt'), prompt);
    assert.ok(!Object.hasOwn(result, 'normalized_text'), prompt);
  }
});

test('broad multi-goal language produces a bounded coordinator candidate', () => {
  const result = parseSemanticIntent(
    'audit the repository, fix the bugs, refactor the slow code, build the feature, review the design, and verify it in a browser',
  );
  assert.equal(result.task_family, 'coordinator-workflow');
  assert.equal(result.workflow_kind, 'coordinator');
  assert.equal(result.clarification.needed, false);
  assert.equal(result.scope, 'repository');
  assert.deepEqual(result.task_family_candidates, [
    'browser-interaction-verification',
    'bug-diagnosis-fix',
    'design-review',
    'feature-build',
    'quality-audit',
    'refactor-optimization',
  ]);
});

test('missing factual scope and owner-controlled authority ask without selecting', () => {
  const missingScope = parseSemanticIntent('fix the issue');
  assert.equal(missingScope.clarification.needed, true);
  assert.ok(missingScope.clarification.reason_codes.includes('missing_factual_scope'));
  assert.equal(missingScope.dispatch_eligible, false);

  const ownerGate = parseSemanticIntent('deploy this repository to production');
  assert.equal(ownerGate.clarification.needed, true);
  assert.ok(ownerGate.clarification.reason_codes.includes('owner_authority_required'));
  assert.equal(ownerGate.dispatch_eligible, false);
});

test('family recognition stays non-authorizing for safety negatives', () => {
  for (const prompt of [
    'do not audit the repository',
    'what if we build the feature?',
    'explain how to verify the flow in a browser',
    '"refactor the module"',
    'preview fixing the bug',
  ]) {
    const result = parseSemanticIntent(prompt);
    assert.equal(result.dispatch_eligible, false, prompt);
    assert.equal(result.execution_signal, 'none', prompt);
  }
});

test('empty and unknown requests remain bounded and explainable', () => {
  for (const prompt of ['', 'please do the thing with the unnamed capability']) {
    const result = parseSemanticIntent(prompt);
    assert.equal(result.task_family, 'unknown');
    assert.equal(result.workflow_kind, 'unknown');
    assert.equal(result.clarification.needed, true);
    assert.equal(result.dispatch_eligible, false);
  }
});
