#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { watch } from 'node:fs';
import { readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanFingerprintTree, loadFingerprintState, saveFingerprintState } from './fingerprint.mjs';
import { diffFingerprintTrees } from './diff.mjs';
import { acquireRegistry, assembleRegistry, refreshIncrementalAcquisition } from './build.mjs';
import { reconcileCandidate as reconcileRegistryCandidate } from './reconcile.mjs';
import { mapCandidateRegistry } from './map.mjs';
import { isCanonicalMappingSafe, produceActivationVerification, createTestActivationVerifier } from './validate.mjs';
import { activateCandidate, recoverActiveVersion } from './activate.mjs';
import { stableStringify } from './schema.mjs';
import { publishCompiledIndex } from '../prompt/publish-index.mjs';
import { compatible, COMPILED_INDEX_COMPATIBILITY, loadCompiledIndex } from '../prompt/compile-index.mjs';
import { proposeCandidate, evaluateCandidate, applyCanaryDecision } from '../evolution/canary-controller.mjs';
import { createPersistentEvidenceStore } from '../evolution/evidence.mjs';
import { assessCalibration, evaluateCalibrationCorpus, measureRoutes, CALIBRATION_CORPUS } from '../evolution/perf-measure.mjs';
import { buildCandidateCalibrationRoute, buildKnownGoodCalibrationRoute } from '../evolution/candidate-calibration-route.mjs';

