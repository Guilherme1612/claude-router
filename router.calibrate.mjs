// router.calibrate.mjs — dry-run calibration harness for the Phase 1 exit gate.
//
// Loads the 13-15 user-approved calibration right-picks (calibration-tasks.json;
// 10 Phase-1 originals + 3-5 Phase-2 codebase fixtures), runs each prompt
// through the SAME pipeline functions as router.mjs (DRY — imported via ESM,
// not duplicated) UP TO the route decision, compares the router's pick against
// the right-pick, and prints `X/N right`.
//
// Phase 2 extension (Plan 02-03 / D-15, D-16): codebase fixtures carry a
// `cwd` field and a `graph_status_expected` field. The harness exercises
// graphifyHeuristic + applyGraphBoost on every fixture and prints a per-fixture
// `graph_status` + symbol-count column. The pass threshold is dynamic:
// originalCount + 1 (so the original 10 must remain 10/10 AND at least 1 of the
// new codebase fixtures must be right). Phase-1's 8/10-of-originals gate (VRF-02)
// is preserved as the lower bound.
//
// Dry-run (D-13): does NOT emit additionalContext, does NOT write to a live
// session, does NOT touch the cache or telemetry. Threshold tuning is a DATA
// edit the user makes against the printed score distribution (T_high/T_low/M in
// mode-map.json) — this harness does NOT auto-mutate mode-map (Phase 3 adds
// auto-mutation).
//
// Exit code: 0 iff rightCount >= originalCount + 1 (D-16), non-zero otherwise.
// A non-zero exit prints the wrong high-confidence picks so the user can raise
// T_high (D-09: prefer false pass-through over wrong auto-route).

import { readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mapCandidateRegistry } from './src/registry/map.mjs';

const HOME = homedir();
const GLOBAL_CALIBRATION_CWD = tmpdir();
const ROUTER_DIR = join(HOME, '.claude', 'router');
const MANIFEST = join(ROUTER_DIR, 'claude-inventory-manifest.json');
const MODE_MAP = join(ROUTER_DIR, 'mode-map.json');
const CALIBRATION = new URL('./calibration-tasks.json', import.meta.url);

// Import the SAME pipeline functions as router.mjs — DRY, not duplicated.
const routerUrl = pathToFileURL(join(HOME, '.claude', 'hooks', 'router.mjs')).href;
const R = await import(routerUrl);

// --- helpers --------------------------------------------------------------

