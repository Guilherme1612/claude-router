// Phase 09 Wave 0 RED contract: EVO-03/EVO-04 advisory proposals.
// These tests describe read-only proposal generation and privacy-preserving
// CLI output before implementation exists.
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
import { spawnSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const mod = await import(HOOK);
const { buildTelemetryProposals } = mod;

const RAW_PROMPT_FIXTURE = 'RAW_PHASE_09_PROPOSAL_PROMPT_DO_NOT_PRINT';
const RAW_DOWNSTREAM_FIXTURE = 'actually wrong redo it with sk-live-proposal-secret and ghp_phase09_secret';

function withTempDir(fn) {
  const dir = join(tmpdir(), `router-evo-proposal-${process.pid}-${Math.random().toString(36).slice(2)}`);
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

function fixtureModeMap() {
  return {
    schema_version: 2,
    thresholds: { T_high: 0.6, T_low: 0.3, M: 0.2 },
    entries: [
      {
        id: 'gsd-debug',
        mode: 'gsd-debug',
        invoke_kind: 'slash',
        signal_patterns: ['debug router failure'],
        recommended_skills: [],
        recommended_agents: [],
      },
      {
        id: 'gsd-review',
        mode: 'gsd-review',
        invoke_kind: 'slash',
        signal_patterns: ['review changed code'],
        recommended_skills: [],
        recommended_agents: [],
      },
    ],
  };
}

function writeRuntimeFixture(dir) {
  const paths = {
    modeMapPath: join(dir, 'mode-map.json'),
    weightsPath: join(dir, 'weights.json'),
    evolutionStatePath: join(dir, 'evolution-state.json'),
    evolveTriggerPath: join(dir, '.evolve-trigger'),
    telemetryPath: join(dir, 'telemetry.jsonl'),
  };
  writeJson(paths.modeMapPath, fixtureModeMap());
  writeJson(paths.weightsPath, {
    schema_version: 2,
    blend: 0.15,
    weights: { 'gsd-debug': { g: 0, b: 6, u: 1, score: 0 } },
  });
  writeJson(paths.evolutionStatePath, {
    schema_version: 1,
    last_run: '2026-07-11T02:00:00.000Z',
    proposal_counts: { add: 0, edit: 0, prune: 0 },
  });
  writeFileSync(paths.evolveTriggerPath, '143', 'utf8');
  const lines = [];
  for (let i = 0; i < 6; i++) {
    lines.push(JSON.stringify({
      ts: 1000 + i,
      prompt_signature: `sig-add-${i}`,
      suggested_mode: 'gsd-debug',
      confidence_tier: 'low',
      selected_route: { id: 'gsd-debug' },
      outcome: 'unknown',
      downstream_event: RAW_DOWNSTREAM_FIXTURE,
      prompt: RAW_PROMPT_FIXTURE,
      cwd: dir,
    }));
  }
  for (let i = 0; i < 8; i++) {
    lines.push(JSON.stringify({
      ts: 2000 + i,
      prompt_signature: `sig-edit-${i}`,
      suggested_mode: 'gsd-debug',
      confidence_tier: 'high',
      selected_route: { id: 'gsd-debug' },
      outcome: 'bad',
      downstream_event: RAW_DOWNSTREAM_FIXTURE,
      cwd: dir,
    }));
  }
  writeFileSync(paths.telemetryPath, `${lines.join('\n')}\n`, 'utf8');
  return paths;
}

function assertNoRawProposalText(value) {
  const text = JSON.stringify(value);
  for (const forbidden of [
    RAW_PROMPT_FIXTURE,
    RAW_DOWNSTREAM_FIXTURE,
    'sk-live-proposal-secret',
    'ghp_phase09_secret',
  ]) {
    assert.ok(!text.includes(forbidden), `proposal output leaked forbidden text: ${forbidden}`);
  }
}

function assertNoForbiddenFields(value, path = '$') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(
      !['prompt', 'raw_prompt', 'raw', 'downstream_event', 'telemetry_line'].includes(key),
      `proposal output must not contain forbidden field ${path}.${key}`,
    );
    assertNoForbiddenFields(child, `${path}.${key}`);
  }
}

