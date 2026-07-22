#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeRollback, previewRollback, recoverActiveVersion, verifyVersion } from '../registry/activate.mjs';
import { stableStringify } from '../registry/schema.mjs';
import { loadCapsule, saveCapsule } from '../context/capsule.mjs';
import { resolveContextAction } from '../context/resolve.mjs';
import { proposeCandidate, evaluateCandidate, applyCanaryDecision } from '../evolution/canary-controller.mjs';
import { createPersistentEvidenceStore } from '../evolution/evidence.mjs';
import { assessCalibration, CALIBRATION_CORPUS, evaluateCalibrationCorpus, measureRoutes } from '../evolution/perf-measure.mjs';
import { buildCandidateCalibrationRoute, buildKnownGoodCalibrationRoute } from '../evolution/candidate-calibration-route.mjs';
import { compatible, COMPILED_INDEX_COMPATIBILITY } from '../prompt/compile-index.mjs';

// D-05 safety_correction predicate: a reconciliation report indicates a
// safety/recovery fix when its verdicts carry a safety reason_code. Used to
// decide whether a perf-neutral candidate still promotes (safety_correction)
// or preserves (neutral) — Phase 17 success criterion #4. Mirrors the
// isSafetyFix helper in src/registry/watcher.mjs:35-39 so the CLI promote path
// derives demonstrated_benefit with the SAME predicate as the watcher.
function isSafetyFix(report) {
  return Array.isArray(report?.verdicts) && report.verdicts.some((verdict) => (
    typeof verdict?.reason_code === 'string' && verdict.reason_code.startsWith('safety_')
  ));
}

const VERSION_ID = /^v1-[a-f0-9]{16}$/;
const MAX_VALUE = 256;
const MAX_DIFF = 256;
const EXIT = Object.freeze({ success: 0, usage: 2, invalid: 3, unsafe: 4, mutation: 5 });

function canonical(command, ok, reasonCode, data = {}, warnings = []) {
  return { schema_version: 1, command, ok, reason_code: reasonCode, data, warnings: [...warnings].sort() };
}

function activeSourceFailure(command, root, active) {
  if (!active) return { result: canonical(command, false, 'invalid_active_pointer', { next_action: 'run_registry_recovery' }), exitCode: EXIT.invalid };
  const verdict = verifyVersion({ ownedRoot: root, versionId: active.version_id });
  if (verdict.valid) return null;
  return {
    result: canonical(command, false, 'invalid_active_version', { source_verdict: verdict, next_action: 'run_registry_recovery' }, ['active authority is unsafe; recover before inspection or mutation']),
    exitCode: EXIT.unsafe,
  };
}

function pointer(root) {
  try {
    const value = JSON.parse(readFileSync(join(root, 'active.json'), 'utf8'));
    return VERSION_ID.test(value.version_id) && Number.isInteger(value.sequence) ? value : null;
  } catch { return null; }
}

function versionIds(root) {
  const directory = join(root, 'versions');
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter(value => VERSION_ID.test(value)).sort((a, b) => {
    const at = statSync(join(directory, a)).mtimeMs;
    const bt = statSync(join(directory, b)).mtimeMs;
    return bt - at || a.localeCompare(b);
  });
}

function readVersion(root, versionId) {
  const verdict = verifyVersion({ ownedRoot: root, versionId });
  if (!verdict.valid) return { verdict };
  const directory = join(root, 'versions', versionId);
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  return {
    verdict,
    manifest,
    registry: JSON.parse(readFileSync(join(directory, 'registry.json'), 'utf8')),
    mapping: JSON.parse(readFileSync(join(directory, 'mappings.json'), 'utf8')),
    verification: JSON.parse(readFileSync(join(directory, 'verification.json'), 'utf8')),
  };
}

function projection(versionId, version) {
  return {
    version_id: versionId,
    created_at: version.manifest.created_at,
    bundle_fingerprint: version.verdict.bundle_fingerprint,
    verification_fingerprint: version.verdict.verification_fingerprint,
  };
}

function mappingRows(mapping) {
  return (mapping?.subjects || mapping?.results || []).map(subject => ({
    subject_id: subject.subject_id,
    target_id: subject.target_id || null,
    disposition: subject.disposition,
  })).sort((a, b) => a.subject_id.localeCompare(b.subject_id));
}

