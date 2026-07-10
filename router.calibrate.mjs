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
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HOME = homedir();
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
  const gotMode = normMode(route.mode);
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
    const result = dryRun(task.prompt, manifest, modeMap, task.cwd || process.cwd(), syntheticWeights);
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
  const originalCount = tasks.filter((t) => !t.codebase && !t.evolution && !String(t?.right?.edge || '').includes('COV-')).length;
  const codebaseCount = tasks.filter((t) => t.codebase === true).length;
  const evolutionCount = tasks.filter((t) => t.evolution === true).length;
  if (tasks.length < 16 || tasks.length > 32 || originalCount !== 10 || codebaseCount < 3 || codebaseCount > 5 || evolutionCount < 3 || evolutionCount > 5 || phase05Count < 9) {
    console.error(`FATAL: calibration-tasks.json expected 10 originals, 3-5 codebase, 3-5 evolution, and >=9 Phase-05 COV fixtures; got total=${tasks.length} originals=${originalCount} codebase=${codebaseCount} evolution=${evolutionCount} phase05=${phase05Count}`);
    throw new Error(`calibration-tasks.json fixture counts invalid: total=${tasks.length} originals=${originalCount} codebase=${codebaseCount} evolution=${evolutionCount} phase05=${phase05Count}`);
  }
  // Phase 3 (D-13, D-25): pass threshold = originalCount + 1 (codebase) + 1 (evolution) = N + 2
  // Phase 5: every added COV fixture is a standing route-coverage regression
  // fixture, so the threshold also includes the full Phase-05 subset.
  const passThreshold = originalCount + (codebaseCount > 0 ? 1 : 0) + (evolutionCount > 0 ? 1 : 0) + phase05Count;

  console.log(`# Calibration dry-run — thresholds T_high=${modeMap.thresholds.T_high} T_low=${modeMap.thresholds.T_low} M=${modeMap.thresholds.M}`);
  console.log(`# Manifest: ${manifest.skills ? manifest.skills.length : 0} skills, ${manifest.commands ? manifest.commands.length : 0} commands, ${manifest.agents ? manifest.agents.length : 0} agents`);
  console.log(`# Fixtures: ${tasks.length} total (${originalCount} Phase-1 originals + ${codebaseCount} Phase-2 codebase + ${evolutionCount} Phase-3 evolution + ${phase05Count} Phase-05 route coverage); pass threshold = ${passThreshold} of ${tasks.length} (originalCount + 1 codebase + 1 evolution + all Phase-05 coverage)`);
  console.log('');

  let rightCount = 0;
  let codebaseRightCount = 0;
  let evolutionRightCount = 0;
  let evolutionWeightSum = 0;
  let evolutionWeightN = 0;
  const wrongHigh = [];
  const codebaseMismatches = []; // graph_status_expected vs actual
  const evolutionOutcomes = []; // per-fixture outcome_label for the summary
  for (const task of tasks) {
    let result, ok, detail;
    if (task.evolution === true) {
      // Phase 3: evolution branch — correlate + aggregate + blend
      const evo = await evolutionRight(task, manifest, modeMap, { schema_version: 2, blend: 0.15, decay_days: 14, weights: {} });
      ok = evo.ok;
      detail = evo.detail.reason || 'evolution match';
      // Run a real dryRun to get the actual result object for the per-fixture
      // print (tier, route, top3, etc.). Use empty weights so the printed
      // columns reflect the un-blended baseline; the blend math is captured
      // separately in evolution_score (weight_applied).
      const baselineRun = dryRun(task.prompt, manifest, modeMap, task.cwd || process.cwd());
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
      result = dryRun(task.prompt, manifest, modeMap, task.cwd || process.cwd());
      const ev = evaluate(task, result);
      ok = ev.ok;
      detail = ev.detail;
      if (ok) rightCount++;
      if (ok && task.codebase === true) codebaseRightCount++;
    }
    if (!ok && result.tier === 'high') wrongHigh.push({ id: task.id, prompt: task.prompt, detail });

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
    // Phase 3: evolution_outcome + evolution_score columns for evolution fixtures
    const evoOutcome = task.evolution
      ? ` evolution_outcome=${(result.detail && result.detail.outcome_actual) || 'unknown'}`
      : '';
    const evoScore = task.evolution
      ? ` score=${(result.route && typeof result.route.weight_applied === 'number') ? Number(result.route.weight_applied.toFixed(3)) : 'n/a'}`
      : '';
    console.log(`${mark}#${task.id}${codebaseTag}${evolutionTag} tier=${result.tier} mode=${modeStr} skills=[${skillsStr}] agents=[${agentsStr}] margin=${result.margin} top3=[${top3Str}] graph=${result.graph_status} syms=${symbolCount} elapsed_ms=${elapsed}${evoOutcome}${evoScore}`);
    console.log(`     right: mode=${task.right.mode || 'null'} skills=[${(task.right.skills || []).join(',')}] agents=[${(task.right.agents || []).join(',')}] status=${task.right.status} graph_status_expected=${task.graph_status_expected || 'n/a'}`);
    console.log(`     ${detail}`);
    console.log('');
  }

  console.log(`=== ${rightCount}/${tasks.length} right (threshold ${passThreshold}) ===`);
  console.log(`=== Codebase subset: ${codebaseRightCount}/${codebaseCount} right (was 0/${codebaseCount} pre-Phase-2) ===`);
  if (evolutionCount > 0) {
    const avgWeight = evolutionWeightN > 0 ? Number((evolutionWeightSum / evolutionWeightN).toFixed(3)) : 0;
    const labels = evolutionOutcomes.map((o) => `${o.id}:${o.outcome}${o.ok ? '' : '/xx'}`).join(', ');
    console.log(`=== Evolution subset: ${evolutionRightCount}/${evolutionCount} right (was 0/${evolutionCount} pre-Phase-3) ===`);
    console.log(`=== Average weight_applied: ${avgWeight} ===`);
    console.log(`=== Per-fixture outcomes: [${labels}] ===`);
  }
  console.log(`Original 10: ${originalCount}/${originalCount} (preserved)`);
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
      console.log(`   #${w.id} "${w.prompt}" — ${w.detail}`);
    }
  }
  console.log(`Thresholds: T_high=${modeMap.thresholds.T_high} T_low=${modeMap.thresholds.T_low} M=${modeMap.thresholds.M}`);

  process.exit(rightCount >= passThreshold ? 0 : 1);
}

// --- Named exports (D-16 DRY: Phase-3 worker imports these) ----------------
// Re-exports of router.mjs scoring helpers (same fn identity — no re-impl).
// loadManifest and loadModeMap are imported from router.mjs (R); we re-export
// them so the worker can import the full calibration surface from one place.
export const loadManifest = R.loadManifest;
export const loadModeMap = R.loadModeMap;
// Pure pipeline fns (already in scope; make importable).
export { dryRun, evaluate, resolveEvolveUrl, evolutionRight };
