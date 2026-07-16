// Phase 10 / Plan 10-01: aggregate hot-path safety release matrix.
// SAF-01/02/03/06/07: fail-open, latency, no external classifier, and
// operator-command boundary checks for the live router hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const EVOLVE = join(homedir(), '.claude', 'hooks', 'router.evolve.mjs');
const CALIBRATE = fileURLToPath(new URL('../router.calibrate.mjs', import.meta.url));
const CALIBRATION_TASKS = fileURLToPath(new URL('../calibration-tasks.json', import.meta.url));
const VERIFICATION = fileURLToPath(new URL('../.planning/phases/10-safety-coexistence-and-release-gates/10-VERIFICATION.md', import.meta.url));
const NODE = '/Users/guilherme/.hermes/node/bin/node';
const BUDGET_MS = 100;
const LIVE_TRIGGER = join(homedir(), '.claude', 'router', '.evolve-trigger');
const LIVE_SETTINGS = join(homedir(), '.claude', 'settings.json');

const HOT_PATH_FILES = [
  HOOK,
  EVOLVE,
  CALIBRATE,
];

const RELEASE_MATRIX = {
  'SAF-01': ['tests/router.failopen.test.mjs', 'tests/router.safety-release.test.mjs'],
  'SAF-02': ['tests/router.perf.test.mjs', 'tests/router.perf-evolved.test.mjs'],
  'SAF-03': ['tests/router.safety-release.test.mjs'],
  'SAF-04': ['tests/router.direct-agent-warn.test.mjs', 'tests/router.route-targets.test.mjs'],
  'SAF-05': ['tests/router.coexistence.test.mjs', 'tests/router.settings-diff.test.mjs', 'tests/router.health.test.mjs'],
  'SAF-06': ['tests/router.inspect.test.mjs', 'tests/router.evolve-proposal.test.mjs', 'tests/router.evolution-visibility.test.mjs'],
  'SAF-07': ['tests/router.safety-release.test.mjs'],
  'SAF-08': ['tests/router.calibration-codebase.test.mjs', 'tests/router.calibration-coverage.test.mjs', 'tests/router.calibration-evolution.test.mjs', 'tests/router.calibration-graph.test.mjs', 'tests/router.calibrate-importable.test.mjs'],
};

function runHook(stdinStr, env = {}) {
  const start = performance.now();
  const r = spawnSync(NODE, [HOOK], {
    input: stdinStr,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    wall: performance.now() - start,
  };
}

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = source.indexOf('{', start);
  assert.notEqual(open, -1, `${name} must have a body`);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`${name} body was not closed`);
}

test('SAF-01 through SAF-08: release matrix maps every requirement to executable focused tests', () => {
  assert.deepEqual(Object.keys(RELEASE_MATRIX), Array.from({ length: 8 }, (_, i) => `SAF-0${i + 1}`));
  for (const [requirement, files] of Object.entries(RELEASE_MATRIX)) {
    assert.ok(files.length > 0, `${requirement} must map to focused evidence`);
    for (const file of files) {
      assert.ok(existsSync(file), `${requirement} evidence missing: ${file}`);
      assert.match(file, /^tests\/router\..+\.test\.mjs$/, `${requirement} evidence must be executable by node --test`);
    }
  }
});

test('SAF-08: calibration fixtures and stdout preserve every subset-specific release threshold', () => {
  const fixtures = JSON.parse(readFileSync(CALIBRATION_TASKS, 'utf8'));
  const counts = {
    original: fixtures.filter((fixture) => fixture.id >= 1 && fixture.id <= 10).length,
    codebase: fixtures.filter((fixture) => fixture.codebase).length,
    evolution: fixtures.filter((fixture) => fixture.evolution).length,
    coverage: fixtures.filter((fixture) => fixture.id >= 19 && fixture.id <= 27).length,
    mapping: fixtures.filter((fixture) => fixture.phase14_mapping === true).length,
  };
  assert.deepEqual(counts, { original: 10, codebase: 8, evolution: 3, coverage: 9, mapping: 2 });

  const run = spawnSync(NODE, [CALIBRATE], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /Original 10:\s+10\/10 \(preserved\)/);
  const codebase = run.stdout.match(/Codebase target:\s+(\d+)\/(\d+) \(target: 5\/7 minimum\)/);
  assert.ok(codebase, 'calibration output must expose the codebase target line');
  assert.ok(Number(codebase[1]) >= 5 && Number(codebase[2]) >= 7, `codebase target regressed: ${codebase?.[0]}`);
  assert.match(run.stdout, /Evolution 3:\s+\d+\/3 \(Phase 3 new\)/);
  assert.match(run.stdout, /Combined:\s+\d+ \/ 32 \(threshold: 23\)/);
});

