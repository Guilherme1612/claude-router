import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const evidenceUrl = new URL('../src/evolution/evidence.mjs', import.meta.url);

function validSignal(overrides = {}) {
  return {
    timestamp_ms: 1_750_000_000_000,
    route_id: 'gsd-debug',
    confidence_band: 'high',
    guard_codes: [],
    reason_code: 'route_selected',
    fixture_class: 'minimal-prompt',
    latency_us: 24_000,
    candidate_version: 'steady-state-v1',
    policy_version: 'workflow-transitions-v1',
    verdict: 'success',
    prompt_signature: 'a'.repeat(64),
    ...overrides,
  };
}

function uniqueRoot() {
  return mkdtempSync(join(tmpdir(), 'evidence-persist-'));
}

test('Task2.1 append routes by scope to separate files; aggregate requires eligibility', async () => {
  const { createPersistentEvidenceStore } = await import(evidenceUrl);
  const root = uniqueRoot();
  try {
    const store = createPersistentEvidenceStore({ root, now: () => 1_750_000_000_000 });
    // project scope → project-proj-A.jsonl
    const r1 = store.append(validSignal(), { scope: 'project', project_id: 'proj-A' });
    assert.equal(r1.status, 'stored');
    assert.ok(existsSync(join(root, 'project-proj-A.jsonl')));
    // aggregate scope eligible → aggregate.jsonl
    const r2 = store.append(validSignal(), { scope: 'aggregate', aggregate_eligible: true });
    assert.equal(r2.status, 'stored');
    assert.ok(existsSync(join(root, 'aggregate.jsonl')));
    // aggregate scope without eligibility → denied, writes nothing new
    const before = readFileSync(join(root, 'aggregate.jsonl'), 'utf8').split('\n').filter(Boolean).length;
    const r3 = store.append(validSignal(), { scope: 'aggregate' });
    assert.equal(r3.status, 'denied');
    assert.equal(r3.reason_code, 'aggregate_eligibility_required');
    const after = readFileSync(join(root, 'aggregate.jsonl'), 'utf8').split('\n').filter(Boolean).length;
    assert.equal(after, before, 'no line written for ineligible aggregate append');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Task2.2 scope isolation — project-A records never appear in project-B window', async () => {
  const { createPersistentEvidenceStore } = await import(evidenceUrl);
  const root = uniqueRoot();
  try {
    const now = 1_750_000_000_000;
    const store = createPersistentEvidenceStore({ root, now: () => now });
    store.append(validSignal(), { scope: 'project', project_id: 'proj-A' });
    store.append(validSignal(), { scope: 'project', project_id: 'proj-A' });
    store.append(validSignal(), { scope: 'project', project_id: 'proj-B' });
    const winA = store.window({ scope: 'project', project_id: 'proj-A' });
    const winB = store.window({ scope: 'project', project_id: 'proj-B' });
    assert.equal(winA.sample_count, 2);
    assert.equal(winB.sample_count, 1);
    // project-A window never contains proj-B records
    assert.ok(winA.observations.every((o) => o.signal.route_id === 'gsd-debug'));
    assert.ok(winA.observations.every((o) => o.scope.project_id === 'proj-A'));
    assert.ok(winB.observations.every((o) => o.scope.project_id === 'proj-B'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Task2.3 retention — records older than 7d are excluded from window', async () => {
  const { createPersistentEvidenceStore, MAX_RETENTION_MS } = await import(evidenceUrl);
  const root = uniqueRoot();
  try {
    let clock = 1_750_000_000_000;
    const store = createPersistentEvidenceStore({ root, now: () => clock });
    // Append an old record
    store.append(validSignal({ timestamp_ms: clock - (MAX_RETENTION_MS + 1000) }), { scope: 'project', project_id: 'p' });
    // Window with only old records → insufficient
    const win = store.window({ scope: 'project', project_id: 'p' });
    assert.equal(win.sample_count, 0);
    assert.equal(win.sufficient, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Task2.4 decay — weighted_samples matches exponential-half-life-v1 formula', async () => {
  const { createPersistentEvidenceStore, HALF_LIFE_MS } = await import(evidenceUrl);
  const root = uniqueRoot();
  try {
    const now = 1_750_000_000_000;
    const store = createPersistentEvidenceStore({ root, now: () => now });
    const ageMs = 3 * 60 * 60 * 1000; // 3h
    store.append(validSignal({ timestamp_ms: now - ageMs }), { scope: 'project', project_id: 'p' });
    const win = store.window({ scope: 'project', project_id: 'p' });
    const expected = 2 ** (-ageMs / HALF_LIFE_MS);
    assert.ok(Math.abs(win.weighted_samples - expected) < 1e-9, `weighted_samples ${win.weighted_samples} != expected ${expected}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Task2.5 floor — window.sufficient false below 30 samples, true at ≥30', async () => {
  const { createPersistentEvidenceStore } = await import(evidenceUrl);
  const root = uniqueRoot();
  try {
    const now = 1_750_000_000_000;
    const store = createPersistentEvidenceStore({ root, now: () => now, minimum_samples: 30 });
    for (let i = 0; i < 29; i++) {
      store.append(validSignal({ timestamp_ms: now - i * 1000 }), { scope: 'project', project_id: 'p' });
    }
    let win = store.window({ scope: 'project', project_id: 'p' });
    assert.equal(win.sample_count, 29);
    assert.equal(win.sufficient, false);
    store.append(validSignal({ timestamp_ms: now }), { scope: 'project', project_id: 'p' });
    win = store.window({ scope: 'project', project_id: 'p' });
    assert.equal(win.sample_count, 30);
    assert.equal(win.sufficient, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Task2.6 fingerprint integrity — disk window fingerprint matches in-memory', async () => {
  const { createPersistentEvidenceStore, evidenceWindowFingerprint, createEvidenceStore } = await import(evidenceUrl);
  const root = uniqueRoot();
  try {
    const now = 1_750_000_000_000;
    const diskStore = createPersistentEvidenceStore({ root, now: () => now });
    const memStore = createEvidenceStore({ now: () => now });
    for (let i = 0; i < 3; i++) {
      const sig = validSignal({ timestamp_ms: now - i * 1000 });
      diskStore.append(sig, { scope: 'project', project_id: 'p' });
      memStore.append(sig, { scope: 'project', project_id: 'p' });
    }
    const diskWin = diskStore.window({ scope: 'project', project_id: 'p' });
    const memWin = memStore.window({ scope: 'project', project_id: 'p' });
    assert.equal(diskWin.source_evidence_fingerprint, memWin.source_evidence_fingerprint);
    // evidenceWindowFingerprint exported function also matches
    assert.equal(evidenceWindowFingerprint(diskWin), diskWin.source_evidence_fingerprint);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Task2.7 forbidden field rejection before persistence — no leak on disk', async () => {
  const { createPersistentEvidenceStore } = await import(evidenceUrl);
  const root = uniqueRoot();
  try {
    const store = createPersistentEvidenceStore({ root, now: () => 1_750_000_000_000 });
    const denied = store.append({ ...validSignal(), raw_prompt: 'leak' }, { scope: 'project', project_id: 'x' });
    assert.equal(denied.status, 'denied');
    assert.equal(denied.reason_code, 'forbidden_evidence_field');
    // The project file either does not exist OR contains no 'leak'
    const path = join(root, 'project-x.jsonl');
    if (existsSync(path)) {
      const contents = readFileSync(path, 'utf8');
      assert.ok(!contents.includes('leak'), 'raw_prompt leaked to disk');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Task2.8 atomic append — directory 0o700, file append flag a mode 0o600', async () => {
  const { createPersistentEvidenceStore } = await import(evidenceUrl);
  const { statSync } = await import('node:fs');
  const root = uniqueRoot();
  try {
    const store = createPersistentEvidenceStore({ root, now: () => 1_750_000_000_000 });
    store.append(validSignal(), { scope: 'project', project_id: 'p' });
    const dirStat = statSync(root);
    assert.equal(dirStat.mode & 0o777, 0o700);
    const fileStat = statSync(join(root, 'project-p.jsonl'));
    assert.equal(fileStat.mode & 0o777, 0o600);
    // appending again still works (flag 'a')
    store.append(validSignal(), { scope: 'project', project_id: 'p' });
    const lines = readFileSync(join(root, 'project-p.jsonl'), 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});