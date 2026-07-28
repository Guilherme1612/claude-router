import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFullRegistry } from '../src/registry/build.mjs';

test('background build exposes every member of one complete release tuple', () => {
  const built = buildFullRegistry({
    discoverClaude: () => ({ observations: [], diagnostics: [] }),
    discoverCodex: () => ({ observations: [], diagnostics: [] }),
  });
  for (const member of ['registry', 'contracts', 'relationships', 'intent_policy', 'workflows', 'health_policy', 'suggestion_reference']) {
    assert.ok(Object.hasOwn(built, member), `PHASE26_MISSING_COMPLETE_TUPLE:${member}`);
  }
});
