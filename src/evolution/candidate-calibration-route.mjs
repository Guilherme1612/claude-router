import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { routeContextPrompt } from '../context/prompt-route.mjs';
import { saveCapsule } from '../context/capsule.mjs';
import { publishCompiledIndex } from '../prompt/publish-index.mjs';
import { CALIBRATION_CORPUS } from './perf-measure.mjs';

// Internal helper: replicates tests/router.compiled-evolution.test.mjs:21-32
// calibrationCapsule. NOT exported (watcher/CLI do not construct capsules by
// hand — this is only for the calibration harness).
function calibrationCapsule(fixture, now) {
  return {
    schema_version: 1,
    scope: { workspace_id: 'calibration', project_id: fixture.id },
    goal: { id: 'phase-17', summary: 'Compiled routing calibration' },
    position: { workflow: 'gsd-execute-phase', phase: '17', plan: '05', task: fixture.id },
    status: fixture.input.status === 'complete' ? 'completed' : 'active',
    artifacts: [],
    blockers: [],
    freshness: { captured_at: 1_000, generation: fixture.id },
    provenance: { source: 'calibration-fixture', version: '1' },
  };
}

// Normalize routeContextPrompt output to the { outcome, dispatch_eligible[,
// context_within_budget] } shape that evaluateCalibrationCorpus compares
// against fixture.expected (tests/router.compiled-evolution.test.mjs:79-87).
function normalizeRouted(routed, fixture) {
  const normalized = {
    outcome: routed.resolution.outcome,
    dispatch_eligible: routed.resolution.dispatch_eligible,
    ...(fixture.fixture_class === 'context_budget' ? {
      context_within_budget: typeof routed.additional_context === 'string'
        && Buffer.byteLength(routed.additional_context, 'utf8') <= fixture.max_context_bytes,
    } : {}),
  };
  Object.defineProperty(normalized, 'additional_context', { value: routed.additional_context, enumerable: false });
  return normalized;
}

// Build the forceStale/authoritative options for a fixture, mirroring
// buildRealCalibrationRoute at tests/router.compiled-evolution.test.mjs:71-77.
function fixtureOptions(fixture) {
  if (fixture.input.force_stale || fixture.input.tied) {
    return {
      forceStale: true,
      authoritative: fixture.input.tied
        ? { status: 'unresolved', reason_code: 'identity_conflict' }
        : { status: 'dispatchable', value: { workflow: 'gsd-execute-phase', phase: '17', plan: '05', task: 'refreshed-é', status: 'active', action: 'continue_workflow-é' } },
    };
  }
  return {};
}

// Shared route-fn builder: maps each fixture.id to its per-fixture temp
// ownedRoot and invokes routeContextPrompt. `routeCtx` is the (possibly
// injected) routeContextPrompt implementation.
function buildRouteFn(states, now, routeCtx) {
  const captures = new Map();
  const route = (fixture) => {
    const state = states.get(fixture.id);
    if (!state) throw new Error(`no published fixture state for ${fixture.id}`);
    const routed = routeCtx({
      prompt: fixture.input.prompt,
      ownedRoot: state.ownedRoot,
      projectRoot: state.ownedRoot,
      now,
      ...fixtureOptions(fixture),
    });
    captures.set(fixture.id, routed);
    return normalizeRouted(routed, fixture);
  };
  return { route, captures };
}

function cleanupAll(tempRoots, rm) {
  for (const root of tempRoots) {
    try { rm(root, { recursive: true, force: true }); } catch { /* already removed */ }
  }
}

// D-04 candidate variant: publishes the candidate compiled index into a
// per-fixture temp ownedRoot, saves a per-fixture calibration capsule, and
// returns a route fn that wraps routeContextPrompt bound to those temp
// ownedRoots. cleanup() removes every temp ownedRoot (success + error paths).
export function buildCandidateCalibrationRoute({
  registry, mapping, policyFingerprint, now = Date.now(), corpus = CALIBRATION_CORPUS, deps = {},
} = {}) {
  if (!registry) throw new TypeError('registry is required');
  const publish = deps.publishCompiledIndex || publishCompiledIndex;
  const saveCap = deps.saveCapsule || saveCapsule;
  const routeCtx = deps.routeContextPrompt || routeContextPrompt;
  const mkdtemp = deps.mkdtempSync || ((prefix) => mkdtempSync(prefix));
  const rm = deps.rmSync || ((path, opts) => rmSync(path, opts));

  const tempRoots = [];
  let versionId = null;
  const states = new Map(corpus.map((fixture) => {
    const tempRoot = mkdtemp(join(tmpdir(), `router-canary-${fixture.fixture_class}-`));
    tempRoots.push(tempRoot);
    const publication = publish({
      ownedRoot: tempRoot, registry,
      registryVersionId: `v1-${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      mapping, policyFingerprint, now,
    });
    if (publication?.compiled_version_id && !versionId) versionId = publication.compiled_version_id;
    saveCap({ ownedRoot: tempRoot, capsule: calibrationCapsule(fixture, now) });
    return [fixture.id, { fixture, ownedRoot: tempRoot }];
  }));
  if (!versionId) versionId = `v1-${randomUUID().replace(/-/g, '').slice(0, 16)}`;

  const { route, captures } = buildRouteFn(states, now, routeCtx);
  const cleanup = () => cleanupAll(tempRoots, rm);
  return { route, captures, cleanup, versionId };
}

// D-04 known-good variant: reuses the active compiled index already at
// ownedRoot (published by a prior successful activation). Per fixture it
// mkdtemps a temp ownedRoot, copies the compiled-index/ and release-tuples/
// directories from the source ownedRoot into the temp (read-only — never
// mutates the real activation_root with per-fixture capsules), saves a
// per-fixture capsule into the temp, and builds the same route fn shape.
// cleanup() removes the temp ownedRoots.
export function buildKnownGoodCalibrationRoute({
  ownedRoot, now = Date.now(), corpus = CALIBRATION_CORPUS, deps = {},
} = {}) {
  if (!ownedRoot) throw new TypeError('ownedRoot is required');
  const saveCap = deps.saveCapsule || saveCapsule;
  const routeCtx = deps.routeContextPrompt || routeContextPrompt;
  const mkdtemp = deps.mkdtempSync || ((prefix) => mkdtempSync(prefix));
  const rm = deps.rmSync || ((path, opts) => rmSync(path, opts));
  const copyDir = deps.cpSync || ((src, dest) => cpSync(src, dest, { recursive: true }));

  const tempRoots = [];
  const states = new Map(corpus.map((fixture) => {
    const tempRoot = mkdtemp(join(tmpdir(), `router-known-good-${fixture.fixture_class}-`));
    tempRoots.push(tempRoot);
    for (const dir of ['compiled-index', 'release-tuples']) {
      const src = join(ownedRoot, dir);
      if (existsSync(src)) copyDir(src, join(tempRoot, dir));
    }
    saveCap({ ownedRoot: tempRoot, capsule: calibrationCapsule(fixture, now) });
    return [fixture.id, { fixture, ownedRoot: tempRoot }];
  }));

  const { route, captures } = buildRouteFn(states, now, routeCtx);
  const cleanup = () => cleanupAll(tempRoots, rm);
  return { route, captures, cleanup };
}