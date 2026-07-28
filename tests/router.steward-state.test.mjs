import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync,
} from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createStewardStore } from '../src/steward/state.mjs';

const FP = 'a'.repeat(64);
const NOW = 1_800_000_000_000;

function fixture() {
  const owned = mkdtempSync(join(tmpdir(), 'router-steward-'));
  return { owned, root: join(owned, 'steward') };
}

test('state is private, atomic, and dismissal is idempotent', () => {
  const f = fixture();
  try {
    const store = createStewardStore({ root: f.root });
    assert.equal(statSync(f.root).mode & 0o777, 0o700);
    assert.equal(store.dismiss(FP, { now: NOW }).status, 'stored');
    assert.equal(store.dismiss(FP, { now: NOW + 1 }).status, 'unchanged');
    assert.equal(statSync(store.statePath).mode & 0o777, 0o600);
    assert.deepEqual(readdirSync(f.root).filter((x) => x.includes('.tmp-')), []);
    assert.equal(store.readState().dismissed[FP], NOW);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('snooze validates bounded safe expiry and cooldown is separate from identity', () => {
  const f = fixture();
  try {
    const store = createStewardStore({ root: f.root });
    assert.throws(() => store.snooze(FP, NOW - 1, { now: NOW }), TypeError);
    assert.throws(() => store.snooze(FP, NOW + 31 * 24 * 60 * 60 * 1000, { now: NOW }), TypeError);
    store.snooze(FP, NOW + 1000, { now: NOW });
    store.recordCooldown(FP, { now: NOW });
    const state = store.readState();
    assert.equal(state.snoozed_until[FP], NOW + 1000);
    assert.equal(state.cooldown_at[FP], NOW);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('correction is immutable, content-addressed, private, and routing remains unchanged', () => {
  const f = fixture();
  try {
    const protectedPath = join(f.owned, 'active.json');
    writeFileSync(protectedPath, '{"version":"unchanged"}');
    const before = readFileSync(protectedPath);
    const store = createStewardStore({ root: f.root });
    const result = store.correct(FP, {
      reason_code: 'wrong_relationship',
      proposed_observation_kind: 'overlap',
    }, { now: NOW });
    assert.equal(result.status, 'stored');
    assert.equal(result.routing_unchanged, true);
    assert.ok(result.proposal_id.startsWith('v1-'));
    assert.equal(statSync(result.path).mode & 0o777, 0o600);
    assert.deepEqual(readFileSync(protectedPath), before);
    assert.equal(store.correct(FP, {
      reason_code: 'wrong_relationship',
      proposed_observation_kind: 'overlap',
    }, { now: NOW }).status, 'unchanged');
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('missing/corrupt state fails closed and held lock loses no data', () => {
  const f = fixture();
  try {
    const store = createStewardStore({ root: f.root, lock: { timeout_ms: 0 } });
    assert.deepEqual(store.readState(), {
      schema_version: 1, dismissed: {}, snoozed_until: {}, cooldown_at: {},
    });
    writeFileSync(store.statePath, '{bad', { mode: 0o600 });
    assert.deepEqual(store.readState(), {
      schema_version: 1, dismissed: {}, snoozed_until: {}, cooldown_at: {},
    });
    mkdirSync(join(f.root, '.mutation.lock'), { mode: 0o700 });
    writeFileSync(join(f.root, '.mutation.lock', 'owner.json'), JSON.stringify({
      token: 'other', pid: process.pid, started_at: Date.now(),
    }), { mode: 0o600 });
    assert.equal(store.dismiss(FP, { now: NOW }).reason_code, 'mutation_lock_timeout');
    assert.equal(existsSync(store.statePath), true);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('malformed fingerprints and correction payloads are rejected', () => {
  const f = fixture();
  try {
    const store = createStewardStore({ root: f.root });
    assert.throws(() => store.dismiss('../bad', { now: NOW }), TypeError);
    assert.throws(() => store.correct(FP, { arbitrary_text: 'secret' }, { now: NOW }), TypeError);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});
