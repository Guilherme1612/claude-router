// Plan 32.1-01 Task 2 — runtime isolation through buildTargetIndexes (PARITY-03).
// Each probe imports the live hook in a fresh process because ROUTER_RUNTIME is
// clamped once at module load.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');

const runtimeManifest = {
  commands: [{ name: 'flat-command' }],
  runtime_commands: {
    claude: ['gsd-debug', 'gsd-plan-phase'],
    codex: ['systematic-debugging'],
  },
  skills: [],
  plugin_skills: [],
  agents_store_skills: [],
  agents: [],
};

const flatManifest = {
  commands: ['flat-command', 'legacy-command'],
  skills: [],
  plugin_skills: [],
  agents_store_skills: [],
  agents: [],
};

const emptyRuntimeManifest = {
  ...flatManifest,
  runtime_commands: { claude: [], codex: [] },
};

const CODEX_ONLY_ROUTE = {
  id: 'debug-capability',
  invoke_kind: 'slash',
  mode: 'systematic-debugging',
  resolve: [{ name: 'systematic-debugging', weight: 1.0 }],
  signal_patterns: ['debug'],
  recommended_skills: [],
  recommended_agents: [],
};

const MODE_MAP = {
  schema_version: 4,
  entries: [CODEX_ONLY_ROUTE],
};

function probe(runtime) {
  const code = [
    `const m = await import(${JSON.stringify(pathToFileURL(HOOK).href)});`,
    `const manifest = ${JSON.stringify(runtimeManifest)};`,
    `const flatManifest = ${JSON.stringify(flatManifest)};`,
    `const emptyRuntimeManifest = ${JSON.stringify(emptyRuntimeManifest)};`,
    `const route = ${JSON.stringify(CODEX_ONLY_ROUTE)};`,
    `const modeMap = ${JSON.stringify(MODE_MAP)};`,
    'const indexes = m.buildTargetIndexes(manifest);',
    'const flatIndexes = m.buildTargetIndexes(flatManifest);',
    'const emptyRuntimeIndexes = m.buildTargetIndexes(emptyRuntimeManifest);',
    'const routeExists = m.routeTargetsExist(route, manifest, modeMap, indexes);',
    'const validation = m.validateRouteTargets(manifest, modeMap, indexes);',
    'process.stdout.write(JSON.stringify({ runtime: m.RUNTIME, indexes: { ...indexes, commands: [...indexes.commands] }, flatIndexes: { ...flatIndexes, commands: [...flatIndexes.commands] }, emptyRuntimeIndexes: { ...emptyRuntimeIndexes, commands: [...emptyRuntimeIndexes.commands] }, routeExists, validation }));',
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    env: { ...process.env, ROUTER_RUNTIME: runtime },
    encoding: 'utf8',
    timeout: 15000,
  });
  let value = null;
  const output = (result.stdout || '').trim();
  if (output) {
    try { value = JSON.parse(output); } catch { value = null; }
  }
  return { ...result, output, value, error: (result.stderr || '').trim() };
}

for (const runtime of ['claude', 'codex']) {
  test(`index path isolates the active ${runtime} runtime`, () => {
    const result = probe(runtime);
    assert.equal(result.status, 0, `${runtime} probe exited non-zero: ${result.error}`);
    assert.ok(result.value, `${runtime} probe must return JSON`);

    const { indexes, flatIndexes, emptyRuntimeIndexes } = result.value;
    assert.equal(indexes.runtime, runtime);
    if (runtime === 'claude') {
      assert.ok(indexes.commands.includes('gsd-debug'));
      assert.ok(!indexes.commands.includes('systematic-debugging'));
      assert.equal(result.value.routeExists, false);
      assert.ok(result.value.validation.some((row) => row.status === 'stale_target'));
    } else {
      assert.ok(indexes.commands.includes('systematic-debugging'));
      assert.ok(!indexes.commands.includes('gsd-debug'));
      assert.equal(result.value.routeExists, true);
      assert.equal(result.value.validation.some((row) => row.status === 'stale_target'), false);
    }

    assert.ok(flatIndexes.commands.includes('flat-command'));
    assert.ok(flatIndexes.commands.includes('legacy-command'));
    assert.ok(emptyRuntimeIndexes.commands.includes('flat-command'));
    assert.ok(emptyRuntimeIndexes.commands.includes('legacy-command'));
  });
}
