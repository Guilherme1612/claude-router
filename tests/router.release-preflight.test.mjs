import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  RELEASE_POLICY_VERSION,
  reconcileReleaseEvidence,
  reconcileV20ReleaseEvidence,
} from '../src/release/preflight.mjs';

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

test('v1.9: verified zero-dispatchable inventory may preserve an empty active tuple', () => {
  const result = reconcileReleaseEvidence(evidence({
    installed: {
      claude: {
        ...installed('claude'),
        semantic_active: false,
        safe_empty_active: true,
        candidate_disposition: 'eligible',
        verification_passing: true,
        active_tuple_absent: true,
        dispatchable_count: 0,
      },
      codex: {
        ...installed('codex'),
        semantic_active: false,
        safe_empty_active: true,
        candidate_disposition: 'eligible',
        verification_passing: true,
        active_tuple_absent: true,
        dispatchable_count: 0,
      },
    },
  }));
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.blockers, []);
});

test('v1.9: incomplete safe-empty evidence remains blocked', () => {
  const result = reconcileReleaseEvidence(evidence({
    installed: {
      claude: {
        ...installed('claude'),
        semantic_active: false,
        safe_empty_active: true,
        candidate_disposition: 'eligible',
        verification_passing: true,
        active_tuple_absent: true,
        dispatchable_count: 1,
      },
      codex: installed('codex'),
    },
  }));
  assert.equal(result.status, 'blocked');
  assert.ok(result.blockers.includes('installed_claude_semantic_missing'));
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

function v20Evidence(overrides = {}) {
  return {
    coverage_fresh: true,
    expected_roles_available: true,
    browser_required: true,
    browser_runtime_evidence: true,
    prompt_privacy: true,
    safety: true,
    prompt_latency_pass: true,
    prompt_latency_ms: 12,
    ...overrides,
  };
}

test('EVAL-02: complete v2.0 workflow evidence is independently release-ready', () => {
  const result = reconcileV20ReleaseEvidence(v20Evidence());
  assert.equal(result.status, 'ready');
  assert.equal(result.no_composite_score, true);
  assert.deepEqual(result.blockers, []);
});

test('EVAL-02: every stale, unavailable, evidence, privacy, safety, and latency gate remains visible', () => {
  const result = reconcileV20ReleaseEvidence(v20Evidence({
    coverage_fresh: false,
    expected_roles_available: false,
    browser_runtime_evidence: false,
    prompt_privacy: false,
    safety: false,
    prompt_latency_ms: 101,
  }));
  assert.equal(result.status, 'blocked');
  for (const blocker of [
    'stale_coverage',
    'expected_roles_unavailable',
    'browser_runtime_evidence_missing',
    'prompt_privacy_regression',
    'safety_regression',
    'prompt_latency_regression',
  ]) assert.ok(result.blockers.includes(blocker), blocker);
  assert.equal(Object.hasOwn(result, 'score'), false);
});

test('EVAL-02: browser evidence is required only when the workflow requires browser/runtime verification', () => {
  const result = reconcileV20ReleaseEvidence(v20Evidence({
    browser_required: false,
    browser_runtime_evidence: false,
  }));
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.blockers, []);
});
