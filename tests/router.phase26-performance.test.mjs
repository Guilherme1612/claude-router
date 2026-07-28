import test from 'node:test';
import assert from 'node:assert/strict';
import { routeContextPrompt } from '../src/context/prompt-route.mjs';

test('installed route emits isolated large-registry release metrics', () => {
  const result = routeContextPrompt({ prompt: 'hello' });
  assert.ok(result.release_metrics?.sample_count >= 20,
    'PHASE26_PERFORMANCE_EVIDENCE_MISSING');
});
