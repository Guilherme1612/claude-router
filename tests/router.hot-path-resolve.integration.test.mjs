import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');

const ROLE = {
  id: 'debug-capability',
  invoke_kind: 'slash',
  mode: 'gsd-debug',
  resolve: [
    { name: 'gsd-debug', weight: 1.0 },
    { name: 'systematic-debugging', weight: 0.98 },
  ],
  signal_patterns: ['debug'],
  recommended_skills: [],
  recommended_agents: [],
};

const MODE_MAP = {
  schema_version: 4,
  thresholds: { T_high: 0.6, T_low: 0.3, M: 0.2 },
  entries: [ROLE],
};

function manifestFor(runtime) {
  return {
    // Keep the scoring corpus deterministic; runtime_commands is the resolver's
    // active-runtime presence source.
    commands: [{ name: 'gsd-debug', description: 'debug' }],
    runtime_commands: {
      claude: runtime === 'claude' ? ['gsd-debug'] : [],
      codex: runtime === 'codex' ? ['systematic-debugging'] : [],
    },
    skills: [],
    plugin_skills: [],
    agents_store_skills: [],
    agents: [],
  };
}

function inspect(runtime, manifest, prompt = 'debug this issue', modeMap = MODE_MAP, extraOptions = {}) {
  const code = [
    `const m = await import(${JSON.stringify(pathToFileURL(HOOK).href)});`,
    `const manifest = ${JSON.stringify(manifest)};`,
    `const modeMap = ${JSON.stringify(modeMap)};`,
    `const out = m.inspectDecision(${JSON.stringify(prompt)}, { manifest, modeMap, weights: null, mutateCache: false, logTelemetry: false, emitInjection: false, includePrompt: false, ...${JSON.stringify(extraOptions)} });`,
    'process.stdout.write(JSON.stringify(out));',
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    env: { ...process.env, ROUTER_RUNTIME: runtime },
    encoding: 'utf8',
    timeout: 15000,
  });
  const stdout = (result.stdout || '').trim();
  let value = null;
  if (stdout) {
    try { value = JSON.parse(stdout); } catch {}
  }
  return { status: result.status, stdout, stderr: (result.stderr || '').trim(), value };
}

function resolve(runtime, entry, commands) {
  const manifest = {
    commands: [],
    runtime_commands: { claude: [], codex: [], [runtime]: commands },
  };
  const code = [
    `const m = await import(${JSON.stringify(pathToFileURL(HOOK).href)});`,
    `const entry = ${JSON.stringify(entry)};`,
    `const manifest = ${JSON.stringify(manifest)};`,
    'process.stdout.write(JSON.stringify(m.resolveSlashRoute(entry, manifest, { tier: \'high\' })));',
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    env: { ...process.env, ROUTER_RUNTIME: runtime },
    encoding: 'utf8',
    timeout: 15000,
  });
  let value = null;
  try { value = JSON.parse((result.stdout || '').trim()); } catch {}
  return { status: result.status, stderr: (result.stderr || '').trim(), value };
}

test('real hot path emits the Claude-local resolved slash', () => {
  const result = inspect('claude', manifestFor('claude'));
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.value, result.stdout);
  assert.match(result.value.final_injected_context, /Run \/gsd-debug/);
  assert.doesNotMatch(result.value.final_injected_context, /systematic-debugging/);
  assert.equal(result.value.selected_route.resolved_slash, 'gsd-debug');
});

test('real hot path emits the Codex-local resolved slash and quarantines Claude-only candidate', () => {
  const result = inspect('codex', manifestFor('codex'));
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.value, result.stdout);
  assert.match(result.value.final_injected_context, /Run \/systematic-debugging/);
  assert.doesNotMatch(result.value.final_injected_context, /gsd-debug/);
  assert.equal(result.value.selected_route.resolved_slash, 'systematic-debugging');
  assert.deepEqual(result.value.selected_route.resolve_quarantined, ['gsd-debug']);
});

test('real hot path suppresses a slash when no active runtime candidate resolves', () => {
  const manifest = manifestFor('claude');
  manifest.runtime_commands.claude = [];
  const result = inspect('claude', manifest, 'debug this issue', {
    ...MODE_MAP,
    thresholds: { T_high: 1.1, T_low: 0.3, M: 0.2 },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.value, result.stdout);
  assert.equal(result.value.final_injected_context, '');
  assert.equal(result.value.selected_route, null);
  assert.notEqual(result.value.pass_through_reason, 'error');
});

test('resolver failure on the inspectDecision hot path fails open without a fabricated slash', () => {
  const malformedModeMap = {
    ...MODE_MAP,
    entries: [{ ...ROLE, resolve: { malformed: true } }],
  };
  const result = inspect(
    'claude',
    manifestFor('claude'),
    'debug this issue',
    malformedModeMap,
    { cachePath: '/dev/null' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.value, result.stdout);
  assert.equal(result.value.final_injected_context, '');
  assert.equal(result.value.selected_route, null);
  assert.equal(result.value.pass_through_reason, 'resolve_unavailable');
  assert.notEqual(result.value.selected_tier, 'error');
  assert.doesNotMatch(result.value.final_injected_context, /Run \/gsd-debug/);
});

test('resolver keeps declared order for equal-weight resolve members', () => {
  const result = resolve('claude', {
    mode: 'entry-mode',
    resolve: [
      { name: 'b', weight: 0.9 },
      { name: 'a', weight: 0.9 },
    ],
  }, ['b', 'a']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.value.suggested_slash, 'b');
});

test('resolver still sorts differing weights before declared order', () => {
  const result = resolve('claude', {
    mode: 'entry-mode',
    resolve: [
      { name: 'b', weight: 0.8 },
      { name: 'a', weight: 0.9 },
    ],
  }, ['b', 'a']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.value.suggested_slash, 'a');
});

test('resolver keeps the mode candidate primary over lower-weight resolve members', () => {
  const result = resolve('claude', {
    mode: 'entry-mode',
    resolve: [{ name: 'b', weight: 0.99 }],
  }, ['entry-mode', 'b']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.value.suggested_slash, 'entry-mode');
});

test('real hot path downgrades a resolver near-tie to med without a slash command line', () => {
  const manifest = manifestFor('claude');
  manifest.runtime_commands.claude = ['gsd-debug', 'systematic-debugging'];
  const result = inspect('claude', manifest);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.value, result.stdout);
  assert.equal(result.value.selected_tier, 'med');
  assert.equal(result.value.selected_route.tier, 'med');
  assert.match(result.value.final_injected_context, /Recommended: \/gsd-debug/);
  assert.doesNotMatch(result.value.final_injected_context, /Run \/gsd-debug/);
});
