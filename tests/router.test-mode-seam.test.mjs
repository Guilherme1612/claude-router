import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installRouter } from '../src/lifecycle/router-lifecycle.mjs';
import { loadCompiledIndex } from '../src/prompt/compile-index.mjs';
import { createTestActivationVerifier } from '../src/registry/validate.mjs';
import { trusted } from '../src/registry/activate.mjs';
import { stubVerificationRunners, inProcessControllerLauncher } from './helpers/test-mode-seam.mjs';

// Re-export the shared seam helpers so tests that import from this file (per the plan's
// key_links) can access them. The canonical definitions live in tests/helpers/test-mode-seam.mjs
// so importing them does not register additional tests with the runner.
export { stubVerificationRunners, inProcessControllerLauncher };

function artifact(name, command = name) {
  return `${JSON.stringify({ schema_version: 1, name, command, mapping: { explicit_subjects: [name] } })}\n`;
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

test('production-default trusted() rejects test_only:true verification without test_mode', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-seam-default-'));
  try {
    const verifier = createTestActivationVerifier(stubVerificationRunners);
    const candidate = { schema_version: 1, records: [] };
    const reconciliation = { disposition: 'eligible', verdicts: [], candidate_fingerprint: 'x' };
    const mapping = { schema_version: 1, policy_fingerprint: 'a'.repeat(64), subjects: [], summary: { disposition: 'complete', ambiguous: 0 } };
    const policy = {};
    const verification = verifier({ candidate, reconciliation, mapping, policy, now: Date.now(), freshnessMs: 300_000 });
    return Promise.resolve(verification).then(resolved => {
      assert.equal(resolved.test_only, true);
      assert.equal(resolved.disposition, 'passing');
      // Production-default: trusted() rejects test_only:true without test_mode
      assert.equal(trusted({ candidate, mapping, reconciliation, policy, verification: resolved }), false);
      // Opt-in: trusted() accepts the same verification when test_mode is true
      assert.equal(trusted({ candidate, mapping, reconciliation, policy, verification: resolved, test_mode: true }), true);
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('opt-in test_mode lets the installed controller publish via the real watcher→controller→compiled-index seam', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-seam-optin-'));
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

    const installed = await installRouter(options);
    const initialTuple = tupleId(ownedRoot);
    // Seed a safe filesystem event and wait for the installed controller to publish
    writeFileSync(join(claudeRoot, 'skills', 'beta.json'), artifact('beta'));
    const published = await waitUntil(() => {
      const current = tupleId(ownedRoot);
      return current && current !== initialTuple ? current : null;
    });
    // The published tuple is observable via the public compiled-index reader
    const compiled = loadCompiledIndex({ ownedRoot });
    assert.equal(compiled.dispatch_eligible, true);
    assert.equal(compiled.tuple_version_id, published);
    // Controller config on disk carries the opt-in flag (verification_runners is stripped
    // because functions are not JSON-serializable; the in-process launcher reattaches them).
    const config = JSON.parse(readFileSync(installed.controllerConfigPath, 'utf8'));
    assert.equal(config.test_mode, true);
    assert.equal(config.verification_runners, undefined);
  } finally {
    // Close the in-process controller directly so its heartbeat/control intervals clear and
    // the event loop drains. Do NOT call uninstallRouter: stopController would SIGTERM the
    // test process (the in-process controller reports pid = process.pid).
    try { holder.child?.kill(); } catch {}
    rmSync(root, { recursive: true, force: true });
  }
});

test('opt-in test_mode seam test file does not import the compiled-index publisher (controller publishes on its own)', () => {
  // Static invariant: this test file must NOT import the publisher function.
  // (If it did, the opt-in integration test would not prove the real seam.)
  const source = readFileSync(new URL(import.meta.url), 'utf8');
  const forbidden = ['publish', 'Compiled', 'Index'].join('');
  assert.equal(source.includes(forbidden), false);
  assert.equal(source.includes('from \'../src/prompt/publish-index.mjs\''), false);
});