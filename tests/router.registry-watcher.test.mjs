import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRegistryReconciler, createRegistryWatcher, createTestRegistryReconciler } from '../src/registry/watcher.mjs';
import { stableStringify } from '../src/registry/schema.mjs';
import { mapCandidateRegistry } from '../src/registry/map.mjs';
import { PRODUCTION_GATE_RUNNERS, REQUIRED_ACTIVATION_GATES } from '../src/registry/validate.mjs';

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
    disposition: 'quarantined',
    active_bytes: `${stableStringify({ schema_version: 1, records: [] })}\n`,
    active_fingerprint: createHash('sha256').update(`${stableStringify({ schema_version: 1, records: [] })}\n`).digest('hex'),
  });
});

function reconcilerCapability(overrides = {}) {
  return {
    schema_version: 1, type: 'skill', name: 'planner', canonical_identity: 'router/planner',
    lifecycle: 'ready', scope: { kind: 'global' }, dispatchable: true,
    invocation: { runtime: 'claude', command: 'planner', args: [] },
    dependencies: { state: 'unknown', items: [] },
    provenance: [{ runtime: 'claude', scope: 'global', logical_root: 'claude_global', relative_path: 'skills/planner/SKILL.md', source_fingerprint: 'sha:planner', adapter: 'claude/1' }],
    runtime_variants: [{ runtime: 'claude', native_identity: 'skill:planner' }], conflicts: [], ...overrides,
  };
}

test('installed reconciliation publishes eligible inactive candidate and deterministic report without activation', async () => {
  const writes = [], activations = [];
  const activeBytes = '{"active":true}\n';
  const reconcile = createRegistryReconciler({ candidate_path: '/candidate', report_path: '/report' }, {
    acquireRegistry: () => ({ generation: 0 }),
    refreshIncrementalAcquisition: previous => ({ generation: previous.generation + 1 }),
    assembleRegistry: () => ({ registry: { schema_version: 1, records: [reconcilerCapability()] }, diagnostics: [], summary: { activated: false } }),
    readActive: async () => ({ bytes: activeBytes, fingerprint: createHash('sha256').update(activeBytes).digest('hex') }),
    activate: value => activations.push(value),
    writeJson: async (path, value) => writes.push({ path, value }),
  });
  await reconcile({ diff: { events: [], diagnostics: [] } });
  assert.deepEqual(writes.map(value => value.path), ['/candidate', '/report']);
  assert.equal(writes[0].value.activated, false);
  assert.equal(writes[1].value.disposition, 'eligible');
  assert.equal(writes[1].value.active_bytes, activeBytes);
  assert.deepEqual(activations, []);
  assert.equal(reconcile.lastReconciliation.disposition, 'eligible');
});

test('eligible watcher pipeline maps then verifies then activates, including safe unmapped', async () => {
  const calls = [];
  const reconcile = createTestRegistryReconciler({ candidate_path: '/candidate', report_path: '/report', activation_root: '/owned' }, {
    acquireRegistry: () => ({ generation: 0 }),
    refreshIncrementalAcquisition: previous => ({ generation: previous.generation + 1 }),
    assembleRegistry: () => ({ registry: { schema_version: 1, records: [reconcilerCapability()] }, diagnostics: [], summary: {} }),
    readActive: async () => ({ bytes: '{}\n', fingerprint: 'active' }),
    reconcileCandidate: () => ({ disposition: 'eligible', candidate_fingerprint: 'candidate', report_fingerprint: 'report', verdicts: [], active_bytes: '{}\n', active_fingerprint: 'active' }),
    writeJson: async () => {},
    recoverActiveVersion: async () => ({ recovery_status: 'healthy' }),
    mapCandidateRegistry: async () => { calls.push('map'); return { disposition: 'complete', results: [{ disposition: 'unmapped' }], report_fingerprint: 'map' }; },
    produceActivationVerification: async () => { calls.push('verify'); return { disposition: 'passing', complete: true }; },
    activateCandidate: async () => { calls.push('activate'); return { activation_status: 'activated' }; },
  });
  await reconcile({ diff: { events: [], diagnostics: [] } });
  assert.deepEqual(calls, ['map', 'verify', 'activate']);
  assert.equal(reconcile.lastReconciliation.activation_status, 'activated');
});

