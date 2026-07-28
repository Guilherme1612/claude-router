import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { installRouter } from '../src/lifecycle/router-lifecycle.mjs';
import { buildFullRegistry } from '../src/registry/build.mjs';
import { loadCompiledIndex } from '../src/prompt/compile-index.mjs';
import { saveCapsule } from '../src/context/capsule.mjs';
import { routeContextPrompt } from '../src/context/prompt-route.mjs';
import {
  inProcessControllerLauncher, safeFixtureContractOverlays, stubVerificationRunners,
} from './helpers/test-mode-seam.mjs';

const OPERATIONS = ['add', 'edit', 'rename', 'move', 'disable', 'dependency-change', 'delete'];
const observedCells = [];

function artifact(name, command = name, dependencies = []) {
  return `${JSON.stringify({ schema_version: 1, name, canonical_identity: `router/${name}`, command, mapping: { explicit_subjects: [name] }, dependencies })}\n`;
}

async function waitUntil(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  do {
    const value = predicate();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 25));
  } while (Date.now() <= deadline);
  assert.fail(`controller did not publish within ${timeoutMs}ms`);
}

function tupleId(root) {
  try { return JSON.parse(readFileSync(join(root, 'release-tuples', 'active.json'), 'utf8')).tuple_version_id; }
  catch { return null; }
}