const normMode = (m) => (m == null ? null : String(m).replace(/^\//, ''));
const asSet = (a) => new Set((Array.isArray(a) ? a : []).filter(Boolean).map((x) => String(x)));
const setEq = (a, b) => {
  const sa = asSet(a), sb = asSet(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
};

function codebaseRightTarget(codebaseCount) {
  const count = Math.max(0, Number(codebaseCount) || 0);
  if (count === 0) return 0;
  if (count < 7) return count;
  return Math.max(5, Math.ceil(count * 0.7));
}

export function calibrationPassThreshold({ originalCount, codebaseCount, evolutionCount, phase05Count, mappingCount }) {
  return originalCount + (codebaseCount > 0 ? 1 : 0) + (evolutionCount > 0 ? 1 : 0) + phase05Count + mappingCount;
}

function calibrationCapability(record, index) {
  const canonicalIdentity = String(record.canonical_identity || `router/calibration-${index}`);
  const name = canonicalIdentity.split('/').pop();
  return {
    schema_version: 1, type: 'skill', name, canonical_identity: canonicalIdentity,
    lifecycle: 'ready', scope: { kind: 'global' }, dispatchable: true,
    invocation: { runtime: 'claude', command: name, args: [] },
    dependencies: { state: 'unknown', items: [] },
    provenance: [{ runtime: 'claude', scope: 'global', logical_root: 'calibration', relative_path: `skills/${name}/SKILL.md`, source_fingerprint: `calibration:${index}:${name}`, adapter: 'calibration/1' }],
    runtime_variants: [{ runtime: 'claude', native_identity: `skill:${name}` }], conflicts: [],
    ...(record.mapping ? { mapping: record.mapping } : {}),
  };
}

export function evaluatePhase14MappingFixture(task) {
  try {
    const fixture = task?.mapping_fixture;
    if (!task?.phase14_mapping || !fixture || typeof fixture.subject_id !== 'string' || !Array.isArray(fixture.registry?.records)) {
      return { ok: false, detail: 'invalid_mapping_fixture' };
    }
    const candidate = { schema_version: 1, records: fixture.registry.records.map(calibrationCapability) };
    const mapping = mapCandidateRegistry({ candidate, reconciliation: { disposition: 'eligible' } });
    const subject = mapping.subjects.find(value => value.subject_id === fixture.subject_id);
    const expectedDisposition = fixture.expected_disposition || 'mapped';
    const dispositionOk = subject?.disposition === expectedDisposition;
    const targetOk = expectedDisposition !== 'mapped' || subject?.target_id === fixture.expected_target;
    return {
      ok: dispositionOk && targetOk,
      detail: dispositionOk && targetOk ? 'mapping match' : `got disposition=${subject?.disposition || 'missing'} target=${subject?.target_id || 'none'} want disposition=${expectedDisposition} target=${fixture.expected_target || 'none'}`,
      mapping, subject,
    };
  } catch (error) { return { ok: false, detail: `mapping_error:${error.message}` }; }
}

function classifyCalibrationMiss(task, result, evaluation) {
  const detail = String(evaluation?.detail || '');
  const topNames = (result?.top3 || []).map((candidate) => String(candidate?.name || ''));
  const graphExpected = task?.graph_status_expected;
  const graphActual = result?.graph_status;

  if (graphExpected && graphActual && graphExpected !== graphActual) {
    return { class: 'graph_signal', follow_up: 'graph' };
  }
  if (/skills:|agents:|completion_promise:|task:/.test(detail)) {
    return { class: 'target_shape', follow_up: 'target-shape' };
  }
  if (result?.skipReason === 'margin_tie' || /margin_tie|margin/.test(detail)) {
    return { class: 'threshold_margin', follow_up: 'threshold' };
  }
  if (!result?.route || result?.route?.mode == null) {
    return { class: 'mode_map_gap', follow_up: 'mode-map' };
  }
  if (/mode:/.test(detail)) {
    const rightMode = normMode(task?.right?.mode);
    const gotMode = normMode(result?.route?.mode);
    if (rightMode && gotMode && topNames.includes(rightMode)) {
      return { class: 'threshold_margin', follow_up: 'threshold' };
    }
    return { class: 'scoring_conflict', follow_up: 'scoring' };
  }
  return { class: 'fixture_gap', follow_up: 'fixture' };
}

// Adapter over router.mjs inspectDecision. Calibration keeps its existing
// printed output/evaluation shape, but the route decision comes from the same
// shared dry-run helper used by inspect/preview and production routing.
function dryRun(prompt, manifest, modeMap, cwd = process.cwd(), weights = null) {
  const out = R.inspectDecision(prompt, {
    cwd,
    mutateCache: false,
    logTelemetry: false,
    emitInjection: false,
    bumpEvolution: false,
    includePrompt: false,
    manifestPath: MANIFEST,
    modeMapPath: MODE_MAP,
    weightsPath: join(ROUTER_DIR, '__calibration-no-file-weights.json'),
    cachePath: join(ROUTER_DIR, '__calibration-no-cache-writes.json'),
    manifest,
    modeMap,
    weights,
  });
  const top3 = (out.candidates || []).slice(0, 3).map((s) => ({
    name: s.name,
    norm: Number(Number(s.final_score || 0).toFixed(3)),
  }));
  const route = out.selected_route ? { ...out.selected_route } : null;
  if (route && route.weight_applied == null && out.score_debug && typeof out.score_debug.weight_applied === 'number') {
    route.weight_applied = out.score_debug.weight_applied;
  }
  return {
    tier: out.selected_tier,
    route,
    guards_fired: out.guards_fired || [],
    top3,
    margin: Number(Number(out.margin || 0).toFixed(3)),
    skipReason: out.pass_through_reason || null,
    graph_status: out.graphify ? out.graphify.status : 'not_triggered',
    graph_symbols: out.graphify ? out.graphify.symbols || [] : [],
    elapsed_ms: out.graphify ? out.graphify.elapsed_ms || 0 : 0,
  };
}

const thresholdTier = (record, thresholds) => {
  if (record.score < thresholds.T_low) return 'low';
  if (record.margin < thresholds.M) return record.canonical === false ? 'low' : 'medium';
  return record.score >= thresholds.T_high ? 'high' : 'medium';
};

const uniqueSorted = (values) => [...new Set(values.filter(Number.isFinite))].sort((a, b) => a - b);

export function enumerateThresholdCandidates(records, current) {
  const breakpoints = (values) => values.flatMap((value) => [value, Number(Math.min(1, value + 0.001).toFixed(3))]);
  const highs = uniqueSorted([current.T_high, ...breakpoints(records.map(({ score }) => score))]);
  const lows = uniqueSorted([current.T_low, ...breakpoints(records.map(({ score }) => score))]);
  const margins = uniqueSorted([current.M, ...breakpoints(records.map(({ margin }) => margin))]);
  const candidates = [];
  for (const T_high of highs) {
    for (const T_low of lows) {
      if (T_low > T_high) continue;
      for (const M of margins) candidates.push({ T_high, T_low, M });
    }
  }
  return candidates;
}

function evaluateThresholds(records, thresholds) {
  const rows = records.map((record) => ({ ...record, actual_tier: thresholdTier(record, thresholds) }));
  return {
    rows,
    wrong_high: rows.filter(({ correct, actual_tier }) => !correct && actual_tier === 'high').length,
    correct_routes: rows.filter(({ correct }) => correct).length,
    correct_tiers: rows.filter(({ expected_tier, actual_tier }) => expected_tier === actual_tier).length,
    correct_high: rows.filter(({ correct, actual_tier }) => correct && actual_tier === 'high').length,
    misses: rows.filter(({ correct, actual_tier }) => !correct || (correct && actual_tier === 'low')).length,
  };
}

const betterObjective = (a, b) => a.some((value, index) =>
  value !== b[index] && a.slice(0, index).every((prior, priorIndex) => prior === b[priorIndex])
    ? value > b[index]
    : false);

function affectedSamples(records, thresholds, candidates, key) {
  const selectedTiers = records.map((record) => thresholdTier(record, thresholds));
  const alternatives = uniqueSorted(candidates.map((candidate) => candidate[key])).filter((value) => value !== thresholds[key]);
  return records
    .filter((record, index) => alternatives.some((value) =>
      thresholdTier(record, { ...thresholds, [key]: value }) !== selectedTiers[index]))
    .map(({ id }) => id);
}

export function selectThresholds(records, current, { requireEvidence = true } = {}) {
  const candidates = enumerateThresholdCandidates(records, current);
  let selected = null;
  for (const thresholds of candidates) {
    const metrics = evaluateThresholds(records, thresholds);
    if (metrics.wrong_high) continue;
    const objective = [
      -metrics.wrong_high,
      metrics.correct_routes,
      metrics.correct_tiers,
      metrics.correct_high,
      -metrics.misses,
      -thresholds.T_high,
      -thresholds.T_low,
      -thresholds.M,
    ];
    if (!selected || betterObjective(objective, selected.objective)) {
      selected = { thresholds, metrics, objective };
    }
  }
  if (!selected) throw new Error('no zero-wrong-high threshold candidate');
  selected.affected_samples = Object.fromEntries(
    ['T_high', 'T_low', 'M'].map((key) => [key, affectedSamples(records, selected.thresholds, candidates, key)]),
  );
  selected.supported_boundaries = Object.entries(selected.affected_samples)
    .filter(([, ids]) => ids.length > 0)
    .map(([key]) => key);
  if (requireEvidence && ['T_high', 'T_low', 'M'].some((key) => selected.affected_samples[key].length === 0)) {
    throw new Error('threshold selection lacks independent boundary evidence');
  }
  selected.distance_from_current = ['T_high', 'T_low', 'M']
    .reduce((sum, key) => sum + Math.abs(selected.thresholds[key] - current[key]), 0);
  return selected;
}

export function leaveOneOutThresholds(records, current) {
  const selections = records.map((omitted, index) => ({
    omitted: omitted.id,
    thresholds: selectThresholds(records.filter((_, recordIndex) => recordIndex !== index), current, { requireEvidence: false }).thresholds,
  }));
  const ranges = {};
  const frequency = {};
  for (const key of ['T_high', 'T_low', 'M']) {
    const values = selections.map(({ thresholds }) => thresholds[key]);
    ranges[key] = { min: Math.min(...values), max: Math.max(...values) };
    frequency[key] = Object.fromEntries(uniqueSorted(values).map((value) => [
      String(value),
      values.filter((candidate) => candidate === value).length,
    ]));
  }
  return { ranges, frequency, selections };
}

const boundaryFixture = (task, thresholds) => {
  const top = 'gsd-ship';
  const runner = 'image-to-code';
  return {
    manifest: {
      commands: [],
      skills: [
        { id: top, name: top, description: task.prompt },
        { id: runner, name: runner, description: task.prompt },
      ],
      plugin_skills: [],
      agents_store_skills: [],
      agents: [],
    },
    modeMap: {
      schema_version: 3,
      thresholds,
      entries: [top, runner].map((id) => ({
        id,
        mode: id,
        invoke_kind: 'skill',
        signal_patterns: [task.prompt],
        recommended_skills: [id],
        recommended_agents: [],
      })),
    },
    weights: {
      schema_version: 2,
      blend: 1,
      weights: {
        [top]: { score: task.boundary.score },
        [runner]: { score: task.boundary.score - task.boundary.margin },
      },
    },
  };
};

export function phase29CalibrationRecords(tasks, manifest, modeMap) {
  return tasks.filter(({ phase29 }) => phase29 === true).map((task) => {
    const fixture = task.boundary ? boundaryFixture(task, modeMap.thresholds) : { manifest, modeMap, weights: null };
    const result = dryRun(task.prompt, fixture.manifest, fixture.modeMap, task.cwd || GLOBAL_CALIBRATION_CWD, fixture.weights);
    const actualRoute = result.route?.id || result.route?.mode || null;
    const expectedRoute = task.right.mode?.replace(/^\//, '') || null;
    return {
      id: task.id,
      score: result.top3[0]?.norm || 0,
      margin: result.margin,
      correct: task.right.status === 'pass_through' ? result.route == null || result.tier === 'low' : actualRoute === expectedRoute,
      expected_tier: task.right.tier,
      canonical: actualRoute != null,
      actual_route: actualRoute,
      expected_route: expectedRoute,
      classification: task.phase29_classification,
    };
  });
}

// Compare the dry-run result against the right-pick.
function evaluate(task, result) {
  const right = task.right;
  // pass_through: router must have trivial/low tier and no route
  if (right.status === 'pass_through') {
    const ok = result.tier === 'trivial' || result.tier === 'low' || result.route == null;
    return { ok, detail: `status=pass_through, router tier=${result.tier}, route=${result.route ? result.route.mode : 'null'}` };
  }
  // user_explicit: router must have user_explicit tier
  if (right.status === 'user_explicit') {
    const ok = result.tier === 'user_explicit';
    return { ok, detail: `status=user_explicit, router tier=${result.tier}` };
  }
  // status === 'route': compare mode + skills + agents
  const route = result.route;
  if (!route) {
    return { ok: false, detail: `right=route but router produced no route (tier=${result.tier}, guards=${JSON.stringify(result.guards_fired)})` };
  }
  // ralph two-gate: if guards dropped the route (no_verifiable_done_criteria),
  // that's a mismatch UNLESS the right-pick also expects the fallback.
  const rightMode = normMode(right.mode);
  const gotMode = normMode(route.mode || (rightMode ? route.id : null));
  // Accept secondary_mode as an alternate (task #9: gsd-secure-phase OR review-pr)
  const altMode = right.secondary_mode ? normMode(right.secondary_mode) : null;
  const modeOk = gotMode === rightMode || (altMode != null && gotMode === altMode);
  const skillsOk = setEq(route.recommended_skills, right.skills);
  const agentsOk = setEq(route.recommended_agents, right.agents);
  // ralph-loop completion_promise check (task #6): if right has completion_promise,
  // the route must carry it
  let promiseOk = true;
  if (right.completion_promise) {
    promiseOk = route.completion_promise === right.completion_promise;
  }
  // CR-01: a ralph-loop route must populate `task` from the prompt (not the
  // literal "the task" placeholder) so the injected slash line is meaningful.
  // Calibration gate catches regressions of the CR-01 placeholder bug.
  let taskOk = true;
  if (rightMode === 'ralph-loop') {
    const t = route.task || '';
    taskOk = t.length > 0 && t !== 'the task';
  }
  const ok = modeOk && skillsOk && agentsOk && promiseOk && taskOk;
  const parts = [];
  if (!modeOk) parts.push(`mode: got ${gotMode} want ${rightMode}${altMode ? ' or ' + altMode : ''}`);
  if (!skillsOk) parts.push(`skills: got ${JSON.stringify(route.recommended_skills)} want ${JSON.stringify(right.skills)}`);
  if (!agentsOk) parts.push(`agents: got ${JSON.stringify(route.recommended_agents)} want ${JSON.stringify(right.agents)}`);
  if (!promiseOk) parts.push(`completion_promise: got ${JSON.stringify(route.completion_promise)} want ${JSON.stringify(right.completion_promise)}`);
  if (!taskOk) parts.push(`task: got ${JSON.stringify(route.task)} want non-placeholder derived from prompt`);
  if (result.guards_fired.length) parts.push(`guards: ${result.guards_fired.join(',')}`);
  return { ok, detail: parts.length ? parts.join('; ') : 'exact match' };
}

// --- Phase 3: evolution branch (D-13, D-25 / Plan 03-03) -------------------
// The evolution worker is installed at a fixed path (same as router.mjs): the
// user-global hooks dir at ~/.claude/hooks/. This is the same resolution the
// main router.mjs import at the top of this file uses (HOOKS = homedir +
// '.claude' + 'hooks'). We re-derive the URL here rather than carrying a
// separate env var so the calibration harness has a single canonical import
// path (matches router.mjs line ~30: same homedir join, same import pattern).
function resolveEvolveUrl() {
  return pathToFileURL(join(homedir(), '.claude', 'hooks', 'router.evolve.mjs')).href;
}

// Phase 3: evaluate an evolution fixture by correlating the fixture's
// evolution_telemetry_mock (D-04) → aggregating per-entry (D-05) → building
// a synthetic weights object (D-08) → running the dryRun pipeline (with
// weights). Returns {ok, detail: {outcome_actual, score_actual, weight_applied, topEntry}}.
// DRY: imports correlateOutcomes + aggregatePerEntry from the worker; no
// duplicated logic. Fail-open: any error returns {ok: false, reason}.
async function evolutionRight(task, manifest, modeMap, weights) {
  try {
    const evolveUrl = resolveEvolveUrl();
    const E = await import(evolveUrl).catch(() => null);
    if (!E || typeof E.correlateOutcomes !== 'function' || typeof E.aggregatePerEntry !== 'function') {
      return { ok: false, detail: { reason: 'evolve_unavailable' } };
    }
    const mock = Array.isArray(task.evolution_telemetry_mock) ? task.evolution_telemetry_mock : [];
    const outcomes = E.correlateOutcomes(mock, 14);
    const perEntry = E.aggregatePerEntry(outcomes, modeMap);
    // Build synthetic weights from perEntry: score = g / max(1, g + b) per D-08.
    const syntheticWeights = {
      schema_version: 2,
      blend: (weights && typeof weights.blend === 'number') ? weights.blend : 0.15,
      decay_days: (weights && typeof weights.decay_days === 'number') ? weights.decay_days : 14,
      weights: {},
    };
    for (const [k, v] of perEntry) {
      const g = (v && typeof v.g === 'number') ? v.g : 0;
      const b = (v && typeof v.b === 'number') ? v.b : 0;
      syntheticWeights.weights[k] = { g, b, u: (v && typeof v.u === 'number') ? v.u : 0, score: g / Math.max(1, g + b) };
    }
    const result = dryRun(task.prompt, manifest, modeMap, task.cwd || GLOBAL_CALIBRATION_CWD, syntheticWeights);
    const outcome_actual = (outcomes[0] && outcomes[0].outcome) || 'unknown';
    const topEntry = result && result.route ? result.route.mode : null;
    const expectedMode = task.right ? normMode(task.right.mode) : null;
    const modeOk = expectedMode == null
      // pass-through right-pick: route is null OR route.mode is null (BM25 picked
      // a manifest entry with no mode-map mapping, which is the pass-through edge)
      ? (result.route == null || result.route.mode == null)
      : (topEntry === expectedMode);
    const outcomeOk = task.evolution_outcome_expected === outcome_actual;
    const ok = outcomeOk && modeOk;
    return {
      ok,
      detail: {
        outcome_actual,
        score_actual: (result && result.route && typeof result.route.weight_applied === 'number') ? result.route.weight_applied : 0,
        weight_applied: (result && result.route && typeof result.route.weight_applied === 'number') ? result.route.weight_applied : null,
        topEntry,
        reason: ok ? 'match' : `outcome=${outcomeOk ? 'ok' : `got ${outcome_actual} want ${task.evolution_outcome_expected}`}; mode=${modeOk ? 'ok' : `got ${topEntry} want ${expectedMode}`}`,
      },
    };
  } catch (e) {
    return { ok: false, detail: { reason: 'evolution_error', error: String(e && e.message || e) } };
  }
}

// --- isMain guard (D-16 / Wave 0 prerequisite) -----------------------------
// Run the CLI entry only when this file is executed directly, not when
// imported as a module by tests or the Phase-3 worker. Mirrors router.mjs
// line 32 isMain pattern.
const isMain = () => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1] || '').href;
  } catch {
    return false;
  }
};