test('installed activation paths bootstrap one immutable version and active pointer', async () => {
  const ownedRoot = mkdtempSync(join(tmpdir(), 'router-watcher-activation-'));
  const candidate = { schema_version: 1, records: [reconcilerCapability()] };
  const now = Date.now();
  const verification = {
    schema_version: 1, trusted: true, complete: true, disposition: 'passing', expires_at: now + 60_000,
    gates: REQUIRED_ACTIVATION_GATES.map(id => ({ id, passed: true })),
  };
  try {
    const reconcile = createTestRegistryReconciler({
      candidate_path: join(ownedRoot, 'candidate.json'), report_path: join(ownedRoot, 'report.json'),
      activation_root: ownedRoot, active_path: join(ownedRoot, 'active.json'),
    }, {
      acquireRegistry: () => ({ generation: 0 }),
      refreshIncrementalAcquisition: previous => ({ generation: previous.generation + 1 }),
      assembleRegistry: () => ({ registry: candidate, diagnostics: [], summary: {} }),
      reconcileCandidate: options => ({ disposition: 'eligible', candidate_fingerprint: hashForTest(candidate), report_fingerprint: 'report', verdicts: [], active_bytes: options.active.bytes, active_fingerprint: options.active.fingerprint }),
      mapCandidateRegistry: () => ({ schema_version: 1, subjects: [], summary: { disposition: 'complete', ambiguous: 0 }, report_fingerprint: 'map' }),
      produceActivationVerification: () => verification,
    });
    await reconcile({ diff: { events: [], diagnostics: [] } });
    assert.equal(reconcile.lastReconciliation.activation_status, 'activated');
    assert.equal(existsSync(join(ownedRoot, 'active.json')), true);
    assert.equal(existsSync(join(ownedRoot, 'versions')), true);
  } finally {
    rmSync(ownedRoot, { recursive: true, force: true });
  }
});

test('real canonical ambiguous mapping stops before verification and activation', async () => {
  const candidate = { schema_version: 1, records: [
    reconcilerCapability({ name: 'one', canonical_identity: 'router/one', mapping: { explicit_subjects: ['route:conflict'] } }),
    reconcilerCapability({ name: 'two', canonical_identity: 'router/two', mapping: { explicit_subjects: ['route:conflict'] }, invocation: { runtime: 'claude', command: 'two', args: [] }, provenance: [{ runtime: 'claude', scope: 'global', logical_root: 'claude_global', relative_path: 'skills/two/SKILL.md', source_fingerprint: 'sha:two', adapter: 'claude/1' }], runtime_variants: [{ runtime: 'claude', native_identity: 'skill:two' }] }),
  ] };
  const probe = mapCandidateRegistry({ candidate, reconciliation: { disposition: 'eligible' } });
  assert.equal(probe.summary.disposition, 'ambiguous');
  const calls = [];
  const reconcile = createTestRegistryReconciler({ candidate_path: '/candidate', report_path: '/report', activation_root: '/owned' }, {
    acquireRegistry: () => ({}), refreshIncrementalAcquisition: value => value,
    assembleRegistry: () => ({ registry: candidate, diagnostics: [], summary: {} }),
    readActive: async () => ({ bytes: '{}\n', fingerprint: 'active', authority_status: 'empty' }),
    reconcileCandidate: () => ({ disposition: 'eligible', candidate_fingerprint: probe.candidate_fingerprint, report_fingerprint: 'report', verdicts: [], active_bytes: '{}\n', active_fingerprint: 'active' }),
    writeJson: async () => {},
    produceActivationVerification: async () => { calls.push('verify'); return { disposition: 'passing', complete: true }; },
    activateCandidate: async () => { calls.push('activate'); return { activation_status: 'activated' }; },
  });
  await reconcile({ diff: { events: [], diagnostics: [] } });
  assert.deepEqual(calls, []);
  assert.equal(reconcile.lastReconciliation.activation_reason, 'mapping_ambiguous');
});

test('ambiguous canonical subject fails closed despite optimistic or malformed summary', async () => {
  let verifyCalls = 0;
  const reconcile = createTestRegistryReconciler({ candidate_path: '/candidate', report_path: '/report', activation_root: '/owned' }, {
    acquireRegistry: () => ({}), refreshIncrementalAcquisition: value => value,
    assembleRegistry: () => ({ registry: { schema_version: 1, records: [reconcilerCapability()] }, diagnostics: [], summary: {} }),
    readActive: async () => ({ bytes: '{}\n', fingerprint: 'active', authority_status: 'empty' }),
    reconcileCandidate: () => ({ disposition: 'eligible', candidate_fingerprint: 'candidate', report_fingerprint: 'report', verdicts: [], active_bytes: '{}\n', active_fingerprint: 'active' }),
    writeJson: async () => {},
    mapCandidateRegistry: () => ({ schema_version: 1, subjects: [{ subject_id: 'route:x', disposition: 'ambiguous' }], summary: { disposition: 'complete', ambiguous: 0 } }),
    produceActivationVerification: async () => { verifyCalls += 1; return { disposition: 'passing', complete: true }; },
  });
  await reconcile({ diff: { events: [], diagnostics: [] } });
  assert.equal(verifyCalls, 0);
  assert.equal(reconcile.lastReconciliation.activation_reason, 'mapping_ambiguous');

  const verdict = await PRODUCTION_GATE_RUNNERS.mapping_integrity.run({ mapping: { schema_version: 1, subjects: [{ disposition: 'ambiguous' }], summary: { disposition: 'complete', ambiguous: 0 } } });
  assert.equal(verdict.passed, false);
});