function hash(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function defaultScheduler() {
  return { now: Date.now, setTimeout, clearTimeout };
}

// D-05 safety_correction predicate: a reconciliation report indicates a
// safety/recovery fix when its verdicts carry a safety reason_code. Used to
// decide whether a perf-neutral candidate still promotes (safety_correction)
// or preserves (neutral) — Phase 17 success criterion #4.
function isSafetyFix(report) {
  return Array.isArray(report?.verdicts) && report.verdicts.some((verdict) => (
    typeof verdict?.reason_code === 'string' && verdict.reason_code.startsWith('safety_')
  ));
}

export function createRegistryWatcher(options) {
  if (!Array.isArray(options?.roots) || options.roots.length === 0) {
    throw new TypeError('roots must be a non-empty array');
  }
  const roots = [...options.roots].sort((a, b) => a.logicalRoot.localeCompare(b.logicalRoot));
  const rootNames = roots.map(item => item.logicalRoot);
  const scheduler = options.scheduler || defaultScheduler();
  const debounceMs = options.debounceMs ?? 250;
  const maxLatencyMs = options.maxLatencyMs ?? 1_500;
  const repairMs = options.repairMs ?? 300_000;
  const watchFactory = options.watchFactory || ((path, watchOptions, callback) => watch(path, watchOptions, callback));
  const readState = options.readState || (() => loadFingerprintState(options.statePath, rootNames));
  const scan = options.scan || scanFingerprintTree;
  const diff = options.diff || diffFingerprintTrees;
  const reconcile = options.reconcile || (async () => {});
  const writeState = options.writeState || (state => saveFingerprintState(options.statePath, state));
  const onError = options.onError || (() => {});
  const watchers = [];
  const dirty = new Set();
  let closed = false, timer = null, repairTimer = null, firstDirtyAt = null;
  let inFlight = null, rerun = false, baseline = null;

  function clearTimer(name) {
    const value = name === 'work' ? timer : repairTimer;
    if (value !== null) scheduler.clearTimeout(value);
    if (name === 'work') timer = null;
    else repairTimer = null;
  }

  function report(error) {
    if (!closed) onError(error instanceof Error ? error : new Error(String(error)));
  }

  function scheduleRepair() {
    clearTimer('repair');
    if (closed) return;
    repairTimer = scheduler.setTimeout(() => {
      repairTimer = null;
      markDirty(rootNames, true);
      scheduleRepair();
    }, repairMs);
  }

  async function reconcileDirty(names) {
    const current = await scan(roots);
    const lifecycle = diff(baseline, current);
    await reconcile({ roots: names, previous: baseline, current, diff: lifecycle });
    await writeState(current);
    baseline = current;
  }

  function startWork() {
    if (closed || dirty.size === 0) return inFlight || Promise.resolve();
    if (inFlight) { rerun = true; return inFlight; }
    clearTimer('work');
    const names = [...dirty].sort();
    dirty.clear(); firstDirtyAt = null;
    inFlight = reconcileDirty(names).catch(report).finally(() => {
      inFlight = null;
      if (closed) return;
      if (rerun || dirty.size) {
        rerun = false;
        startWork();
      }
    });
    return inFlight;
  }

  function markDirty(names, immediate = false) {
    if (closed) return;
    for (const name of names) dirty.add(name);
    const now = scheduler.now();
    if (firstDirtyAt === null) firstDirtyAt = now;
    if (inFlight) { rerun = true; return; }
    clearTimer('work');
    const delay = immediate ? 0 : Math.max(0, Math.min(debounceMs, firstDirtyAt + maxLatencyMs - now));
    timer = scheduler.setTimeout(() => { timer = null; startWork(); }, delay);
  }

  const ready = (async () => {
    const loaded = await readState();
    baseline = loaded?.clean_scan_required ? null : loaded?.state || null;
    const watchGroups = new Map();
    for (const root of roots) {
      const watchPath = root.watchPath || root.path;
      if (!watchGroups.has(watchPath)) watchGroups.set(watchPath, []);
      watchGroups.get(watchPath).push(root);
    }
    for (const [watchPath, watchedRoots] of watchGroups) {
      try {
        const handle = watchFactory(watchPath, { recursive: true }, (_event, filename) => {
          const relative = filename === undefined || filename === null ? null : String(filename).replaceAll('\\', '/');
          const matched = watchedRoots.filter(root => {
            if (relative === null) return true;
            const included = !(root.includeRelativePaths || []).length
              || root.includeRelativePaths.some(prefix => relative === prefix || relative.startsWith(`${prefix}/`));
            const ignored = (root.ignoredRelativePaths || []).some(prefix => (
              relative === prefix || relative.startsWith(`${prefix}/`)
            ));
            return included && !ignored;
          }).map(root => root.logicalRoot);
          if (matched.length) markDirty(matched);
        });
        handle.on?.('error', report);
        watchers.push(handle);
      } catch (error) { report(error); }
    }
    scheduleRepair();
    await reconcileDirty(rootNames);
  })().catch(error => {
    report(error);
    throw error;
  });

  return {
    ready,
    notify(logicalRoot) { markDirty([logicalRoot]); },
    async repair() { markDirty(rootNames, true); clearTimer('work'); return startWork(); },
    async flush() {
      do {
        const current = inFlight;
        if (current) await current;
        else await Promise.resolve();
      } while (inFlight || dirty.size || rerun);
    },
    async close() {
      if (closed) return;
      closed = true; dirty.clear(); rerun = false;
      clearTimer('work'); clearTimer('repair');
      for (const watcher of watchers.splice(0)) {
        try { watcher.close(); } catch { /* resource already closed */ }
      }
      await inFlight;
    },
  };
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp.${process.pid}.${randomUUID()}`;
  await writeFile(temporary, `${stableStringify(value)}\n`, 'utf8');
  await rename(temporary, path);
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

export async function runRegistryWatcher(options) {
  const configPath = options.configPath ? resolve(options.configPath) : null;
  const config = options.config || (configPath ? JSON.parse(await readFile(configPath, 'utf8')) : null);
  if (!config) throw new Error('runRegistryWatcher requires either options.config or options.configPath');
  // verification_runners may carry function-valued runner objects when test_mode is opted in
  // (an in-process test harness reattaches them after reading the on-disk config). They are
  // not part of the configuration fingerprint: strip them before hashing so the fingerprint
  // matches the one installRouter computed from the serialized (runner-free) config.
  const { verification_runners: _runners, ...fingerprintable } = config;
  const configurationFingerprint = hash(fingerprintable);
  const instanceId = randomUUID();
  const heartbeatMs = config.heartbeat_ms ?? 1_000;
  const controlPollMs = config.control_poll_ms ?? 250;
  let stopping = false;
  const publish = state => atomicJson(config.status_path, {
    schema_version: 1, state, instance_id: instanceId, pid: process.pid,
    heartbeat: Date.now(), configuration_fingerprint: configurationFingerprint,
    ...(reconcile.lastReconciliation ? { reconciliation: reconcile.lastReconciliation } : {}),
  });
  const reconcile = createRegistryReconciler(config, config.test_mode === true
    ? { produceActivationVerification: createTestActivationVerifier(config.verification_runners || {}) }
    : {});
  const controller = createRegistryWatcher({
    roots: config.roots,
    statePath: config.state_path,
    debounceMs: config.debounce_ms,
    maxLatencyMs: config.max_latency_ms,
    repairMs: config.repair_ms,
    reconcile,
    onError: async error => {
      await atomicJson(config.status_path, {
        schema_version: 1, state: 'error', instance_id: instanceId, pid: process.pid,
        heartbeat: Date.now(), configuration_fingerprint: configurationFingerprint, error: error.message,
      });
    },
  });
  await controller.ready;
  await publish('ready');
  // If close() was called while we were awaiting controller.ready/publish('ready') (the
  // in-process test launcher can kill the child before runRegistryWatcher resolves), skip
  // interval/handler registration so nothing leaks past the close. stopping is set by close().
  if (stopping) return { controller, instanceId, configurationFingerprint, close: async () => {} };
  const heartbeat = setInterval(() => { publish('ready').catch(() => {}); }, heartbeatMs);
  const control = setInterval(async () => {
    const request = await readJson(config.control_path);
    if (!request || request.instance_id !== instanceId || request.configuration_fingerprint !== configurationFingerprint) return;
    if (request.action === 'shutdown' || request.action === 'restart') {
      clearInterval(control); clearInterval(heartbeat); stopping = true;
      await controller.close();
      await publish('stopped');
      if (request.action === 'restart') {
        if (configPath) {
          spawn(process.execPath, [fileURLToPath(import.meta.url), 'run', '--config', configPath], {
            detached: true, stdio: 'ignore',
          }).unref();
        }
        // When configPath is null (in-process test harness with options.config), there is
        // no on-disk config to re-exec from; the harness owns the controller lifecycle.
      }
    }
  }, controlPollMs);
  const close = async () => {
    if (stopping) return;
    stopping = true; clearInterval(control); clearInterval(heartbeat);
    await controller.close(); await publish('stopped');
  };
  process.once('SIGTERM', close);
  process.once('SIGINT', close);
  return { controller, instanceId, configurationFingerprint, close };
}

export function createRegistryReconciler(config, dependencies = {}) {
  const acquisitionOptions = {
    claudeRoot: config.claude_root,
    codexRoot: config.codex_root,
    ...(config.project_root ? { projectRoot: config.project_root, scopeId: config.scope_id } : {}),
  };
  const acquire = dependencies.acquireRegistry || acquireRegistry;
  const refresh = dependencies.refreshIncrementalAcquisition || refreshIncrementalAcquisition;
  const assemble = dependencies.assembleRegistry || assembleRegistry;
  const evaluate = dependencies.reconcileCandidate || reconcileRegistryCandidate;
  const mapper = dependencies.mapCandidateRegistry || mapCandidateRegistry;
  const verifier = dependencies.produceActivationVerification || produceActivationVerification;
  const activator = dependencies.activateCandidate || activateCandidate;
  const recovery = dependencies.recoverActiveVersion || recoverActiveVersion;
  const publishIndex = dependencies.publishCompiledIndex || publishCompiledIndex;
  const canaryDecision = dependencies.applyCanaryDecision || applyCanaryDecision;
  const buildCandidateRoute = dependencies.buildCandidateCalibrationRoute || buildCandidateCalibrationRoute;
  const buildKnownGoodRoute = dependencies.buildKnownGoodCalibrationRoute || buildKnownGoodCalibrationRoute;
  const measure = dependencies.measureRoutes || measureRoutes;
  const assess = dependencies.assessCalibration || assessCalibration;
  const evaluateCorpus = dependencies.evaluateCalibrationCorpus || evaluateCalibrationCorpus;
  const createEvidenceStore = dependencies.createPersistentEvidenceStore || createPersistentEvidenceStore;
  const compatibleFn = dependencies.compatible || compatible;
  const writeJson = dependencies.writeJson || atomicJson;
  const readActive = dependencies.readActive || (async () => {
    const empty = () => {
      const registry = { schema_version: 1, records: [] };
      const bytes = `${stableStringify(registry)}\n`;
      return { registry, bytes, fingerprint: createHash('sha256').update(bytes).digest('hex'), authority_status: 'empty' };
    };
    if (!config.activation_root) {
      return empty();
    }
    try {
      const tuple = loadCompiledIndex({ ownedRoot: resolve(config.activation_root) });
      if (!tuple.dispatch_eligible || !tuple.registry) return empty();
      const bytes = `${stableStringify(tuple.registry)}\n`;
      return { registry: tuple.registry, bytes, fingerprint: createHash('sha256').update(bytes).digest('hex'), authority_status: 'active', tuple_version_id: tuple.tuple_version_id };
    } catch (error) {
      if (error?.code === 'ENOENT') return empty();
      throw error;
    }
  });
  let baseline = acquire(acquisitionOptions);
  let recovered = false;

  const reconcile = async ({ diff }) => {
    const next = refresh(baseline, diff, acquisitionOptions);
    const built = assemble(next);
    const active = await readActive();
    const report = evaluate({
      candidate: built.registry,
      active,
      lifecycle: diff,
      aliases: config.aliases || [],
      mappings: config.mappings || [],
      ...(config.scope ? { scope: config.scope } : {}),
    });
    const candidatePublication = report.disposition === 'eligible'
      ? { ...built.registry, disposition: 'eligible', activated: false, candidate_fingerprint: report.candidate_fingerprint }
      : {
          schema_version: 1,
          disposition: 'quarantined',
          activated: false,
          candidate_fingerprint: report.candidate_fingerprint,
          verdicts: report.verdicts,
        };
    const reportPublication = {
      ...report,
      diagnostics: built.diagnostics,
      summary: { ...built.summary, activated: false },
    };
    await writeJson(config.candidate_path, candidatePublication);
    await writeJson(config.report_path, reportPublication);
    let activation = { activation_status: 'preserved', reason_code: report.disposition };
    if (config.activation_root) {
      let recoveryReady = recovered || active.authority_status === 'empty';
      let knownGood = active.authority_status === 'empty' ? null : null;
      if (!recovered && active.authority_status !== 'empty') {
        const recoveryResult = await recovery({ ownedRoot: config.activation_root, test_mode: config.test_mode === true });
        if (['healthy', 'recovered'].includes(recoveryResult.recovery_status)) {
          recovered = true;
          recoveryReady = true;
          knownGood = recoveryResult.version_id || null;
        } else if (recoveryResult.recovery_status === 'blocked' && recoveryResult.reason_code === 'no_valid_history') {
          // Bootstrap: first-ever activation (no valid history to roll back to).
          // Route through the existing activator path with reason:'watcher'.
          recoveryReady = true;
          knownGood = null;
        } else if (recoveryResult.recovery_status === 'blocked') {
          activation = { activation_status: 'preserved', reason_code: recoveryResult.reason_code || 'recovery_blocked' };
          recoveryReady = false;
        } else {
          activation = { activation_status: 'recovery_required', reason_code: recoveryResult.reason_code };
          recoveryReady = false;
        }
      }
      if (report.disposition === 'eligible' && recoveryReady) {
        const mapping = await mapper({ candidate: built.registry, reconciliation: report, lifecycle: diff, existingMappings: config.mappings || [], policy: config.mapping_policy });
        if (isCanonicalMappingSafe(mapping)) {
          const verification = await verifier({
            candidate: built.registry, reconciliation: report, mapping, policy: config.activation_policy || {},
            equivalence: { previous: baseline, diff, options: acquisitionOptions },
          });
          if (verification.disposition === 'passing' && verification.complete === true) {
            if (knownGood === null) {
              // Bootstrap path: no known-good version exists to canary against.
              // Activate directly with reason:'watcher' (first activation becomes
              // the known-good; no canary rollback possible — RESEARCH.md:376).
              activation = await activator({ ownedRoot: config.activation_root, candidate: built.registry, reconciliation: report, mapping, policy: config.activation_policy || {}, verification, reason: 'watcher', test_mode: config.test_mode === true });
              if (activation.activation_status === 'activated' && activation.version_id) {
                const publication = await publishIndex({
                  ownedRoot: config.activation_root, registry: built.registry,
                  registryVersionId: activation.version_id, mapping,
                  policyFingerprint: verification.policy_fingerprint, now: verification.generated_at || Date.now(),
                });
                if (publication.publication_status !== 'published') throw new Error('compiled_tuple_not_published');
                activation = { ...activation, ...publication };
              }
            } else {
              // Canary path: eligible + known-good present. Gate on evidence
              // sufficiency, construct the 6 REQUIRED_GATES, derive
              // demonstrated_benefit via D-05 (candidate vs known-good
              // measureRoutes), and delegate publication mutation exclusively
              // through applyCanaryDecision -> REGISTRY_PUBLICATION.
              const store = createEvidenceStore({ root: join(config.activation_root, 'evidence') });
              const window = store.window({ project_id: config.scope_id || config.scope || 'global' });
              if (window.sufficient !== true) {
                activation = { activation_status: 'preserved', reason_code: 'insufficient_evidence_samples' };
              } else {
                let candidateCtx = null, knownGoodCtx = null;
                try {
                  const helperNow = verification.generated_at || Date.now();
                  candidateCtx = buildCandidateRoute({ registry: built.registry, mapping, policyFingerprint: verification.policy_fingerprint, now: helperNow, deps: dependencies.helperDeps });
                  knownGoodCtx = buildKnownGoodRoute({ ownedRoot: config.activation_root, now: helperNow, deps: dependencies.helperDeps });
                  const versionsBase = { policy: COMPILED_INDEX_COMPATIBILITY.policy_version, corpus: 'router-calibration-v1' };
                  const candidateEvaluation = evaluateCorpus({ corpus: CALIBRATION_CORPUS, route: candidateCtx.route, versions: { candidate: report.candidate_fingerprint, compiled_index: candidateCtx.versionId, ...versionsBase } });
                  const knownGoodEvaluation = evaluateCorpus({ corpus: CALIBRATION_CORPUS, route: knownGoodCtx.route, versions: { candidate: knownGood, compiled_index: knownGood, ...versionsBase } });
                  const candidatePerf = measure({ fixtures: CALIBRATION_CORPUS, route: candidateCtx.route, versions: { candidate: report.candidate_fingerprint, compiled_index: candidateCtx.versionId, ...versionsBase } });
                  measure({ fixtures: CALIBRATION_CORPUS, route: knownGoodCtx.route, versions: { candidate: knownGood, compiled_index: knownGood, ...versionsBase }, baseline: null });
                  const assessed = assess({ evaluation: candidateEvaluation, performance: candidatePerf });
                  const privacyPass = !(window.observations || []).some((r) => (
                    r?.signal?.confidence_band === 'deny_filtered'
                    || (r?.signal?.guard_codes || []).some((c) => ['privacy_guard', 'deny_filtered', 'secret_detected', 'content_detected'].includes(c))
                  ));
                  const gates = {
                    safety: { pass: report.disposition === 'eligible', reason_code: report.disposition === 'eligible' ? 'safety_passed' : 'safety_uncertain' },
                    privacy: { pass: privacyPass, reason_code: 'privacy_passed' },
                    quality: candidateEvaluation.quality,
                    context_budget: candidateEvaluation.context_budget,
                    latency: assessed.latency,
                    compatibility: { pass: compatibleFn(built.registry.compatibility || built.candidateMetadata?.compatibility) === true, reason_code: 'compatibility_passed' },
                  };
                  const proposed = proposeCandidate({
                    source_evidence_fingerprint: window.source_evidence_fingerprint,
                    policy_version: COMPILED_INDEX_COMPATIBILITY.policy_version,
                    compiled_index_version: candidateCtx.versionId || report.candidate_fingerprint,
                    evaluation_inputs: { corpus: CALIBRATION_CORPUS, gates },
                    proposal: { registry: built.registry, mapping, reconciliation: report },
                  });
                  const candidate = proposed.candidate;
                  const evaluation = evaluateCandidate({ candidate, evidence_window: window, gates, known_good_version: knownGood });
                  let demonstrated_benefit;
                  if (!evaluation.promotable) {
                    demonstrated_benefit = null;
                  } else {
                    const strictImproveQuality = candidateEvaluation.quality.pass === true && knownGoodEvaluation.quality.pass === false;
                    const strictImproveContext = candidateEvaluation.context_budget.pass === true && knownGoodEvaluation.context_budget.pass === false;
                    const strictImprove = strictImproveQuality || strictImproveContext;
                    const latencyPass = assessed.latency.pass === true;
                    if (strictImprove && latencyPass) {
                      demonstrated_benefit = { status: 'demonstrated', reason_code: strictImproveQuality ? 'quality_improved' : 'context_bytes_reduced' };
                    } else if (!strictImprove && latencyPass && isSafetyFix(report)) {
                      demonstrated_benefit = { status: 'safety_correction', reason_code: 'safety_fix' };
                    } else {
                      demonstrated_benefit = { status: 'neutral', reason_code: 'no_strict_improvement' };
                    }
                  }
                  const decision = canaryDecision({
                    evaluation,
                    demonstrated_benefit,
                    activation: { ownedRoot: config.activation_root, candidate: built.registry, reconciliation: report, mapping, policy: config.activation_policy || {}, verification, reason: 'canary', test_mode: config.test_mode === true },
                    ownedRoot: config.activation_root,
                    known_good_version: knownGood,
                    published_version: active.tuple_version_id || active.version_id || null,
                  });
                  if (decision.status === 'promoted') {
                    activation = { activation_status: 'activated', version_id: decision.active_version, ...decision };
                    if (decision.active_version) {
                      const publication = await publishIndex({
                        ownedRoot: config.activation_root, registry: built.registry,
                        registryVersionId: decision.active_version, mapping,
                        policyFingerprint: verification.policy_fingerprint, now: verification.generated_at || Date.now(),
                      });
                      if (publication.publication_status !== 'published') throw new Error('compiled_tuple_not_published');
                      activation = { ...activation, ...publication };
                    }
                  } else if (decision.status === 'rolled_back') {
                    activation = { activation_status: 'rolled_back', reason_code: decision.reason_code };
                  } else if (decision.status === 'preserved') {
                    activation = { activation_status: 'preserved', reason_code: decision.reason_code || 'canary_preserved' };
                  } else if (decision.status === 'recovery_required') {
                    activation = { activation_status: 'recovery_required', reason_code: decision.reason_code };
                  } else {
                    activation = { activation_status: 'preserved', reason_code: decision.reason_code || 'canary_rejected' };
                  }
                } finally {
                  // Backstop (T-20-25): cleanup D-04 helper temp ownedRoots on
                  // every path including exceptions — no tempdir leak across
                  // reconciles.
                  candidateCtx?.cleanup?.();
                  knownGoodCtx?.cleanup?.();
                }
              }
            }
          } else activation = { activation_status: 'preserved', reason_code: 'verification_non_passing' };
        } else activation = { activation_status: 'preserved', reason_code: 'mapping_ambiguous' };
      }
    }
    baseline = next;
    reconcile.lastReconciliation = {
      strategy: 'incremental',
      lifecycle_hash: diff.hash || hash(diff),
      disposition: report.disposition,
      active_bytes: report.active_bytes,
      active_fingerprint: report.active_fingerprint,
      ...(config.activation_root ? {
        activation_status: activation.activation_status,
        activation_reason: activation.reason_code || null,
        ...(activation.tuple_version_id ? { tuple_version_id: activation.tuple_version_id } : {}),
      } : {}),
    };
  };
  return reconcile;
}

export function createTestRegistryReconciler(config, dependencies) {
  if (!dependencies || typeof dependencies !== 'object') throw new TypeError('test dependencies required');
  return createRegistryReconciler(config, dependencies);
}

function cliArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv[2] === 'run' && process.argv.includes('--config')) {
  const configPath = cliArgument('--config');
  if (!configPath) throw new Error('run requires --config');
  await runRegistryWatcher({ configPath });
}