function assertProposalShape(out) {
  assert.equal(out.status, 'ok');
  assert.equal(out.advisory, true, 'proposal mode must be advisory');
  assert.ok(out.privacy, 'proposal output must include privacy metadata');
  assert.equal(out.privacy.raw_prompt_text, false);
  assert.equal(out.privacy.raw_lines, false);
  assert.equal(out.privacy.raw_telemetry_lines, false);
  assert.match(out.privacy.note, /telemetry-metadata-derived/);
  assert.equal(out.applied, false);
  assert.equal(typeof out.generated_at, 'string');
  assert.equal(typeof out.window_minutes, 'number');
  assert.ok(out.proposal_counts && typeof out.proposal_counts === 'object', 'proposal output must include proposal_counts');
  assert.ok(Array.isArray(out.proposals), 'proposal output must include proposals array');
  assert.ok(out.source_counts && typeof out.source_counts === 'object', 'proposal output must include source_counts');
  assert.equal(out.proposal_counts.total, out.proposals.length);
  assert.ok(out.counts && typeof out.counts === 'object', 'proposal output must include counts');
  assert.ok(Array.isArray(out.suggestions), 'proposal output must include suggestions array');
  assert.deepEqual(out.counts, out.proposal_counts, 'legacy counts alias must match proposal_counts');
  assert.deepEqual(out.suggestions, out.proposals, 'legacy suggestions alias must match proposals');
  assert.ok(out.suggestions.length > 0, 'fixture should produce proposal suggestions');
  for (const suggestion of out.suggestions) {
    assert.equal(typeof suggestion.type, 'string');
    assert.equal(typeof suggestion.kind, 'string');
    assert.equal(suggestion.kind, suggestion.type);
    assert.ok('entry_id' in suggestion || 'mode_id' in suggestion, 'suggestion must identify an entry or mode');
    assert.ok(Array.isArray(suggestion.reason_codes), 'suggestion must include reason codes');
    assert.equal(typeof suggestion.confidence, 'number');
    assert.ok(suggestion.counts && typeof suggestion.counts === 'object', 'suggestion must include counts');
    assert.ok(Array.isArray(suggestion.suggested_patterns), 'suggestion must include suggested_patterns');
    assert.equal(typeof suggestion.privacy_note, 'string');
    if ('signal_patterns' in suggestion) {
      assert.ok(Array.isArray(suggestion.signal_patterns), 'signal_patterns must be an array');
      for (const pattern of suggestion.signal_patterns) {
        assert.equal(typeof pattern, 'string');
        assert.ok(pattern.length <= 80, 'signal pattern summaries must be bounded');
      }
    }
  }
  assertNoForbiddenFields(out);
  assertNoRawProposalText(out);
}

test('EVO-03/EVO-04: buildTelemetryProposals export returns advisory private suggestions without mutation', () => {
  assert.equal(typeof buildTelemetryProposals, 'function', 'router.mjs must export buildTelemetryProposals');
  withTempDir((dir) => {
    const paths = writeRuntimeFixture(dir);
    const tracked = {
      modeMap: paths.modeMapPath,
      weights: paths.weightsPath,
      evolutionState: paths.evolutionStatePath,
      evolveTrigger: paths.evolveTriggerPath,
      telemetry: paths.telemetryPath,
    };
    const before = routerFileSnapshots(tracked);
    const out = buildTelemetryProposals({
      telemetryPath: paths.telemetryPath,
      modeMapPath: paths.modeMapPath,
      weightsPath: paths.weightsPath,
      evolutionStatePath: paths.evolutionStatePath,
      triggerPath: paths.evolveTriggerPath,
    });
    const after = routerFileSnapshots(tracked);

    assert.deepEqual(after, before, 'buildTelemetryProposals must not mutate mode-map, weights, evolution state, trigger, or telemetry');
    assertProposalShape(out);
  });
});

test('EVO-03/EVO-04: router proposals --json is read-only and privacy-preserving', () => {
  withTempDir((dir) => {
    const paths = writeRuntimeFixture(dir);
    const tracked = {
      modeMap: paths.modeMapPath,
      weights: paths.weightsPath,
      evolutionState: paths.evolutionStatePath,
      evolveTrigger: paths.evolveTriggerPath,
      telemetry: paths.telemetryPath,
    };
    const before = routerFileSnapshots(tracked);
    const result = spawnSync('node', [HOOK, 'proposals', '--json'], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        ROUTER_TEST_MODE_MAP_PATH: paths.modeMapPath,
        ROUTER_TEST_WEIGHTS_PATH: paths.weightsPath,
        ROUTER_TEST_EVOLUTION_STATE_PATH: paths.evolutionStatePath,
        ROUTER_TEST_EVOLVE_TRIGGER_PATH: paths.evolveTriggerPath,
        ROUTER_TEST_TELEMETRY_PATH: paths.telemetryPath,
      },
      timeout: 5000,
    });
    const after = routerFileSnapshots(tracked);

    assert.equal(result.status, 0, `proposals --json failed: ${result.stderr || result.stdout}`);
    assert.ok(result.stdout.trim(), 'proposals --json must print JSON');
    assert.equal(result.stderr, '', 'proposals --json must not print stderr diagnostics');
    assert.deepEqual(after, before, 'proposals --json must not mutate mode-map, weights, evolution state, trigger, or telemetry');
    assertProposalShape(JSON.parse(result.stdout));
  });
});