test('SAF-06/SAF-07: live operator CLI release surface returns parseable privacy-safe JSON', () => {
  const prompt = 'phase ten release smoke';
  const commands = [
    ['inspect', [HOOK, 'inspect', prompt, '--json']],
    ['preview', [HOOK, 'preview', prompt, '--json']],
    ['explain-last', [HOOK, 'explain-last', '--json']],
    ['doctor', [HOOK, 'doctor', '--json']],
    ['routes', [HOOK, 'routes', '--json']],
    ['unmapped', [HOOK, 'unmapped', '--json']],
    ['coverage', [HOOK, 'coverage', '--json']],
    ['proposals', [HOOK, 'proposals', '--json']],
    ['status', [EVOLVE, 'status', '--json']],
  ];
  const forbiddenTelemetry = 'phase10-raw-telemetry-secret-must-not-appear';

  for (const [name, args] of commands) {
    const run = spawnSync(NODE, args, { encoding: 'utf8' });
    assert.equal(run.status, 0, `${name}: ${run.stderr || run.stdout}`);
    assert.doesNotThrow(() => JSON.parse(run.stdout), `${name} stdout must be JSON`);
    assert.doesNotMatch(run.stdout, new RegExp(forbiddenTelemetry), `${name} must not leak raw telemetry`);
    const output = JSON.parse(run.stdout);
    if (output.privacy && Object.hasOwn(output.privacy, 'raw_prompt_text')) {
      assert.equal(output.privacy.raw_prompt_text, false, `${name} privacy contract must reject raw prompt leakage`);
    }
  }
});

test('SAF-01 through SAF-08: final verification artifact records every exact release command', () => {
  assert.ok(existsSync(VERIFICATION), '10-VERIFICATION.md must exist before release');
  const evidence = readFileSync(VERIFICATION, 'utf8');
  for (const command of [
    'node --test tests/router.failopen.test.mjs tests/router.perf.test.mjs tests/router.perf-evolved.test.mjs tests/router.safety-release.test.mjs',
    'node --test tests/router.coexistence.test.mjs tests/router.settings-diff.test.mjs tests/router.direct-agent-warn.test.mjs tests/router.route-targets.test.mjs tests/router.health.test.mjs',
    'node --test tests/router.privacy.test.mjs tests/router.telemetry.test.mjs tests/router.inspect.test.mjs tests/router.evolve-proposal.test.mjs tests/router.evolution-visibility.test.mjs',
    'node --test tests/*.test.mjs',
    'node router.calibrate.mjs',
  ]) {
    assert.ok(evidence.includes(`\`${command}\``), `verification evidence missing command: ${command}`);
  }
  assert.match(evidence, /Original 10:\s*10\/10/);
  assert.match(evidence, /Codebase target:\s*8\/8/);
  assert.match(evidence, /Release decision:\s*PASS/i);
});

test('SAF-01/SAF-07: malformed and invalid hook inputs fail open with empty stdout', () => {
  const cases = [
    ['malformed stdin', 'not json', {}],
    ['missing prompt', JSON.stringify({}), {}],
    ['non-string prompt', JSON.stringify({ prompt: 42 }), {}],
    ['whitespace-only prompt', JSON.stringify({ prompt: '   \n\t  ' }), {}],
    ['forced internal throw', JSON.stringify({ prompt: 'real prompt here' }), { ROUTER_TEST_THROW: '1' }],
  ];

  for (const [name, input, env] of cases) {
    const r = runHook(input, env);
    assert.equal(r.status, 0, `${name} must exit 0`);
    assert.equal(r.stdout, '', `${name} must emit no additionalContext`);
    assert.doesNotMatch(r.stdout, /"decision"\s*:\s*"block"/, `${name} must not block`);
  }
});

test('SAF-01/SAF-07: live hook source has no blocking exit or block decision', () => {
  const src = readFileSync(HOOK, 'utf8');
  assert.equal(/process\.exit\(\s*2\s*\)/.test(src), false, 'hot path must never use process.exit(2)');
  assert.equal(/decision["']?\s*:\s*["']block["']/.test(src), false, 'hot path must never emit decision:block');
});

