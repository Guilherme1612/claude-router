// Isolated latency measurement for the D-13 through D-16 calibration corpus. Spawned as a
// dedicated subprocess by tests/router.compiled-evolution.test.mjs so the p95 reflects the
// route's real cost, not concurrent test scheduling overhead from the full workspace run
// (`node --test tests/*.test.mjs` runs all files concurrently). The parent spawns this script
// via spawnSync, parses the JSON stdout, and asserts the <25ms/<100ms thresholds. This keeps
// the thresholds strict (the route's real isolated p95 is well under 25ms) while eliminating
// the flake under concurrent load.
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CALIBRATION_CORPUS, evaluateCalibrationCorpus, measureRoutes } from '../../src/evolution/perf-measure.mjs';
import { routeContextPrompt } from '../../src/context/prompt-route.mjs';
import { saveCapsule } from '../../src/context/capsule.mjs';
import { stableStringify } from '../../src/registry/schema.mjs';

const COMPILED_VERSION = 'v1-fedcba9876543210';

function calibrationCapsule(fixture) {
  return {
    schema_version: 1,
    scope: { workspace_id: 'calibration', project_id: fixture.id },
    goal: { id: 'phase-17', summary: 'Compiled routing calibration' },
    position: { workflow: 'gsd-execute-phase', phase: '17', plan: '05', task: fixture.id },
    status: fixture.input.status === 'complete' ? 'completed' : 'active',
    artifacts: [], blockers: [],
    freshness: { captured_at: 1_000, generation: fixture.id },
    provenance: { source: 'calibration-fixture', version: '1' },
  };
}

function publishCompiledFixture(ownedRoot, fixture, now) {
  const versionRoot = join(ownedRoot, 'compiled-index', 'versions', COMPILED_VERSION);
  mkdirSync(versionRoot, { recursive: true });
  const index = {
    schema_version: 2, version_id: COMPILED_VERSION,
    policy_version: 'workflow-transitions-v1', capsule_contract_version: 1,
    routes: {
      'gsd-execute-phase': { workflow_id: 'gsd-execute-phase', transition_id: 'gsd.execute', dispatch_eligible: true, reason_code: 'unique_valid_transition' },
    },
  };
  const bytes = `${stableStringify(index)}\n`;
  const payloadSha256 = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(join(versionRoot, 'index.json'), bytes);
  writeFileSync(join(versionRoot, 'metadata.json'), `${stableStringify({
    schema_version: 2, state: 'verified', version_id: COMPILED_VERSION,
    created_at: now - 1_000, expires_at: now + 60_000,
    compatibility: { router_contract: 'prompt-route-v1', policy_version: 'workflow-transitions-v1', capsule_schema_version: 1, orchestrator_contract_version: 'workflow-first-v1', context_contract_version: 'workflow-context-contract-v1' },
    payload_sha256: payloadSha256,
  })}\n`);
  writeFileSync(join(ownedRoot, 'compiled-index', 'active.json'), `${stableStringify({ schema_version: 2, version_id: COMPILED_VERSION, payload_sha256: payloadSha256 })}\n`);
  saveCapsule({ ownedRoot, capsule: calibrationCapsule(fixture) });
}

function buildRoute(corpus) {
  const now = 10_000;
  const states = new Map(corpus.map(fixture => {
    const ownedRoot = mkdtempSync(join(tmpdir(), `router-calibration-${fixture.fixture_class}-`));
    publishCompiledFixture(ownedRoot, fixture, now);
    return [fixture.id, { fixture, ownedRoot }];
  }));
  const route = fixture => {
    const state = states.get(fixture.id);
    if (!state) throw new Error(`published fixture state for ${fixture.id}`);
    const routed = routeContextPrompt({
      prompt: fixture.input.prompt, ownedRoot: state.ownedRoot, projectRoot: state.ownedRoot, now,
      ...(fixture.input.force_stale || fixture.input.tied ? {
        forceStale: true,
        authoritative: fixture.input.tied
          ? { status: 'unresolved', reason_code: 'identity_conflict' }
          : { status: 'dispatchable', value: { workflow: 'gsd-execute-phase', phase: '17', plan: '05', task: 'refreshed-é', status: 'active', action: 'continue_workflow-é' } },
      } : {}),
    });
    const normalized = {
      outcome: routed.resolution.outcome,
      dispatch_eligible: routed.resolution.dispatch_eligible,
      ...(fixture.fixture_class === 'context_budget' ? {
        context_within_budget: Buffer.byteLength(routed.additional_context, 'utf8') <= fixture.max_context_bytes,
      } : {}),
    };
    return normalized;
  };
  return { route, roots: [...states.values()].map(s => s.ownedRoot) };
}

const versions = { candidate: 'candidate-e2e', compiled_index: 'compiled-v1', policy: 'policy-v1', corpus: 'router-calibration-v1' };
const { route, roots } = buildRoute(CALIBRATION_CORPUS);
try {
  const evaluation = evaluateCalibrationCorpus({ corpus: CALIBRATION_CORPUS, route, versions });
  const measured = measureRoutes({ fixtures: CALIBRATION_CORPUS, route, versions, baseline: { p50_ms: 1, p95_ms: 2 }, warmup_runs: 14, measured_runs: 70 });
  process.stdout.write(JSON.stringify({ measured, evaluation }));
} finally {
  for (const root of roots) { try { rmSync(root, { recursive: true, force: true }); } catch { /* already cleaned */ } }
}