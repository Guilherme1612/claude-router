import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createRegistryReconciler, createRegistryWatcher, createTestRegistryReconciler,
  finishWatcherShutdown, rebuildRuntimeArtifacts,
} from '../src/registry/watcher.mjs';
import { stableStringify } from '../src/registry/schema.mjs';
import { mapCandidateRegistry } from '../src/registry/map.mjs';
import { PRODUCTION_GATE_RUNNERS, REQUIRED_ACTIVATION_GATES } from '../src/registry/validate.mjs';

test('control repair is single-flight and acknowledged only after success', () => {
  const source = readFileSync(new URL('../src/registry/watcher.mjs', import.meta.url), 'utf8');
  const repair = source.indexOf("if (request.action === 'repair')");
  const acknowledge = source.indexOf('await rm(config.control_path', repair);
  assert.doesNotMatch(source, /setInterval\(async/);
  assert.ok(repair < source.indexOf('await controller.repair()', repair));
  assert.ok(source.indexOf("await publish('ready')", repair) < acknowledge);
});

test('watcher shutdown unregisters both process signal handlers', () => {
  const source = readFileSync(new URL('../src/registry/watcher.mjs', import.meta.url), 'utf8');
  assert.match(source, /process\.off\('SIGTERM', onSigterm\)/);
  assert.match(source, /process\.off\('SIGINT', onSigint\)/);
  assert.match(source, /finishWatcherShutdown\(controller, publish, removeSignalHandlers\)/);
});

test('watcher shutdown removes signal handlers when stopped publication fails', async () => {
  const calls = [];
  await assert.rejects(finishWatcherShutdown(
    { async close() { calls.push('close'); } },
    async () => { calls.push('publish'); throw new Error('status unavailable'); },
    () => calls.push('remove-listeners'),
  ), /status unavailable/);
  assert.deepEqual(calls, ['close', 'publish', 'remove-listeners']);
});

test('runtime artifact refresh builds Claude and Codex manifests with isolated outputs', () => {
  const calls = [];
  const result = rebuildRuntimeArtifacts({
    claude_root: '/home/user/.claude', codex_root: '/home/user/.codex',
    project_root: '/worktree',
    runtime_artifacts: [
      { runtime: 'claude', builder_path: '/owned/claude/build-manifest.mjs', manifest_path: '/owned/claude/manifest.json', mode_map_path: '/owned/claude/mode-map.json', coverage_report_path: '/owned/claude/coverage.json', hook_path: '/home/user/.claude/hooks/router.mjs' },
      { runtime: 'codex', builder_path: '/owned/codex/build-manifest.mjs', manifest_path: '/owned/codex/manifest.json', mode_map_path: '/owned/codex/mode-map.json', coverage_report_path: '/owned/codex/coverage.json', hook_path: '/home/user/.codex/hooks/router.mjs' },
    ],
  }, {
    run(artifact, env) {
      calls.push({ runtime: env.ROUTER_RUNTIME, claudeHome: env.ROUTER_CLAUDE_HOME, codexHome: env.ROUTER_CODEX_HOME, builder: artifact.builder_path, manifest: env.ROUTER_MANIFEST_OUT, modeMap: env.ROUTER_MODE_MAP_PATH, hook: env.ROUTER_HOOK_PATH });
      return { status: 0 };
    },
  });
  assert.equal(result.status, 'built');
  assert.deepEqual(calls, [
    { runtime: 'claude', claudeHome: '/home/user/.claude', codexHome: '/home/user/.codex', builder: '/owned/claude/build-manifest.mjs', manifest: '/owned/claude/manifest.json', modeMap: '/owned/claude/mode-map.json', hook: '/home/user/.claude/hooks/router.mjs' },
    { runtime: 'codex', claudeHome: '/home/user/.claude', codexHome: '/home/user/.codex', builder: '/owned/codex/build-manifest.mjs', manifest: '/owned/codex/manifest.json', modeMap: '/owned/codex/mode-map.json', hook: '/home/user/.codex/hooks/router.mjs' },
  ]);
});

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

test('filename-less hints reconcile immediately while duplicate hints and a continuous flood remain bounded', async () => {
  const h = harness();
  await h.controller.ready;
  assert.equal(h.scans.length, 1, 'startup repair runs immediately');
  const emit = h.callbacks.get('/virtual/claude');
  emit('change'); emit('change', 'same.md'); emit('rename', undefined);
  await h.scheduler.advance(0); assert.equal(h.scans.length, 2);
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

test('resource-exhausted watcher falls back to fingerprint polling', async () => {
  let emitError;
  let scans = 0;
  let reconciles = 0;
  const controller = createRegistryWatcher({
    roots: [{ logicalRoot: 'claude_global', path: '/virtual/claude' }],
    debounceMs: 0,
    fallbackPollMs: 10,
    repairMs: 300_000,
    watchFactory(_path, _options, _callback) {
      return {
        on(event, callback) { if (event === 'error') emitError = callback; },
        close() {},
      };
    },
    readState: async () => ({ clean_scan_required: false, state: { hash: 'scan-1' }, diagnostics: [] }),
    scan: async () => ({ hash: `scan-${++scans}`, roots: ['claude_global'] }),
    diff: () => ({ events: [], diagnostics: [] }),
    reconcile: async () => { reconciles += 1; },
    writeState: async () => {},
  });
  await controller.ready;
  assert.equal(scans, 1);
  emitError(Object.assign(new Error('too many open files'), { code: 'EMFILE' }));
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.ok(scans >= 2);
  assert.ok(reconciles >= 2);
  await controller.close();
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

test('successful reconciliation notifies its status publisher immediately', async () => {
  const completed = [];
  const h = harness({ onReconciled(state) { completed.push(state); } });
  await h.controller.ready;
  h.callbacks.get('/virtual/claude')('change', 'live.md');
  await h.scheduler.advance(250);
  assert.deepEqual(completed.map(state => state.trigger), ['startup', 'filesystem-event']);
  assert.equal(completed.at(-1).state, 'current');
  await h.controller.close();
});

test('[phase21-red:convergence] watcher exposes complete-baseline authority and four-state operational inspection', async () => {
  const h = harness();
  assert.equal(h.controller.inspect().state, 'reconciling');
  await h.controller.ready;
  const current = h.controller.inspect();
  assert.equal(current.state, 'current');
  assert.equal(current.trigger, 'startup');
  assert.equal(current.last_complete_fingerprint_state.hash, 'scan-1');
  assert.match(current.active_generation_id, /^generation-/);
  assert.equal(current.candidate_generation_id, null);
  assert.deepEqual(current.pending_changes, []);
  assert.deepEqual(current.stale_roots, []);
  assert.deepEqual(current.unreadable_roots, []);
  assert.equal(current.reason_code, 'reconciliation_complete');
  assert.equal(current.next_recovery_action, null);
  assert.ok(['current', 'reconciling', 'degraded', 'failed'].includes(current.state));
  await h.controller.close();
});

test('[phase21-red:convergence] authoritative triggers are immediate and periodic repair defaults to five minutes', async () => {
  const triggers = [];
  const h = harness({ repairMs: undefined, async reconcile(context) { triggers.push(context.trigger); } });
  await h.controller.ready;
  assert.deepEqual(triggers, ['startup']);
  h.callbacks.get('/virtual/claude')('rename', undefined);
  await h.scheduler.advance(0);
  assert.deepEqual(triggers, ['startup', 'ambiguous-event']);
  await h.scheduler.advance(300_000);
  assert.equal(triggers.at(-1), 'periodic-repair');
  await h.controller.authoritative('watcher-restart');
  assert.equal(triggers.at(-1), 'watcher-restart');
  await h.controller.authoritative('root-replacement');
  assert.equal(triggers.at(-1), 'root-replacement');
  await h.controller.authoritative('fingerprint-mismatch');
  assert.equal(triggers.at(-1), 'fingerprint-mismatch');
  await h.controller.close();
});

test('[phase21-red:convergence] incomplete scan degrades without replacing the last complete fingerprint', async () => {
  let incomplete = false;
  const h = harness({
    async scan() {
      return incomplete
        ? {
            hash: 'partial',
            roots: ['claude_global', 'codex_home'],
            logicalRoots: [
              { logicalRoot: 'claude_global', complete: false, diagnosticCodes: ['read_error'] },
              { logicalRoot: 'codex_home', complete: true, diagnosticCodes: [] },
            ],
          }
        : { hash: 'complete', roots: ['claude_global', 'codex_home'], logicalRoots: [] };
    },
  });
  await h.controller.ready;
  incomplete = true;
  await h.controller.authoritative('dropped-events');
  const state = h.controller.inspect();
  assert.equal(state.state, 'degraded');
  assert.equal(state.reason_code, 'incomplete_scan');
  assert.deepEqual(state.unreadable_roots, ['claude_global']);
  assert.equal(state.last_complete_fingerprint_state.hash, 'complete');
  assert.deepEqual(h.writes, ['complete']);
  await h.controller.close();
});

test('watcher publication exposes bounded runtime coverage and withdraws stale active authority', async () => {
  const writes = [], withdrawals = [];
  const active = {
    authority_status: 'active',
    tuple_version_id: 't1-active',
    bytes: '{"active":true}\n',
    fingerprint: 'active-fingerprint',
  };
  const built = {
    registry: {
      schema_version: 1,
      records: [
        { dispatchable: true, coverage: { classification: 'routable' } },
        { dispatchable: false, coverage: { classification: 'unavailable' } },
      ],
    },
    diagnostics: [{ code: 'bounded_diagnostic', logical_root: 'claude_global' }],
    summary: { runtimes: { claude: 1, codex: 1 }, dispatchable_count: 1, record_count: 2 },
  };
  const reconcile = createRegistryReconciler({
    candidate_path: '/candidate', report_path: '/report', activation_root: '/owned',
  }, {
    acquireRegistry: () => ({ generation: 0 }),
    refreshIncrementalAcquisition: previous => ({ generation: previous.generation + 1 }),
    assembleRegistry: () => built,
    readActive: async () => active,
    reconcileCandidate: () => ({
      disposition: 'eligible', candidate_fingerprint: 'candidate', report_fingerprint: 'report',
      verdicts: [], active_bytes: active.bytes, active_fingerprint: active.fingerprint,
    }),
    writeJson: async (path, value) => writes.push({ path, value }),
    withdrawActive: async value => withdrawals.push(value),
  });

  await reconcile({
    diff: { events: [], diagnostics: [] }, trigger: 'startup',
    current: {
      hash: 'a'.repeat(64),
      logicalRoots: [
        { logicalRoot: 'claude_global', complete: true, diagnosticCodes: [] },
        { logicalRoot: 'codex_home', complete: true, diagnosticCodes: [] },
      ],
    },
  });
  assert.equal(reconcile.lastReconciliation.inventory_epoch, 'a'.repeat(64));
  assert.deepEqual(reconcile.lastReconciliation.runtime_observation_counts, { claude: 1, codex: 1 });
  assert.deepEqual(reconcile.lastReconciliation.coverage_classification_counts, { routable: 1, unavailable: 1 });
  assert.equal(reconcile.lastReconciliation.dispatchable_count, 1);
  assert.equal(reconcile.lastReconciliation.authority_status, 'active');

  await reconcile({
    diff: { events: [{ primary: 'removed', facets: [], old_provenance: [], new_provenance: [] }], diagnostics: [] },
    trigger: 'dropped-events',
    current: {
      hash: 'b'.repeat(64),
      logicalRoots: [
        { logicalRoot: 'claude_global', complete: false, diagnosticCodes: ['root_missing'] },
        { logicalRoot: 'codex_home', complete: true, diagnosticCodes: [] },
      ],
    },
  });
  assert.deepEqual(withdrawals, [{ reason_code: 'incomplete_scan', stale_roots: ['claude_global'] }]);
  const staleReport = writes.at(-1).value;
  assert.equal(staleReport.disposition, 'quarantined');
  assert.equal(staleReport.authority_status, 'empty');
  assert.equal(staleReport.candidate_disposition, 'quarantined');
  assert.equal(staleReport.dispatchable_count, 0);
  assert.equal(reconcile.lastReconciliation.watcher_state, 'degraded');
  assert.equal(reconcile.lastReconciliation.next_recovery_action, 'authoritative-repair');
  assert.equal(reconcile.lastReconciliation.authority_status, 'empty');
  assert.equal(JSON.stringify(staleReport).includes('active'), false);
});

test('production verification keeps the six runtime-truth gate identities independent', () => {
  const ids = ['privacy', 'latency', 'token_budget', 'reconciliation_safety', 'regression_suite', 'incremental_full_equivalence'];
  for (const id of ids) {
    assert.equal(PRODUCTION_GATE_RUNNERS[id]?.id, id);
    assert.equal(typeof PRODUCTION_GATE_RUNNERS[id]?.run, 'function');
  }
  assert.deepEqual(ids.filter(id => REQUIRED_ACTIVATION_GATES.includes(id)), ids);
});

test('deployed reconciler consumes the real lifecycle diff and advances acquisition only after both publications', async () => {
  const initial = { claude: { observations: [], diagnostics: [] }, codex: { observations: [], diagnostics: [] }, generation: 0 };
  const lifecycle = { events: [], diagnostics: [], marker: 'authoritative-diff' };
  const refreshCalls = [];
  const writes = [];
  const published = [];
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
    onPublished: status => published.push(status),
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
  assert.equal(published.length, 1, 'acknowledgement follows both successful publications');
  assert.deepEqual(reconcile.lastReconciliation, {
    strategy: 'incremental',
    lifecycle_hash: hashForTest(lifecycle),
    disposition: 'quarantined',
    active_bytes: `${stableStringify({ schema_version: 1, records: [] })}\n`,
    active_fingerprint: createHash('sha256').update(`${stableStringify({ schema_version: 1, records: [] })}\n`).digest('hex'),
    publication_status: 'published',
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
  const writes = [], activations = [], assemblyOptions = [], refreshes = [];
  const activeBytes = '{"active":true}\n';
  const reconcile = createRegistryReconciler({
    candidate_path: '/candidate',
    report_path: '/report',
    mode_map_path: '/owned/mode-map.json',
    workflow_declarations_path: '/owned/workflow-declarations.json',
  }, {
    acquireRegistry: () => ({ generation: 0 }),
    refreshIncrementalAcquisition: previous => ({ generation: previous.generation + 1 }),
    assembleRegistry: (_next, options) => {
      assemblyOptions.push(options);
      return { registry: { schema_version: 1, records: [reconcilerCapability()] }, diagnostics: [], summary: { activated: false } };
    },
    readActive: async () => ({ bytes: activeBytes, fingerprint: createHash('sha256').update(activeBytes).digest('hex') }),
    activate: value => activations.push(value),
    writeJson: async (path, value) => writes.push({ path, value }),
    refreshRuntimeArtifacts: context => { refreshes.push(context); return { status: 'built' }; },
  });
  await reconcile({ diff: { events: [], diagnostics: [] } });
  assert.deepEqual(writes.map(value => value.path), ['/candidate', '/report']);
  assert.equal(writes[0].value.activated, false);
  assert.equal(writes[1].value.disposition, 'eligible');
  assert.equal(writes[1].value.active_bytes, activeBytes);
  assert.deepEqual(activations, []);
  assert.equal(refreshes.length, 1);
  assert.deepEqual(refreshes[0].diff, { events: [], diagnostics: [] });
  assert.equal(reconcile.lastReconciliation.disposition, 'eligible');
  assert.equal(assemblyOptions[0].modeMapPath, '/owned/mode-map.json');
  assert.equal(assemblyOptions[0].workflowDeclarationsPath, '/owned/workflow-declarations.json');
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
    mapCandidateRegistry: async () => { calls.push('map'); return { schema_version: 1, subjects: [{ disposition: 'unmapped' }], summary: { disposition: 'complete', ambiguous: 0 }, report_fingerprint: 'map' }; },
    produceActivationVerification: async () => { calls.push('verify'); return { disposition: 'passing', complete: true }; },
    activateCandidate: async () => { calls.push('activate'); return { activation_status: 'activated' }; },
  });
  await reconcile({ diff: { events: [], diagnostics: [] } });
  assert.deepEqual(calls, ['map', 'verify', 'activate']);
  assert.equal(reconcile.lastReconciliation.activation_status, 'activated');
});

test('eligible watcher publishes bounded verification gate evidence when activation is preserved', async () => {
  const reconcile = createTestRegistryReconciler({ candidate_path: '/candidate', report_path: '/report', activation_root: '/owned' }, {
    acquireRegistry: () => ({ generation: 0 }),
    refreshIncrementalAcquisition: previous => ({ generation: previous.generation + 1 }),
    assembleRegistry: () => ({ registry: { schema_version: 1, records: [reconcilerCapability()] }, diagnostics: [], summary: {} }),
    readActive: async () => ({ bytes: '{}\\n', fingerprint: 'active' }),
    reconcileCandidate: () => ({ disposition: 'eligible', candidate_fingerprint: 'candidate', report_fingerprint: 'report', verdicts: [], active_bytes: '{}\\n', active_fingerprint: 'active' }),
    writeJson: async () => {},
    recoverActiveVersion: async () => ({ recovery_status: 'healthy' }),
    mapCandidateRegistry: async () => ({ schema_version: 1, subjects: [{ disposition: 'unmapped' }], summary: { disposition: 'complete', ambiguous: 0 } }),
    produceActivationVerification: async () => ({
      disposition: 'non_passing', complete: true, verification_fingerprint: 'verification',
      gates: [{ id: 'latency', passed: true }, { id: 'privacy', passed: false }, { id: 'regression_suite', passed: false }],
    }),
  });

  await reconcile({ diff: { events: [], diagnostics: [] } });
  assert.deepEqual(reconcile.lastReconciliation.verification, {
    disposition: 'non_passing', complete: true, gate_count: 3,
    failed_gate_ids: ['privacy', 'regression_suite'], verification_fingerprint: 'verification',
  });
  assert.equal(reconcile.lastReconciliation.activation_reason, 'verification_non_passing');
});

test('installed activation paths bootstrap one immutable version and active pointer', async () => {
  const ownedRoot = mkdtempSync(join(tmpdir(), 'router-watcher-activation-'));
  const candidate = { schema_version: 1, records: [reconcilerCapability()] };
  const now = Date.now();
  const reconciliation = { disposition: 'eligible', candidate_fingerprint: hashForTest(candidate), report_fingerprint: 'report', verdicts: [], active_bytes: `${stableStringify({ schema_version: 1, records: [] })}\n`, active_fingerprint: 'active' };
  const mapping = { schema_version: 1, subjects: [{ subject_id: 'planner', disposition: 'mapped', target_id: 'router/planner', reason_code: 'explicit_subject' }], summary: { disposition: 'complete', ambiguous: 0 }, report_fingerprint: 'map' };
  const policy = {};
  const gates = REQUIRED_ACTIVATION_GATES.map(id => {
    const runner = PRODUCTION_GATE_RUNNERS[id];
    const gate = { id, runner_id: runner.id, runner_version: runner.version, passed: true, reason_code: 'passed', threshold: runner.threshold, measured: {} };
    return { ...gate, evidence_fingerprint: hashForTest(gate) };
  });
  const canonicalVerification = {
    schema_version: 1, verification_policy_version: 'activation-verification-v1', trusted: true, complete: true,
    generated_at: now, expires_at: now + 60_000, required_gate_ids: [...REQUIRED_ACTIVATION_GATES],
    candidate_fingerprint: hashForTest(candidate), reconciliation_fingerprint: hashForTest(reconciliation),
    mapping_fingerprint: hashForTest(mapping), policy_fingerprint: hashForTest(policy),
    gates, disposition: 'passing', test_only: false,
  };
  const verification = { ...canonicalVerification, verification_fingerprint: hashForTest(canonicalVerification) };
  try {
    const reconcile = createTestRegistryReconciler({
      candidate_path: join(ownedRoot, 'candidate.json'), report_path: join(ownedRoot, 'report.json'),
      activation_root: ownedRoot, active_path: join(ownedRoot, 'active.json'),
    }, {
      acquireRegistry: () => ({ generation: 0 }),
      refreshIncrementalAcquisition: previous => ({ generation: previous.generation + 1 }),
      assembleRegistry: () => ({ registry: candidate, diagnostics: [], summary: {} }),
      reconcileCandidate: () => reconciliation,
      mapCandidateRegistry: () => mapping,
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

test('incremental/full equivalence compares canonical registry bytes, not schema presence', async () => {
  const emptyAcquisition = {
    claude: { observations: [], diagnostics: [] },
    codex: { observations: [], diagnostics: [] },
  };
  const equivalence = {
    previous: emptyAcquisition,
    diff: { events: [], diagnostics: [] },
    options: {
      discoverClaude: () => ({ observations: [], diagnostics: [] }),
      discoverCodex: () => ({ observations: [], diagnostics: [] }),
    },
  };
  const passing = await PRODUCTION_GATE_RUNNERS.incremental_full_equivalence.run({
    candidate: { schema_version: 1, records: [] }, equivalence,
  });
  assert.equal(passing.passed, true);
  const substituted = await PRODUCTION_GATE_RUNNERS.incremental_full_equivalence.run({
    candidate: { schema_version: 1, records: [{ id: 'substituted' }] }, equivalence,
  });
  assert.equal(substituted.passed, false);
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

test('valid release-tuple authority is preserved when legacy registry history is absent', async () => {
  const calls = [];
  const reconcile = createTestRegistryReconciler({ candidate_path: '/candidate', report_path: '/report', activation_root: '/owned' }, {
    acquireRegistry: () => ({}), refreshIncrementalAcquisition: value => value,
    assembleRegistry: () => ({ registry: { schema_version: 1, records: [reconcilerCapability()] }, diagnostics: [], summary: {} }),
    readActive: async () => ({ bytes: '{"tuple":"known-good"}\n', fingerprint: 'tuple', authority_status: 'active', tuple_version_id: 't1-known-good00000' }),
    reconcileCandidate: () => ({ disposition: 'eligible', candidate_fingerprint: 'candidate', report_fingerprint: 'report', verdicts: [], active_bytes: '{"tuple":"known-good"}\n', active_fingerprint: 'tuple' }),
    writeJson: async () => {},
    recoverActiveVersion: async () => ({ recovery_status: 'blocked', reason_code: 'no_valid_history' }),
    mapCandidateRegistry: async () => { calls.push('map'); return { schema_version: 1, subjects: [], summary: { disposition: 'complete' } }; },
    produceActivationVerification: async () => { calls.push('verify'); return { disposition: 'passing', complete: true }; },
    activateCandidate: async () => { calls.push('activate'); return { activation_status: 'activated' }; },
  });
  await reconcile({ diff: { events: [], diagnostics: [] } });
  assert.deepEqual(calls, []);
  assert.equal(reconcile.lastReconciliation.activation_status, 'preserved');
  assert.equal(reconcile.lastReconciliation.activation_reason, 'release_tuple_active');
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

test('noise events never dirty roots while installed_plugins.json does (INVC-04 noise + authoritative plugin signal)', async () => {
  // Match the claude_global root shape emitted by router-lifecycle.mjs (INVC-04):
  // prefix-specific ignore list that excludes sqlite/WAL + plugin-catalog caches
  // but deliberately keeps plugins/installed_plugins.json visible.
  const NOISE_IGNORES = [
    'router',
    'context-mode',
    'plugins/plugin-catalog-cache.json',
    'plugins/known_marketplaces.json',
    'plugins/cache',
    'plugins/data',
    'plugins/marketplaces',
    '*.sqlite', '*.sqlite-wal', '*.sqlite-shm',
  ];
  const scheduler = clock();
  let callback;
  const reconciled = [];
  const controller = createRegistryWatcher({
    roots: [
      { logicalRoot: 'claude_global', path: '/virtual/claude', ignoredRelativePaths: NOISE_IGNORES },
    ],
    scheduler, debounceMs: 1, repairMs: 10_000,
    watchFactory(path, _options, handler) { callback = handler; return { close() {} }; },
    readState: async () => ({ clean_scan_required: true }),
    scan: async () => ({ schema_version: 1, roots: ['claude_global'], entries: [], diagnostics: [], hash: 'scan' }),
    diff: () => ({ events: [], diagnostics: [] }),
    reconcile: async context => { reconciled.push(context.roots); },
    writeState: async () => {},
  });
  await controller.ready;
  reconciled.length = 0;

  // Each noise path must NOT mark claude_global dirty.
  for (const noise of [
    'context-mode/content/foo.db',
    'context-mode/sessions/x.db-wal',
    'context-mode/sessions/x.db-shm',
    'logs_2.sqlite',
    'logs_2.sqlite-wal',
    'state_5.sqlite-shm',
    'plugins/plugin-catalog-cache.json',
    'plugins/known_marketplaces.json',
    'plugins/cache/context-mode/x/y/1.0.0/file',
    'plugins/data/whatever',
    'plugins/marketplaces/github.com/somewhere/catalog.json',
    'router/cache.json',
  ]) {
    callback('change', noise); await scheduler.advance(1);
    assert.deepEqual(reconciled, [], `noise event must not dirty roots: ${noise}`);
    reconciled.length = 0;
  }

  // installed_plugins.json is the authoritative add/remove signal — MUST mark dirty.
  callback('change', 'plugins/installed_plugins.json'); await scheduler.advance(1);
  assert.deepEqual(reconciled.pop(), ['claude_global']);
  assert.deepEqual(reconciled, [], 'no further reconciles after installed_plugins.json');

  // The ignore list must be prefix-specific and exact — never cover installed_plugins.json.
  assert.deepEqual(NOISE_IGNORES, ['router', 'context-mode', 'plugins/plugin-catalog-cache.json', 'plugins/known_marketplaces.json', 'plugins/cache', 'plugins/data', 'plugins/marketplaces', '*.sqlite', '*.sqlite-wal', '*.sqlite-shm']);
  assert.equal(NOISE_IGNORES.includes('plugins'), false, 'bare plugins prefix must never be ignored');

  await controller.close();
});
