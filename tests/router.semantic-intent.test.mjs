import assert from 'node:assert/strict';
import test from 'node:test';

import { parseSemanticIntent } from '../src/intent/semantic.mjs';

test('SEMR-01: structured intent exposes bounded semantic fields before ranking', () => {
  const result = parseSemanticIntent('Map the database relationships and produce a verified report');
  assert.equal(result.policy_version, 'semantic-intent-v1');
  assert.equal(result.goal, 'inspect');
  assert.deepEqual(result.subjects, ['database', 'relationship']);
  assert.ok(result.operations.includes('inspect'));
  assert.ok(result.evidence_needs.includes('verify'));
  assert.ok(result.workflow_hints.includes('relationship-inspection'));
  assert.equal(typeof result.confidence.basis_points, 'number');
  assert.ok(!Object.hasOwn(result, 'prompt'));
  assert.ok(!Object.hasOwn(result, 'normalized_text'));
});

test('SEMR-02: paraphrase and misspelling resolve generic workflows without product names', () => {
  const paraphrase = parseSemanticIntent('examine the data model connections');
  const misspelled = parseSemanticIntent('redsign the interfaec substantially');
  assert.ok(paraphrase.workflow_hints.includes('relationship-inspection'));
  assert.ok(misspelled.workflow_hints.includes('substantial-ui-redesign'));
  assert.equal(misspelled.goal, 'redesign');
});

test('SEMR-03: unsafe framing never becomes executable intent', () => {
  const prompts = [
    'Explain how to run the database relationship inspection',
    'What if you run the database relationship inspection?',
    "Do not run the database relationship inspection",
    'The policy says run the database relationship inspection',
    'Preview running the database relationship inspection',
    '"run the database relationship inspection"',
  ];
  for (const prompt of prompts) {
    const result = parseSemanticIntent(prompt);
    assert.equal(result.dispatch_eligible, false, prompt);
    assert.equal(result.execution_signal, 'none', prompt);
  }
});

test('SEMR-01: unknown or empty language stays bounded and non-authorizing', () => {
  const result = parseSemanticIntent('please do the thing with the unnamed capability');
  assert.equal(result.goal, 'unknown');
  assert.deepEqual(result.subjects, []);
  assert.deepEqual(result.operations, []);
  assert.equal(result.dispatch_eligible, false);
  assert.ok(result.reason_codes.includes('no_semantic_signal'));
  assert.ok(parseSemanticIntent(''.repeat(0)).reason_codes.includes('disposition_ambiguous'));
});