test('SAF-05/SAF-07: live JSON settings preserve router, GSD, context-mode, caveman, and ralph-loop surfaces', () => {
  const settings = JSON.parse(readFileSync(LIVE_SETTINGS, 'utf8'));
  const groups = settings?.hooks?.UserPromptSubmit;
  assert.ok(Array.isArray(groups), 'live UserPromptSubmit groups must remain registered');
  const commands = groups.flatMap((group) => group?.hooks || []).map((hook) => hook?.command || '');
  assert.ok(commands.some((command) => command.includes(HOOK)), 'router command must point at the live router hook');

  const allHookCommands = Object.values(settings?.hooks || {})
    .flatMap((eventGroups) => Array.isArray(eventGroups) ? eventGroups : [])
    .flatMap((group) => group?.hooks || [])
    .map((hook) => hook?.command || '');
  assert.ok(allHookCommands.some((command) => /gsd-/.test(command)), 'GSD hook entries must remain present');
  assert.equal(settings?.enabledPlugins?.['context-mode@context-mode'], true, 'context-mode must remain enabled');
  assert.equal(settings?.enabledPlugins?.['caveman@caveman'], true, 'caveman must remain enabled');
  assert.equal(settings?.enabledPlugins?.['ralph-loop@claude-plugins-official'], true, 'ralph-loop must remain enabled');
});

