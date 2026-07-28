import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadCompiledIndex } from '../src/prompt/compile-index.mjs';
import { publishCompiledIndex, recoverReleaseTuple } from '../src/prompt/publish-index.mjs';
import { installRouter, restartController } from '../src/lifecycle/router-lifecycle.mjs';
import { saveCapsule } from '../src/context/capsule.mjs';
import { routeContextPrompt } from '../src/context/prompt-route.mjs';
import {
  inProcessControllerLauncher, safeFixtureContractOverlays, stubVerificationRunners,
} from './helpers/test-mode-seam.mjs';

const NOW = 1_800_000_000_000;
const registry = suffix => ({ schema_version: 1, records: [{ id: `cap-${suffix}`, name: `execute-${suffix}`,
  lifecycle: 'ready', dispatchable: true, scope: { kind: 'global' },
  invocation: { runtime: 'claude', command: `execute-${suffix}`, args: [] }, dependencies: { state: 'ready', items: [] } }] });
const mapping = suffix => ({ schema_version: 1, policy_fingerprint: 'a'.repeat(64), subjects: [{
  subject_id: 'gsd-execute-phase', disposition: 'mapped', target_id: `cap-${suffix}`, reason_code: 'explicit_subject' }] });

function artifact(name, command = name, dependencies = []) {
  return `${JSON.stringify({ schema_version: 1, name, canonical_identity: `router/${name}`, command, mapping: { explicit_subjects: [name] }, dependencies })}\n`;
}

