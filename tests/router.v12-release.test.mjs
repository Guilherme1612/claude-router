import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  loadReleaseMatrix,
  runRelease,
  validateReleaseMatrix,
  verifyReleaseReport,
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

test('D-11 one runner executes every hard gate sequentially with latency isolated last', async () => {
  const calls = [];
  const execute = async request => {
    calls.push(request);
    return {
      status: 'passed', exit_code: 0, skipped: false,
      gate_results: request.gate_ids.map(id => ({ id, pass: true, reason_code: `${id}_pass` })),
      ...(request.stage === 'latency' ? { measurements: { warm_p95_ms: 1.5, max_route_ms: 4.5 } } : {}),
    };
  };
  const result = await runRelease({ execute, publish: false });
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.stages.map(stage => stage.id), [
    'regression', 'calibration', 'privacy', 'coexistence', 'recovery', 'context-token', 'latency',
  ]);
  assert.equal(calls.at(-1).stage, 'latency');
  assert.equal(calls.at(-1).isolated, true);
  assert.ok(calls.slice(0, -1).every(call => call.isolated === false));
  assert.ok(calls.every(call => call.timeout_ms > 0));
});

test('D-11 runner fails closed on command failure, skip, timeout, missing gates, and latency thresholds', async () => {
  for (const defect of ['failure', 'skip', 'timeout', 'missing', 'slow']) {
    const execute = async request => ({
      status: defect === 'timeout' ? 'timed_out' : 'passed',
      exit_code: defect === 'failure' ? 1 : 0,
      skipped: defect === 'skip',
      gate_results: defect === 'missing' ? [] : request.gate_ids.map(id => ({ id, pass: true, reason_code: `${id}_pass` })),
      ...(request.stage === 'latency' ? { measurements: defect === 'slow' ? { warm_p95_ms: 25, max_route_ms: 99 } : { warm_p95_ms: 1, max_route_ms: 2 } } : {}),
    });
    await assert.rejects(runRelease({ execute, publish: false }), /release gate failed/, defect);
  }
});

test('D-12 report is deterministic, privacy-safe, version-bound, and independently verifiable', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-release-report-'));
  const secret = 'PROMPT-secret-env-/Users/private/tmp';
  const execute = async request => ({
    status: 'passed', exit_code: 0, skipped: false, stdout: secret, environment: { TOKEN: secret },
    gate_results: request.gate_ids.map(id => ({ id, pass: true, reason_code: `${id}_pass`, raw: secret })),
    ...(request.stage === 'latency' ? { measurements: { warm_p95_ms: 1.25, max_route_ms: 4.75, raw_path: secret } } : {}),
  });
  try {
    const first = join(root, 'first.json');
    const second = join(root, 'second.json');
    await runRelease({ execute, outputPath: first });
    await runRelease({ execute, outputPath: second });
    const firstBytes = readFileSync(first, 'utf8');
    assert.equal(firstBytes, readFileSync(second, 'utf8'));
    assert.doesNotMatch(firstBytes, /PROMPT|secret|\/Users\/private|TOKEN/);
    const verified = verifyReleaseReport({ reportPath: first, matrixPath: MATRIX_PATH });
    assert.equal(verified.status, 'verified');
    assert.deepEqual(Object.keys(verified.versions).sort(), ['corpus', 'index', 'policy', 'registry']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('D-12 failed run preserves prior passing evidence and tampering fails verification', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-release-atomic-'));
  const outputPath = join(root, 'report.json');
  const passing = async request => ({
    status: 'passed', exit_code: 0, skipped: false,
    gate_results: request.gate_ids.map(id => ({ id, pass: true, reason_code: `${id}_pass` })),
    ...(request.stage === 'latency' ? { measurements: { warm_p95_ms: 1, max_route_ms: 2 } } : {}),
  });
  try {
    await runRelease({ execute: passing, outputPath });
    const prior = readFileSync(outputPath, 'utf8');
    await assert.rejects(runRelease({ outputPath, execute: async request => request.stage === 'privacy'
      ? { status: 'failed', exit_code: 1, skipped: false, gate_results: [] }
      : passing(request) }), /release gate failed/);
    assert.equal(readFileSync(outputPath, 'utf8'), prior);
    const tampered = JSON.parse(prior);
    tampered.matrix_sha256 = '0'.repeat(64);
    writeFileSync(outputPath, JSON.stringify(tampered));
    assert.throws(() => verifyReleaseReport({ reportPath: outputPath, matrixPath: MATRIX_PATH }), /matrix hash/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
