import assert from 'node:assert/strict';
import test from 'node:test';
import { loadReleaseMatrix, parseChildEvidence, runRelease, validateReleaseMatrix } from '../src/release/run-release.mjs';

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

test('latency stages reject unknown gates instead of fabricating a pass', () => {
  const matrix = structuredClone(loadReleaseMatrix({ matrixPath: MATRIX_PATH }));
  matrix.stages.at(-1).gate_ids.push('security-typo');
  assert.throws(() => validateReleaseMatrix(matrix), /unknown latency gate/);
  const parsed = parseChildEvidence({
    stdout: '# pass 1\n# fail 0\n# RELEASE_METRICS {"warm_p95_ms":2,"max_route_ms":8,"context_max_bytes":512}\n',
    stage: 'latency', gate_ids: ['security-typo'], error: null, skipped: false,
    thresholds: matrix.thresholds,
  });
  assert.equal(parsed.reason_code, 'unknown-latency-gate');
  assert.deepEqual(parsed.gate_results, []);
});