function tupleId(root) {
  try { return JSON.parse(readFileSync(join(root, 'release-tuples', 'active.json'), 'utf8')).tuple_version_id; }
  catch { return null; }
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

// Install the router with the opt-in test_mode seam into a temporary home and return the
// runtime handles. The in-process controller launcher is used so function-valued verification
// runners are available (see tests/helpers/test-mode-seam.mjs for why we cannot spawn a child).
async function installSeam(root, holder, { claudeSkills = ['alpha'] } = {}) {
  const claudeRoot = join(root, '.claude');
  const codexRoot = join(root, '.codex');
  const sourceRouter = join(root, 'router.mjs');
  const settingsPath = join(claudeRoot, 'settings.json');
  const ownedRoot = join(claudeRoot, 'router');
  mkdirSync(join(claudeRoot, 'skills'), { recursive: true });
  mkdirSync(join(codexRoot, 'skills'), { recursive: true });
  writeFileSync(settingsPath, '{"hooks":{}}\n');
  writeFileSync(sourceRouter, 'export const router = true;\n');
  for (const name of claudeSkills) writeFileSync(join(claudeRoot, 'skills', `${name}.json`), artifact(name));
  const options = {
    claudeRoot, codexRoot, sourceRouter, settingsPath, nodeBinary: process.execPath,
    debounceMs: 10, repairMs: 60_000,
    testMode: true, verificationRunners: stubVerificationRunners,
    launchController: inProcessControllerLauncher(stubVerificationRunners, holder),
  };
  options.contractOverlays = safeFixtureContractOverlays({
    claudeRoot, codexRoot,
    artifacts: [
      ...['alpha', 'beta', 'gamma', 'delta', 'epsilon'].map(name => ({
        runtime: 'claude', relativePath: `skills/${name}.json`, bytes: artifact(name),
      })),
      { runtime: 'claude', relativePath: 'skills/beta.json', bytes: artifact('beta', 'beta', [{ id: 'missing', available: false }]) },
    ],
  });
  const installed = await installRouter(options);
  // Wait for the installed controller to publish the initial verified tuple.
  const initialTuple = await waitUntil(() => tupleId(ownedRoot));
  saveCapsule({ ownedRoot, capsule: { schema_version: 1, scope: { workspace_id: 'recovery', project_id: 'matrix' }, goal: { id: 'matrix', summary: 'matrix' }, position: { workflow: 'alpha', phase: '18', plan: '04', task: 'recovery' }, status: 'active', artifacts: [], blockers: [], freshness: { captured_at: Date.now(), generation: 'initial' }, provenance: { source: 'test', version: '1' } } });
  return { installed, options, ownedRoot, claudeRoot, codexRoot, initialTuple };
}

// ===========================================================================
// Unit-level baselines (retained from the pre-gap suite) — direct publisher/loader
// ===========================================================================

test('corrupt active tuple is durably repaired from verified known-good and repeated recovery is idempotent', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-tuple-recovery-'));
  try {
    const old = publishCompiledIndex({ ownedRoot: root, registry: registry('old'), registryVersionId: 'v1-aaaaaaaaaaaaaaaa', mapping: mapping('old'), now: NOW });
    writeFileSync(join(root, 'release-tuples', 'active.json'), '{corrupt');
    assert.equal(recoverReleaseTuple({ ownedRoot: root, now: NOW }).tuple_version_id, old.tuple_version_id);
    const firstBytes = readFileSync(join(root, 'release-tuples', 'active.json'));
    assert.equal(recoverReleaseTuple({ ownedRoot: root, now: NOW }).status, 'already-active');
    assert.deepEqual(readFileSync(join(root, 'release-tuples', 'active.json')), firstBytes);
    assert.equal(loadCompiledIndex({ ownedRoot: root, now: NOW }).tuple_version_id, old.tuple_version_id);
    const newer = publishCompiledIndex({ ownedRoot: root, registry: registry('new'), registryVersionId: 'v1-bbbbbbbbbbbbbbbb', mapping: mapping('new'), now: NOW + 1 });
    assert.notEqual(newer.tuple_version_id, old.tuple_version_id);
    assert.equal(loadCompiledIndex({ ownedRoot: root, now: NOW + 1 }).tuple_version_id, newer.tuple_version_id);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('publication crash before pointer preserves old tuple while crash after pointer exposes only new tuple', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-tuple-crash-'));
  try {
    const old = publishCompiledIndex({ ownedRoot: root, registry: registry('old'), registryVersionId: 'v1-aaaaaaaaaaaaaaaa', mapping: mapping('old'), now: NOW });
    assert.throws(() => publishCompiledIndex({ ownedRoot: root, registry: registry('new'), registryVersionId: 'v1-bbbbbbbbbbbbbbbb', mapping: mapping('new'), now: NOW + 1, crashAt: 'before-active-pointer' }), /injected crash/);
    assert.equal(loadCompiledIndex({ ownedRoot: root, now: NOW + 1 }).tuple_version_id, old.tuple_version_id);
    assert.throws(() => publishCompiledIndex({ ownedRoot: root, registry: registry('new'), registryVersionId: 'v1-bbbbbbbbbbbbbbbb', mapping: mapping('new'), now: NOW + 1, crashAt: 'after-active-pointer' }), /injected crash/);
    const observed = loadCompiledIndex({ ownedRoot: root, now: NOW + 1 });
    assert.equal(observed.dispatch_eligible, true);
    assert.notEqual(observed.tuple_version_id, old.tuple_version_id);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ===========================================================================
// D-05: reader sampling at publication boundaries observes old-or-new, never mixed
// ===========================================================================

test('D-05 reader sampling at publication boundaries observes old-or-new tuple via loadCompiledIndex and routeContextPrompt, never mixed or partial', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-d05-sampling-'));
  try {
    const old = publishCompiledIndex({ ownedRoot: root, registry: registry('old'), registryVersionId: 'v1-aaaaaaaaaaaaaaaa', mapping: mapping('old'), now: NOW });
    saveCapsule({ ownedRoot: root, capsule: { schema_version: 1, scope: { workspace_id: 'recovery', project_id: 'matrix' }, goal: { id: 'matrix', summary: 'matrix' }, position: { workflow: 'gsd-execute-phase', phase: '18', plan: '04', task: 'd05' }, status: 'active', artifacts: [], blockers: [], freshness: { captured_at: NOW, generation: 'initial' }, provenance: { source: 'test', version: '1' } } });

    // Before-active-pointer crash: the new tuple is written to its version dir but the active
    // pointer still references the old tuple. Every reader sample must resolve the complete
    // OLD tuple, never a mixed or partial state.
    assert.throws(() => publishCompiledIndex({ ownedRoot: root, registry: registry('new'), registryVersionId: 'v1-bbbbbbbbbbbbbbbb', mapping: mapping('new'), now: NOW + 1, crashAt: 'before-active-pointer' }), /injected crash/);
    const beforeSample = loadCompiledIndex({ ownedRoot: root, now: NOW + 1 });
    assert.equal(beforeSample.dispatch_eligible, true);
    assert.equal(beforeSample.tuple_version_id, old.tuple_version_id);
    const beforeRoute = routeContextPrompt({ prompt: 'continue', ownedRoot: root, projectRoot: root, now: NOW + 1 });
    // routeContextPrompt resolves the complete OLD tuple (the old registry has a
    // 'gsd-execute-phase' route from mapping('old')); it never returns a mixed or partial tuple.
    // Phase 19 D-03: the route path observes the baked budget dispatch_eligible flag. In v1,
    // planContextLoad blocks with 'required_source_class_missing' (sources:[] hardcoded,
    // Plan 02 locked decision); the route synthesizes a blocked resolution but the reader
    // still resolves the complete OLD tuple via loadCompiledIndex (the D-05 invariant).
    assert.equal(beforeRoute.handled, true);
    assert.equal(beforeSample.tuple_version_id, old.tuple_version_id);
    assert.equal(beforeRoute.resolution.dispatch_eligible, false);

    // After-active-pointer crash: the active pointer references the new tuple, but known-good
    // is not yet updated. Every reader sample must resolve the complete NEW tuple.
    assert.throws(() => publishCompiledIndex({ ownedRoot: root, registry: registry('new'), registryVersionId: 'v1-bbbbbbbbbbbbbbbb', mapping: mapping('new'), now: NOW + 1, crashAt: 'after-active-pointer' }), /injected crash/);
    const afterSample = loadCompiledIndex({ ownedRoot: root, now: NOW + 1 });
    assert.equal(afterSample.dispatch_eligible, true);
    assert.notEqual(afterSample.tuple_version_id, old.tuple_version_id);
    assert.equal(afterSample.source === 'active' || afterSample.source === 'known_good', true);

    // Recovery is idempotent: a later valid publication advances to a strictly newer tuple.
    const advanced = publishCompiledIndex({ ownedRoot: root, registry: registry('adv'), registryVersionId: 'v1-cccccccccccccccc', mapping: mapping('adv'), now: NOW + 2 });
    assert.notEqual(advanced.tuple_version_id, old.tuple_version_id);
    assert.equal(loadCompiledIndex({ ownedRoot: root, now: NOW + 2 }).tuple_version_id, advanced.tuple_version_id);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ===========================================================================
// D-04: unsafe candidate recovery through the installed watcher/controller
// ===========================================================================

test('D-04 unsafe candidate recovery through installed controller preserves the verified tuple and a later valid change advances', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-d04-unsafe-'));
  const holder = {};
  try {
    const { installed, ownedRoot, claudeRoot, initialTuple } = await installSeam(root, holder);
    let previousTuple = initialTuple;
    // Write a capability with a missing dependency → quarantined candidate, tuple unchanged.
    writeFileSync(join(claudeRoot, 'skills', 'beta.json'), artifact('beta', 'beta', [{ id: 'missing', available: false }]));
    await waitUntil(() => {
      const candidate = JSON.parse(readFileSync(installed.candidatePath, 'utf8'));
      return candidate.disposition === 'quarantined' ? candidate : null;
    });
    assert.equal(tupleId(ownedRoot), previousTuple);
    assert.equal(loadCompiledIndex({ ownedRoot }).tuple_version_id, previousTuple);
    // A later valid change advances to a strictly newer verified tuple.
    writeFileSync(join(claudeRoot, 'skills', 'beta.json'), artifact('beta'));
    const advanced = await waitUntil(() => {
      const current = tupleId(ownedRoot);
      return current && current !== previousTuple ? current : null;
    });
    assert.notEqual(advanced, previousTuple);
    const routed = routeContextPrompt({ prompt: 'continue', ownedRoot, projectRoot: root });
    // Phase 19 D-03: route path observes the baked budget dispatch_eligible flag. In v1,
    // planContextLoad blocks with 'required_source_class_missing' (sources:[] hardcoded,
    // Plan 02 locked decision); the route synthesizes a blocked resolution. The reader
    // still resolves the advanced tuple via loadCompiledIndex (the recovery invariant).
    assert.equal(loadCompiledIndex({ ownedRoot }).tuple_version_id, advanced);
    assert.equal(routed.resolution.dispatch_eligible, false);
  } finally {
    try { await holder.child?.kill(); } catch {}
    rmSync(root, { recursive: true, force: true });
  }
});

// ===========================================================================
// D-04: corrupt release-tuple payload recovery through the installed controller
// (registry, index, manifest/schema, and hash corruption variants)
// ===========================================================================

const CORRUPTION_VARIANTS = [
  { name: 'corrupt registry payload recovery', file: 'registry.json', payload: '{corrupt' },
  { name: 'corrupt index payload recovery', file: 'index.json', payload: '{corrupt' },
  { name: 'corrupt tuple manifest/schema recovery', file: 'manifest.json', payload: '{corrupt' },
  { name: 'corrupt tuple hash recovery', file: 'manifest.json', mutate: manifest => ({ ...manifest, registry: { ...manifest.registry, payload_sha256: '0'.repeat(64) } }) },
];

for (const variant of CORRUPTION_VARIANTS) test(`D-04 ${variant.name} through installed controller preserves reader safety and a later valid change advances`, async () => {
  const root = mkdtempSync(join(tmpdir(), `router-d04-${variant.name.replace(/[^a-z0-9]+/gi, '-')}-`));
  const holder = {};
  try {
    const { ownedRoot, claudeRoot, initialTuple } = await installSeam(root, holder);
    const versionDir = join(ownedRoot, 'release-tuples', 'versions', initialTuple);
    assert.equal(existsSync(versionDir), true);
    const targetFile = join(versionDir, variant.file);
    if (variant.payload) writeFileSync(targetFile, variant.payload);
    else if (variant.mutate) {
      const manifest = JSON.parse(readFileSync(targetFile, 'utf8'));
      writeFileSync(targetFile, `${JSON.stringify(variant.mutate(manifest))}\n`);
    }
    // Reader safety: the corrupt active tuple is NEVER exposed as mixed or partial state.
    // loadCompiledIndex falls back to known-good (also pointing at the corrupt tuple) and
    // returns blocked rather than a partial tuple.
    const corruptSample = loadCompiledIndex({ ownedRoot });
    assert.equal(corruptSample.dispatch_eligible, false);
    // A later valid change drives the installed controller to publish a strictly newer tuple
    // via the real seam, bypassing the corrupt version directory.
    writeFileSync(join(claudeRoot, 'skills', 'gamma.json'), artifact('gamma'));
    const advanced = await waitUntil(() => {
      const current = tupleId(ownedRoot);
      return current && current !== initialTuple ? current : null;
    });
    assert.notEqual(advanced, initialTuple);
    const recovered = loadCompiledIndex({ ownedRoot });
    assert.equal(recovered.dispatch_eligible, true);
    assert.equal(recovered.tuple_version_id, advanced);
    const routed = routeContextPrompt({ prompt: 'continue', ownedRoot, projectRoot: root });
    // Phase 19 D-03: route path observes the baked budget dispatch_eligible flag. In v1,
    // planContextLoad blocks with 'required_source_class_missing' (sources:[] hardcoded,
    // Plan 02 locked decision); the route synthesizes a blocked resolution. The reader
    // still resolves the advanced tuple via loadCompiledIndex (the recovery invariant).
    assert.equal(loadCompiledIndex({ ownedRoot }).tuple_version_id, advanced);
    assert.equal(routed.resolution.dispatch_eligible, false);
  } finally {
    try { await holder.child?.kill(); } catch {}
    rmSync(root, { recursive: true, force: true });
  }
});

// ===========================================================================
// D-04: controller interruption recovery through the installed watcher/controller
// ===========================================================================

test('D-04 controller interruption recovery through installed controller reconciles the missed event and a later valid change advances', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-d04-interruption-'));
  const holder = {};
  try {
    const { options, ownedRoot, claudeRoot, initialTuple } = await installSeam(root, holder);
    // Write a file and immediately stop the controller before debounce fires. The event is
    // missed by the stopped controller.
    writeFileSync(join(claudeRoot, 'skills', 'beta.json'), artifact('beta'));
    holder.child?.kill();
    // Confirm the missed event did not advance the tuple while the controller was stopped.
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(tupleId(ownedRoot), initialTuple);
    // Restart the controller. Its startup scan reconciles the current filesystem state
    // (including the missed beta file) and publishes a strictly newer tuple.
    await restartController({ ...options, launchController: inProcessControllerLauncher(stubVerificationRunners, holder) });
    const restarted = await waitUntil(() => {
      const current = tupleId(ownedRoot);
      return current && current !== initialTuple ? current : null;
    });
    assert.notEqual(restarted, initialTuple);
    // A later valid change advances to a strictly newer tuple.
    writeFileSync(join(claudeRoot, 'skills', 'gamma.json'), artifact('gamma'));
    const advanced = await waitUntil(() => {
      const current = tupleId(ownedRoot);
      return current && current !== restarted ? current : null;
    });
    assert.notEqual(advanced, restarted);
    const routed = routeContextPrompt({ prompt: 'continue', ownedRoot, projectRoot: root });
    // Phase 19 D-03: route path observes the baked budget dispatch_eligible flag. In v1,
    // planContextLoad blocks with 'required_source_class_missing' (sources:[] hardcoded,
    // Plan 02 locked decision); the route synthesizes a blocked resolution. The reader
    // still resolves the advanced tuple via loadCompiledIndex (the recovery invariant).
    assert.equal(loadCompiledIndex({ ownedRoot }).tuple_version_id, advanced);
    assert.equal(routed.resolution.dispatch_eligible, false);
  } finally {
    try { await holder.child?.kill(); } catch {}
    rmSync(root, { recursive: true, force: true });
  }
});

// ===========================================================================
// D-04: missed/coalesced events recovery through the installed watcher/controller
// ===========================================================================

test('D-04 missed/coalesced events recovery through installed controller produces one consistent tuple and a later valid change advances', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-d04-coalesced-'));
  const holder = {};
  try {
    const { installed, ownedRoot, claudeRoot, initialTuple } = await installSeam(root, holder);
    // Rapidly write multiple files within the debounce window. The controller coalesces them
    // into a single reconciliation that produces one consistent tuple.
    writeFileSync(join(claudeRoot, 'skills', 'beta.json'), artifact('beta'));
    writeFileSync(join(claudeRoot, 'skills', 'gamma.json'), artifact('gamma'));
    writeFileSync(join(claudeRoot, 'skills', 'delta.json'), artifact('delta'));
    const coalesced = await waitUntil(() => {
      const current = tupleId(ownedRoot);
      return current && current !== initialTuple ? current : null;
    });
    // The coalesced tuple reflects all three new capabilities.
    const candidate = JSON.parse(readFileSync(installed.candidatePath, 'utf8'));
    const names = candidate.records.map(record => record.name).sort();
    for (const expected of ['beta', 'gamma', 'delta']) assert.equal(names.includes(expected), true);
    // A later valid change advances to a strictly newer tuple.
    writeFileSync(join(claudeRoot, 'skills', 'epsilon.json'), artifact('epsilon'));
    const advanced = await waitUntil(() => {
      const current = tupleId(ownedRoot);
      return current && current !== coalesced ? current : null;
    });
    assert.notEqual(advanced, coalesced);
    const routed = routeContextPrompt({ prompt: 'continue', ownedRoot, projectRoot: root });
    // Phase 19 D-03: route path observes the baked budget dispatch_eligible flag. In v1,
    // planContextLoad blocks with 'required_source_class_missing' (sources:[] hardcoded,
    // Plan 02 locked decision); the route synthesizes a blocked resolution. The reader
    // still resolves the advanced tuple via loadCompiledIndex (the recovery invariant).
    assert.equal(loadCompiledIndex({ ownedRoot }).tuple_version_id, advanced);
    assert.equal(routed.resolution.dispatch_eligible, false);
  } finally {
    try { await holder.child?.kill(); } catch {}
    rmSync(root, { recursive: true, force: true });
  }
});

// ===========================================================================
// D-06: startup repair — corrupt active pointer on boot recovers from known-good
// ===========================================================================

test('D-06 startup repair recovers the corrupt active pointer from known-good and a later valid change advances', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-d06-startup-'));
  const holder = {};
  try {
    const { options, ownedRoot, claudeRoot, initialTuple } = await installSeam(root, holder);
    // Stop the controller and corrupt the release-tuples active pointer.
    holder.child?.kill();
    // Let the old controller's async close() finish publishing 'stopped' before we restart,
    // so its final status write cannot race the new controller's 'ready' status.
    await new Promise(resolve => setTimeout(resolve, 80));
    // Corrupt the active pointer with a parseable-but-unverifiable pointer: schema-valid but
    // references a tuple version that does not exist. tupleActive is non-null so the public
    // reader's release-tuples branch runs; verifyTuple rejects the missing version, and the
    // reader falls back to known-good. (An unparseable active.json would skip the release-tuples
    // branch entirely, leaving no known-good fallback — and perturbing the hot path to open
    // known-good unconditionally would broaden the I/O footprint pinned by compiled-index tests.)
    writeFileSync(join(ownedRoot, 'release-tuples', 'active.json'),
      JSON.stringify({ schema_version: 2, tuple_version_id: 't1-ffffffffffffffff' }));
    // Reader safety: the public reader falls back to known-good and still resolves the
    // complete verified LKG tuple, never a mixed or partial state.
    const degraded = loadCompiledIndex({ ownedRoot });
    assert.equal(degraded.dispatch_eligible, true);
    assert.equal(degraded.tuple_version_id, initialTuple);
    assert.equal(degraded.source, 'known_good');
    // Durable repair: recoverReleaseTuple rewrites the active pointer from known-good.
    const repaired = recoverReleaseTuple({ ownedRoot });
    assert.equal(repaired.tuple_version_id, initialTuple);
    assert.equal(loadCompiledIndex({ ownedRoot }).source, 'active');
    // Restart the controller and make a valid change → strictly newer tuple.
    await restartController({ ...options, launchController: inProcessControllerLauncher(stubVerificationRunners, holder) });
    writeFileSync(join(claudeRoot, 'skills', 'beta.json'), artifact('beta'));
    const advanced = await waitUntil(() => {
      const current = tupleId(ownedRoot);
      return current && current !== initialTuple ? current : null;
    });
    assert.notEqual(advanced, initialTuple);
    const routed = routeContextPrompt({ prompt: 'continue', ownedRoot, projectRoot: root });
    // Phase 19 D-03: route path observes the baked budget dispatch_eligible flag. In v1,
    // planContextLoad blocks with 'required_source_class_missing' (sources:[] hardcoded,
    // Plan 02 locked decision); the route synthesizes a blocked resolution. The reader
    // still resolves the advanced tuple via loadCompiledIndex (the recovery invariant).
    assert.equal(loadCompiledIndex({ ownedRoot }).tuple_version_id, advanced);
    assert.equal(routed.resolution.dispatch_eligible, false);
  } finally {
    try { await holder.child?.kill(); } catch {}
    rmSync(root, { recursive: true, force: true });
  }
});

// ===========================================================================
// D-06: steady-state failure recovery — controller crash mid-debounce is repaired on
// restart and a later valid change advances
// ===========================================================================

test('D-06 steady-state failure recovery through installed controller repairs on restart and a later valid change advances', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-d06-steady-'));
  const holder = {};
  try {
    const { options, ownedRoot, claudeRoot, initialTuple } = await installSeam(root, holder);
    // Simulate a steady-state controller crash: write a change, then kill the controller
    // while it is mid-debounce (before publication completes).
    writeFileSync(join(claudeRoot, 'skills', 'beta.json'), artifact('beta'));
    holder.child?.kill();
    // The crashed controller did not advance the tuple.
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(tupleId(ownedRoot), initialTuple);
    // Restart the controller. It reconciles the pending change and publishes a strictly
    // newer verified tuple (authoritative recovery from the steady-state failure).
    await restartController({ ...options, launchController: inProcessControllerLauncher(stubVerificationRunners, holder) });
    const restarted = await waitUntil(() => {
      const current = tupleId(ownedRoot);
      return current && current !== initialTuple ? current : null;
    });
    assert.notEqual(restarted, initialTuple);
    // A later valid change advances to a strictly newer tuple.
    writeFileSync(join(claudeRoot, 'skills', 'gamma.json'), artifact('gamma'));
    const advanced = await waitUntil(() => {
      const current = tupleId(ownedRoot);
      return current && current !== restarted ? current : null;
    });
    assert.notEqual(advanced, restarted);
    const routed = routeContextPrompt({ prompt: 'continue', ownedRoot, projectRoot: root });
    // Phase 19 D-03: route path observes the baked budget dispatch_eligible flag. In v1,
    // planContextLoad blocks with 'required_source_class_missing' (sources:[] hardcoded,
    // Plan 02 locked decision); the route synthesizes a blocked resolution. The reader
    // still resolves the advanced tuple via loadCompiledIndex (the recovery invariant).
    assert.equal(loadCompiledIndex({ ownedRoot }).tuple_version_id, advanced);
    assert.equal(routed.resolution.dispatch_eligible, false);
  } finally {
    try { await holder.child?.kill(); } catch {}
    rmSync(root, { recursive: true, force: true });
  }
});
