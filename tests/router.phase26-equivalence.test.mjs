import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFullRegistry, buildIncrementalRegistry } from '../src/registry/build.mjs';
import { stableStringify } from '../src/registry/schema.mjs';

test('full and incremental builders expose byte-identical complete tuples', () => {
  const acquisition = {
    claude: { observations: [], diagnostics: [] },
    codex: { observations: [], diagnostics: [] },
  };
  const full = buildFullRegistry({
    discoverClaude: () => acquisition.claude,
    discoverCodex: () => acquisition.codex,
  });
  const incremental = buildIncrementalRegistry(acquisition, { events: [], diagnostics: [] });
  assert.ok(full.complete_tuple && incremental.complete_tuple, 'PHASE26_EQUIVALENCE_INCOMPLETE');
  assert.equal(stableStringify(full.complete_tuple), stableStringify(incremental.complete_tuple),
    'PHASE26_EQUIVALENCE_INCOMPLETE');
});