test('EVO-03: proposal CLI aliases return the same advisory shape', () => {
  withTempDir((dir) => {
    const paths = writeRuntimeFixture(dir);
    const env = {
      ...process.env,
      ROUTER_TEST_MODE_MAP_PATH: paths.modeMapPath,
      ROUTER_TEST_WEIGHTS_PATH: paths.weightsPath,
      ROUTER_TEST_EVOLUTION_STATE_PATH: paths.evolutionStatePath,
      ROUTER_TEST_EVOLVE_TRIGGER_PATH: paths.evolveTriggerPath,
      ROUTER_TEST_TELEMETRY_PATH: paths.telemetryPath,
    };
    const primary = spawnSync('node', [HOOK, 'proposals', '--json'], {
      cwd: dir,
      encoding: 'utf8',
      env,
      timeout: 5000,
    });
    assert.equal(primary.status, 0, `proposals --json failed: ${primary.stderr || primary.stdout}`);
    const primaryOut = JSON.parse(primary.stdout);
    for (const alias of ['proposal', 'evolve-proposals']) {
      const result = spawnSync('node', [HOOK, alias, '--json'], {
        cwd: dir,
        encoding: 'utf8',
        env,
        timeout: 5000,
      });
      assert.equal(result.status, 0, `${alias} --json failed: ${result.stderr || result.stdout}`);
      const out = JSON.parse(result.stdout);
      assertProposalShape(out);
      assert.deepEqual(out.proposal_counts, primaryOut.proposal_counts, `${alias} counts must match primary command`);
      assert.deepEqual(out.proposals, primaryOut.proposals, `${alias} proposals must match primary command`);
    }
  });
});

test('EVO-04: proposal output rejects raw prompt, raw telemetry, downstream event, and long free-text fields', () => {
  assert.equal(typeof buildTelemetryProposals, 'function', 'router.mjs must export buildTelemetryProposals');
  withTempDir((dir) => {
    const paths = writeRuntimeFixture(dir);
    const out = buildTelemetryProposals({
      telemetryPath: paths.telemetryPath,
      modeMapPath: paths.modeMapPath,
      weightsPath: paths.weightsPath,
      evolutionStatePath: paths.evolutionStatePath,
      triggerPath: paths.evolveTriggerPath,
    });
    assertProposalShape(out);
    for (const suggestion of out.suggestions) {
      const sampleFields = Object.entries(suggestion)
        .filter(([key, value]) => typeof value === 'string' && /sample|text|event|line/i.test(key))
        .map(([, value]) => value);
      assert.equal(sampleFields.length, 0, 'proposal suggestions must not include free-text sample fields');
    }
  });
});

test('EVO-03: buildTelemetryProposals reports malformed telemetry as status instead of mutating state', () => {
  assert.equal(typeof buildTelemetryProposals, 'function', 'router.mjs must export buildTelemetryProposals');
  withTempDir((dir) => {
    const paths = writeRuntimeFixture(dir);
    writeFileSync(paths.telemetryPath, '{not json}\n[still not json]\n', 'utf8');
    const before = routerFileSnapshots({
      modeMap: paths.modeMapPath,
      weights: paths.weightsPath,
      evolutionState: paths.evolutionStatePath,
      evolveTrigger: paths.evolveTriggerPath,
      telemetry: paths.telemetryPath,
    });
    assert.doesNotThrow(() => buildTelemetryProposals({
      telemetryPath: paths.telemetryPath,
      modeMapPath: paths.modeMapPath,
      weightsPath: paths.weightsPath,
      evolutionStatePath: paths.evolutionStatePath,
      triggerPath: paths.evolveTriggerPath,
    }));
    const out = buildTelemetryProposals({
      telemetryPath: paths.telemetryPath,
      modeMapPath: paths.modeMapPath,
      weightsPath: paths.weightsPath,
      evolutionStatePath: paths.evolutionStatePath,
      triggerPath: paths.evolveTriggerPath,
    });
    const after = routerFileSnapshots({
      modeMap: paths.modeMapPath,
      weights: paths.weightsPath,
      evolutionState: paths.evolutionStatePath,
      evolveTrigger: paths.evolveTriggerPath,
      telemetry: paths.telemetryPath,
    });
    assert.equal(out.status, 'empty');
    assert.deepEqual(after, before, 'malformed proposal input must still be read-only');
    assert.equal(out.privacy.raw_prompt_text, false);
    assert.equal(out.privacy.raw_telemetry_lines, false);
  });
});