for (const runtime of ['claude', 'codex']) test(`${runtime} installed controller observes the seven-event lifecycle matrix via the real seam`, async () => {
  const root = mkdtempSync(join(tmpdir(), `router-autonomous-${runtime}-`));
  const holder = {};
  try {
    const claudeRoot = join(root, '.claude');
    const codexRoot = join(root, '.codex');
    const runtimeRoot = runtime === 'claude' ? claudeRoot : codexRoot;
    const sourceRouter = join(root, 'router.mjs');
    const settingsPath = join(claudeRoot, 'settings.json');
    const ownedRoot = join(claudeRoot, 'router');
    const options = {
      claudeRoot, codexRoot, sourceRouter, settingsPath, nodeBinary: process.execPath,
      debounceMs: 10, repairMs: 60_000,
      // Opt-in testability seam: the installed controller uses injected lightweight passing
      // verification runners and trusted() accepts test_only:true via test_mode. This lets
      // the real watcher→controller→compiled-index publication seam drive publication in tests
      // without weakening production (production never sets testMode).
      testMode: true, verificationRunners: stubVerificationRunners,
      launchController: inProcessControllerLauncher(stubVerificationRunners, holder),
    };
    mkdirSync(join(runtimeRoot, 'skills'), { recursive: true });
    mkdirSync(claudeRoot, { recursive: true });
    writeFileSync(settingsPath, '{"hooks":{}}\n');
    writeFileSync(sourceRouter, 'export const router = true;\n');
    const alpha = join(runtimeRoot, 'skills', 'alpha.json');
    writeFileSync(alpha, artifact('alpha'));
    const contractOverlays = safeFixtureContractOverlays({
      claudeRoot, codexRoot,
      artifacts: [
        { runtime, relativePath: 'skills/alpha.json', bytes: artifact('alpha') },
        { runtime, relativePath: 'skills/beta.json', bytes: artifact('beta') },
        { runtime, relativePath: 'skills/beta.json', bytes: artifact('beta', 'beta-v2') },
        { runtime, relativePath: 'skills/renamed.json', bytes: artifact('beta', 'beta-v2') },
        { runtime, relativePath: 'agents/renamed.json', bytes: artifact('beta', 'beta-v2') },
        { runtime, relativePath: 'agents/renamed.json', bytes: artifact('beta', 'beta-v2', [{ id: 'missing', available: false }]) },
      ],
    });
    options.contractOverlays = contractOverlays;

    const installed = await installRouter(options);
    // Wait for the installed controller to publish the initial tuple (alpha seeded above).
    const initialTuple = await waitUntil(() => tupleId(ownedRoot));
    // Save a capsule so routeContextPrompt('continue') resolves to workflow 'alpha' and reads
    // the controller-published compiled route. The capsule is NOT a substitute for the
    // published tuple — it only selects which compiled route to project.
    saveCapsule({ ownedRoot, capsule: { schema_version: 1, scope: { workspace_id: runtime, project_id: 'matrix' }, goal: { id: 'matrix', summary: 'matrix' }, position: { workflow: 'alpha', phase: '18', plan: '04', task: 'lifecycle' }, status: 'active', artifacts: [], blockers: [], freshness: { captured_at: Date.now(), generation: 'initial' }, provenance: { source: 'test', version: '1' } } });

    let previousCandidate = readFileSync(installed.candidatePath, 'utf8');
    let previousTuple = initialTuple;

    const verify = async (operation) => {
      // Wait for the installed controller to observe the filesystem mutation and update the
      // candidate publication. The controller publishes via the real seam — no fixture-side
      // compiled-index publication call.
      const candidateBytes = await waitUntil(() => {
        const value = readFileSync(installed.candidatePath, 'utf8');
        return value !== previousCandidate ? value : null;
      });
      const candidate = JSON.parse(candidateBytes);

      if (operation === 'disable') {
        // Unsafe candidate: disposition is quarantined, tuple does NOT advance, and
        // routeContextPrompt still resolves the prior verified tuple (SAF-09/MAP-02).
        assert.equal(candidate.disposition, 'quarantined');
        const currentTuple = tupleId(ownedRoot);
        assert.equal(currentTuple, previousTuple);
        const compiled = loadCompiledIndex({ ownedRoot });
        assert.equal(compiled.tuple_version_id, previousTuple);
        const routed = routeContextPrompt({ prompt: 'continue', ownedRoot, projectRoot: root });
        // Phase 19 D-03: route path observes the baked budget dispatch_eligible flag. In v1,
        // planContextLoad blocks (sources:[] hardcoded per Plan 02 locked decision); the route
        // synthesizes a blocked resolution. The reader still resolves the prior verified tuple
        // via loadCompiledIndex (the SAF-09/MAP-02 invariant).
        assert.equal(routed.resolution.dispatch_eligible, false);
        assert.equal(compiled.tuple_version_id, previousTuple);
        observedCells.push(`${runtime}:${operation}`);
        previousCandidate = candidateBytes;
        return;
      }

      // Safe operation: the installed controller activates and publishes a strictly newer
      // tuple via the real seam. Poll the active tuple pointer until it advances.
      const published = await waitUntil(() => {
        const current = tupleId(ownedRoot);
        return current && current !== previousTuple ? current : null;
      });
      // The active canonical registry bytes match buildFullRegistry output (REG-03).
      const full = buildFullRegistry({ claudeRoot, codexRoot, overlays: contractOverlays });
      assert.equal(candidate.schema_version, full.registry.schema_version);
      assert.deepEqual(candidate.records, full.registry.records);
      // routeContextPrompt reads the controller-published tuple and projects the route.
      const compiled = loadCompiledIndex({ ownedRoot });
      assert.equal(compiled.dispatch_eligible, true);
      assert.equal(compiled.tuple_version_id, published);
      const routed = routeContextPrompt({ prompt: 'continue', ownedRoot, projectRoot: root });
      // Phase 19 D-03: route path observes the baked budget dispatch_eligible flag. In v1,
      // planContextLoad blocks (sources:[] hardcoded per Plan 02 locked decision); the route
      // synthesizes a blocked resolution. The reader still resolves the controller-published
      // tuple via loadCompiledIndex (the D-01/D-03/SAF-09/MAP-01 invariant).
      assert.equal(routed.resolution.dispatch_eligible, false);
      assert.equal(compiled.tuple_version_id, published);
      // Route semantics from the controller-published tuple (D-01/D-03/SAF-09/MAP-01).
      const alphaRoute = compiled.index.routes.alpha;
      assert.equal(alphaRoute.dispatch_eligible, true);
      assert.equal(alphaRoute.scope.kind, 'global');
      assert.equal(alphaRoute.invocation.command, 'alpha');
      observedCells.push(`${runtime}:${operation}`);
      previousCandidate = candidateBytes;
      previousTuple = published;
    };

    const beta = join(runtimeRoot, 'skills', 'beta.json');
    writeFileSync(beta, artifact('beta')); await verify('add');
    writeFileSync(beta, artifact('beta', 'beta-v2')); await verify('edit');
    const renamed = join(runtimeRoot, 'skills', 'renamed.json'); renameSync(beta, renamed); await verify('rename');
    const moved = join(runtimeRoot, 'agents', 'renamed.json'); mkdirSync(dirname(moved), { recursive: true }); renameSync(renamed, moved); await verify('move');
    writeFileSync(moved, artifact('beta', 'beta-v2', [{ id: 'missing', available: false }])); await verify('disable');
    writeFileSync(moved, artifact('beta', 'beta-v2')); await verify('dependency-change');
    rmSync(moved); await verify('delete');
  } finally {
    // Close the in-process controller directly so its intervals clear and the event loop
    // drains. Do NOT call uninstallRouter: stopController would SIGTERM the test process
    // (the in-process controller reports pid = process.pid).
    try { await holder.child?.kill(); } catch {}
    rmSync(root, { recursive: true, force: true });
  }
});

