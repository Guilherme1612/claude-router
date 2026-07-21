import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Phase 19 Plan 03 Task 1 (D-07): the deployed bundle manifest must include the three
// orchestrator .mjs modules and the workflow-declarations.json static source so the
// deployed controller can import them at publish time. Plan 04 extends the test-mode-seam
// D-09 assertions to cover deployed-bytes-equal-source-bytes for these four files; this
// test is the static-invariant RED gate (mirrors tests/router.test-mode-seam.test.mjs:103-110)
// that the four literals are present in the moduleNames array literal.

const source = readFileSync(new URL('../src/lifecycle/router-lifecycle.mjs', import.meta.url), 'utf8');

test('router-lifecycle.mjs moduleNames array includes orchestrator/select.mjs (D-07)', () => {
  assert.equal(source.includes(`'orchestrator/select.mjs'`), true);
});

test('router-lifecycle.mjs moduleNames array includes orchestrator/transitions.mjs (D-07)', () => {
  assert.equal(source.includes(`'orchestrator/transitions.mjs'`), true);
});

test('router-lifecycle.mjs moduleNames array includes orchestrator/budget.mjs (D-07)', () => {
  assert.equal(source.includes(`'orchestrator/budget.mjs'`), true);
});

test('router-lifecycle.mjs moduleNames array includes orchestrator/workflow-declarations.json (Decision 1)', () => {
  assert.equal(source.includes(`'orchestrator/workflow-declarations.json'`), true);
});

test('router-lifecycle.mjs does not remove existing moduleNames entries (context/prompt-route.mjs preserved)', () => {
  assert.equal(source.includes(`'context/prompt-route.mjs'`), true);
  assert.equal(source.includes(`'prompt/compile-index.mjs'`), true);
  assert.equal(source.includes(`'prompt/publish-index.mjs'`), true);
});