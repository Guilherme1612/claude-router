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
import { stubVerificationRunners, inProcessControllerLauncher } from './helpers/test-mode-seam.mjs';

const OPERATIONS = ['add', 'edit', 'rename', 'move', 'disable', 'dependency-change', 'delete'];
const observedCells = [];

function artifact(name, command = name, dependencies) {
  return `${JSON.stringify({ schema_version: 1, name, command, mapping: { explicit_subjects: [name] }, ...(dependencies ? { dependencies } : {}) })}\n`;
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
      debounceMs: 10, repairMs: 200,
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
        assert.equal(routed.compiled?.tuple_version_id, previousTuple);
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
      const full = buildFullRegistry({ claudeRoot, codexRoot });
      assert.deepEqual({ schema_version: candidate.schema_version, records: candidate.records }, full.registry);
      // routeContextPrompt reads the controller-published tuple and projects the route.
      const compiled = loadCompiledIndex({ ownedRoot });
      assert.equal(compiled.dispatch_eligible, true);
      assert.equal(compiled.tuple_version_id, published);
      const routed = routeContextPrompt({ prompt: 'continue', ownedRoot, projectRoot: root });
      assert.equal(routed.compiled?.tuple_version_id, published);
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
    writeFileSync(moved, artifact('beta', 'beta-v2', [{ id: 'present', available: true }])); await verify('dependency-change');
    rmSync(moved); await verify('delete');
  } finally {
    // Close the in-process controller directly so its intervals clear and the event loop
    // drains. Do NOT call uninstallRouter: stopController would SIGTERM the test process
    // (the in-process controller reports pid = process.pid).
    try { holder.child?.kill(); } catch {}
    rmSync(root, { recursive: true, force: true });
  }
});

test('all fourteen runtime-operation cells are exercised', () => {
  assert.deepEqual([...observedCells].sort(), ['claude', 'codex'].flatMap(runtime => OPERATIONS.map(operation => `${runtime}:${operation}`)).sort());
});