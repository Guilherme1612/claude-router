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
const NODE = '/Users/guilherme/.hermes/node/bin/node';
const BUDGET_MS = 100;
const LIVE_TRIGGER = join(homedir(), '.claude', 'router', '.evolve-trigger');
const LIVE_SETTINGS = join(homedir(), '.claude', 'settings.json');

const HOT_PATH_FILES = [
  HOOK,
  EVOLVE,
  CALIBRATE,
];

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
