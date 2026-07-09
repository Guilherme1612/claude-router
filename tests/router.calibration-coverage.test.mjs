// Phase 05 calibration coverage regression gate.
// Keeps the original core fixtures represented while requiring one standing
// calibration fixture for each expanded route-coverage cluster.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const repoRoot = process.cwd();
const CALIBRATION = join(repoRoot, 'calibration-tasks.json');
const CALIBRATE = join(repoRoot, 'router.calibrate.mjs');

function loadTasks() {
  return JSON.parse(readFileSync(CALIBRATION, 'utf8'));
}

function edgeText(task) {
  return String(task?.right?.edge || '');
}

const phase05Clusters = [
  { key: 'debug', cov: 'COV-03' },
  { key: 'tests', cov: 'COV-04' },
  { key: 'review', cov: 'COV-05' },
  { key: 'ui', cov: 'COV-06' },
  { key: 'github', cov: 'COV-07' },
  { key: 'graphify', cov: 'COV-08' },
  { key: 'docs', cov: 'COV-09' },
  { key: 'agent', cov: 'COV-10' },
  { key: 'warn', cov: 'COV-11' },
];

test('original core calibration fixtures 1-10 remain represented', () => {
  const tasks = loadTasks();
  const ids = new Set(tasks.map((task) => task.id));

  for (let id = 1; id <= 10; id++) {
    assert.ok(ids.has(id), `original fixture id ${id} must still exist`);
  }

  const originals = tasks.filter((task) => task.id >= 1 && task.id <= 10);
  assert.equal(originals.length, 10, 'original core fixture id range must contain exactly 10 fixtures');
});

test('Phase 05 calibration fixtures cover every route cluster', () => {
  const tasks = loadTasks();

  for (const cluster of phase05Clusters) {
    assert.ok(
      tasks.some((task) => edgeText(task).toLowerCase().includes(cluster.cov.toLowerCase())),
      `missing Phase 05 ${cluster.key} fixture with ${cluster.cov} edge text`
    );
  }

  assert.ok(
    tasks.some((task) => edgeText(task).includes('COV-12') && task.right?.mode === null && Array.isArray(task.right?.agents)),
    'missing COV-12 direct agent/warn channel fixture'
  );
});

test('Phase 05 fixture targets match expected route shapes', () => {
  const tasks = loadTasks();
  const byCov = new Map();
  for (const task of tasks) {
    const edge = edgeText(task);
    for (const cluster of phase05Clusters) {
      if (edge.includes(cluster.cov)) byCov.set(cluster.cov, task);
    }
  }

  assert.equal(byCov.get('COV-03')?.right?.mode, '/gsd-debug');
  assert.deepEqual(byCov.get('COV-04')?.right?.skills, ['test-driven-development']);
  assert.equal(byCov.get('COV-05')?.right?.mode, '/gsd-code-review');
  assert.equal(byCov.get('COV-06')?.right?.mode, '/gsd-ui-review');
  assert.equal(byCov.get('COV-07')?.right?.mode, '/commit-push-pr');
  assert.equal(byCov.get('COV-08')?.right?.mode, '/gsd-graphify');
  assert.equal(byCov.get('COV-09')?.right?.mode, '/gsd-spec-phase');
  assert.deepEqual(byCov.get('COV-10')?.right?.agents, ['gsd-codebase-mapper']);
  assert.deepEqual(byCov.get('COV-11')?.right?.agents, []);
});

test('calibration command exits 0 with stdout and stderr surfaced on failure', () => {
  const proc = spawnSync(process.execPath, ['router.calibrate.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30000,
  });
  const output = `status=${proc.status}\nstdout:\n${proc.stdout}\nstderr:\n${proc.stderr}`;

  assert.equal(proc.status, 0, output);
  assert.match(proc.stdout, /Original 10: 10\/10 \(preserved\)/, output);
  assert.match(proc.stdout, /Phase-05 route coverage/, output);
});