test('blocked recovery preserves authority and is retried before later activation', async () => {
  const calls = [];
  let recoveryAttempt = 0;
  const reconcile = createTestRegistryReconciler({ candidate_path: '/candidate', report_path: '/report', activation_root: '/owned', active_path: '/owned/active.json' }, {
    acquireRegistry: () => ({}), refreshIncrementalAcquisition: value => value,
    assembleRegistry: () => ({ registry: { schema_version: 1, records: [reconcilerCapability()] }, diagnostics: [], summary: {} }),
    readActive: async () => ({ bytes: '{"authority":"prior"}\n', fingerprint: 'prior', authority_status: 'active' }),
    reconcileCandidate: () => ({ disposition: 'eligible', candidate_fingerprint: 'candidate', report_fingerprint: 'report', verdicts: [], active_bytes: '{"authority":"prior"}\n', active_fingerprint: 'prior' }),
    writeJson: async () => {},
    recoverActiveVersion: async () => { calls.push('recover'); recoveryAttempt += 1; return recoveryAttempt === 1 ? { recovery_status: 'blocked', reason_code: 'unsafe_pointer' } : { recovery_status: 'healthy' }; },
    mapCandidateRegistry: async () => { calls.push('map'); return { schema_version: 1, subjects: [], summary: { disposition: 'complete', ambiguous: 0 } }; },
    produceActivationVerification: async () => { calls.push('verify'); return { disposition: 'passing', complete: true }; },
    activateCandidate: async () => { calls.push('activate'); return { activation_status: 'activated' }; },
  });
  await reconcile({ diff: { events: [], diagnostics: [] } });
  assert.deepEqual(calls, ['recover']);
  assert.equal(reconcile.lastReconciliation.active_fingerprint, 'prior');
  assert.equal(reconcile.lastReconciliation.activation_reason, 'unsafe_pointer');
  await reconcile({ diff: { events: [], diagnostics: [] } });
  assert.deepEqual(calls, ['recover', 'recover', 'map', 'verify', 'activate']);
  assert.equal(reconcile.lastReconciliation.activation_status, 'activated');
});

test('quarantine publishes corrective diagnostics and preserves exact active authority', async () => {
  const writes = [], activations = [];
  const activeBytes = '{"version":"last-known-good"}\n';
  const activeFingerprint = createHash('sha256').update(activeBytes).digest('hex');
  const reconcile = createRegistryReconciler({ candidate_path: '/candidate', report_path: '/report' }, {
    acquireRegistry: () => ({ generation: 0 }),
    refreshIncrementalAcquisition: previous => ({ generation: previous.generation + 1 }),
    assembleRegistry: () => ({ registry: { schema_version: 1, records: [reconcilerCapability({ lifecycle: 'partial', dispatchable: false })] }, diagnostics: [], summary: { activated: false } }),
    readActive: async () => ({ bytes: activeBytes, fingerprint: activeFingerprint }),
    activate: value => activations.push(value),
    writeJson: async (path, value) => writes.push({ path, value }),
  });
  await reconcile({ diff: { events: [], diagnostics: [] } });
  assert.deepEqual(writes.map(value => value.path), ['/candidate', '/report']);
  assert.equal(writes[0].value.disposition, 'quarantined');
  const report = writes[1].value;
  assert.equal(report.disposition, 'quarantined');
  assert.equal(report.active_bytes, activeBytes);
  assert.equal(report.active_fingerprint, activeFingerprint);
  assert.ok(report.verdicts.every(value => value.corrective_action && value.dispatchable === false));
  assert.doesNotMatch(stableStringify(report), /\/Users\/|[A-Za-z]:\\\\/);
  assert.deepEqual(activations, []);
});

test('evaluation and paired publication failures retain baselines and retry from last success', async () => {
  const initial = { generation: 0 };
  const activeBytes = '{"active":true}\n';
  for (const failure of ['evaluate', 'candidate', 'report']) {
    const generations = [];
    let fail = true;
    const reconcile = createRegistryReconciler({ candidate_path: '/candidate', report_path: '/report' }, {
      acquireRegistry: () => initial,
      refreshIncrementalAcquisition(previous) { generations.push(previous.generation); return { generation: previous.generation + 1 }; },
      assembleRegistry: () => ({ registry: { schema_version: 1, records: [reconcilerCapability()] }, diagnostics: [], summary: { activated: false } }),
      readActive: async () => ({ bytes: activeBytes, fingerprint: createHash('sha256').update(activeBytes).digest('hex') }),
      reconcileCandidate: options => { if (failure === 'evaluate' && fail) throw new Error('evaluate failed'); return { disposition: 'eligible', verdicts: [], candidate_fingerprint: 'candidate', report_fingerprint: 'report', active_bytes: options.active.bytes, active_fingerprint: options.active.fingerprint }; },
      writeJson: async path => { if (failure === 'candidate' && path === '/candidate' && fail) throw new Error('candidate failed'); if (failure === 'report' && path === '/report' && fail) throw new Error('report failed'); },
    });
    await assert.rejects(reconcile({ diff: { events: [], diagnostics: [] } }), /failed/);
    fail = false;
    await reconcile({ diff: { events: [], diagnostics: [] } });
    assert.deepEqual(generations, [0, 0], failure);
    assert.equal(reconcile.lastReconciliation.active_bytes, activeBytes);
  }
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
