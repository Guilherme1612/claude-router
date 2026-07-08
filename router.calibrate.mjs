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

// Replicate main()'s route computation UP TO the route decision, dry-run.
// Phase 2 (Plan 02-03 / D-15, D-16): accepts a `cwd` parameter and threads
// graphifyHeuristic + applyGraphBoost into the scoring path. Returns
// { tier, route, guards_fired, top3, margin, skipReason, graph_status, graph_symbols, elapsed_ms }.
function dryRun(prompt, manifest, modeMap, cwd = process.cwd()) {
  // Trivial short-circuit
  if (R.trivialPromptDetect(prompt)) {
    return { tier: 'trivial', route: null, guards_fired: [], top3: [], margin: 0, skipReason: 'trivial', graph_status: 'not_triggered', graph_symbols: [], elapsed_ms: 0 };
  }
  // Explicit /-prefix override (GRD-04 first half)
  if (R.explicitOverrideDetect(prompt).override) {
    return { tier: 'user_explicit', route: null, guards_fired: [], top3: [], margin: 0, skipReason: 'user_explicit', graph_status: 'not_triggered', graph_symbols: [], elapsed_ms: 0 };
  }
  // Re-entry dedupe
  if (R.sentinelScan(prompt)) {
    return { tier: 'reentry_skipped', route: null, guards_fired: [], top3: [], margin: 0, skipReason: 'reentry', graph_status: 'not_triggered', graph_symbols: [], elapsed_ms: 0 };
  }
  // Named-name override (GRD-04 second half) — runs before scoring
  const knownNames = R.buildKnownNames(modeMap);
  if (R.explicitOverrideDetect(prompt, knownNames).override) {
    return { tier: 'user_explicit', route: null, guards_fired: [], top3: [], margin: 0, skipReason: 'user_explicit_named', graph_status: 'not_triggered', graph_symbols: [], elapsed_ms: 0 };
  }
  // Scoring
  const corpus = R.buildCorpus(manifest, modeMap);
  const queryTokens = R.tokenize(prompt);
  const scored = R.bm25Score(queryTokens, corpus);
  // Phase 2 / D-07: fold graph boost into the scored list. Only applies if
  // graphifyHeuristic actually fired (queried=true) and produced a non-empty
  // boostIds set. Otherwise `scored` is unchanged.
  const t0 = process.hrtime.bigint();
  const graph = R.graphifyHeuristic(prompt, cwd);
  const manifestIdSet = new Set((corpus || []).map((c) => String(c.name || '').toLowerCase()));
  const hasBoost = graph.boostIds && graph.boostIds.size > 0;
  const scoredBoosted = hasBoost
    ? R.applyGraphBoost(scored, graph.boostIds, manifestIdSet, 0.15)
    : scored;
  const normed = R.normalize(scoredBoosted);
  const graphElapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  if (normed.length === 0) {
    return { tier: 'low', route: null, guards_fired: [], top3: [], margin: 0, skipReason: 'no_match', graph_status: graph.status, graph_symbols: graph.symbols || [], elapsed_ms: graphElapsedMs };
  }
  const top = normed[0];
  const runnerUp = normed[1];
  const tier = R.confidenceTier(top.norm, runnerUp ? runnerUp.norm : 0, modeMap.thresholds);
  const top3 = normed.slice(0, 3).map((s) => ({ name: s.name, norm: Number(s.norm.toFixed(3)) }));
  const margin = Number((top.norm - (runnerUp ? runnerUp.norm : 0)).toFixed(3));

  // Map top manifest entry → mode-map entry (same logic as main())
  const topName = (top.name || '').toLowerCase();
  const mmEntry = (modeMap.entries || []).find((e) => {
    if (e.id && e.id.toLowerCase() === topName) return true;
    const recs = [...(e.recommended_skills || []), ...(e.recommended_agents || [])];
    return recs.some((r) => r.toLowerCase() === topName);
  }) || null;

  const route = {
    mode: mmEntry ? mmEntry.mode : null,
    invoke_kind: mmEntry ? mmEntry.invoke_kind : null,
    recommended_skills: mmEntry ? mmEntry.recommended_skills : [],
    recommended_agents: mmEntry ? mmEntry.recommended_agents : [],
    tier,
    args_hint: mmEntry ? mmEntry.args_hint : null,
    scores: top3,
  };

  // Apply guards (GRD-01 MCP demote, GRD-03 ralph two-gate, GRD-05 deny)
  const guarded = R.applyGuards(route, prompt, manifest, modeMap, {
    queryTokens,
    thresholds: modeMap.thresholds,
    autoTopScore: top.score,
  });

  return {
    tier,
    route: guarded.route,
    guards_fired: guarded.guards_fired,
    top3,
    margin,
    skipReason: null,
    graph_status: graph.status,
    graph_symbols: graph.symbols || [],
    elapsed_ms: graphElapsedMs,
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
  if (!Array.isArray(tasks) || tasks.length < 13 || tasks.length > 15) {
    console.error('FATAL: calibration-tasks.json must have 13-15 entries (10 Phase-1 originals + 3-5 Phase-2 codebase fixtures), got ' + (Array.isArray(tasks) ? tasks.length : 'non-array'));
    throw new Error('calibration-tasks.json must have 13-15 entries, got ' + (Array.isArray(tasks) ? tasks.length : 'non-array'));
  }

  const originalCount = tasks.filter((t) => !t.codebase).length;
  const codebaseCount = tasks.filter((t) => t.codebase === true).length;
  const passThreshold = originalCount + 1; // D-16: at least 1 codebase fixture right

  console.log(`# Calibration dry-run — thresholds T_high=${modeMap.thresholds.T_high} T_low=${modeMap.thresholds.T_low} M=${modeMap.thresholds.M}`);
  console.log(`# Manifest: ${manifest.skills ? manifest.skills.length : 0} skills, ${manifest.commands ? manifest.commands.length : 0} commands, ${manifest.agents ? manifest.agents.length : 0} agents`);
  console.log(`# Fixtures: ${tasks.length} total (${originalCount} Phase-1 originals + ${codebaseCount} Phase-2 codebase); pass threshold = ${passThreshold} of ${tasks.length} (originalCount + 1)`);
  console.log('');

  let rightCount = 0;
  let codebaseRightCount = 0;
  const wrongHigh = [];
  const codebaseMismatches = []; // graph_status_expected vs actual
  for (const task of tasks) {
    const result = dryRun(task.prompt, manifest, modeMap, task.cwd || process.cwd());
    const { ok, detail } = evaluate(task, result);
    if (ok) rightCount++;
    if (ok && task.codebase === true) codebaseRightCount++;
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
    console.log(`${mark}#${task.id}${codebaseTag} tier=${result.tier} mode=${modeStr} skills=[${skillsStr}] agents=[${agentsStr}] margin=${result.margin} top3=[${top3Str}] graph=${result.graph_status} syms=${symbolCount} elapsed_ms=${elapsed}`);
    console.log(`     right: mode=${task.right.mode || 'null'} skills=[${(task.right.skills || []).join(',')}] agents=[${(task.right.agents || []).join(',')}] status=${task.right.status} graph_status_expected=${task.graph_status_expected || 'n/a'}`);
    console.log(`     ${detail}`);
    console.log('');
  }

  console.log(`=== ${rightCount}/${tasks.length} right (threshold ${passThreshold}) ===`);
  console.log(`=== Codebase subset: ${codebaseRightCount}/${codebaseCount} right (was 0/${codebaseCount} pre-Phase-2) ===`);
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
export { dryRun, evaluate };