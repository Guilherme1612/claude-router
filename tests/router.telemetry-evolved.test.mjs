// Plan 03-02 / Task 1: 4 new telemetry fields + Phase 1 regression preservation.
// Verifies weight_applied, outcomes, and evolved_after land on each entry
// (D-23 / RESEARCH §11), and that the existing 13-field schema is preserved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOOK_ROOT = mkdtempSync(join(tmpdir(), 'router-telemetry-evolved-source-'));
const HOOK = join(HOOK_ROOT, 'router.mjs');
writeFileSync(HOOK, readFileSync(new URL('../src/runtime/router.mjs', import.meta.url)));
writeFileSync(join(HOOK_ROOT, 'router.evolve.mjs'), readFileSync(new URL('../src/runtime/router.evolve.mjs', import.meta.url)));
process.on('exit', () => rmSync(HOOK_ROOT, { recursive: true, force: true }));
const R = await import(HOOK);
const { logTelemetry } = R;

// --- Schema: 4 new fields present-but-null on first run --------------------
// (TEL-03 seam: the existing 13 fields are preserved, the 4 new fields
// are additive. Phase 1 regression must be zero.)
const SCHEMA_FIELDS = [
  'ts', 'prompt_signature', 'suggested_mode', 'suggested_skills',
  'suggested_agents', 'confidence_tier', 'invoke_kind', 'graphify_queried',
  'graph_status', 'guards_fired', 'downstream_invocations', 'outcome', 'latency_ms',
];
const NEW_FIELDS = ['weight_applied', 'outcomes', 'evolved_after'];

test('telemetry: 13 legacy fields still present after the Phase 3 add', () => {
  const dir = mkdtempSync(join(tmpdir(), 'router-tel-evo-legacy-'));
  try {
    const tPath = join(dir, 'telemetry.jsonl');
    const entry = {
      ts: 1750000000000,
      prompt_signature: 'abc123',
      suggested_mode: 'gsd-debug',
      suggested_skills: ['systematic-debugging'],
      suggested_agents: [],
      confidence_tier: 'high',
      invoke_kind: 'slash',
      graphify_queried: false,
      graph_status: 'graph_missing',
      guards_fired: [],
      downstream_invocations: null,
      outcome: null,
      latency_ms: 18,
      weight_applied: null,
      outcomes: null,
      evolved_after: null,
      cwd: process.cwd(),
    };
    logTelemetry(entry, tPath);
    const parsed = JSON.parse(readFileSync(tPath, 'utf8').trim());
    for (const f of SCHEMA_FIELDS) {
      assert.ok(f in parsed, `missing legacy field: ${f}`);
    }
    for (const f of NEW_FIELDS) {
      assert.ok(f in parsed, `missing new field: ${f}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('telemetry: weight_applied + outcomes are null on first run (before worker has populated weights.json)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'router-tel-evo-null-'));
  try {
    const tPath = join(dir, 'telemetry.jsonl');
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
        weight_applied: null,
        outcomes: null,
        evolved_after: new Date().toISOString(),
        cwd: process.cwd(),
      };
      logTelemetry(entry, tPath);
    }
    const lines = readFileSync(tPath, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 9, 'one line per tier');
    for (const line of lines) {
      const p = JSON.parse(line);
      assert.equal(p.weight_applied, null, `weight_applied not null for tier=${p.confidence_tier}`);
      assert.equal(p.outcomes, null, `outcomes not null for tier=${p.confidence_tier}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('telemetry: raw cwd is not persisted by the router entry builder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'router-tel-evo-cwd-'));
  try {
    const tPath = join(dir, 'telemetry.jsonl');
    logTelemetry({
      ts: 1, prompt_signature: 's', suggested_mode: null, suggested_skills: [],
      suggested_agents: [], confidence_tier: 'low', invoke_kind: null,
      graphify_queried: false, graph_status: 'not_triggered', guards_fired: [],
      downstream_invocations: null, outcome: null, latency_ms: 1,
      weight_applied: null, outcomes: null, evolved_after: null, cwd: process.cwd(),
    }, tPath);
    const p = JSON.parse(readFileSync(tPath, 'utf8').trim());
    assert.equal('cwd' in p, false);
    logTelemetry({ CWD: '/private/project' }, tPath);
    const lines = readFileSync(tPath, 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal('CWD' in lines.at(-1), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('telemetry: evolved_after is a valid ISO8601 string when set', () => {
  const dir = mkdtempSync(join(tmpdir(), 'router-tel-evo-iso-'));
  try {
    const tPath = join(dir, 'telemetry.jsonl');
    const iso = new Date().toISOString();
    logTelemetry({
      ts: Date.now(), prompt_signature: 's', suggested_mode: null, suggested_skills: [],
      suggested_agents: [], confidence_tier: 'low', invoke_kind: null,
      graphify_queried: false, graph_status: 'not_triggered', guards_fired: [],
      downstream_invocations: null, outcome: null, latency_ms: 1,
      weight_applied: null, outcomes: null, evolved_after: iso, cwd: process.cwd(),
    }, tPath);
    const p = JSON.parse(readFileSync(tPath, 'utf8').trim());
    assert.equal(p.evolved_after, iso);
    // Valid ISO8601 → Date can parse it
    const parsed = new Date(p.evolved_after);
    assert.ok(!isNaN(parsed.getTime()), 'evolved_after is parseable as a Date');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