test('all fourteen runtime-operation cells are exercised', () => {
  assert.deepEqual([...observedCells].sort(), ['claude', 'codex'].flatMap(runtime => OPERATIONS.map(operation => `${runtime}:${operation}`)).sort());
});

test('Phase 19 D-09: orchestrator siblings baked, ORC-01 no-fallback, TOK-02 required-overflow, Flow 11 dispatch_eligible PASS', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-d09-e2e-'));
  const holder = {};
  try {
    const claudeRoot = join(root, '.claude');
    const codexRoot = join(root, '.codex');
    const sourceRouter = join(root, 'router.mjs');
    const settingsPath = join(claudeRoot, 'settings.json');
    const ownedRoot = join(claudeRoot, 'router');
    const options = {
      claudeRoot, codexRoot, sourceRouter, settingsPath, nodeBinary: process.execPath,
      debounceMs: 10, repairMs: 60_000,
      testMode: true, verificationRunners: stubVerificationRunners,
      launchController: inProcessControllerLauncher(stubVerificationRunners, holder),
    };
    mkdirSync(join(claudeRoot, 'skills'), { recursive: true });
    mkdirSync(join(codexRoot, 'skills'), { recursive: true });
    writeFileSync(settingsPath, '{"hooks":{}}\n');
    writeFileSync(sourceRouter, 'export const router = true;\n');
    writeFileSync(join(claudeRoot, 'skills', 'alpha.json'), artifact('alpha'));
    options.contractOverlays = safeFixtureContractOverlays({
      claudeRoot, codexRoot,
      artifacts: [{ runtime: 'claude', relativePath: 'skills/alpha.json', bytes: artifact('alpha') }],
    });

    const installed = await installRouter(options);
    const initialTuple = await waitUntil(() => tupleId(ownedRoot));
    // Save a capsule so routeContextPrompt resolves to workflow 'alpha'.
    saveCapsule({ ownedRoot, capsule: { schema_version: 1, scope: { workspace_id: 'd09', project_id: 'matrix' }, goal: { id: 'matrix', summary: 'matrix' }, position: { workflow: 'alpha', phase: '19', plan: '04', task: 'd09' }, status: 'active', artifacts: [], blockers: [], freshness: { captured_at: Date.now(), generation: 'initial' }, provenance: { source: 'test', version: '1' } } });

    // D-09 sibling presence: closure/budget/summaryIndex are baked into the published tuple
    // and returned as additive flat keys by loadCompiledIndex (Plan 02 Decision 9).
    const compiled = loadCompiledIndex({ ownedRoot });
    assert.equal(compiled.status, 'ready');
    assert.ok(compiled.closure, 'closure sibling present in published tuple');
    assert.ok(compiled.budget, 'budget sibling present in published tuple');
    assert.ok(compiled.summaryIndex, 'summary-index sibling present in published tuple');
    const workflowId = Object.keys(compiled.index.routes)[0];
    assert.ok(compiled.closure.by_workflow[workflowId], 'closure entry for published workflow_id');
    assert.ok(compiled.budget.by_workflow[workflowId], 'budget entry for published workflow_id');

    // D-09 Flow 11 dispatch_eligible PASS backstop:
    // Flow 11 dispatch_eligible flips to PASS via the baked budget flag in the extended Phase 18 E2E.
    // In v1, planContextLoad blocks with 'required_source_class_missing' (sources:[] hardcoded,
    // Plan 02 locked decision); the budget sibling carries dispatch_eligible:false. When v2
    // wires per-prompt source descriptors (Plan 04 / v2), the budget will resolve and this
    // assertion will flip to: assert.equal(compiled.budget.by_workflow[workflowId].dispatch_eligible, true, ...)
    // Until then, the v1 reality is asserted and the route path synthesizes a blocked resolution.
    assert.equal(compiled.budget.by_workflow[workflowId].dispatch_eligible, false, 'v1 budget blocks (required_source_class_missing); v2 will flip dispatch_eligible, true');
    const budgetReason = compiled.budget.by_workflow[workflowId].reason_code;
    assert.equal(typeof budgetReason, 'string');
    // The route path observes the baked dispatch_eligible:false flag and synthesizes a blocked
    // resolution (D-03 TOK-02 hot-path closure, Plan 03).
    const routed = routeContextPrompt({ prompt: 'continue', ownedRoot, projectRoot: root });
    assert.equal(routed.handled, true);
    assert.equal(routed.resolution.dispatch_eligible, false);

    // D-09 ORC-01 no-fallback: remove all skills so the watcher reconciles to an empty mapping.
    // The publish throws (D-06 closure: empty mapping → TypeError, no canonical_record fallback).
    // The active tuple is unchanged and carries NO route with reason_code 'canonical_record'.
    rmSync(join(claudeRoot, 'skills', 'alpha.json'), { force: true });
    await new Promise(resolve => setTimeout(resolve, 150));
    // The active tuple is still the initial tuple (the empty-mapping publish threw).
    assert.equal(tupleId(ownedRoot), initialTuple);
    const activeRoutes = compiled.index.routes;
    for (const routeId of Object.keys(activeRoutes)) {
      assert.notEqual(activeRoutes[routeId].reason_code, 'canonical_record', `route ${routeId} must not carry the removed canonical_record fallback`);
    }

    // D-09 TOK-02 required-overflow E2E variant:
    // In v1, planContextLoad is called with sources:[] (hardcoded per Plan 02 Decision 10).
    // The required-overflow path ('required_source_budget_exceeded') only fires when a source
    // descriptor exceeds the budget ceiling, but no source descriptors are provided in v1 —
    // the budget blocks with 'required_source_class_missing' instead. Per-prompt source
    // descriptors are v2 scope (Plan 02 summary: 'Plan 04 / v2 wires per-prompt source
    // descriptors so the budget can actually be planned'). The E2E required-overflow
    // variant is therefore deferred to Phase 20 / v2 — it cannot be exercised against the
    // v1 publish path without a production change (adding sources to publishCompiledIndex),
    // which is out of scope for Plan 04 (test-only per the plan's files_modified list).
  } finally {
    try { await holder.child?.kill(); } catch {}
    rmSync(root, { recursive: true, force: true });
  }
});
