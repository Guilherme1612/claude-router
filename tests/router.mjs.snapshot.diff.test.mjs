// Production runtime ownership guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const RUNTIME = fileURLToPath(new URL('../src/runtime/router.mjs', import.meta.url));

test('production router bundle is the importable source of truth', async () => {
  const runtime = await import(new URL('../src/runtime/router.mjs', import.meta.url));
  assert.equal(typeof runtime.inspectDecision, 'function', RUNTIME);
});