// --- main -----------------------------------------------------------------

if (isMain()) {
  const manifest = R.loadManifest(MANIFEST);
  const modeMap = R.loadModeMap(MODE_MAP);
  const tasks = JSON.parse(readFileSync(CALIBRATION, 'utf8'));

  if (!manifest) { console.error('FATAL: manifest missing at ' + MANIFEST); throw new Error('manifest missing at ' + MANIFEST); }
  if (!modeMap) { console.error('FATAL: mode-map missing at ' + MODE_MAP); throw new Error('mode-map missing at ' + MODE_MAP); }
  if (!Array.isArray(tasks)) {
    console.error('FATAL: calibration-tasks.json must be an array');
    throw new Error('calibration-tasks.json must be an array');
  }

  const phase05Count = tasks.filter((t) => String(t?.right?.edge || '').includes('COV-')).length;
  const originalCount = tasks.filter((t) => !t.phase29 && !t.codebase && !t.evolution && !t.phase14_mapping && !String(t?.right?.edge || '').includes('COV-')).length;
  const codebaseCount = tasks.filter((t) => t.codebase === true).length;
  const evolutionCount = tasks.filter((t) => t.evolution === true).length;
  const mappingCount = tasks.filter((t) => t.phase14_mapping === true).length;
  if (tasks.length < 16 || originalCount !== 10 || codebaseCount < 7 || evolutionCount < 3 || evolutionCount > 5 || phase05Count < 9) {
    console.error(`FATAL: calibration-tasks.json expected 10 originals, >=7 codebase, 3-5 evolution, and >=9 Phase-05 COV fixtures; got total=${tasks.length} originals=${originalCount} codebase=${codebaseCount} evolution=${evolutionCount} phase05=${phase05Count}`);
    throw new Error(`calibration-tasks.json fixture counts invalid: total=${tasks.length} originals=${originalCount} codebase=${codebaseCount} evolution=${evolutionCount} phase05=${phase05Count}`);
  }
  // Phase 3 (D-13, D-25): pass threshold = originalCount + 1 (codebase) + 1 (evolution) = N + 2
  // Phase 5: every added COV fixture is a standing route-coverage regression
  // fixture, so the threshold also includes the full Phase-05 subset.
  const passThreshold = calibrationPassThreshold({ originalCount, codebaseCount, evolutionCount, phase05Count, mappingCount });

  console.log(`# Calibration dry-run — thresholds T_high=${modeMap.thresholds.T_high} T_low=${modeMap.thresholds.T_low} M=${modeMap.thresholds.M}`);
  console.log(`# Manifest: ${manifest.skills ? manifest.skills.length : 0} skills, ${manifest.commands ? manifest.commands.length : 0} commands, ${manifest.agents ? manifest.agents.length : 0} agents`);
  console.log(`# Fixtures: ${tasks.length} total (${originalCount} Phase-1 originals + ${codebaseCount} Phase-2 codebase + ${evolutionCount} Phase-3 evolution + ${phase05Count} Phase-05 route coverage + ${mappingCount} Phase-14 mapping); pass threshold = ${passThreshold} of ${tasks.length} (originalCount + 1 codebase + 1 evolution + all Phase-05 coverage + all Phase-14 mapping)`);
  console.log('');

  let rightCount = 0;
  let originalRightCount = 0;
  let codebaseRightCount = 0;
  let evolutionRightCount = 0;
  let mappingRightCount = 0;
  let evolutionWeightSum = 0;
  let evolutionWeightN = 0;
  const wrongHigh = [];
  const codebaseMismatches = []; // graph_status_expected vs actual
  const evolutionOutcomes = []; // per-fixture outcome_label for the summary
  for (const task of tasks) {
    let result, ok, detail;
    if (task.phase14_mapping === true) {
      const mappingOutcome = evaluatePhase14MappingFixture(task);
      ok = mappingOutcome.ok;
      detail = mappingOutcome.detail;
      result = { tier: 'phase14_mapping', route: null, guards_fired: [], top3: [], margin: 0, skipReason: null, graph_status: 'not_triggered', graph_symbols: [], elapsed_ms: 0 };
      if (ok) { rightCount++; mappingRightCount++; }
    } else if (task.evolution === true) {
      // Phase 3: evolution branch — correlate + aggregate + blend
      const evo = await evolutionRight(task, manifest, modeMap, { schema_version: 2, blend: 0.15, decay_days: 14, weights: {} });
      ok = evo.ok;
      detail = evo.detail.reason || 'evolution match';
      // Run a real dryRun to get the actual result object for the per-fixture
      // print (tier, route, top3, etc.). Use empty weights so the printed
      // columns reflect the un-blended baseline; the blend math is captured
      // separately in evolution_score (weight_applied).
      const baselineRun = dryRun(task.prompt, manifest, modeMap, task.cwd || GLOBAL_CALIBRATION_CWD);
      result = {
        ...baselineRun,
        route: baselineRun.route
          ? { ...baselineRun.route, weight_applied: evo.detail.weight_applied }
          : null,
        // For evolution fixtures the "evolution_outcome" is the correlator verdict
        // on the mock; expose it via the result.detail convenience field.
        detail: { outcome_actual: evo.detail.outcome_actual },
      };
      if (ok) {
        rightCount++;
        evolutionRightCount++;
      }
      if (evo.detail && typeof evo.detail.weight_applied === 'number') {
        evolutionWeightSum += evo.detail.weight_applied;
        evolutionWeightN++;
      }
      evolutionOutcomes.push({ id: task.id, outcome: evo.detail.outcome_actual, ok });
    } else {
      const fixture = task.boundary ? boundaryFixture(task, modeMap.thresholds) : { manifest, modeMap, weights: null };
      result = dryRun(task.prompt, fixture.manifest, fixture.modeMap, task.cwd || GLOBAL_CALIBRATION_CWD, fixture.weights);
      const ev = evaluate(task, result);
      ok = ev.ok;
      detail = ev.detail;
      if (ok) rightCount++;
      if (ok && !task.phase29 && !task.codebase && !task.evolution && !task.phase14_mapping && !String(task?.right?.edge || '').includes('COV-')) originalRightCount++;
      if (ok && task.codebase === true) codebaseRightCount++;
    }
    const taxonomy = ok ? null : classifyCalibrationMiss(task, result, { ok, detail });
    if (!ok && result.tier === 'high') wrongHigh.push({ id: task.id, prompt: task.prompt, detail, taxonomy });

    // Track graph_status_expected vs actual for codebase fixtures
    if (task.codebase === true && task.graph_status_expected) {
      const expected = task.graph_status_expected;
      const actual = result.graph_status;
      if (expected !== actual) {
        codebaseMismatches.push({ id: task.id, expected, actual, prompt: task.prompt });
      }
    }

    const top3Str = result.top3.length
      ? result.top3.map((s) => `${s.name}=${s.norm}`).join(', ')
      : '(no match)';
    const modeStr = result.route && result.route.mode ? result.route.mode : (result.tier === 'trivial' ? 'trivial' : result.tier === 'user_explicit' ? 'user_explicit' : 'null');
    const skillsStr = result.route && result.route.recommended_skills && result.route.recommended_skills.length
      ? result.route.recommended_skills.join(',') : '';
    const agentsStr = result.route && result.route.recommended_agents && result.route.recommended_agents.length
      ? result.route.recommended_agents.join(',') : '';
    const symbolCount = (result.graph_symbols || []).length;
    const elapsed = Number((result.elapsed_ms || 0).toFixed(1));
    const mark = ok ? 'OK ' : 'XX ';
    const codebaseTag = task.codebase ? ' [codebase]' : '';
    const evolutionTag = task.evolution ? ' [evolution]' : '';
    const mappingTag = task.phase14_mapping ? ' [phase14-mapping]' : '';
    // Phase 3: evolution_outcome + evolution_score columns for evolution fixtures
    const evoOutcome = task.evolution
      ? ` evolution_outcome=${(result.detail && result.detail.outcome_actual) || 'unknown'}`
      : '';
    const evoScore = task.evolution
      ? ` score=${(result.route && typeof result.route.weight_applied === 'number') ? Number(result.route.weight_applied.toFixed(3)) : 'n/a'}`
      : '';
    console.log(`${mark}#${task.id}${codebaseTag}${evolutionTag}${mappingTag} tier=${result.tier} mode=${modeStr} skills=[${skillsStr}] agents=[${agentsStr}] margin=${result.margin} top3=[${top3Str}] graph=${result.graph_status} syms=${symbolCount} elapsed_ms=${elapsed}${evoOutcome}${evoScore}`);
    console.log(`     right: mode=${task.right.mode || 'null'} skills=[${(task.right.skills || []).join(',')}] agents=[${(task.right.agents || []).join(',')}] status=${task.right.status} graph_status_expected=${task.graph_status_expected || 'n/a'}`);
    console.log(`     ${detail}`);
    if (taxonomy) {
      console.log(`     Miss taxonomy: ${taxonomy.class} follow_up=${taxonomy.follow_up}`);
    }
    console.log('');
  }

  const codebaseTarget = codebaseRightTarget(codebaseCount);
  console.log(`=== ${rightCount}/${tasks.length} right (threshold ${passThreshold}) ===`);
  console.log(`=== Codebase subset: ${codebaseRightCount}/${codebaseCount} right (was 0/${codebaseCount} pre-Phase-2) ===`);
  if (evolutionCount > 0) {
    const avgWeight = evolutionWeightN > 0 ? Number((evolutionWeightSum / evolutionWeightN).toFixed(3)) : 0;
    const labels = evolutionOutcomes.map((o) => `${o.id}:${o.outcome}${o.ok ? '' : '/xx'}`).join(', ');
    console.log(`=== Evolution subset: ${evolutionRightCount}/${evolutionCount} right (was 0/${evolutionCount} pre-Phase-3) ===`);
    console.log(`=== Average weight_applied: ${avgWeight} ===`);
    console.log(`=== Per-fixture outcomes: [${labels}] ===`);
  }
  if (mappingCount > 0) console.log(`=== Phase 14 mapping subset: ${mappingRightCount}/${mappingCount} right ===`);
  console.log(`Original 10: ${originalRightCount}/${originalCount} (preserved)`);
  console.log(`Codebase target: ${codebaseRightCount}/${codebaseCount} (target: 5/7 minimum)`);
  console.log(`Codebase 5: ${codebaseRightCount}/${codebaseCount} (preserved / improved)`);
  console.log(`Evolution ${evolutionCount}: ${evolutionRightCount}/${evolutionCount} (Phase 3 new)`);
  console.log(`Combined: ${rightCount} / ${tasks.length} (threshold: ${passThreshold})`);
  if (codebaseMismatches.length) {
    console.log('!! graph_status mismatches (expected vs actual):');
    for (const m of codebaseMismatches) {
      console.log(`   #${m.id} expected=${m.expected} actual=${m.actual} prompt="${m.prompt}"`);
    }
  }
  if (wrongHigh.length) {
    console.log('!! Wrong HIGH-confidence auto-routes (raise T_high per D-09):');
    for (const w of wrongHigh) {
      const taxonomyText = w.taxonomy ? ` — Miss taxonomy: ${w.taxonomy.class} follow_up=${w.taxonomy.follow_up}` : '';
      console.log(`   #${w.id} "${w.prompt}" — ${w.detail}${taxonomyText}`);
    }
  }
  console.log(`Thresholds: T_high=${modeMap.thresholds.T_high} T_low=${modeMap.thresholds.T_low} M=${modeMap.thresholds.M}`);

  const phase29Records = phase29CalibrationRecords(tasks, manifest, modeMap);
  const selection = selectThresholds(phase29Records, modeMap.thresholds);
  const sensitivity = leaveOneOutThresholds(phase29Records, modeMap.thresholds);
  console.log(`Selected thresholds: ${JSON.stringify(selection.thresholds)}`);
  console.log(`Affected samples: ${JSON.stringify(selection.affected_samples)}`);
  console.log(`Leave-one-out ranges: ${JSON.stringify(sensitivity.ranges)}`);
  console.log(`Leave-one-out frequencies: ${JSON.stringify(sensitivity.frequency)}`);

  process.exit(rightCount >= passThreshold && originalRightCount === originalCount && codebaseRightCount >= codebaseTarget ? 0 : 1);
}

// --- Named exports (D-16 DRY: Phase-3 worker imports these) ----------------
// Re-exports of router.mjs scoring helpers (same fn identity — no re-impl).
// loadManifest and loadModeMap are imported from router.mjs (R); we re-export
// them so the worker can import the full calibration surface from one place.
export const loadManifest = R.loadManifest;
export const loadModeMap = R.loadModeMap;
// Pure pipeline fns (already in scope; make importable).
export { dryRun, evaluate, resolveEvolveUrl, evolutionRight, classifyCalibrationMiss, codebaseRightTarget };
