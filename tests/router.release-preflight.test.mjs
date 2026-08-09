import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { RELEASE_POLICY_VERSION, reconcileReleaseEvidence } from '../src/release/preflight.mjs';

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function installed(runtime) {
  return {
    pass: true, runtime, ownership_ledger: true, semantic_active: true, continuity: true,
    native_invocation_identity: `${runtime}:fixture`, receipt_verification: true, tuple_integrity: true,
  };
}

function evidence(overrides = {}) {
  return {
    repository_tests: true, independent_evaluation: true, security: true, nyquist: true,
    installed: { claude: installed('claude'), codex: installed('codex') },
    unsupported: [{ runtime: 'future-runtime', recommendation_only: true }],
    milestone_audit: true, roadmap: true, archive: true, tag: true, ...overrides,
  };
}

test('LIFE-01..07: complete independent evidence reconciles to release-ready', () => {
  const result = reconcileReleaseEvidence(evidence());
  assert.equal(result.status, 'ready');
  assert.equal(result.policy_version, RELEASE_POLICY_VERSION);
  assert.equal(result.no_composite_score, true);
  assert.deepEqual(result.blockers, []);
});

test('LIFE-05/07: missing native evidence or archive truth blocks release', () => {
  const result = reconcileReleaseEvidence(evidence({
    installed: { claude: installed('claude'), codex: { ...installed('codex'), native_invocation_identity: null } },
    archive: false,
  }));
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.includes('installed_codex_native_evidence_missing'));
  assert.ok(result.blockers.includes('archive_evidence_missing'));
});

test('LIFE-06: unsupported runtimes must remain recommendation-only', () => {
  const result = reconcileReleaseEvidence(evidence({ unsupported: [{ runtime: 'future-runtime', recommendation_only: false }] }));
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.includes('unsupported_runtime_dispatchable'));
});

test('LIFE-02/05: installed module closure includes the activated semantic and continuity seams', () => {
  const source = readFileSync(join(REPO_ROOT, 'src/lifecycle/router-lifecycle.mjs'), 'utf8');
  for (const module of ['intent/semantic.mjs', 'orchestrator/compose.mjs', 'orchestrator/preferences.mjs', 'steward/continuity.mjs']) {
    assert.match(source, new RegExp(`['\\"]${module.replace('.', '\\.')}`));
  }
  const router = readFileSync(join(REPO_ROOT, 'src/runtime/router.mjs'), 'utf8');
  assert.doesNotMatch(router, /from ['"]\.\.\/intent\/semantic\.mjs/);
  assert.doesNotMatch(router, /from ['"]\.\.\/orchestrator\/compose\.mjs/);
});
