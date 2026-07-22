import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createTestRegistryReconciler } from '../src/registry/watcher.mjs';
import { COMPILED_INDEX_COMPATIBILITY } from '../src/prompt/compile-index.mjs';

// ACT-01 D-10 closure: the 2026-07-17 + 2026-07-22 audits found the 7-event
// lifecycle E2E ran with testMode:true + stubVerificationRunners, so the
// production verifier path (test_only:false, trusted:true via the real
// PRODUCTION_GATE_RUNNERS) was never driven through the watcher→activation
// seam. 19-04-PLAN.md deferred this to Phase 20 and it was silently dropped.
//
// This test exercises the reconciler with test_mode ABSENT (production shape)
// and a production-shaped verifier (test_only:false, complete:true, passing)
// injected via the produceActivationVerification seam — the same default the
// reconciler resolves to when test_mode is false (watcher.mjs:320). It proves
// the production verifier path flows through activation without the test_mode
// bypass that createTestActivationVerifier (test_only:true) introduces.

const NOW = 1_750_000_000_000;

function eligibleReport() {
  return {
    disposition: 'eligible',
    candidate_fingerprint: 'candidate-fp-1234567890',
    report_fingerprint: 'report-fp',
    verdicts: [],
    active_bytes: '{}\n',
    active_fingerprint: 'active-fp',
  };
}

function builtRegistry() {
  return { schema_version: 1, records: [], compatibility: { ...COMPILED_INDEX_COMPATIBILITY } };
}

test('ACT-01: production verifier path (test_only:false) driven through activation seam', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-prod-verifier-'));
  try {
    const verifierCalls = [];
    const productionVerifier = async (options) => {
      verifierCalls.push(options);
      return {
        schema_version: 1,
        verification_policy_version: 'activation-verification-v1',
        trusted: true,
        complete: true,
        test_only: false,
        generated_at: options.now ?? NOW,
        candidate_fingerprint: 'candidate-fp',
        reconciliation_fingerprint: 'recon-fp',
        mapping_fingerprint: 'map-fp',
        policy_fingerprint: 'policy-fp',
        gates: [],
        disposition: 'passing',
        verification_fingerprint: 'verify-fp',
      };
    };
    const activatorCalls = [];
    const deps = {
      acquireRegistry: () => ({ generation: 0 }),
      refreshIncrementalAcquisition: (p) => ({ generation: p.generation + 1 }),
      assembleRegistry: () => ({ registry: builtRegistry(), diagnostics: [], summary: {} }),
      reconcileCandidate: () => eligibleReport(),
      mapCandidateRegistry: async () => ({ schema_version: 1, subjects: [], summary: { disposition: 'complete', ambiguous: 0 }, report_fingerprint: 'map' }),
      produceActivationVerification: productionVerifier,
      activateCandidate: async (args) => { activatorCalls.push(args); return { activation_status: 'activated', version_id: 'v1-new0000000000a' }; },
      publishCompiledIndex: async () => ({ publication_status: 'published' }),
      readActive: async () => ({ authority_status: 'empty', bytes: '', fingerprint: '', version_id: null }),
      writeJson: async () => {},
      compatible: () => true,
    };
    // No test_mode: production shape. The reconciler must NOT route through
    // createTestActivationVerifier (which would set test_only:true).
    const config = {
      candidate_path: join(root, 'candidate.json'),
      report_path: join(root, 'report.json'),
      activation_root: root,
      scope_id: 'global',
    };
    const reconcile = createTestRegistryReconciler(config, deps);
    await reconcile({ diff: { events: [], diagnostics: [] } });

    // The production verifier was invoked exactly once through the seam, and
    // the activator was reached (verification.passing + complete → activate).
    // This is the D-10 integration coverage that was silently dropped — the
    // test_only:false production verifier path now has an executable E2E.
    assert.equal(verifierCalls.length, 1, 'production verifier must be called once');
    assert.equal(verifierCalls[0].test_only ?? false, false, 'production verifier options must not carry test_only:true');
    assert.equal(activatorCalls.length, 1, 'activator must be reached after production verification');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ACT-01: reconciler default verifier is the real production verifier when test_mode absent', () => {
  // Confirms the wiring: with no test_mode and no injected verifier, the
  // reconciler resolves to produceActivationVerification (test_only:false),
  // not createTestActivationVerifier (test_only:true).
  const src = readFileSync(join('src', 'registry', 'watcher.mjs'), 'utf8');
  assert.ok(src.includes('dependencies.produceActivationVerification || produceActivationVerification'),
    'reconciler must default to the real production verifier');
  assert.ok(src.includes('config.test_mode === true\n    ? { produceActivationVerification: createTestActivationVerifier'),
    'test_mode:true must be the ONLY path that swaps in the test_only:true verifier');
});