import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  loadReleaseMatrix,
  validateReleaseMatrix,
} from '../src/release/run-release.mjs';

const MATRIX_PATH = new URL('../release/v1.2-matrix.json', import.meta.url);
const IDS = [
  'REG-01', 'REG-02', 'REG-03', 'ADP-01', 'ADP-02', 'CHG-01', 'CHG-02',
  'SAF-09', 'SAF-10', 'MAP-01', 'MAP-02', 'ACT-01', 'CTX-01', 'CTX-02',
  'ORC-01', 'ORC-02', 'TOK-01', 'TOK-02', 'EVO-05', 'REL-01',
];

function clone(value) { return JSON.parse(JSON.stringify(value)); }

test('D-10 release matrix has the exact 20 requirements and one inherited primary each', () => {
  const matrix = loadReleaseMatrix({ matrixPath: MATRIX_PATH });
  assert.deepEqual(matrix.requirements.map(row => row.id).sort(), [...IDS].sort());
  assert.equal(matrix.requirements.length, 20);
  assert.ok(matrix.requirements.every(row => row.primary.phase !== 18));
  assert.ok(matrix.requirements.every(row => row.secondary?.every(entry => entry.label === 'phase-18-cross-cutting')));
  assert.equal(validateReleaseMatrix(matrix).status, 'valid');
});

test('D-11 matrix validation rejects incomplete, unknown, duplicate, skipped, stale, unsafe, and circular evidence', () => {
  const valid = loadReleaseMatrix({ matrixPath: MATRIX_PATH });
  const cases = [
    ['missing', matrix => matrix.requirements.pop(), /coverage/],
    ['unknown', matrix => { matrix.requirements[0].id = 'BAD-01'; }, /unknown/],
    ['duplicate', matrix => matrix.requirements.push(clone(matrix.requirements[0])), /duplicate/],
    ['skip', matrix => { matrix.requirements[0].primary.commands[0] = 'node --test --test-skip-pattern=x tests/router.registry-schema.test.mjs'; }, /skip/],
    ['unsafe', matrix => { matrix.requirements[0].primary.commands[0] = 'sh -c whoami'; }, /executable/],
    ['circular', matrix => { matrix.requirements[0].primary.commands = ['node --test tests/router.v12-release.test.mjs']; }, /circular/],
    ['version', matrix => { matrix.versions.policy = 'stale-policy'; }, /version/],
  ];
  for (const [name, mutate, expected] of cases) {
    const matrix = clone(valid);
    mutate(matrix);
    assert.throws(() => validateReleaseMatrix(matrix), expected, name);
  }
});

test('D-11 loader rejects missing matrix bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-release-missing-'));
  try {
    assert.throws(() => loadReleaseMatrix({ matrixPath: join(root, 'missing.json') }), /matrix/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
