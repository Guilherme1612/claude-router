import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

export const CALIBRATION_CORPUS_VERSION = 'router-calibration-v1';

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}

export const CALIBRATION_CORPUS = freeze([
  { id: 'minimal-prompt-v1', fixture_class: 'minimal_prompt', input: { prompt: 'continue' }, expected: { outcome: 'resume', dispatch_eligible: true }, max_context_bytes: 2048 },
  { id: 'explicit-override-v1', fixture_class: 'explicit_override', input: { prompt: 'execute phase 17' }, expected: { outcome: 'override', dispatch_eligible: true }, max_context_bytes: 2048 },
  { id: 'stale-context-v1', fixture_class: 'stale_context', input: { prompt: 'continue', force_stale: true }, expected: { outcome: 'refresh', dispatch_eligible: true }, max_context_bytes: 2048 },
  { id: 'ambiguity-v1', fixture_class: 'ambiguity', input: { prompt: 'continue', tied: true }, expected: { outcome: 'clarify', dispatch_eligible: false }, max_context_bytes: 2048 },
  { id: 'terminal-state-v1', fixture_class: 'terminal_state', input: { prompt: 'continue', status: 'complete' }, expected: { outcome: 'clarify', dispatch_eligible: false }, max_context_bytes: 2048 },
  { id: 'dependency-v1', fixture_class: 'dependency', input: { prompt: 'continue', dependencies: 'ready' }, expected: { outcome: 'resume', dispatch_eligible: true }, max_context_bytes: 2048 },
  { id: 'context-budget-v1', fixture_class: 'context_budget', input: { prompt: 'continue', context_bytes: 2048 }, expected: { outcome: 'resume', dispatch_eligible: true, context_within_budget: true }, max_context_bytes: 2048 },
]);

const corpusBytes = JSON.stringify({ version: CALIBRATION_CORPUS_VERSION, fixtures: CALIBRATION_CORPUS });
export const CALIBRATION_CORPUS_FINGERPRINT = createHash('sha256').update(corpusBytes).digest('hex');

function exactVersions(versions = {}) {
  const required = ['candidate', 'compiled_index', 'policy', 'corpus'];
  const value = { ...versions, corpus: versions.corpus ?? CALIBRATION_CORPUS_VERSION };
  if (required.some(key => typeof value[key] !== 'string' || value[key].length === 0)) throw new TypeError('exact evaluated versions are required');
  return Object.freeze(Object.fromEntries(required.map(key => [key, value[key]])));
}

export function evaluateCalibrationCorpus({ corpus = CALIBRATION_CORPUS, route, versions } = {}) {
  if (!Array.isArray(corpus) || typeof route !== 'function') throw new TypeError('corpus and route are required');
  const fixtures = corpus.map(fixture => {
    const actual = route(fixture);
    const pass = JSON.stringify(actual) === JSON.stringify(fixture.expected);
    let context;
    if (typeof actual?.additional_context === 'string') context = actual.additional_context;
    else if (typeof actual?.context === 'string') context = actual.context;
    else if (actual && typeof actual === 'object') context = JSON.stringify(actual);
    const measured_context_bytes = typeof context === 'string' ? Buffer.byteLength(context, 'utf8') : null;
    const maximum_context_bytes = fixture.max_context_bytes;
    const contextPass = Number.isSafeInteger(maximum_context_bytes) && maximum_context_bytes >= 0
      && measured_context_bytes !== null && measured_context_bytes <= maximum_context_bytes;
    return freeze({ id: fixture.id, fixture_class: fixture.fixture_class, pass, context_budget_pass: contextPass, measured_context_bytes, maximum_context_bytes });
  });
  return freeze({
    versions: exactVersions(versions), fixtures,
    quality: { pass: fixtures.every(result => result.pass), reason_code: fixtures.every(result => result.pass) ? 'quality_pass' : 'quality_regression' },
    context_budget: { pass: fixtures.every(result => result.context_budget_pass), reason_code: fixtures.every(result => result.context_budget_pass) ? 'context_budget_pass' : 'context_budget_regression' },
  });
}

export function percentile(values, fraction) {
  if (!Array.isArray(values) || values.length === 0 || !Number.isFinite(fraction) || fraction <= 0 || fraction > 1) throw new TypeError('valid samples and percentile are required');
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(fraction * ordered.length) - 1)];
}

export function measureRoutes({ fixtures, route, versions, baseline = null, warmup_runs = 5, measured_runs = 20, now = () => performance.now() } = {}) {
  if (!Array.isArray(fixtures) || fixtures.length === 0 || typeof route !== 'function') throw new TypeError('fixtures and route are required');
  if (!Number.isInteger(warmup_runs) || warmup_runs < 0 || !Number.isInteger(measured_runs) || measured_runs < 1 || measured_runs > 10_000) throw new TypeError('bounded run counts are required');
  const invoke = index => {
    const fixture = fixtures[index % fixtures.length];
    const start = now(); route(fixture); const elapsed = now() - start;
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new TypeError('monotonic clock required');
    return { fixture_id: fixture.id, elapsed_ms: elapsed };
  };
  for (let index = 0; index < warmup_runs; index += 1) invoke(index);
  const samples = Array.from({ length: measured_runs }, (_, index) => invoke(index));
  const durations = samples.map(sample => sample.elapsed_ms);
  const warm = { p50_ms: percentile(durations, 0.5), p95_ms: percentile(durations, 0.95), max_ms: Math.max(...durations) };
  return freeze({
    versions: exactVersions(versions), samples,
    corpus_fingerprint: CALIBRATION_CORPUS_FINGERPRINT,
    baseline_delta: baseline ? {
      p50_ms: warm.p50_ms - baseline.p50_ms,
      p95_ms: warm.p95_ms - baseline.p95_ms,
    } : null,
    warm,
  });
}

export function assessCalibration({ evaluation, performance: measured } = {}) {
  const p95Pass = measured?.warm?.p95_ms < 25;
  const maxPass = measured?.warm?.max_ms < 100;
  const latency = {
    pass: p95Pass && maxPass,
    reason_code: !p95Pass ? 'warm_p95_ceiling_exceeded' : !maxPass ? 'route_ceiling_exceeded' : 'latency_pass',
  };
  const quality = evaluation?.quality ?? { pass: false, reason_code: 'quality_missing' };
  const context_budget = evaluation?.context_budget ?? { pass: false, reason_code: 'context_budget_missing' };
  return freeze({ pass: quality.pass === true && context_budget.pass === true && latency.pass, quality, context_budget, latency });
}
