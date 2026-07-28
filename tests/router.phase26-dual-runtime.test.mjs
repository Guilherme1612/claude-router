import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInstallGeneration } from '../src/lifecycle/router-lifecycle.mjs';

test('installed generation declares Claude and Codex recommendation-kind coverage', () => {
  let generation;
  try {
    generation = resolveInstallGeneration({}, { repair: false });
  } catch (error) {
    generation = { reason_code: error.code };
  }
  assert.deepEqual(generation.runtime_profiles, ['claude', 'codex', 'combined'],
    'PHASE26_DUAL_RUNTIME_INCOMPLETE');
});
