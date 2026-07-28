import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLargeMixedProfile } from './helpers/inventory-fixture.mjs';

test('registry fixture is deterministic, normalized, and covers every installed kind', () => {
  const left = buildLargeMixedProfile();
  const right = buildLargeMixedProfile();
  assert.deepEqual(left, right);
  assert.ok(left.length >= 300);
  assert.equal(new Set(left.map(record => record.name)).size, left.length);
  assert.deepEqual(
    [...new Set(left.map(record => record.native_type.split(':').at(-1)))].sort(),
    ['agent', 'command', 'mcp', 'skill', 'tool', 'workflow'],
  );
});
