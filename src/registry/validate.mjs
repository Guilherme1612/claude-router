import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableStringify } from './schema.mjs';
import { buildFullRegistry, buildIncrementalRegistry } from './build.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
const bounded = value => String(value || '').slice(-4096).replaceAll(ROOT, '<repo>');

export const REQUIRED_ACTIVATION_GATES = Object.freeze([
  'calibration_quality', 'incremental_full_equivalence', 'latency', 'mapping_integrity',
  'privacy', 'reconciliation_safety', 'regression_suite', 'token_budget',
]);

const subprocess = (id, args, timeout, threshold) => Object.freeze({
  id, version: '1', threshold,
  async run() {
    const result = spawnSync(process.execPath, args, {
      cwd: ROOT, shell: false, encoding: 'utf8', timeout, maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH || '', HOME: ROOT, LANG: 'C', LC_ALL: 'C', NODE_NO_WARNINGS: '1' },
    });
    return {
      passed: result.status === 0 && !result.error,
      reason_code: result.error?.code === 'ETIMEDOUT' ? 'timeout' : result.signal ? 'signal' : result.status === 0 ? 'passed' : 'nonzero',
      measured: { status: result.status, signal: result.signal || null, output: bounded(`${result.stdout || ''}\n${result.stderr || ''}`) },
      threshold,
    };
  },
});

const inProcess = (id, validate, threshold) => Object.freeze({ id, version: '1', threshold, async run(input) {
  try { return { passed: Boolean(validate(input)), reason_code: validate(input) ? 'passed' : 'input_mismatch', measured: {}, threshold }; }
  catch { return { passed: false, reason_code: 'malformed_input', measured: {}, threshold }; }
} });

export function isCanonicalMappingSafe(mapping) {
  if (!mapping || mapping.schema_version !== 1 || !Array.isArray(mapping.subjects)) return false;
  if (!mapping.summary || mapping.summary.disposition !== 'complete' || mapping.summary.ambiguous !== 0) return false;
  return mapping.subjects.every(subject => subject && ['mapped', 'unmapped'].includes(subject.disposition));
}

const incrementalFullEquivalence = Object.freeze({
  id: 'incremental_full_equivalence', version: '1', threshold: { equality: 'exact' },
  async run({ candidate, equivalence } = {}) {
    try {
      const incremental = buildIncrementalRegistry(equivalence.previous, equivalence.diff, equivalence.options || {}).registry;
      const full = buildFullRegistry(equivalence.options || {}).registry;
      const candidateBytes = stableStringify(candidate);
      const incrementalBytes = stableStringify(incremental);
      const fullBytes = stableStringify(full);
      const passed = candidateBytes === incrementalBytes && candidateBytes === fullBytes;
      return {
        passed, reason_code: passed ? 'passed' : 'registry_bytes_mismatch', threshold: { equality: 'exact' },
        measured: { candidate_fingerprint: hash(candidateBytes), incremental_fingerprint: hash(incrementalBytes), full_fingerprint: hash(fullBytes) },
      };
    } catch { return { passed: false, reason_code: 'equivalence_build_failed', threshold: { equality: 'exact' }, measured: {} }; }
  },
});

export const PRODUCTION_GATE_RUNNERS = Object.freeze({
  incremental_full_equivalence: incrementalFullEquivalence,
  reconciliation_safety: inProcess('reconciliation_safety', ({ reconciliation }) => reconciliation?.disposition === 'eligible' && !(reconciliation.verdicts || []).some(v => v.dispatchable === false), { blocking_findings: 0 }),
  mapping_integrity: inProcess('mapping_integrity', ({ mapping }) => isCanonicalMappingSafe(mapping), { ambiguous: 0 }),
  calibration_quality: subprocess('calibration_quality', ['router.calibrate.mjs'], 30_000, { policy: 'repository-owned' }),
  regression_suite: subprocess('regression_suite', ['--test', 'tests/router.registry-schema.test.mjs', 'tests/router.adapters.test.mjs', 'tests/router.registry-diff.test.mjs', 'tests/router.registry-reconcile.test.mjs', 'tests/router.route-targets.test.mjs', 'tests/router.registry-map.test.mjs'], 120_000, { failures: 0 }),
  privacy: subprocess('privacy', ['--test', 'tests/router.privacy.test.mjs'], 120_000, { forbidden_evidence: 0 }),
  latency: subprocess('latency', ['--test', 'tests/router.perf-evolved.test.mjs'], 120_000, { maximum_ms: 100 }),
  token_budget: subprocess('token_budget', ['--test', 'tests/router-graphify-integration.test.mjs', 'tests/router.inject.test.mjs'], 120_000, { estimated_tokens: 500 }),
});

Object.freeze(Object.values(PRODUCTION_GATE_RUNNERS));

function producer(runners, testOnly) {
  return async function verify(options = {}) {
    if (!testOnly && ('runners' in options || 'commands' in options || 'thresholds' in options)) throw new TypeError('production runner injection is forbidden');
    const now = options.now ?? Date.now();
    const fingerprints = {
      candidate_fingerprint: hash(options.candidate || null), reconciliation_fingerprint: hash(options.reconciliation || null),
      mapping_fingerprint: hash(options.mapping || null), policy_fingerprint: hash(options.policy || null),
    };
    const gates = [];
    for (const id of REQUIRED_ACTIVATION_GATES) {
      const runner = runners[id];
      let outcome = { passed: false, reason_code: 'missing_runner' };
      if (runner) try { outcome = await (typeof runner === 'function' ? runner(options) : runner.run(options)); } catch { outcome = { passed: false, reason_code: 'runner_exception' }; }
      const gate = { id, runner_id: runner?.id || (testOnly ? `test:${id}` : null), runner_version: runner?.version || 'test', passed: outcome?.passed === true, reason_code: outcome?.reason_code || (outcome?.passed ? 'passed' : 'failed'), threshold: outcome?.threshold || runner?.threshold || {}, measured: outcome?.measured || {} };
      gates.push({ ...gate, evidence_fingerprint: hash(gate) });
    }
    const canonical = {
      schema_version: 1, verification_policy_version: 'activation-verification-v1', trusted: true, complete: gates.length === 8,
      generated_at: now, expires_at: now + (options.freshnessMs ?? 300_000), required_gate_ids: [...REQUIRED_ACTIVATION_GATES],
      ...fingerprints, gates, disposition: gates.every(g => g.passed) ? 'passing' : 'non_passing', test_only: testOnly,
    };
    return { ...canonical, verification_fingerprint: hash(canonical) };
  };
}

export const produceActivationVerification = producer(PRODUCTION_GATE_RUNNERS, false);
export function createTestActivationVerifier(overrides = {}) { return producer(overrides, true); }
