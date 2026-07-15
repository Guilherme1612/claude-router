import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRegistryReconciler, createRegistryWatcher } from '../src/registry/watcher.mjs';
import { stableStringify } from '../src/registry/schema.mjs';

function hashForTest(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

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
  assert.deepEqual(h.scans[2], ['claude_global', 'codex_home']);
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

test('startup reconciliation failure rejects readiness instead of publishing a healthy baseline', async () => {
  const h = harness({ async scan() { throw new Error('initial scan denied'); } });
  await assert.rejects(h.controller.ready, /initial scan denied/);
  assert.deepEqual(h.writes, []);
  assert.deepEqual(h.errors, ['initial scan denied']);
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
  release(); await h.controller.flush();
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

test('deployed reconciler consumes the real lifecycle diff and advances acquisition only after both publications', async () => {
  const initial = { claude: { observations: [], diagnostics: [] }, codex: { observations: [], diagnostics: [] }, generation: 0 };
  const lifecycle = { events: [], diagnostics: [], marker: 'authoritative-diff' };
  const refreshCalls = [];
  const writes = [];
  let failReport = true;
  const reconcile = createRegistryReconciler({ candidate_path: '/candidate', report_path: '/report' }, {
    acquireRegistry: () => initial,
    refreshIncrementalAcquisition(previous, diff) {
      refreshCalls.push({ previous, diff });
      return { ...previous, generation: previous.generation + 1 };
    },
    assembleRegistry(acquisition) {
      return { registry: { generation: acquisition.generation }, diagnostics: [], summary: { generation: acquisition.generation } };
    },
    async writeJson(path, value) {
      writes.push({ path, value });
      if (path === '/report' && failReport) throw new Error('report rejected');
    },
  });

  await assert.rejects(reconcile({ diff: lifecycle }), /report rejected/);
  failReport = false;
  await reconcile({ diff: lifecycle });
  assert.equal(refreshCalls.length, 2);
  assert.strictEqual(refreshCalls[0].diff, lifecycle);
  assert.strictEqual(refreshCalls[1].diff, lifecycle);
  assert.equal(refreshCalls[0].previous.generation, 0);
  assert.equal(refreshCalls[1].previous.generation, 0, 'failed publication must retain acquisition baseline');
  assert.deepEqual(writes.slice(-2).map(item => item.path), ['/candidate', '/report']);
  assert.deepEqual(reconcile.lastReconciliation, {
    strategy: 'incremental',
    lifecycle_hash: hashForTest(lifecycle),
  });
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

test('ancestor watch routes project prefixes and filename-less hints without unrelated noise', async () => {
  const scheduler = clock();
  let callback;
  const reconciled = [];
  const controller = createRegistryWatcher({
    roots: [
      { logicalRoot: 'project:fixture:claude', path: '/project/.claude', watchPath: '/project', includeRelativePaths: ['.claude'] },
      { logicalRoot: 'project:fixture:codex', path: '/project/.codex', watchPath: '/project', includeRelativePaths: ['.codex'] },
    ],
    scheduler, debounceMs: 1, repairMs: 10_000,
    watchFactory(path, _options, handler) { assert.equal(path, '/project'); callback = handler; return { close() {} }; },
    readState: async () => ({ clean_scan_required: true }),
    scan: async () => ({ schema_version: 1, roots: [], entries: [], diagnostics: [], hash: 'scan' }),
    diff: () => ({ events: [], diagnostics: [] }),
    reconcile: async context => { reconciled.push(context.roots); },
    writeState: async () => {},
  });
  await controller.ready;
  reconciled.length = 0;
  callback('change', 'README.md'); await scheduler.advance(1); assert.deepEqual(reconciled, []);
  callback('change', '.claude/skills/a/SKILL.md'); await scheduler.advance(1);
  assert.deepEqual(reconciled.pop(), ['project:fixture:claude']);
  callback('change', '.codex'); await scheduler.advance(1);
  assert.deepEqual(reconciled.pop(), ['project:fixture:codex']);
  callback('rename'); await scheduler.advance(1);
  assert.deepEqual(reconciled.pop(), ['project:fixture:claude', 'project:fixture:codex']);
  await controller.close();
});
