// Phase 08 Wave 0: codebase calibration contract tests.
// These lock the expanded CAL fixture categories and diagnostics before route
// tuning changes are made in later Phase 08 plans.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const CALIBRATION = join(repoRoot, 'calibration-tasks.json');
const CALIBRATE = join(repoRoot, 'router.calibrate.mjs');
const MODE_MAP = join(homedir(), '.claude', 'router', 'mode-map.json');
const MANIFEST = join(homedir(), '.claude', 'router', 'claude-inventory-manifest.json');

const C = await import(pathToFileURL(CALIBRATE).href);

function loadTasks() {
  return JSON.parse(readFileSync(CALIBRATION, 'utf8'));
}

function edgeText(task) {
  return String(task?.right?.edge || '');
}

function taskHasCal(task, cal) {
  return edgeText(task).includes(cal);
}

function fixtureFor(cal) {
  return loadTasks().find((task) => taskHasCal(task, cal));
}

function loadModeMapModes() {
  const modeMap = JSON.parse(readFileSync(MODE_MAP, 'utf8'));
  return new Set((modeMap.entries || []).map((entry) => String(entry.mode || '').replace(/^\//, '')));
}

function loadRouteTargets() {
  const modeMap = JSON.parse(readFileSync(MODE_MAP, 'utf8'));
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  return {
    modeMap,
    modes: new Set((modeMap.entries || []).map((entry) => String(entry.mode || '').replace(/^\//, ''))),
    skills: new Set([
      ...(manifest.skills || []).map((skill) => skill.name),
      ...(manifest.plugin_skills || []).map((skill) => skill.name),
      ...(modeMap.entries || []).flatMap((entry) => entry.recommended_skills || []),
    ]),
    agents: new Set([
      ...(manifest.agents || []).map((agent) => agent.name),
      ...(modeMap.entries || []).flatMap((entry) => entry.recommended_agents || []),
    ]),
  };
}

test('CAL-01 through CAL-07 have executable codebase fixture citations', () => {
  const tasks = loadTasks();

  for (const cal of ['CAL-01', 'CAL-02', 'CAL-03', 'CAL-04', 'CAL-05', 'CAL-06', 'CAL-07']) {
    const task = tasks.find((candidate) => taskHasCal(candidate, cal));
    assert.ok(task, `missing ${cal} right.edge citation`);
    assert.equal(task.codebase, true, `${cal} fixture must be codebase=true`);
    assert.equal(typeof task.cwd, 'string', `${cal} fixture missing cwd`);
    assert.ok(task.cwd.length > 0, `${cal} fixture cwd must be non-empty`);
    assert.ok(
      ['ok', 'empty', 'error', 'graph_missing', 'not_triggered'].includes(task.graph_status_expected),
      `${cal} fixture has invalid graph_status_expected=${task.graph_status_expected}`,
    );
  }
});

test('CAL-08 and CAL-09 are explicit contract assertions', () => {
  const cal08 = fixtureFor('CAL-08');
  const cal09 = fixtureFor('CAL-09');

  assert.ok(cal08, 'missing CAL-08 right.edge citation for expanded codebase target');
  assert.ok(cal09, 'missing CAL-09 right.edge citation for miss taxonomy output');
});

test('codebase right-pick shapes resolve to mode-map, manifest skill, or manifest agent targets', () => {
  const tasks = loadTasks();
  const targets = loadRouteTargets();
  const codebase = tasks.filter((task) => task.codebase === true && task.right?.status === 'route');

  assert.ok(codebase.length >= 7, `expected at least 7 codebase fixtures, got ${codebase.length}`);

  for (const task of codebase) {
    const mode = String(task.right?.mode || '').replace(/^\//, '');
    if (mode) {
      assert.ok(targets.modes.has(mode), `fixture #${task.id} right.mode=${mode} not in mode-map`);
    }

    for (const skill of task.right?.skills || []) {
      assert.ok(targets.skills.has(skill), `fixture #${task.id} skill=${skill} not in mode-map or manifest`);
    }

    for (const agent of task.right?.agents || []) {
      assert.ok(targets.agents.has(agent), `fixture #${task.id} agent=${agent} not in mode-map or manifest`);
    }
  }
});

test('CAL-03 target shape is gsd-add-tests with TDD skill and no test-engineer agent', () => {
  const cal03 = fixtureFor('CAL-03');
  assert.ok(cal03, 'missing CAL-03 fixture');
  assert.equal(cal03.right?.mode, '/gsd-add-tests');
  assert.deepEqual(cal03.right?.skills, ['test-driven-development']);
  assert.deepEqual(cal03.right?.agents, []);
  assert.ok(loadModeMapModes().has('gsd-add-tests'), 'gsd-add-tests must be a mode-map route');
});

test('calibration harness exports Phase 08 miss taxonomy helpers', () => {
  assert.equal(typeof C.classifyCalibrationMiss, 'function');
  assert.equal(typeof C.codebaseRightTarget, 'function');
});

test('codebaseRightTarget enforces at least five of seven without lowering core gate', () => {
  assert.equal(C.codebaseRightTarget(0), 0);
  assert.equal(C.codebaseRightTarget(1), 1);
  assert.equal(C.codebaseRightTarget(7), 5);
  assert.equal(C.codebaseRightTarget(8), 6);
  assert.equal(C.codebaseRightTarget(10), 7);
});

test('classifyCalibrationMiss returns class and follow-up owner for representative misses', () => {
  const fixtureGap = C.classifyCalibrationMiss(
    { id: 99, codebase: true, graph_status_expected: 'ok', right: { mode: '/gsd-graphify', skills: [], agents: [] } },
    { tier: 'low', route: null, skipReason: 'low_threshold', graph_status: 'ok', top3: [] },
    { ok: false, detail: 'right=route but router produced no route' },
  );
  assert.deepEqual(fixtureGap, { class: 'mode_map_gap', follow_up: 'mode-map' });

  const threshold = C.classifyCalibrationMiss(
    { id: 100, codebase: true, graph_status_expected: 'not_triggered', right: { mode: '/gsd-debug', skills: [], agents: [] } },
    { tier: 'low', route: { mode: 'gsd-debug', recommended_skills: [], recommended_agents: [] }, skipReason: 'margin_tie', graph_status: 'not_triggered', top3: [] },
    { ok: false, detail: 'mode: got gsd-debug want gsd-debug' },
  );
  assert.deepEqual(threshold, { class: 'threshold_margin', follow_up: 'threshold' });

  const targetShape = C.classifyCalibrationMiss(
    { id: 101, codebase: true, graph_status_expected: 'not_triggered', right: { mode: '/gsd-add-tests', skills: ['test-driven-development'], agents: [] } },
    { tier: 'high', route: { mode: 'gsd-add-tests', recommended_skills: [], recommended_agents: [] }, skipReason: null, graph_status: 'not_triggered', top3: [] },
    { ok: false, detail: 'skills: got [] want ["test-driven-development"]' },
  );
  assert.deepEqual(targetShape, { class: 'target_shape', follow_up: 'target-shape' });
});

test('calibration CLI prints codebase target and miss taxonomy markers', () => {
  const proc = spawnSync(process.execPath, ['router.calibrate.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30000,
  });
  const output = `status=${proc.status}\nstdout:\n${proc.stdout}\nstderr:\n${proc.stderr}`;

  assert.equal(proc.status, 0, output);
  assert.match(proc.stdout, /Original 10: 10\/10 \(preserved\)/, output);
  assert.match(proc.stdout, /Codebase target: \d+\/\d+ \(target: 5\/7 minimum\)/, output);
  assert.match(proc.stdout, /Miss taxonomy: [a-z_]+ follow_up=(fixture|scoring|mode-map|graph|threshold|target-shape)/, output);
});
