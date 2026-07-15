import test from 'node:test';
import assert from 'node:assert/strict';
import { stableStringify } from '../src/registry/schema.mjs';

export function hookFile(overrides = {}) {
  return { runtime: 'claude', event: 'UserPromptSubmit', logical_root: 'claude_global', relative_path: 'hooks/router.mjs', native_identity: 'hook:router', ...overrides };
}

export function hookBinding(overrides = {}) {
  return { runtime: 'claude', event: 'UserPromptSubmit', command: 'hooks/router.mjs', args: [], native_identity: 'binding:router', ...overrides };
}

export function permuteHookInventory(files, bindings) {
  return [
    { files, bindings },
    { files: [...files].reverse(), bindings: [...bindings].reverse() },
  ];
}

test('portable hook fixture builders are deterministic under input permutation', () => {
  const files = [hookFile(), hookFile({ event: 'Stop', native_identity: 'hook:stop' })];
  const bindings = [hookBinding(), hookBinding({ event: 'Stop', native_identity: 'binding:stop' })];
  const normalized = permuteHookInventory(files, bindings).map(value => stableStringify({
    files: [...value.files].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
    bindings: [...value.bindings].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
  }));
  assert.equal(new Set(normalized).size, 1);
  assert.doesNotMatch(normalized[0], /\/Users\/|[A-Za-z]:\\\\/);
});