function boundedResult(values) {
  const ordered = values.slice(0, MAX_DIFF);
  return {
    values: ordered,
    meta: { total: values.length, returned: ordered.length, truncated: values.length > MAX_DIFF, limit: MAX_DIFF, next_offset: values.length > MAX_DIFF ? MAX_DIFF : null },
  };
}

function diffVersions(root, sourceId, destinationId) {
  const source = readVersion(root, sourceId), destination = readVersion(root, destinationId);
  if (!source.verdict.valid || !destination.verdict.valid) return { ok: false, reason_code: !source.verdict.valid ? source.verdict.reason_code : destination.verdict.reason_code };
  const sourceRecords = new Map((source.registry.records || []).map(record => [record.id, record]));
  const destinationRecords = new Map((destination.registry.records || []).map(record => [record.id, record]));
  const recordIds = [...new Set([...sourceRecords.keys(), ...destinationRecords.keys()])].sort();
  const allRecordChanges = recordIds.flatMap(id => {
    const before = sourceRecords.get(id), after = destinationRecords.get(id);
    if (!before) return [{ id, change: 'added' }];
    if (!after) return [{ id, change: 'removed' }];
    return stableStringify(before) === stableStringify(after) ? [] : [{ id, change: 'changed' }];
  });
  const sourceMappings = new Map(mappingRows(source.mapping).map(row => [row.subject_id, row]));
  const destinationMappings = new Map(mappingRows(destination.mapping).map(row => [row.subject_id, row]));
  const allMappingChanges = [...new Set([...sourceMappings.keys(), ...destinationMappings.keys()])].sort().flatMap(subjectId => {
    const before = sourceMappings.get(subjectId), after = destinationMappings.get(subjectId);
    if (stableStringify(before) === stableStringify(after)) return [];
    return [{ subject_id: subjectId, from: before?.target_id || null, to: after?.target_id || null }];
  });
  const records = boundedResult(allRecordChanges), mappings = boundedResult(allMappingChanges);
  return {
    ok: true, source: projection(sourceId, source), destination: projection(destinationId, destination),
    record_changes: records.values, record_changes_meta: records.meta,
    mapping_changes: mappings.values, mapping_changes_meta: mappings.meta,
  };
}

function parse(argv) {
  const args = [...argv], options = { format: 'text', execute: false };
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value.length > 4096) throw new TypeError('argument_too_long');
    if (value === '--format' || value === '--owned-root' || value === '--confirm' || value === '--project-root' || value === '--instruction-json' || value === '--refresh-json') {
      const next = args[++index];
      if (!next || next.length > 4096) throw new TypeError('missing_option_value');
      options[value.slice(2).replace('-', '_')] = next;
    } else if (value === '--execute') options.execute = true;
    else if (value === '--help' || value === '-h') options.help = true;
    else if (value.startsWith('--')) throw new TypeError('unknown_option');
    else positional.push(value);
  }
  if (!['text', 'json'].includes(options.format)) throw new TypeError('invalid_format');
  return { positional, options };
}

function textResult(result) {
  const lines = [`COMMAND ${result.command}`, `OK ${result.ok}`, `REASON ${result.reason_code}`];
  for (const [key, value] of Object.entries(result.data).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`${key.toUpperCase()} ${typeof value === 'object' ? stableStringify(value) : value}`);
  }
  for (const warning of result.warnings) lines.push(`WARNING ${warning}`);
  return `${lines.join('\n')}\n`;
}

function usage() {
  return 'Usage: router-control <status|diff|explain|registry verify|rollback|context status|refresh|resolve|why-next|canary status|promote|rollback> [--format text|json] [--owned-root path] [--execute --confirm version]\n';
}

