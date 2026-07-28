import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  loadReleaseMatrix,
  parseChildEvidence,
  runRelease,
  validateReleaseMatrix,
  verifyReleaseReport,
} from '../src/release/run-release.mjs';

const MATRIX_PATH = new URL('../release/v1.3-matrix.json', import.meta.url);
const IDS = Array.from({ length: 9 }, (_, index) => `REL-0${index + 1}`);

const clone = value => JSON.parse(JSON.stringify(value));

test('v1.3 matrix owns exact fresh REL-01 through REL-09 release evidence', () => {
  const matrix = loadReleaseMatrix({ matrixPath: MATRIX_PATH });
  assert.equal(matrix.milestone, 'v1.3');
  assert.deepEqual(matrix.requirements.map(row => row.id), IDS);
  assert.deepEqual(matrix.stages.map(stage => stage.id), [
    'focused', 'lifecycle', 'compatibility', 'authority', 'regression', 'latency', 'live-install',
  ]);
  assert.equal(matrix.stages.at(-1).isolated, true);
  assert.deepEqual(matrix.stages.at(-1).gate_ids, [
    'LIVE-INSTALL',
  ]);
  assert.deepEqual(matrix.stages.find(stage => stage.id === 'latency').gate_ids, [
    'warm-p95', 'hard-route-ceiling', 'context-budget', 'REL-07',
  ]);
  assert.equal(validateReleaseMatrix(matrix).status, 'valid');
});

test('v1.3 validation fails closed on incomplete, stale, skipped, malformed, or unsafe evidence', () => {
  const valid = loadReleaseMatrix({ matrixPath: MATRIX_PATH });
  const cases = [
    ['missing requirement', matrix => matrix.requirements.pop(), /coverage/],
    ['duplicate requirement', matrix => matrix.requirements.push(clone(matrix.requirements[0])), /duplicate/],
    ['stale milestone', matrix => { matrix.milestone = 'v1.2'; }, /version|coverage|unknown fields/],
    ['missing stage', matrix => matrix.stages.pop(), /stage|gate/],
    ['duplicate stage', matrix => matrix.stages.push(clone(matrix.stages[0])), /duplicate/],
    ['skipped evidence', matrix => { matrix.stages[0].files[0] = 'tests/router.phase26-skip.test.mjs'; }, /readable|file/],
    ['malformed gate', matrix => { matrix.stages[0].gate_ids = []; }, /gate|malformed/],
    ['release recursion', matrix => { matrix.stages[0].files = ['tests/router.phase26-release.test.mjs']; }, /circular/],
  ];
  for (const [name, mutate, expected] of cases) {
    const matrix = clone(valid);
    mutate(matrix);
    assert.throws(() => validateReleaseMatrix(matrix), expected, name);
  }
});

test('v1.3 runner executes every matrix stage and publishes a verifiable report', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-v13-release-'));
  const outputPath = join(root, 'report.json');
  const requests = [];
  const execute = async request => {
    requests.push(request);
    return {
      status: 'passed',
      exit_code: 0,
      skipped: false,
      gate_results: request.gate_ids.map(id => ({ id, pass: true, reason_code: `${id}_pass` })),
      ...(request.stage === 'latency' ? {
        measurements: { warm_p95_ms: 2, max_route_ms: 8, context_max_bytes: 512 },
      } : {}),
    };
  };
  try {
    const result = await runRelease({ matrixPath: MATRIX_PATH, execute, outputPath });
    assert.equal(result.status, 'passed');
    assert.equal(requests.length, 7);
    assert.ok(requests.at(-1).isolated);
    assert.equal(verifyReleaseReport({ reportPath: outputPath, matrixPath: MATRIX_PATH }).status, 'verified');
    assert.equal(JSON.parse(readFileSync(outputPath, 'utf8')).milestone, 'v1.3');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('v1.3 runner blocks skipped, incomplete, failing, and over-budget stage results', async () => {
  const matrix = loadReleaseMatrix({ matrixPath: MATRIX_PATH });
  const defects = ['skip', 'missing', 'failure', 'slow', 'context'];
  for (const defect of defects) {
    const execute = async request => ({
      status: 'passed',
      exit_code: defect === 'failure' ? 1 : 0,
      skipped: defect === 'skip',
      gate_results: defect === 'missing'
        ? []
        : request.gate_ids.map(id => ({ id, pass: true, reason_code: `${id}_pass` })),
      ...(request.stage === 'latency' ? {
        measurements: {
          warm_p95_ms: defect === 'slow' ? 25 : 2,
          max_route_ms: 8,
          context_max_bytes: defect === 'context' ? matrix.thresholds.context_max_bytes + 1 : 512,
        },
      } : {}),
    });
    await assert.rejects(
      runRelease({ matrix, execute, publish: false }),
      /release gate failed/,
      defect,
    );
  }
});

test('v1.3 isolated evidence normalizes the benchmark max_ms measurement', () => {
  const matrix = loadReleaseMatrix({ matrixPath: MATRIX_PATH });
  const result = parseChildEvidence({
    stdout: '# pass 3\n# fail 0\n# RELEASE_METRICS {"warm_p95_ms":2,"max_ms":8,"context_max_bytes":512}\n',
    stage: 'latency',
    gate_ids: matrix.stages.at(-1).gate_ids,
    thresholds: matrix.thresholds,
    error: null,
    skipped: false,
  });
  assert.equal(result.measurements.max_route_ms, 8);
  assert.ok(result.gate_results.every(gate => gate.pass));
});

test('required release evidence rejects a partial TAP run with any skipped test', () => {
  const matrix = loadReleaseMatrix({ matrixPath: MATRIX_PATH });
  const result = parseChildEvidence({
    stdout: '# pass 1\n# fail 0\n# skipped 1\nok 1 - unrelated\nok 2 - required # SKIP unavailable\n',
    stage: 'compatibility',
    gate_ids: ['REL-06'],
    thresholds: matrix.thresholds,
    error: null,
    skipped: true,
  });
  assert.equal(result.reason_code, 'skipped');
  assert.deepEqual(result.gate_results, []);
});
