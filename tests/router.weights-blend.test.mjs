// Plan 03-02 / Task 1: loadWeights + applyWeightBlend unit tests.
// 3-arg signature per RESEARCH §3 (LOCKED). Mirrors the pattern from
// tests/router.bm25.test.mjs / router.normalize.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const R = await import('../src/runtime/router.mjs');
const { loadWeights, applyWeightBlend, setModeMapForBlend } = R;

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'router-wb-'));
  try {
    return fn(dir);
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

// --- loadWeights ----------------------------------------------------------

test('loadWeights: returns null when file is missing', () => {
  withTempDir((dir) => {
    const p = join(dir, 'no-such.json');
    assert.equal(loadWeights(p), null);
  });
});

test('loadWeights: returns null on malformed JSON (no throw)', () => {
  withTempDir((dir) => {
    const p = join(dir, 'bad.json');
    writeFileSync(p, '{not valid');
    assert.equal(loadWeights(p), null);
  });
});

test('loadWeights: accepts schema_version 1 (empty weights, parsed object returned)', () => {
  withTempDir((dir) => {
    const p = join(dir, 'w.json');
    writeFileSync(p, JSON.stringify({ schema_version: 1, weights: {} }));
    const w = loadWeights(p);
    assert.ok(w);
    assert.equal(w.schema_version, 1);
    assert.deepEqual(w.weights, {});
  });
});

test('loadWeights: accepts schema_version 2 (full schema, parsed object returned)', () => {
  withTempDir((dir) => {
    const p = join(dir, 'w.json');
    const obj = {
      schema_version: 2,
      blend: 0.15,
      decay_days: 14,
      updated_at: '2026-07-01T00:00:00.000Z',
      weights: { 'gsd-debug': { g: 5, b: 1, u: 0, score: 5 / 6, updated_at: '2026-07-01T00:00:00.000Z' } },
    };
    writeFileSync(p, JSON.stringify(obj));
    const w = loadWeights(p);
    assert.ok(w);
    assert.equal(w.schema_version, 2);
    assert.equal(w.blend, 0.15);
    assert.equal(w.weights['gsd-debug'].g, 5);
  });
});

test('loadWeights: returns null on schema_version 3+ (forward-incompatible)', () => {
  withTempDir((dir) => {
    const p = join(dir, 'w.json');
    writeFileSync(p, JSON.stringify({ schema_version: 3, weights: {} }));
    assert.equal(loadWeights(p), null);
  });
});

test('loadWeights: synthesizes empty weights object when missing', () => {
  withTempDir((dir) => {
    const p = join(dir, 'w.json');
    writeFileSync(p, JSON.stringify({ schema_version: 2, blend: 0.15 }));
    const w = loadWeights(p);
    assert.ok(w);
    assert.deepEqual(w.weights, {});
  });
});

// --- applyWeightBlend (3-arg LOCKED signature) ----------------------------

test('applyWeightBlend: returns input unchanged when weights is null (3-arg form)', () => {
  const normed = [{ entry: { id: 'gsd-debug' }, name: 'gsd-debug', score: 1, norm: 1 }];
  const out = applyWeightBlend(normed, null, 0.15);
  // Same array reference, no-op when weights missing
  assert.equal(out, normed);
});

test('applyWeightBlend: returns new array (no input mutation) when weights present (3-arg form)', () => {
  setModeMapForBlend({ entries: [{ id: 'gsd-debug', invoke_kind: 'slash' }] });
  const normed = [{ entry: { id: 'gsd-debug' }, name: 'gsd-debug', score: 1, norm: 1 }];
  const weights = { weights: { 'gsd-debug': { g: 10, b: 0, u: 0, score: 1.0, updated_at: 'x' } } };
  const out = applyWeightBlend(normed, weights, 0.15);
  assert.notEqual(out, normed);
  assert.equal(normed[0].norm, 1, 'input was not mutated');
  // s' = (1 - 0.15) * 1 + 0.15 * 1.0 = 1.0
  assert.equal(out[0].norm, 1);
  assert.equal(out[0].weight_applied, 1.0);
});

test('applyWeightBlend: computes s_prime = (1-blend)*s + blend*w(e).score (3-arg form)', () => {
  setModeMapForBlend({ entries: [{ id: 'gsd-debug', invoke_kind: 'slash' }] });
  const normed = [
    { entry: { id: 'gsd-debug' }, name: 'gsd-debug', score: 2, norm: 0.8 },
    { entry: { id: 'gsd-ship' }, name: 'gsd-ship', score: 1.6, norm: 0.4 },
  ];
  const weights = {
    weights: {
      'gsd-debug': { g: 8, b: 2, u: 0, score: 0.8, updated_at: 'x' },
      'gsd-ship': { g: 1, b: 4, u: 0, score: 0.2, updated_at: 'x' },
    },
  };
  const out = applyWeightBlend(normed, weights, 0.15);
  // gsd-debug: 0.85*0.8 + 0.15*0.8 = 0.8
  assert.ok(Math.abs(out[0].norm - 0.8) < 1e-9);
  // gsd-ship: 0.85*0.4 + 0.15*0.2 = 0.37
  assert.ok(Math.abs(out[1].norm - 0.37) < 1e-9);
});

test('applyWeightBlend: skips candidates with invoke_kind=warn (D-12)', () => {
  setModeMapForBlend({ entries: [{ id: 'gsd-debug', invoke_kind: 'warn' }] });
  const normed = [{ entry: { id: 'gsd-debug' }, name: 'gsd-debug', score: 1, norm: 1 }];
  const weights = { weights: { 'gsd-debug': { g: 10, b: 0, score: 1.0, updated_at: 'x' } } };
  const out = applyWeightBlend(normed, weights, 0.15);
  // D-12: warn kind → no weights applied, norm unchanged
  assert.equal(out[0].norm, 1);
  assert.equal(out[0].weight_applied, undefined);
});

test('applyWeightBlend: returns input unchanged for candidates with no weight entry (D-09 cold-start)', () => {
  setModeMapForBlend({ entries: [{ id: 'gsd-debug', invoke_kind: 'slash' }] });
  const normed = [
    { entry: { id: 'gsd-debug' }, name: 'gsd-debug', score: 1, norm: 1 },
    { entry: { id: 'gsd-unknown' }, name: 'gsd-unknown', score: 0.5, norm: 0.5 },
  ];
  const weights = { weights: { 'gsd-debug': { g: 10, b: 0, score: 1.0, updated_at: 'x' } } };
  const out = applyWeightBlend(normed, weights, 0.15);
  // First: gsd-debug has weight → blended; second: no weight → unchanged
  assert.ok(out[0].norm !== undefined);
  assert.equal(out[1].norm, 0.5);
  assert.equal(out[1].weight_applied, undefined);
});

test('applyWeightBlend: preserves input entry field on each candidate (downstream hasCanonicalMatch/applyGuards)', () => {
  setModeMapForBlend({ entries: [{ id: 'gsd-debug', invoke_kind: 'slash' }] });
  const originalEntry = { id: 'gsd-debug', name: 'gsd-debug', description: 'a description' };
  const normed = [{ entry: originalEntry, name: 'gsd-debug', score: 1, norm: 1 }];
  const weights = { weights: { 'gsd-debug': { g: 5, b: 1, score: 0.83, updated_at: 'x' } } };
  const out = applyWeightBlend(normed, weights, 0.15);
  assert.equal(out[0].entry, originalEntry);
  assert.equal(out[0].entry.id, 'gsd-debug');
});

test('applyWeightBlend: uses default blend=0.15 when omitted', () => {
  setModeMapForBlend({ entries: [{ id: 'gsd-debug', invoke_kind: 'slash' }] });
  const normed = [{ entry: { id: 'gsd-debug' }, name: 'gsd-debug', score: 1, norm: 1 }];
  const weights = { weights: { 'gsd-debug': { g: 5, b: 5, score: 0.5, updated_at: 'x' } } };
  const out = applyWeightBlend(normed, weights); // no blend arg
  // 0.85 * 1 + 0.15 * 0.5 = 0.925
  assert.ok(Math.abs(out[0].norm - 0.925) < 1e-9);
});
