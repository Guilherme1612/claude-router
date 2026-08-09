// Task 1: Telemetry schema test (D-20/TEL-01/02/03). Verifies the exact JSON
// line schema from §9: every field present, outcome + downstream_invocations
// null v1 (seam preservation — TEL-03), confidence_tier vocabulary, deny_filtered
// → prompt_signature null, atomic appendFileSync (not writeFileSync).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync as readSync } from 'node:fs';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const { logTelemetry, promptSignature, redact } = await import(HOOK);

// --- Schema: every §9 field present -----------------------------------------
const SCHEMA_FIELDS = [
    'ts', 'prompt_signature', 'suggested_mode', 'suggested_skills',
  'suggested_agents', 'route_id', 'confidence_tier', 'invoke_kind', 'graphify_queried',
  'graph_status', 'guards_fired', 'downstream_invocations', 'outcome', 'latency_ms',
];

test('telemetry: line has all §9 schema fields', () => {
  const dir = mkdtempSync(join(tmpdir(), 'router-tel-schema-'));
  const tPath = join(dir, 'telemetry.jsonl');
  try {
    const entry = {
      ts: 1750000000000,
      prompt_signature: 'abc123',
      suggested_mode: 'gsd-debug',
      suggested_skills: ['systematic-debugging'],
      suggested_agents: [],
      route_id: 'gsd-debug',
      confidence_tier: 'high',
      invoke_kind: 'slash',
      graphify_queried: false,
      graph_status: 'graph_missing',
      guards_fired: ['mcp_demote:gsd-phase-researcher:context7'],
      downstream_invocations: null,
      outcome: null,
      latency_ms: 18,
    };
    logTelemetry(entry, tPath);
    const parsed = JSON.parse(readFileSync(tPath, 'utf8').trim());
    for (const f of SCHEMA_FIELDS) {
      assert.ok(f in parsed, `missing field: ${f}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- TEL-03: outcome + downstream_invocations null v1 -----------------------
test('telemetry: outcome + downstream_invocations are null v1 (TEL-03 seam)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'router-tel-null-'));
  const tPath = join(dir, 'telemetry.jsonl');
  try {
    for (const tier of ['high', 'medium', 'low', 'trivial', 'user_explicit', 'stale', 'manifest_missing', 'reentry_skipped', 'deny_filtered']) {
      const entry = {
        ts: Date.now(),
        prompt_signature: tier === 'deny_filtered' ? null : 'sig-' + tier,
        suggested_mode: null,
        suggested_skills: [],
        suggested_agents: [],
        confidence_tier: tier,
        invoke_kind: null,
        graphify_queried: false,
        graph_status: 'not_triggered',
        guards_fired: tier === 'deny_filtered' ? ['deny_filtered'] : [],
        downstream_invocations: null,
        outcome: null,
        latency_ms: 1,
      };
      logTelemetry(entry, tPath);
    }
    const lines = readFileSync(tPath, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 9, 'one line per tier');
    for (const line of lines) {
      const p = JSON.parse(line);
      assert.equal(p.outcome, null, `outcome not null for tier=${p.confidence_tier}`);
      assert.equal(p.downstream_invocations, null, `downstream_invocations not null for tier=${p.confidence_tier}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- confidence_tier vocabulary ---------------------------------------------
test('telemetry: confidence_tier is one of the 9 valid values', () => {
  const valid = new Set(['high', 'medium', 'low', 'trivial', 'user_explicit', 'stale', 'manifest_missing', 'reentry_skipped', 'deny_filtered']);
  const dir = mkdtempSync(join(tmpdir(), 'router-tel-vocab-'));
  const tPath = join(dir, 'telemetry.jsonl');
  try {
    for (const tier of valid) {
      logTelemetry({
        ts: 1, prompt_signature: null, suggested_mode: null, suggested_skills: [],
        suggested_agents: [], confidence_tier: tier, invoke_kind: null,
        graphify_queried: false, graph_status: 'not_triggered', guards_fired: [],
        downstream_invocations: null, outcome: null, latency_ms: 1,
      }, tPath);
    }
    const lines = readFileSync(tPath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      const p = JSON.parse(line);
      assert.ok(valid.has(p.confidence_tier), `invalid tier: ${p.confidence_tier}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- deny_filtered → prompt_signature null ----------------------------------
test('telemetry: deny_filtered line has prompt_signature=null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'router-tel-deny-'));
  const tPath = join(dir, 'telemetry.jsonl');
  try {
    logTelemetry({
      ts: 1, prompt_signature: null, suggested_mode: null, suggested_skills: [],
      suggested_agents: [], confidence_tier: 'deny_filtered', invoke_kind: null,
      graphify_queried: false, graph_status: 'not_triggered',
      guards_fired: ['deny_filtered'], downstream_invocations: null, outcome: null, latency_ms: 1,
    }, tPath);
    const p = JSON.parse(readFileSync(tPath, 'utf8').trim());
    assert.equal(p.prompt_signature, null);
    assert.equal(p.confidence_tier, 'deny_filtered');
    assert.deepEqual(p.guards_fired, ['deny_filtered']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- graph_status vocabulary ------------------------------------------------
test('telemetry: graph_status is one of not_triggered|graph_missing|graph_error', () => {
  const valid = new Set(['not_triggered', 'graph_missing', 'graph_error', 'queried']);
  // Phase 1 only emits the first three; 'queried' reserved for Phase 2.
  const dir = mkdtempSync(join(tmpdir(), 'router-tel-graph-'));
  const tPath = join(dir, 'telemetry.jsonl');
  try {
    for (const gs of ['not_triggered', 'graph_missing', 'graph_error']) {
      logTelemetry({
        ts: 1, prompt_signature: 's', suggested_mode: null, suggested_skills: [],
        suggested_agents: [], confidence_tier: 'low', invoke_kind: null,
        graphify_queried: gs !== 'not_triggered', graph_status: gs, guards_fired: [],
        downstream_invocations: null, outcome: null, latency_ms: 1,
      }, tPath);
    }
    const lines = readFileSync(tPath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      const p = JSON.parse(line);
      assert.ok(valid.has(p.graph_status), `invalid graph_status: ${p.graph_status}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- promptSignature shape: 64-char hex (sha256) ----------------------------
test('telemetry: promptSignature returns a 64-char hex sha256', () => {
  const sig = promptSignature('a normalized prompt about debugging', ['debug', 'flaky']);
  assert.match(sig, /^[0-9a-f]{64}$/, 'sha256 hex digest');
  // Stable
  assert.equal(sig, promptSignature('a normalized prompt about debugging', ['debug', 'flaky']));
  // Differs on different input
  assert.notEqual(sig, promptSignature('a different prompt', ['debug', 'flaky']));
});

// --- redact replaces all known secret shapes -------------------------------
test('telemetry: redact replaces all known secret shapes (no raw secret remains)', () => {
  const cases = [
    'sk-live-1234567890abcdefghijklmnop',
    'AKIAIOSFODNN7EXAMPLE',
    'ghp_0123456789012345678901234567890abcdef12',
    'xoxb-1234567890-1234567890123-abcdefghij123456',
    'gho_0123456789012345678901234567890abcdef12',
    'glpat-0123456789abcdefghij',
    'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', // 64 hex
  ];
  for (const c of cases) {
    const r = redact(c);
    assert.ok(!r.includes(c), `redact leaked the raw secret: ${c}`);
    assert.ok(r.includes('[REDACTED]'), `redact did not emit [REDACTED] for: ${c} (got: ${r})`);
  }
});

// --- weights.json schema -----------------------------------------------------
test('telemetry: weights.json uses the current schema with a weights object', () => {
  const weightsPath = join(homedir(), '.claude', 'router', 'weights.json');
  const w = JSON.parse(readSync(weightsPath, 'utf8'));
  assert.equal(w.schema_version, 2);
  assert.equal(typeof w.weights, 'object');
  assert.notEqual(w.weights, null);
});
