// Phase 09 Wave 0 RED contract: EVO-01/EVO-02 evolution visibility.
// These tests intentionally describe the required read-only helper and
// doctor/inspect visibility surface before implementation exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const mod = await import(HOOK);
const {
  summarizeEvolutionVisibility,
  explainWeightApplication,
  diagnoseRouterState,
  inspectDecision,
} = mod;

const RAW_PROMPT_FIXTURE = 'RAW_PHASE_09_SECRET_PROMPT_DO_NOT_PRINT';
const RAW_TELEMETRY_FIXTURE = 'downstream_event contains sk-live-phase09-secret and must not be printed';

function withTempDir(fn) {
  const dir = join(tmpdir(), `router-evo-vis-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function fileSnapshot(path) {
  if (!existsSync(path)) return { exists: false, size: 0, mtimeMs: 0, sha256: null };
  const buf = readFileSync(path);
  const st = statSync(path);
  return {
    exists: true,
    size: st.size,
    mtimeMs: st.mtimeMs,
    sha256: createHash('sha256').update(buf).digest('hex'),
  };
}

function routerFileSnapshots(paths) {
  return Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, fileSnapshot(path)]));
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf8');
}

function fixtureManifest() {
  return {
    commands: [
      { id: 'gsd-debug', name: 'gsd-debug', description: 'debug bugs and failing tests' },
      { id: 'gsd-progress', name: 'gsd-progress', description: 'workflow progress' },
    ],
    skills: [],
    plugin_skills: [],
    agents_store_skills: [],
    agents: [],
    hooks: [],
    mcp_servers: [],
    unwired_mcp_refs: [],
  };
}

function fixtureModeMap() {
  return {
    schema_version: 2,
    thresholds: { T_high: 0.6, T_low: 0.3, M: 0.2 },
    entries: [
      {
        id: 'gsd-debug',
        mode: 'gsd-debug',
        invoke_kind: 'slash',
        signal_patterns: ['debug bug failure'],
        recommended_skills: [],
        recommended_agents: [],
      },
      {
        id: 'blocked-mcp-warning',
        mode: null,
        invoke_kind: 'warn',
        signal_patterns: ['context7 blocked warning'],
        recommended_skills: [],
        recommended_agents: [],
        warning: 'MCP context7 is not wired',
      },
    ],
  };
}

function writeRuntimeFixture(dir) {
  const paths = {
    manifestPath: join(dir, 'manifest.json'),
    modeMapPath: join(dir, 'mode-map.json'),
    weightsPath: join(dir, 'weights.json'),
    evolutionStatePath: join(dir, 'evolution-state.json'),
    evolveTriggerPath: join(dir, '.evolve-trigger'),
    telemetryPath: join(dir, 'telemetry.jsonl'),
    cachePath: join(dir, 'cache.json'),
  };
  writeJson(paths.manifestPath, fixtureManifest());
  writeJson(paths.modeMapPath, fixtureModeMap());
  writeJson(paths.weightsPath, {
    schema_version: 2,
    blend: 0.15,
    updated_at: '2026-07-11T00:00:00.000Z',
    weights: {
      'gsd-debug': { g: 0, b: 2, u: 1, score: 0, updated_at: '2026-07-11T00:00:00.000Z' },
      'blocked-mcp-warning': { g: 9, b: 0, u: 0, score: 1, updated_at: '2026-07-11T00:00:00.000Z' },
    },
  });
  writeJson(paths.evolutionStatePath, {
    schema_version: 1,
    last_run: '2026-07-11T01:02:03.000Z',
    right_pick_rate: 0,
    proposal_counts: { add: 1, edit: 2, prune: 0 },
  });
  writeFileSync(paths.evolveTriggerPath, '199', 'utf8');
  writeFileSync(paths.telemetryPath, [
    '{malformed',
    JSON.stringify({
      ts: Date.now(),
      prompt_signature: 'sig-phase09',
      suggested_mode: 'gsd-debug',
      confidence_tier: 'high',
      downstream_event: RAW_TELEMETRY_FIXTURE,
      prompt: RAW_PROMPT_FIXTURE,
    }),
    '',
  ].join('\n'), 'utf8');
  writeJson(paths.cachePath, { schema_version: 1, entries: {}, order: [], size: 0 });
  return paths;
}

function assertNoRawText(value) {
  const text = JSON.stringify(value);
  assert.ok(!text.includes(RAW_PROMPT_FIXTURE), 'output must not expose raw prompt text');
  assert.ok(!text.includes(RAW_TELEMETRY_FIXTURE), 'output must not expose raw telemetry downstream text');
  assert.ok(!text.includes('sk-live-phase09-secret'), 'output must not expose fake secret material');
}

test('EVO-01/EVO-02: summarizeEvolutionVisibility export explains zero and warn-skipped weights', () => {
  assert.equal(typeof summarizeEvolutionVisibility, 'function', 'router.mjs must export summarizeEvolutionVisibility');
  assert.equal(typeof explainWeightApplication, 'function', 'router.mjs must export explainWeightApplication');
  withTempDir((dir) => {
    const paths = writeRuntimeFixture(dir);
    const out = summarizeEvolutionVisibility({
      modeMap: fixtureModeMap(),
      paths: {
        weights: paths.weightsPath,
        evolutionState: paths.evolutionStatePath,
        evolveTrigger: paths.evolveTriggerPath,
        telemetry: paths.telemetryPath,
      },
    });

    assert.equal(out.status, 'ok');
    assert.equal(out.weights.parse_status, 'ok');
    assert.equal(out.last_run.status, 'ok');
    assert.equal(out.last_run.at, '2026-07-11T01:02:03.000Z');
    assert.equal(out.trigger.exists, true);
    assert.equal(out.privacy.raw_prompt_text, false);
    assert.equal(out.privacy.raw_telemetry_lines, false);
    assert.deepEqual(out.proposal_counts, { add: 1, edit: 2, prune: 0 });

    const debug = out.weight_reasons['gsd-debug'];
    assert.ok(debug, 'weight_reasons must include gsd-debug');
    assert.equal(debug.applied, true);
    assert.equal(debug.effective_weight, 0);
    assert.ok(debug.reason_codes.includes('score_zero'), 'zero score reason required');
    assert.ok(debug.reason_codes.includes('no_good_outcomes'), 'g=0 reason required');

    const warn = out.weight_reasons['blocked-mcp-warning'];
    assert.ok(warn, 'weight_reasons must include warn entry');
    assert.equal(warn.applied, false);
    assert.ok(warn.reason_codes.includes('warn_skipped'), 'warn routes must report warn_skipped');
    assertNoRawText(out);
  });
});

test('EVO-01: explainWeightApplication gives machine-readable reason codes for effective-zero weights', () => {
  assert.equal(typeof explainWeightApplication, 'function', 'router.mjs must export explainWeightApplication');
  const out = explainWeightApplication('gsd-debug', {
    modeMap: fixtureModeMap(),
    weights: {
      schema_version: 2,
      weights: {
        'gsd-debug': { g: 0, b: 2, u: 1, score: 0 },
        'blocked-mcp-warning': { g: 4, b: 0, u: 0, score: 1 },
      },
    },
  });
  assert.equal(out.entry_id, 'gsd-debug');
  assert.equal(out.applied, true);
  assert.equal(out.effective_weight, 0);
  assert.ok(out.reason_codes.includes('score_zero'));
  assert.ok(out.reason_codes.includes('no_good_outcomes'));

  const warn = explainWeightApplication('blocked-mcp-warning', {
    modeMap: fixtureModeMap(),
    weights: { schema_version: 2, weights: { 'blocked-mcp-warning': { g: 4, b: 0, u: 0, score: 1 } } },
  });
  assert.equal(warn.applied, false);
  assert.ok(warn.reason_codes.includes('warn_skipped'));
});

test('EVO-02: diagnoseRouterState exposes evolution_visibility with parse statuses and privacy metadata', () => {
  withTempDir((dir) => {
    const paths = writeRuntimeFixture(dir);
    const out = diagnoseRouterState({
      manifest: fixtureManifest(),
      modeMap: fixtureModeMap(),
      manifestPath: paths.manifestPath,
      modeMapPath: paths.modeMapPath,
      paths: {
        cache: paths.cachePath,
        telemetry: paths.telemetryPath,
        weights: paths.weightsPath,
        evolutionState: paths.evolutionStatePath,
        evolveTrigger: paths.evolveTriggerPath,
      },
    });

    assert.ok(out.evolution_visibility, 'doctor output must include evolution_visibility');
    assert.equal(out.evolution_visibility.weights.parse_status, 'ok');
    assert.equal(out.evolution_visibility.last_run.status, 'ok');
    assert.equal(out.evolution_visibility.trigger.exists, true);
    assert.equal(out.evolution_visibility.privacy.raw_prompt_text, false);
    assert.equal(out.evolution_visibility.privacy.raw_telemetry_lines, false);
    assert.ok(out.evolution_visibility.weight_reasons['gsd-debug'].reason_codes.includes('score_zero'));
    assertNoRawText(out.evolution_visibility);
  });
});

test('EVO-02: inspectDecision returns evolution visibility and does not mutate fixtures', () => {
  withTempDir((dir) => {
    const paths = writeRuntimeFixture(dir);
    const tracked = {
      modeMap: paths.modeMapPath,
      weights: paths.weightsPath,
      evolutionState: paths.evolutionStatePath,
      evolveTrigger: paths.evolveTriggerPath,
      telemetry: paths.telemetryPath,
      cache: paths.cachePath,
    };
    const before = routerFileSnapshots(tracked);
    const out = inspectDecision('debug bug failure', {
      cwd: dir,
      manifestPath: paths.manifestPath,
      modeMapPath: paths.modeMapPath,
      weightsPath: paths.weightsPath,
      cachePath: paths.cachePath,
      telemetryPath: paths.telemetryPath,
      includePrompt: false,
      mutateCache: false,
      logTelemetry: false,
      bumpEvolution: false,
      emitInjection: false,
    });
    const after = routerFileSnapshots(tracked);

    assert.deepEqual(after, before, 'inspectDecision must not mutate mode-map, weights, state, trigger, telemetry, or cache');
    assert.ok(out.evolution_visibility, 'inspect output must include evolution_visibility');
    assert.equal(out.evolution_visibility.selected_entry_id, 'gsd-debug');
    assert.ok(out.evolution_visibility.weight_reasons['gsd-debug'].reason_codes.includes('score_zero'));
    assert.equal(out.evolution_visibility.privacy.raw_prompt_text, false);
    assert.equal(out.normalized_prompt, '', 'includePrompt:false must not return normalized prompt text');
    assert.equal(out.prompt, undefined, 'includePrompt:false must not return raw prompt text');
    assertNoRawText(out.evolution_visibility);
  });
});

test('EVO-02: summarizeEvolutionVisibility reports malformed fixtures without throwing', () => {
  assert.equal(typeof summarizeEvolutionVisibility, 'function', 'router.mjs must export summarizeEvolutionVisibility');
  withTempDir((dir) => {
    const weightsPath = join(dir, 'bad-weights.json');
    const evolutionStatePath = join(dir, 'bad-state.json');
    const telemetryPath = join(dir, 'bad-telemetry.jsonl');
    const evolveTriggerPath = join(dir, '.missing-trigger');
    writeFileSync(weightsPath, '{not json', 'utf8');
    writeFileSync(evolutionStatePath, '{not json', 'utf8');
    writeFileSync(telemetryPath, '{not json}\n', 'utf8');

    assert.doesNotThrow(() => summarizeEvolutionVisibility({
      modeMap: fixtureModeMap(),
      paths: { weights: weightsPath, evolutionState: evolutionStatePath, telemetry: telemetryPath, evolveTrigger: evolveTriggerPath },
    }));
    const out = summarizeEvolutionVisibility({
      modeMap: fixtureModeMap(),
      paths: { weights: weightsPath, evolutionState: evolutionStatePath, telemetry: telemetryPath, evolveTrigger: evolveTriggerPath },
    });
    assert.equal(out.weights.parse_status, 'error');
    assert.equal(out.last_run.status, 'error');
    assert.equal(out.telemetry.parse_status, 'empty');
    assert.equal(out.trigger.exists, false);
    assert.equal(out.privacy.raw_prompt_text, false);
  });
});
