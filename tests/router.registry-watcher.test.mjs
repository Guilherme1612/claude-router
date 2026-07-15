import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRegistryWatcher } from '../src/registry/watcher.mjs';

function clock() {
  let now = 0, id = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, delay) { const key = ++id; timers.set(key, { at: now + delay, fn }); return key; },
    clearTimeout(key) { timers.delete(key); },
    async advance(ms) {
      const end = now + ms;
      while (true) {
        const next = [...timers].filter(([, value]) => value.at <= end)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        timers.delete(next[0]); now = next[1].at; next[1].fn();
        await Promise.resolve(); await Promise.resolve();
      }
      now = end; await Promise.resolve(); await Promise.resolve();
    },
    pending: () => timers.size,
  };
}

function harness(overrides = {}) {
  const scheduler = clock(), callbacks = new Map(), scans = [], writes = [], errors = [];
  let state = { hash: 'old', roots: ['claude_global', 'codex_home'] };
  const controller = createRegistryWatcher({
    roots: [
      { logicalRoot: 'codex_home', path: '/virtual/codex' },
      { logicalRoot: 'claude_global', path: '/virtual/claude' },
    ],
    debounceMs: 250,
    maxLatencyMs: 1_500,
    repairMs: 300_000,
    scheduler,
    watchFactory(path, options, callback) {
      callbacks.set(path, callback);
      return { close() { callbacks.delete(path); } };
    },
    async readState() { return { clean_scan_required: false, state, diagnostics: [] }; },
    async scan(rootSpecs) {
      scans.push(rootSpecs.map(item => item.logicalRoot));
      return { hash: `scan-${scans.length}`, roots: ['claude_global', 'codex_home'] };
    },
    diff(previous, current) { return { previous: previous?.hash, current: current.hash, events: [] }; },
    async reconcile(context) { return context; },
    async writeState(next) { state = next; writes.push(next.hash); },
    onError(error) { errors.push(error.message); },
    ...overrides,
  });
  return { scheduler, callbacks, scans, writes, errors, controller };
}

test('duplicate and filename-less hints coalesce while a continuous flood respects maximum latency', async () => {
  const h = harness();
  await h.controller.ready;
  assert.equal(h.scans.length, 1, 'startup repair runs immediately');
  const emit = h.callbacks.get('/virtual/claude');
  emit('change'); emit('change', 'same.md'); emit('rename', undefined);
  await h.scheduler.advance(249); assert.equal(h.scans.length, 1);
  await h.scheduler.advance(1); assert.equal(h.scans.length, 2);
  for (let elapsed = 0; elapsed < 1_500; elapsed += 200) {
    emit('change', 'flood.md');
    await h.scheduler.advance(200);
  }
  assert.equal(h.scans.length, 3, 'flood produces one bounded reconciliation');
  assert.deepEqual(h.scans[2], ['claude_global']);
  await h.controller.close();
});

test('watch creation failure cannot disable startup or five-minute repair', async () => {
  const h = harness({ watchFactory() { throw new Error('watch denied'); } });
  await h.controller.ready;
  assert.equal(h.scans.length, 1);
  assert.deepEqual(h.errors, ['watch denied', 'watch denied']);
  await h.scheduler.advance(299_999); assert.equal(h.scans.length, 1);
  await h.scheduler.advance(1); assert.equal(h.scans.length, 2);
  await h.controller.close();
});

test('reconcile is single-flight and in-flight hints schedule exactly one sorted follow-up', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  let calls = 0, active = 0, maximum = 0;
  const h = harness({ async reconcile() {
    calls += 1; active += 1; maximum = Math.max(maximum, active);
    if (calls === 2) await blocked;
    active -= 1;
  } });
  await h.controller.ready;
  h.callbacks.get('/virtual/claude')('change', 'a');
  await h.scheduler.advance(250);
  h.callbacks.get('/virtual/codex')('change', 'b');
  h.callbacks.get('/virtual/claude')('change', 'c');
  await h.scheduler.advance(250);
  assert.equal(calls, 2);
  release(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(calls, 3);
  assert.equal(maximum, 1);
  assert.deepEqual(h.scans.at(-1), ['claude_global', 'codex_home']);
  await h.controller.close();
});

test('failed reconcile retains the last valid state and reports the error', async () => {
  let fail = false;
  const h = harness({ async reconcile() { if (fail) throw new Error('candidate rejected'); } });
  await h.controller.ready;
  assert.deepEqual(h.writes, ['scan-1']);
  fail = true;
  h.callbacks.get('/virtual/claude')('change', 'bad');
  await h.scheduler.advance(250);
  assert.deepEqual(h.writes, ['scan-1']);
  assert.deepEqual(h.errors, ['candidate rejected']);
  await h.controller.close();
});

test('close releases watchers and timers and makes callbacks inert', async () => {
  const h = harness();
  await h.controller.ready;
  const emit = h.callbacks.get('/virtual/claude');
  await h.controller.close();
  assert.equal(h.callbacks.size, 0);
  assert.equal(h.scheduler.pending(), 0);
  emit('change', 'late');
  await h.scheduler.advance(600_000);
  assert.equal(h.scans.length, 1);
});
