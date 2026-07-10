// Phase 06 Wave 0 RED contract: inspect/preview/explain-last command fixtures.
// These tests intentionally describe the required API/CLI surface before the
// implementation exists. Later Phase 06 plans make them green.
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
const ROUTER_DIR = join(homedir(), '.claude', 'router');
const CACHE_PATH = join(ROUTER_DIR, 'cache.json');
const TELEMETRY_PATH = join(ROUTER_DIR, 'telemetry.jsonl');
const EVOLVE_TRIGGER_PATH = join(ROUTER_DIR, '.evolve-trigger');

const mod = await import(HOOK);
const {
  inspectDecision,
  explainLastDecision,
  cacheKey,
  writeCache,
  saveCache,
  promptSignature,
} = mod;

function withTempDir(fn) {
  const dir = join(tmpdir(), `router-inspect-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  try {
    return fn(dir);
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

function fileSnapshot(path) {
  if (!existsSync(path)) {
    return { exists: false, size: 0, mtimeMs: 0, sha256: null };
  }
  const buf = readFileSync(path);
  const st = statSync(path);
  return {
    exists: true,
    size: st.size,
    mtimeMs: st.mtimeMs,
    sha256: createHash('sha256').update(buf).digest('hex'),
  };
}

function routerStateSnapshot() {
  return {
    cache: fileSnapshot(CACHE_PATH),
    telemetry: fileSnapshot(TELEMETRY_PATH),
    evolveTrigger: fileSnapshot(EVOLVE_TRIGGER_PATH),
  };
}

function assertStateUnchanged(before, after) {
  assert.deepEqual(after.cache, before.cache, 'preview must not mutate cache.json');
  assert.deepEqual(after.telemetry, before.telemetry, 'preview must not mutate telemetry.jsonl');
  assert.deepEqual(after.evolveTrigger, before.evolveTrigger, 'preview must not mutate .evolve-trigger');
}

function runRouterCommand(args, options = {}) {
  return spawnSync('node', [HOOK, ...args], {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
  });
}

function runJsonCommand(args, options = {}) {
  const result = runRouterCommand(args, options);
  assert.equal(result.status, 0, `command failed: ${result.stderr || result.stdout}`);
  assert.ok(result.stdout.trim(), 'command must print JSON to stdout');
  return JSON.parse(result.stdout);
}

function assertCandidateShape(candidate) {
  for (const field of ['id', 'name', 'raw_score', 'normalized_score', 'final_score']) {
    assert.ok(field in candidate, `candidate missing ${field}`);
  }
  assert.equal(typeof candidate.raw_score, 'number');
  assert.equal(typeof candidate.normalized_score, 'number');
  assert.equal(typeof candidate.final_score, 'number');
}

function assertInspectShape(out) {
  for (const field of [
    'normalized_prompt',
    'candidates',
    'margin',
    'thresholds',
    'selected_tier',
    'selected_route',
    'guards_fired',
    'cache',
    'graphify',
    'final_injected_context',
    'pass_through_reason',
  ]) {
    assert.ok(field in out, `inspect output missing ${field}`);
  }
  assert.equal(typeof out.normalized_prompt, 'string');
  assert.ok(Array.isArray(out.candidates), 'candidates must be an array');
  assert.ok(out.candidates.length > 0, 'inspect should expose top candidates');
  for (const c of out.candidates.slice(0, 3)) assertCandidateShape(c);
  assert.ok('T_high' in out.thresholds);
  assert.ok('T_low' in out.thresholds);
  assert.ok('M' in out.thresholds);
  assert.ok(Array.isArray(out.guards_fired));
  assert.ok(['hit', 'miss'].includes(out.cache.status));
  assert.equal(typeof out.cache.key_prefix, 'string');
  assert.ok(out.cache.key_prefix.length > 0);
  assert.equal(typeof out.cache.scoring_skipped, 'boolean');
  assert.ok(['not_triggered', 'graph_missing', 'ok', 'empty', 'error'].includes(out.graphify.status));
}

test('inspectDecision export: hit explanation includes full prompt-level contract', () => {
  assert.equal(typeof inspectDecision, 'function', 'router.mjs must export inspectDecision');
  const out = inspectDecision('fix the flaky router inspect test', {
    cwd: process.cwd(),
    mutateCache: false,
    logTelemetry: false,
    bumpEvolution: false,
    includePrompt: true,
  });
  assertInspectShape(out);
  assert.equal(out.normalized_prompt, 'fix the flaky router inspect test');
  assert.ok(out.selected_tier, 'selected_tier must be present for a scored hit');
  assert.ok(out.selected_route, 'selected_route must be present for a scored hit');
  assert.equal(typeof out.final_injected_context, 'string');
});

test('router inspect JSON: threshold miss/no-match explains pass-through reason', () => {
  const out = runJsonCommand(['inspect', '--json', 'zzzxxy untranslated one-off words']);
  assertInspectShape(out);
  assert.ok(out.pass_through_reason, 'pass-through reason required on no-match');
  assert.match(out.pass_through_reason, /threshold|no_match|low|margin|pass/i);
  assert.ok(['low', 'pass_through', null].includes(out.selected_tier));
});

test('router inspect JSON: guard demotion exposes mcp_demote and final warning route', () => {
  const out = runJsonCommand(['inspect', '--json', 'research the phase with context7 domain context']);
  assertInspectShape(out);
  assert.ok(
    out.guards_fired.some((g) => String(g).startsWith('mcp_demote:')),
    'guards_fired must include mcp_demote details',
  );
  assert.equal(out.selected_route.invoke_kind, 'warn');
  assert.match(out.final_injected_context, /needs MCP|wire it first|warning/i);
});

test('router inspect JSON: cache effect distinguishes hit from miss and skipped scoring', () => {
  withTempDir((dir) => {
    const cachePath = join(dir, 'cache.json');
    const sig = cacheKey('fix the cached route', [], 1, 2, 0, 0);
    let cache = { schema_version: 1, entries: {}, order: [], size: 0 };
    cache = writeCache(cache, sig, {
      id: 'debug',
      mode: 'gsd-debug',
      invoke_kind: 'slash',
      tier: 'high',
      recommended_skills: ['systematic-debugging'],
      recommended_agents: [],
      args_hint: '<bug description>',
    });
    saveCache(cache, cachePath);

    const hit = inspectDecision('fix the cached route', {
      cachePath,
      modeMapMtime: 1,
      manifestMtime: 2,
      graphMtime: 0,
      surfaceMtime: 0,
      mutateCache: false,
      logTelemetry: false,
    });
    assert.equal(hit.cache.status, 'hit');
    assert.equal(hit.cache.key_prefix, sig.slice(0, 8));
    assert.equal(hit.cache.scoring_skipped, true);
    assert.equal(hit.selected_route.mode, 'gsd-debug');

    const miss = inspectDecision('fix the uncached route', {
      cachePath,
      modeMapMtime: 1,
      manifestMtime: 2,
      graphMtime: 0,
      surfaceMtime: 0,
      mutateCache: false,
      logTelemetry: false,
    });
    assert.equal(miss.cache.status, 'miss');
    assert.equal(miss.cache.scoring_skipped, false);
  });
});

test('router inspect JSON: graphify reports not_triggered for non-code prompts', () => {
  const out = runJsonCommand(['inspect', '--json', 'thanks']);
  assert.equal(out.graphify.status, 'not_triggered');
  assert.equal(out.graphify.queried, false);
});

test('router inspect JSON: graph-triggered prompt reports graph status and symbols field', () => {
  withTempDir((dir) => {
    const graphDir = join(dir, 'graphify-out');
    mkdirSync(graphDir, { recursive: true });
    writeFileSync(join(graphDir, 'graph.json'), JSON.stringify({
      nodes: [
        { id: 'src/router.js', label: 'router', path: 'src/router.js', kind: 'file' },
        { id: 'src/router.js#inspectDecision', label: 'inspectDecision', path: 'src/router.js', kind: 'function' },
      ],
      edges: [
        { source: 'src/router.js', target: 'src/router.js#inspectDecision', kind: 'contains' },
      ],
    }), 'utf8');
    const out = runJsonCommand(['inspect', '--json', 'how does inspectDecision route codebase prompts'], { cwd: dir });
    assert.equal(out.graphify.queried, true);
    assert.ok(['ok', 'empty', 'graph_missing', 'error'].includes(out.graphify.status));
    assert.ok(Array.isArray(out.graphify.symbols), 'graphify.symbols must always be an array');
  });
});

test('router preview snapshots prove cache, telemetry, and evolution trigger are not mutated', () => {
  const before = routerStateSnapshot();
  const out = runJsonCommand(['preview', '--json', 'fix the flaky router preview test']);
  const after = routerStateSnapshot();
  assertInspectShape(out);
  assert.equal(out.preview, true);
  assertStateUnchanged(before, after);
});

test('explainLastDecision export reads latest valid telemetry line without raw prompt text', () => {
  assert.equal(typeof explainLastDecision, 'function', 'router.mjs must export explainLastDecision');
  withTempDir((dir) => {
    const telemetryPath = join(dir, 'telemetry.jsonl');
    const rawPrompt = 'human asked to inspect the secret trading router prompt';
    const signature = promptSignature(rawPrompt, ['inspect', 'router']);
    writeFileSync(telemetryPath, [
      '{not json}',
      JSON.stringify({
        ts: Date.now(),
        prompt_signature: signature,
        suggested_mode: 'gsd-debug',
        suggested_skills: ['systematic-debugging'],
        suggested_agents: [],
        confidence_tier: 'high',
        invoke_kind: 'slash',
        graphify_queried: false,
        graph_status: 'not_triggered',
        guards_fired: [],
        downstream_invocations: null,
        outcome: null,
        latency_ms: 3,
      }),
      '',
    ].join('\n'), 'utf8');
    const out = explainLastDecision({ telemetryPath });
    assert.equal(out.prompt_signature, signature);
    assert.equal(out.selected_route.mode, 'gsd-debug');
    assert.equal(out.confidence_tier, 'high');
    assert.ok(!JSON.stringify(out).includes(rawPrompt), 'explain-last must not expose raw prompt text');
  });
});

test('router explain-last CLI prints latest telemetry explanation without raw prompt text', () => {
  const rawPrompt = 'raw human prompt that must never be printed by explain-last';
  const signature = promptSignature(rawPrompt, ['explain']);
  const result = runRouterCommand(['explain-last', '--json']);
  assert.equal(result.status, 0, `explain-last failed: ${result.stderr || result.stdout}`);
  assert.ok(result.stdout.trim(), 'explain-last must print JSON');
  const out = JSON.parse(result.stdout);
  assert.ok('prompt_signature' in out, 'explain-last output must include prompt_signature');
  assert.ok('selected_route' in out, 'explain-last output must include route metadata');
  assert.ok('confidence_tier' in out, 'explain-last output must include confidence tier');
  assert.ok(!result.stdout.includes(rawPrompt), 'explain-last output must not contain raw prompt text');
  assert.notEqual(out.prompt_signature, rawPrompt);
  if (out.prompt_signature === signature) {
    assert.ok(!result.stdout.includes(rawPrompt), 'matching seeded signature still must not reveal prompt');
  }
});