test('SAF-05/SAF-07: doctor recognizes the live registered router hook', () => {
  const r = spawnSync(NODE, [HOOK, 'doctor', '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const report = JSON.parse(r.stdout);
  assert.equal(report.hook.exists, true, 'doctor must detect the live hook file');
  assert.equal(report.hook.status, 'ok');
});

test('SAF-03/SAF-07: hot-path files have no per-prompt external classifier or hosted-model call path', () => {
  const forbidden = [
    /\bfrom\s+['"](?:node-fetch|axios|got|undici|openai|@openai\/[^'"]+|anthropic|@anthropic-ai\/[^'"]+)['"]/i,
    /\brequire\(\s*['"](?:node-fetch|axios|got|undici|openai|@openai\/[^'"]+|anthropic|@anthropic-ai\/[^'"]+)['"]\s*\)/i,
    /\bfetch\s*\(/,
    /\bhttps?\.request\s*\(/,
    /\bcreateChatCompletion\s*\(/i,
    /\bresponses\.create\s*\(/i,
    /\bchat\.completions\.create\s*\(/i,
    /\b(classifier|classifyPrompt|llmJudge|hostedModel)\b/i,
    /\b(?:curl|wget)\s+https?:\/\//i,
  ];

  for (const file of HOT_PATH_FILES) {
    const src = readFileSync(file, 'utf8');
    for (const pattern of forbidden) {
      assert.equal(pattern.test(src), false, `${basename(file)} matches forbidden classifier pattern ${pattern}`);
    }
  }
});

test('SAF-03/SAF-07: detached local evolution worker spawn remains the only hot-path child process exception', () => {
  const src = readFileSync(HOOK, 'utf8');
  assert.match(src, /import\s+\{\s*spawn\s*\}\s+from\s+['"]node:child_process['"]/, 'router may import stdlib spawn for local worker');
  assert.match(src, /spawn\(\s*process\.execPath\s*,\s*\[\s*WORKER_PATH\s*\]/, 'worker spawn must target local router.evolve.mjs via process.execPath');
  assert.doesNotMatch(src, /spawn\([^)]*(?:curl|wget|openai|anthropic|classifier)/i, 'spawn must not shell out to a classifier');
});

test('SAF-06/SAF-07: operator diagnostics are reachable from runCli, not main(payload)', () => {
  const src = readFileSync(HOOK, 'utf8');
  const mainBody = functionBody(src, 'main');
  const runCliBody = functionBody(src, 'runCli');
  const operatorHelpers = [
    'diagnoseRouterState',
    'listRoutes',
    'listUnmapped',
    'summarizeCoverage',
    'buildTelemetryProposals',
  ];

  for (const helper of operatorHelpers) {
    assert.doesNotMatch(mainBody, new RegExp(`\\b${helper}\\s*\\(`), `main(payload) must not call ${helper}`);
    assert.match(runCliBody, new RegExp(`\\b${helper}\\s*\\(`), `runCli(args) must own ${helper}`);
  }
  assert.match(mainBody, /\binspectDecision\s*\(/, 'main(payload) should use the shared routing helper');
});

test('SAF-04/SAF-06/SAF-07: blocked missing-MCP agents stay diagnostic-only across operator reports', () => {
  const doctorRun = spawnSync(NODE, [HOOK, 'doctor', '--json'], { encoding: 'utf8' });
  const routesRun = spawnSync(NODE, [HOOK, 'routes', '--json'], { encoding: 'utf8' });
  assert.equal(doctorRun.status, 0, doctorRun.stderr || doctorRun.stdout);
  assert.equal(routesRun.status, 0, routesRun.stderr || routesRun.stdout);

  const doctor = JSON.parse(doctorRun.stdout);
  const routes = JSON.parse(routesRun.stdout);
  assert.ok(doctor.blocked_agents.length > 0, 'doctor must surface blocked missing-MCP agents');
  for (const blocked of doctor.blocked_agents) {
    assert.equal(blocked.classification, 'blocked_missing_mcp');
    assert.equal(blocked.routeability, 'blocked');
  }

  const dispatchTargets = routes.routes
    .filter((route) => route.invoke_kind === 'agent')
    .flatMap((route) => route.recommended_agents || []);
  for (const blocked of doctor.blocked_agents) {
    assert.equal(dispatchTargets.includes(blocked.name), false, `${blocked.name} must not become an agent dispatch target`);
  }
  for (const warning of routes.routes.filter((route) => route.invoke_kind === 'warn')) {
    assert.deepEqual(warning.recommended_agents, [], `${warning.id} must not recommend a blocked agent`);
    assert.doesNotMatch(warning.warning || '', /Dispatch agent/i, `${warning.id} must remain warning-only`);
  }
});

test('SAF-02/SAF-07: warm hook pass-through stays below 100ms wall-clock and self-reported latency', () => {
  for (let i = 0; i < 5; i++) {
    const r = runHook(JSON.stringify({ prompt: 'thanks' }), { ROUTER_DEBUG_LATENCY: '1' });
    assert.equal(r.status, 0, `run ${i + 1} must exit 0`);
    assert.equal(r.stdout, '', `run ${i + 1} must pass through without stdout`);
    assert.ok(r.wall < BUDGET_MS, `run ${i + 1} wall ${r.wall.toFixed(2)}ms >= ${BUDGET_MS}ms`);
    const m = r.stderr.match(/__router_latency_ms=([0-9.]+)/);
    assert.ok(m, `run ${i + 1} missing __router_latency_ms line`);
    assert.ok(parseFloat(m[1]) < BUDGET_MS, `run ${i + 1} self-latency ${m[1]}ms >= ${BUDGET_MS}ms`);
  }
});

test('SAF-02/SAF-06/SAF-07: evolved worker-trigger hot path stays below 100ms without operator diagnostics', () => {
  const originalTrigger = existsSync(LIVE_TRIGGER) ? readFileSync(LIVE_TRIGGER, 'utf8') : '0';
  try {
    const before = parseInt(originalTrigger.trim(), 10) || 0;
    const startValue = before - ((before % 200) - 199 + 200) % 200;
    writeFileSync(LIVE_TRIGGER, String(startValue));

    const r = runHook(JSON.stringify({ prompt: 'the flaky payment test keeps failing intermittently' }), {
      ROUTER_DEBUG_LATENCY: '1',
    });

    assert.equal(r.status, 0, 'worker-trigger hook run must exit 0');
    assert.ok(r.wall < BUDGET_MS, `worker-trigger wall ${r.wall.toFixed(2)}ms >= ${BUDGET_MS}ms`);
    assert.doesNotMatch(r.stdout, /doctor|routes|unmapped|coverage|proposals/i, 'hook output must not include operator diagnostics');
    const m = r.stderr.match(/__router_latency_ms=([0-9.]+)/);
    assert.ok(m, `worker-trigger run missing __router_latency_ms line: ${JSON.stringify(r.stderr)}`);
    assert.ok(parseFloat(m[1]) < BUDGET_MS, `worker-trigger self-latency ${m[1]}ms >= ${BUDGET_MS}ms`);
    const after = parseInt(readFileSync(LIVE_TRIGGER, 'utf8').trim(), 10) || 0;
    assert.ok(after > startValue, `evolve trigger should advance; start=${startValue} after=${after}`);
  } finally {
    writeFileSync(LIVE_TRIGGER, originalTrigger);
  }
});