function parseJsonOption(value, fallback) {
  if (value === undefined) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

function refreshedValue(capsule, refresh) {
  return {
    ...capsule,
    position: { ...capsule.position, ...refresh.position },
    status: refresh.status || capsule.status,
    freshness: { captured_at: Date.now(), generation: `refresh-${refresh.position?.phase || capsule.position.phase}` },
    provenance: { source: 'authoritative-refresh', version: '1' },
  };
}

function overrideValue(capsule, action, supersession) {
  return {
    schema_version: capsule.schema_version,
    scope: capsule.scope,
    goal: { id: action.goal_id, summary: action.goal_id },
    position: {
      workflow: action.workflow || 'explicit', phase: action.phase || 'none',
      plan: action.plan || 'none', task: action.task || action.action || 'next',
    },
    status: 'active', artifacts: action.artifact_ref ? [{
      ref: action.artifact_ref, type: 'artifact', status: 'next', witness: { kind: 'version', value: 'explicit' }, priority: 1,
    }] : [], blockers: [], freshness: { captured_at: Date.now(), generation: `override-${action.phase || 'explicit'}` },
    provenance: { source: 'explicit-instruction', version: '1' },
    ...(supersession ? { supersession: { workflow_identity: supersession.workflow_identity, reason: supersession.reason } } : {}),
  };
}

function runContextCommand({ subcommand, root, options }) {
  if (!['status', 'refresh', 'resolve', 'why-next'].includes(subcommand)) return { result: canonical('context', false, 'invalid_arguments'), exitCode: EXIT.usage };
  const loaded = loadCapsule({ ownedRoot: root });
  if (subcommand === 'status') {
    const ok = loaded.status === 'active' || loaded.status === 'recovered_lkg';
    return { result: canonical('context status', ok, loaded.reason_code, { status: loaded.status, ...(loaded.capsule ? { capsule: loaded.capsule } : {}) }), exitCode: ok ? 0 : EXIT.invalid };
  }
  if (!loaded.capsule) return { result: canonical(`context ${subcommand}`, false, loaded.reason_code, { status: loaded.status }), exitCode: EXIT.invalid };
  const instruction = parseJsonOption(options.instruction_json, { kind: 'none' });
  if (!instruction) return { result: canonical(`context ${subcommand}`, false, 'invalid_instruction_json'), exitCode: EXIT.usage };
  const refresh = parseJsonOption(options.refresh_json, null);
  if (options.refresh_json !== undefined && !refresh) return { result: canonical(`context ${subcommand}`, false, 'invalid_refresh_json'), exitCode: EXIT.usage };
  const resolution = resolveContextAction({
    instruction, capsule: loaded.capsule,
    ...(subcommand === 'refresh' ? { freshness: 'stale', authoritative: refresh ? { status: 'dispatchable', value: refresh } : { status: 'unresolved' } } : {}),
  });
  let save = null;
  if (subcommand !== 'why-next' && resolution.dispatch_eligible && resolution.outcome === 'refresh') save = saveCapsule({ ownedRoot: root, capsule: refreshedValue(loaded.capsule, resolution.refresh) });
  if (subcommand !== 'why-next' && resolution.dispatch_eligible && resolution.outcome === 'override' && resolution.action.goal_id) save = saveCapsule({ ownedRoot: root, capsule: overrideValue(loaded.capsule, resolution.action, resolution.supersession) });
  if (save?.status === 'blocked') return { result: canonical(`context ${subcommand}`, false, save.reason_code, { resolution }), exitCode: EXIT.mutation };
  const ok = resolution.dispatch_eligible || resolution.outcome === 'none';
  return { result: canonical(`context ${subcommand}`, ok, resolution.reason_code, { resolution, ...(save ? { save: { status: save.status, reason_code: save.reason_code } } : {}) }), exitCode: ok ? 0 : EXIT.invalid };
}

export function runRouterControl({ argv = [], stdin = '', defaultOwnedRoot, dependencies = {} } = {}) {
  let parsed;
  try { parsed = parse(argv); } catch (error) { return { result: canonical('usage', false, error.message), exitCode: EXIT.usage }; }
  const { positional, options } = parsed;
  if (options.help) return { result: canonical('help', true, 'help', { usage: usage().trim() }), exitCode: EXIT.success };
  const root = resolve(options.owned_root || defaultOwnedRoot || join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
  const command = positional[0];
  if (command === 'context') {
    if (positional.length !== 2) return { result: canonical('context', false, 'invalid_arguments'), exitCode: EXIT.usage };
    return runContextCommand({ subcommand: positional[1], root, options });
  }
  const active = pointer(root);
  if (command === 'status') {
    if (positional.length !== 1) return { result: canonical('status', false, 'invalid_arguments'), exitCode: EXIT.usage };
    const unsafe = activeSourceFailure('status', root, active); if (unsafe) return unsafe;
    const version = readVersion(root, active.version_id);
    return { result: canonical('status', true, 'healthy', { active: { ...projection(active.version_id, version), sequence: active.sequence }, versions: versionIds(root) }), exitCode: 0 };
  }
  if (command === 'registry' && positional[1] === 'verify') {
    if (positional.length > 3) return { result: canonical('registry verify', false, 'invalid_arguments'), exitCode: EXIT.usage };
    const versionId = positional[2] || active?.version_id;
    if (!versionId) return { result: canonical('registry verify', false, 'invalid_active_pointer'), exitCode: EXIT.invalid };
    const verdict = verifyVersion({ ownedRoot: root, versionId });
    return { result: canonical('registry verify', verdict.valid, verdict.reason_code, { verification: verdict }), exitCode: verdict.valid ? 0 : EXIT.invalid };
  }
  if (command === 'diff') {
    if (![1, 3].includes(positional.length)) return { result: canonical('diff', false, 'invalid_arguments'), exitCode: EXIT.usage };
    if (positional.length === 1) { const unsafe = activeSourceFailure('diff', root, active); if (unsafe) return unsafe; }
    const ids = versionIds(root), sourceId = positional[1] || active?.version_id, destinationId = positional[2] || ids.find(id => id !== sourceId) || sourceId;
    if (!sourceId || !destinationId) return { result: canonical('diff', false, 'insufficient_history'), exitCode: EXIT.invalid };
    const data = diffVersions(root, sourceId, destinationId);
    return data.ok ? { result: canonical('diff', true, 'diff_ready', data), exitCode: 0 } : { result: canonical('diff', false, data.reason_code), exitCode: EXIT.invalid };
  }
  if (command === 'explain') {
    if (positional.length > 2) return { result: canonical('explain', false, 'invalid_arguments'), exitCode: EXIT.usage };
    const unsafe = activeSourceFailure('explain', root, active); if (unsafe) return unsafe;
    const version = readVersion(root, active.version_id);
    if (!version.verdict.valid) return { result: canonical('explain', false, version.verdict.reason_code), exitCode: EXIT.invalid };
    const rows = version.mapping.subjects || version.mapping.results || [];
    const subject = positional[1] ? rows.find(item => item.subject_id === positional[1]) : null;
    if (positional[1] && !subject) return { result: canonical('explain', false, 'subject_not_found'), exitCode: EXIT.invalid };
    const filters = { exact_candidate: true, lifecycle: true, dispatchable: true, invocation: true, scope: true, permissions: true, dependencies: true, collisions: true };
    return { result: canonical('explain', true, 'explanation_ready', subject ? { version: projection(active.version_id, version), subject, filters } : { version: projection(active.version_id, version), subjects: rows, filters }), exitCode: 0 };
  }
  if (command === 'rollback') {
    if (positional.length !== 2 || !VERSION_ID.test(positional[1])) return { result: canonical('rollback', false, 'invalid_version_id'), exitCode: EXIT.usage };
    const unsafe = activeSourceFailure('rollback', root, active); if (unsafe) return unsafe;
    const destination = positional[1], preview = previewRollback({ ownedRoot: root, destination });
    if (preview.preview_status !== 'ready') return { result: canonical('rollback', false, preview.reason_code, { preview }), exitCode: EXIT.unsafe };
    const diff = diffVersions(root, preview.source_version_id, destination);
    const source = readVersion(root, preview.source_version_id), target = readVersion(root, destination);
    const detail = {
      preview: { ...preview, source: projection(preview.source_version_id, source), destination: projection(destination, target) },
      record_changes: diff.record_changes,
      record_changes_meta: diff.record_changes_meta,
      mapping_changes: diff.mapping_changes,
      mapping_changes_meta: diff.mapping_changes_meta,
      verification: target.verdict,
      mutation: { type: 'active_pointer_replacement_only', path: 'active.json', expected_sequence: preview.source_sequence, next_sequence: preview.source_sequence + 1 },
    };
    if (!options.execute) return { result: canonical('rollback', true, 'rollback_preview_ready', detail, ['execution_requires_exact_destination_confirmation']), exitCode: 0 };
    const confirmation = options.confirm ?? String(stdin).replace(/[\r\n]+$/, '');
    if (confirmation !== destination) return { result: canonical('rollback', false, 'confirmation_mismatch', detail), exitCode: EXIT.usage };
    const rollback = executeRollback({ ownedRoot: root, preview, confirmation, reason: 'operator_rollback', io: dependencies.rollbackIo });
    const ok = rollback.rollback_status === 'rolled_back';
    const exitCode = ok ? 0 : rollback.rollback_status === 'recovery_required' ? EXIT.mutation : rollback.reason_code === 'confirmation_mismatch' ? EXIT.usage : EXIT.unsafe;
    return { result: canonical('rollback', ok, ok ? 'rollback_complete' : rollback.reason_code, { ...detail, rollback }), exitCode };
  }
  // Plan 20-03: canary {status|promote|rollback} — the operator-driven trigger
  // surface for the canary controller. Distinct from the registry `rollback`
  // verb above (reason='operator_rollback', any valid destination): canary
  // rollback uses reason='canary_rollback' and destination=known_good_version
  // only (narrower). All canary subcommands delegate publication mutation
  // exclusively through applyCanaryDecision -> REGISTRY_PUBLICATION ->
  // activate.mjs; router-control.mjs never writes active.json directly.
  if (command === 'canary') {
    const subcommand = positional[1];
    if (!['status', 'promote', 'rollback'].includes(subcommand)) {
      return { result: canonical('canary', false, 'invalid_subcommand', { subcommand: subcommand ?? null, usage: usage().trim() }), exitCode: EXIT.usage };
    }
    try {
      // Canary subcommand body. createPersistentEvidenceStore's mkdirSync and
      // downstream publication helpers can throw (permission denied, read-only
      // fs, disk full). Catch here so programmatic callers receive a structured
      // canonical failure instead of a raw exception propagating through
      // runRouterControl (the CLI entry point's generic catch at line ~552
      // otherwise emits 'ROUTER CONTROL FAILED: internal_error' with exit code
      // 5 (mutation), which is misleading for a read/setup failure).
      const recoverActive = dependencies.recoverActiveVersion || recoverActiveVersion;
      const recovered = recoverActive({ ownedRoot: root });
      const knownGood = (recovered.recovery_status === 'healthy' || recovered.recovery_status === 'recovered')
        ? recovered.version_id : null;
      const canaryActive = pointer(root);
  
      if (subcommand === 'status') {
        const createStore = dependencies.createPersistentEvidenceStore || createPersistentEvidenceStore;
        const store = createStore({ root: join(root, 'evidence') });
        const window = store.window({ project_id: 'global' });
        return {
          result: canonical('canary status', true, 'canary_status_ready', {
            active_version: canaryActive?.version_id ?? null,
            known_good_version: knownGood,
            evidence_window: {
              sufficient: window?.sufficient ?? false,
              sample_count: window?.sample_count ?? 0,
              weighted_samples: window?.weighted_samples ?? 0,
              source_evidence_fingerprint: window?.source_evidence_fingerprint ?? null,
            },
          }),
          exitCode: 0,
        };
      }
  
      if (subcommand === 'promote') {
        // Load the last-built candidate + reconciliation report from disk (the
        // watcher writes candidate/registry.json + candidate/report.json on
        // every eligible reconcile). The candidate file may carry the full
        // registry (records) or a summary; promote requires the full registry
        // to rebuild the route fn via the D-04 helper.
        const candidatePath = join(root, 'candidate', 'registry.json');
        const reportPath = join(root, 'candidate', 'report.json');
        let candidateFile = null, reportFile = null;
        try { candidateFile = JSON.parse(readFileSync(candidatePath, 'utf8')); } catch { /* no candidate staged */ }
        try { reportFile = JSON.parse(readFileSync(reportPath, 'utf8')); } catch { /* no report staged */ }
        if (!candidateFile || !Array.isArray(candidateFile.records)) {
          return { result: canonical('canary promote', false, 'canary_no_candidate', { candidate_staged: !!candidateFile, has_records: !!(candidateFile?.records), next_action: 'wait_for_watcher_eligible_reconcile' }), exitCode: EXIT.invalid };
        }
        if (!knownGood) {
          // Mirror the watcher's bootstrap gate (watcher.mjs: if knownGood === null,
          // take the bootstrap path, bypassing applyCanaryDecision). Promoting a
          // candidate with no known-good version means there is no rollback target
          // if the activation breaks something — refuse rather than activate blind.
          return {
            result: canonical('canary promote', false, 'no_known_good_version', {
              known_good_version: null,
              published_version: canaryActive?.version_id ?? null,
              next_action: 'run_registry_recovery_or_bootstrap',
            }),
            exitCode: EXIT.invalid,
          };
        }
        const registry = {
          schema_version: candidateFile.schema_version || 1,
          records: candidateFile.records,
          compatibility: candidateFile.compatibility || {},
        };
        const mapping = candidateFile.mapping || { schema_version: 1, subjects: [] };
        // Fail-closed when the watcher's report.json is missing (partial write,
        // corruption, manual deletion): the watcher always writes both files
        // atomically together, so a missing report means no safety reconciliation
        // actually occurred. Fall back to the candidate file's embedded
        // disposition (the watcher writes `disposition` into candidate/registry.json
        // at watcher.mjs:325-333); if even that is absent, treat as quarantined so
        // the safety gate refuses to promote. Never silently default to 'eligible'.
        const reconciliation = reportFile || {
          disposition: candidateFile?.disposition === 'eligible' ? 'eligible' : 'quarantined',
          verdicts: candidateFile?.verdicts || [],
          candidate_fingerprint: candidateFile?.candidate_fingerprint || 'candidate-unknown',
        };
        if (!reportFile && !candidateFile?.disposition) {
          return {
            result: canonical('canary promote', false, 'missing_reconciliation_report', {
              candidate_staged: true,
              report_staged: false,
              candidate_disposition: null,
              next_action: 'wait_for_watcher_eligible_reconcile',
            }),
            exitCode: EXIT.invalid,
          };
        }
        const policyFingerprint = reportFile?.policy_fingerprint || 'policy-unknown';
  
        const createStore = dependencies.createPersistentEvidenceStore || createPersistentEvidenceStore;
        const store = createStore({ root: join(root, 'evidence') });
        const window = store.window({ project_id: 'global' });
  
        const buildCandidateRoute = dependencies.buildCandidateCalibrationRoute || buildCandidateCalibrationRoute;
        const buildKnownGoodRoute = dependencies.buildKnownGoodCalibrationRoute || buildKnownGoodCalibrationRoute;
        const evaluateCorpus = dependencies.evaluateCalibrationCorpus || evaluateCalibrationCorpus;
        const measure = dependencies.measureRoutes || measureRoutes;
        const assess = dependencies.assessCalibration || assessCalibration;
        const compatibleFn = dependencies.compatible || compatible;
        const propose = dependencies.proposeCandidate || proposeCandidate;
        const evaluate = dependencies.evaluateCandidate || evaluateCandidate;
        const applyDecision = dependencies.applyCanaryDecision || applyCanaryDecision;
  
        let candidateCtx = null, knownGoodCtx = null;
        let candidate, evaluation, demonstrated_benefit, decision_preview;
        try {
          const helperNow = Date.now();
          candidateCtx = buildCandidateRoute({ registry, mapping, policyFingerprint, now: helperNow, deps: dependencies.helperDeps });
          knownGoodCtx = knownGood ? buildKnownGoodRoute({ ownedRoot: root, now: helperNow, deps: dependencies.helperDeps }) : null;
          const versionsBase = { policy: COMPILED_INDEX_COMPATIBILITY.policy_version, corpus: 'router-calibration-v1' };
          const candidateEvaluation = evaluateCorpus({ corpus: CALIBRATION_CORPUS, route: candidateCtx.route, versions: { candidate: reconciliation.candidate_fingerprint, compiled_index: candidateCtx.versionId, ...versionsBase } });
          const knownGoodEvaluation = knownGoodCtx ? evaluateCorpus({ corpus: CALIBRATION_CORPUS, route: knownGoodCtx.route, versions: { candidate: knownGood, compiled_index: knownGood, ...versionsBase } }) : null;
          const candidatePerf = measure({ fixtures: CALIBRATION_CORPUS, route: candidateCtx.route, versions: { candidate: reconciliation.candidate_fingerprint, compiled_index: candidateCtx.versionId, ...versionsBase } });
          const assessed = assess({ evaluation: candidateEvaluation, performance: candidatePerf });
          const privacyPass = !(window?.observations || []).some((r) => (
            r?.signal?.confidence_band === 'deny_filtered'
            || (r?.signal?.guard_codes || []).some((c) => ['privacy_guard', 'deny_filtered', 'secret_detected', 'content_detected'].includes(c))
          ));
          const gates = {
            safety: { pass: reconciliation.disposition === 'eligible', reason_code: reconciliation.disposition === 'eligible' ? 'safety_passed' : 'safety_uncertain' },
            privacy: { pass: privacyPass, reason_code: 'privacy_passed' },
            quality: candidateEvaluation.quality,
            context_budget: candidateEvaluation.context_budget,
            latency: assessed.latency,
            compatibility: { pass: compatibleFn(registry.compatibility) === true, reason_code: 'compatibility_passed' },
          };
          const proposed = propose({
            source_evidence_fingerprint: window.source_evidence_fingerprint,
            policy_version: COMPILED_INDEX_COMPATIBILITY.policy_version,
            compiled_index_version: candidateCtx.versionId || reconciliation.candidate_fingerprint,
            evaluation_inputs: { corpus: CALIBRATION_CORPUS, gates },
            proposal: { registry, mapping, reconciliation },
          });
          candidate = proposed.candidate;
          evaluation = evaluate({ candidate, evidence_window: window, gates, known_good_version: knownGood });
          // D-05 demonstrated_benefit derivation (SAME predicate as the watcher):
          // strict-improve on quality OR context_budget; latency hard gate;
          // safety_correction on parity when the report is a safety fix; neutral
          // otherwise -> preserve (never promote on parity — Phase 17 SC #4).
          if (!evaluation.promotable) {
            demonstrated_benefit = null;
          } else {
            const strictImproveQuality = candidateEvaluation.quality.pass === true && knownGoodEvaluation?.quality.pass === false;
            const strictImproveContext = candidateEvaluation.context_budget.pass === true && knownGoodEvaluation?.context_budget.pass === false;
            const strictImprove = strictImproveQuality || strictImproveContext;
            const latencyPass = assessed.latency.pass === true;
            if (strictImprove && latencyPass) {
              demonstrated_benefit = { status: 'demonstrated', reason_code: strictImproveQuality ? 'quality_improved' : 'context_bytes_reduced' };
            } else if (!strictImprove && latencyPass && isSafetyFix(reconciliation)) {
              demonstrated_benefit = { status: 'safety_correction', reason_code: 'safety_fix' };
            } else {
              demonstrated_benefit = { status: 'neutral', reason_code: 'no_strict_improvement' };
            }
          }
          decision_preview = {
            candidate_id: candidate?.id ?? null,
            promotable: evaluation?.promotable ?? false,
            demonstrated_benefit: demonstrated_benefit?.status ?? null,
            evidence_sufficient: window?.sufficient ?? false,
          };
        } finally {
          // Backstop (T-20-25): cleanup D-04 helper temp ownedRoots on every path.
          candidateCtx?.cleanup?.();
          knownGoodCtx?.cleanup?.();
        }
  
        const detail = {
          candidate: { id: candidate?.id ?? null },
          evaluation: { promotable: evaluation?.promotable ?? false, reason_code: evaluation?.reason_code ?? null },
          decision_preview,
        };
        if (!options.execute) {
          return { result: canonical('canary promote', true, 'canary_promote_preview_ready', detail, ['execution_requires_exact_candidate_confirmation']), exitCode: 0 };
        }
        // CR-02a (gap-closure 20-05): evidence-sufficiency gate BEFORE the confirmation
        // check and BEFORE applyDecision. Mirrors the watcher's Pitfall 5 behavior
        // (src/registry/watcher.mjs:394-395): insufficient evidence must PRESERVE, not
        // roll back. Without this gate, evaluateCandidate returns promotable:false
        // (canary-controller.mjs:112) and applyCanaryDecision's rollback branch fires
        // (canary-controller.mjs:176-193) because published_version is non-null — an
        // operator asking to PROMOTE gets a surprise ROLLBACK to known_good_version.
        // The gate short-circuits with reason_code='insufficient_evidence_samples'
        // and does NOT call applyDecision, preserving the safety contract.
        if (window.sufficient !== true) {
          return { result: canonical('canary promote', false, 'insufficient_evidence_samples', detail), exitCode: EXIT.invalid };
        }
        const confirmation = options.confirm ?? String(stdin).replace(/[\r\n]+$/, '');
        if (confirmation !== (candidate?.id ?? '')) {
          return { result: canonical('canary promote', false, 'confirmation_mismatch', detail), exitCode: EXIT.usage };
        }
        const decision = applyDecision({
          evaluation,
          demonstrated_benefit,
          activation: { ownedRoot: root, candidate: registry, reconciliation, mapping, policy: {}, verification: { policy_fingerprint: policyFingerprint }, reason: 'canary_promote', test_mode: false },
          ownedRoot: root,
          known_good_version: knownGood,
          published_version: canaryActive?.version_id ?? null,
        });
        const reasonMap = { promoted: 'canary_promote_complete', preserved: 'canary_preserved', rolled_back: 'canary_rolled_back', recovery_required: 'recovery_required', rejected: 'canary_rejected' };
        const ok = decision.status === 'promoted';
        return { result: canonical('canary promote', ok, reasonMap[decision.status] || decision.reason_code || 'canary_decision_failed', { ...detail, decision }), exitCode: ok ? 0 : EXIT.invalid };
      }
  
      if (subcommand === 'rollback') {
        // canary rollback destination is recoverActiveVersion's known_good_version
        // ONLY — NOT an arbitrary positional (unlike the existing rollback verb at
        // line 263 which takes positional[1] as the destination). Any extra
        // positional is ignored. reason='canary_rollback' (in activation) is
        // distinct from the existing rollback verb's reason='operator_rollback'.
        if (!knownGood) {
          return { result: canonical('canary rollback', false, 'no_known_good_version', { known_good_version: null, published_version: canaryActive?.version_id ?? null }), exitCode: EXIT.invalid };
        }
        const destination = knownGood;
        const detail = {
          destination,
          known_good_version: knownGood,
          published_version: canaryActive?.version_id ?? null,
          mutation: { type: 'canary_rollback_to_known_good', path: 'active.json', reason: 'canary_rollback' },
        };
        if (!options.execute) {
          return { result: canonical('canary rollback', true, 'canary_rollback_preview_ready', detail, ['execution_requires_exact_destination_confirmation']), exitCode: 0 };
        }
        const confirmation = options.confirm ?? String(stdin).replace(/[\r\n]+$/, '');
        if (confirmation !== destination) {
          return { result: canonical('canary rollback', false, 'confirmation_mismatch', detail), exitCode: EXIT.usage };
        }
        // Force the applyCanaryDecision rollback branch: evaluation.promotable=false
        // with a published_version present triggers the rollback-to-known_good
        // path (canary-controller.mjs:175-193). Publication mutation flows through
        // REGISTRY_PUBLICATION -> activate.mjs (previewRollback/executeRollback);
        // router-control.mjs never writes active.json directly.
        const evaluation = { promotable: false, candidate_id: null, reason_code: 'operator_canary_rollback', preserve_version: knownGood };
        const applyDecision = dependencies.applyCanaryDecision || applyCanaryDecision;
        const decision = applyDecision({
          evaluation,
          demonstrated_benefit: null,
          activation: { ownedRoot: root, reason: 'canary_rollback', candidate: null },
          ownedRoot: root,
          known_good_version: knownGood,
          published_version: canaryActive?.version_id ?? null,
          // CR-02b (gap-closure 20-05): pass rollback_reason='canary_rollback' so
          // applyCanaryDecision (canary-controller.mjs:155) records `reason: 'canary_rollback'`
          // in the audit trail (line 188: `reason: rollback_reason || 'rollback'`). Without
          // this param the audit trail records the generic 'rollback', making canary rollback
          // indistinguishable from registry rollback (20-03 truth 4). The activation.reason
          // above is a separate field (the activation reason, not the rollback audit reason).
          rollback_reason: 'canary_rollback',
        });
        const ok = decision.status === 'rolled_back';
        return { result: canonical('canary rollback', ok, ok ? 'canary_rollback_complete' : (decision.reason_code || 'canary_rollback_failed'), { ...detail, decision }), exitCode: ok ? 0 : EXIT.unsafe };
      }
    } catch (error) {
      return { result: canonical('canary', false, 'internal_error', { error: error.message }), exitCode: EXIT.mutation };
    }
  }
  return { result: canonical(command || 'usage', false, 'unknown_command', { usage: usage().trim() }), exitCode: EXIT.usage };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    const stdin = process.stdin.isTTY ? '' : readFileSync(0, 'utf8');
    const { positional, options } = parse(process.argv.slice(2));
    const outcome = runRouterControl({ argv: process.argv.slice(2), stdin });
    process.stdout.write(options.format === 'json' ? `${stableStringify(outcome.result)}\n` : textResult(outcome.result));
    process.exitCode = outcome.exitCode;
  } catch {
    process.stderr.write('ROUTER CONTROL FAILED: internal_error\n');
    process.exitCode = EXIT.mutation;
  }
}
