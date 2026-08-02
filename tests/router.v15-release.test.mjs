import assert from 'node:assert/strict';
import test from 'node:test';
import { loadReleaseMatrix, runRelease, validateReleaseMatrix } from '../src/release/run-release.mjs';

const MATRIX_PATH = new URL('../release/v1.5-matrix.json', import.meta.url);

test('v1.5 matrix covers all 25 requirements and installed runtime gates', () => {
  const matrix = loadReleaseMatrix({ matrixPath: MATRIX_PATH });
  assert.equal(validateReleaseMatrix(matrix).requirement_count, 25);
  assert.deepEqual(matrix.stages.at(-1), {
    id: 'latency',
    files: ['tests/router.phase26-performance.test.mjs'],
    gate_ids: ['warm-p95', 'hard-route-ceiling', 'context-budget'],
    isolated: true,
  });
  assert.ok(matrix.stages.find(stage => stage.id === 'installed').files.includes('tests/router.production-verifier-e2e.test.mjs'));
});

test('v1.5 certification refuses an older release matrix', async () => {
  const older = loadReleaseMatrix({ matrixPath: new URL('../release/v1.3-matrix.json', import.meta.url) });
  await assert.rejects(runRelease({ matrix: older, requiredMilestone: 'v1.5', publish: false }), /milestone mismatch/);
});
