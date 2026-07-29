import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

const R = await import(join(homedir(), '.claude', 'hooks', 'router.mjs'));

const entry = (id, signal_patterns, collision_group) => ({
  id,
  mode: id,
  invoke_kind: 'slash',
  signal_patterns,
  recommended_skills: [],
  recommended_agents: [],
  ...(collision_group ? { collision_group } : {}),
});

const diagnostics = (modeMap) =>
  R.validateRouteTargets({ commands: [], skills: [], agents: [] }, modeMap)
    .filter(({ status }) => status !== 'ok' && status !== 'stale_target');

test('v2 strings and v3 contains patterns normalize to the same semantic value', () => {
  assert.equal(typeof R.normalizeSignalPattern, 'function', 'Phase 29 normalizer must be exported');
  assert.deepEqual(R.normalizeSignalPattern('  Redesign   The UI  ', 2), {
    kind: 'contains',
    value: 'redesign the ui',
  });
  assert.deepEqual(R.normalizeSignalPattern({ kind: 'contains', value: '  Redesign   The UI  ' }, 3), {
    kind: 'contains',
    value: 'redesign the ui',
  });
});

test('v3 accepts only non-empty contains strings or objects and v2 rejects objects', () => {
  const invalid = [
    null,
    [],
    { kind: 'prefix', value: 'dashboard' },
    { kind: 'contains', value: '   ' },
    { kind: 'contains' },
  ];
  for (const value of invalid) assert.equal(R.normalizeSignalPattern(value, 3), null);
  assert.equal(R.normalizeSignalPattern({ kind: 'contains', value: 'dashboard' }, 2), null);
});

test('pattern validation reports deterministic invalid values and the one-to-six cap', () => {
  const map = {
    schema_version: 3,
    entries: [
      entry('empty', []),
      entry('too-many', ['a', 'b', 'c', 'd', 'e', 'f', 'g']),
      entry('bad-kind', [{ kind: 'regex', value: 'dashboard' }]),
      entry('bad-value', [{ kind: 'contains', value: '' }]),
    ],
  };

  assert.deepEqual(diagnostics(map).map(({ id, status, target, reason }) => ({ id, status, target, reason })), [
    { id: 'empty', status: 'invalid_pattern_count', target: 'signal_patterns', reason: 'must contain 1 through 6 patterns' },
    { id: 'too-many', status: 'invalid_pattern_count', target: 'signal_patterns', reason: 'must contain 1 through 6 patterns' },
    { id: 'bad-kind', status: 'invalid_pattern', target: 'signal_patterns[0]', reason: 'pattern must normalize to a non-empty contains value' },
    { id: 'bad-value', status: 'invalid_pattern', target: 'signal_patterns[0]', reason: 'pattern must normalize to a non-empty contains value' },
  ]);
});

test('canonical duplicates require the same non-empty collision group everywhere', () => {
  const cases = [
    {
      name: 'same entry',
      entries: [entry('a', ['Redesign the UI', { kind: 'contains', value: ' redesign   the ui ' }])],
    },
    {
      name: 'cross entry',
      entries: [entry('a', ['Redesign the UI']), entry('b', [{ kind: 'contains', value: 'redesign the ui' }])],
    },
    {
      name: 'partial group',
      entries: [entry('a', ['redesign the ui'], 'design-redesign'), entry('b', ['redesign the ui'])],
    },
    {
      name: 'entry group cannot authorize patterns',
      entries: [entry('a', ['redesign the ui'], 'shared'), entry('b', ['redesign the ui'], 'shared')],
    },
    {
      name: 'mismatched groups',
      entries: [entry('a', ['redesign the ui'], 'one'), entry('b', ['redesign the ui'], 'two')],
    },
  ];

  for (const fixture of cases) {
    const rows = diagnostics({ schema_version: 3, entries: fixture.entries });
    assert.ok(rows.some(({ status }) => status === 'pattern_collision'), `${fixture.name} must collide`);
  }

  assert.deepEqual(
    diagnostics({
      schema_version: 3,
      entries: [
        entry('redesign-existing-projects', [{ kind: 'contains', value: 'redesign the ui', collision_group: 'redesign-ui' }]),
        entry('gpt-taste', [{ kind: 'contains', value: ' Redesign  The UI ', collision_group: 'redesign-ui' }]),
      ],
    }),
    [],
    'the legitimate current collision is allowed only under one shared group',
  );
});

test('normalized values never expose object stringification artifacts', () => {
  const pattern = R.normalizeSignalPattern({ kind: 'contains', value: 'responsive landing page' }, 3);
  assert.equal(pattern.value, 'responsive landing page');
  assert.doesNotMatch(pattern.value, /\[object Object\]/);
});
