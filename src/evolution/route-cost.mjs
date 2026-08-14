import { performance } from 'node:perf_hooks';
import { estimateRoutingTokens } from '../orchestrator/budget.mjs';
import { percentile } from './perf-measure.mjs';

const EVIDENCE_CLASSES = new Set(['synthetic', 'evaluation', 'installed', 'audit', 'live', 'unknown']);
const finite = value => Number.isFinite(value) && value >= 0;
const number = value => finite(value) ? value : null;

function stats(values) {
  const known = values.filter(finite);
  if (known.length === 0) return { count: 0, p50: null, p95: null, p99: null, max: null };
  return {
    count: known.length,
    p50: percentile(known, 0.5),
    p95: percentile(known, 0.95),
    p99: percentile(known, 0.99),
    max: Math.max(...known),
  };
}

function metricStats(samples, key) {
  const values = samples.map(sample => sample.metrics[key]).filter(finite);
  if (values.length === 0) return { count: 0, total: null, mean: null, max: null };
  return { count: values.length, total: values.reduce((sum, value) => sum + value, 0), mean: values.reduce((sum, value) => sum + value, 0) / values.length, max: Math.max(...values) };
}

function sampleResult(result, elapsed_ms, phase) {
  const additional_context = typeof result?.additional_context === 'string' ? result.additional_context : '';
  const tokenEstimate = estimateRoutingTokens(additional_context);
  const metrics = result?.metrics && typeof result.metrics === 'object' ? result.metrics : {};
  const evidence = result?.outcome_evidence && typeof result.outcome_evidence === 'object' ? result.outcome_evidence : {};
  const evidence_class = EVIDENCE_CLASSES.has(evidence.class) ? evidence.class : 'unknown';
  return {
    phase,
    elapsed_ms,
    evidence_class,
    verified: evidence.verified === true,
    quality: evidence.quality === 'pass' ? 'pass' : evidence.quality === 'fail' ? 'fail' : 'unknown',
    metrics: {
      filesystem_reads: number(metrics.filesystem_reads),
      root_rescans: number(metrics.root_rescans),
      manifest_load_ms: number(metrics.manifest_load_ms),
      snapshot_load_ms: number(metrics.snapshot_load_ms),
      candidates_before: number(metrics.candidates_before),
      candidates_after: number(metrics.candidates_after),
      injected_bytes: Buffer.byteLength(additional_context, 'utf8'),
      estimated_tokens: tokenEstimate.estimated_tokens,
      tool_calls: number(metrics.tool_calls),
      retries: number(metrics.retries),
      downstream_ms: number(metrics.downstream_ms),
    },
  };
}

function aggregate(samples) {
  const metricKeys = ['filesystem_reads', 'root_rescans', 'manifest_load_ms', 'snapshot_load_ms', 'candidates_before', 'candidates_after', 'injected_bytes', 'estimated_tokens', 'tool_calls', 'retries', 'downstream_ms'];
  const evidenceClasses = Object.fromEntries([...EVIDENCE_CLASSES].map(value => [value, 0]));
  for (const sample of samples) evidenceClasses[sample.evidence_class] += 1;
  const verified = samples.filter(sample => sample.verified);
  const qualityPass = verified.filter(sample => sample.quality === 'pass').length;
  return {
    count: samples.length,
    latency: stats(samples.map(sample => sample.elapsed_ms)),
    metrics: Object.fromEntries(metricKeys.map(key => [key, metricStats(samples, key)])),
    evidence_classes: evidenceClasses,
    verified_samples: verified.length,
    unknown_samples: samples.filter(sample => !sample.verified || sample.evidence_class === 'unknown').length,
    outcome_quality: { verified_samples: verified.length, pass_samples: qualityPass, pass_rate: verified.length ? qualityPass / verified.length : null },
  };
}

export function measureRouteCost({ fixtures = [], route, now = () => performance.now(), cold_runs = 1, warmup_runs = 5, measured_runs = 20 } = {}) {
  if (typeof route !== 'function') throw new TypeError('route function is required');
  const cold = [];
  const warm = [];
  for (const fixture of Array.isArray(fixtures) ? fixtures : []) {
    for (let run = 0; run < Math.max(1, cold_runs); run += 1) {
      const started = now();
      const result = route(fixture, { phase: 'cold', run });
      cold.push(sampleResult(result, Math.max(0, now() - started), 'cold'));
    }
    for (let run = 0; run < Math.max(0, warmup_runs); run += 1) route(fixture, { phase: 'warmup', run });
    for (let run = 0; run < Math.max(1, measured_runs); run += 1) {
      const started = now();
      const result = route(fixture, { phase: 'warm', run });
      warm.push(sampleResult(result, Math.max(0, now() - started), 'warm'));
    }
  }
  return Object.freeze({ version: 'route-cost-v1', measurement_kind: 'end_to_end_route', cold: aggregate(cold), warm: aggregate(warm) });
}

function check(value, limit) {
  if (limit === undefined || limit === null) return { status: 'not_applicable', value: number(value), limit: null };
  if (!finite(value) || !finite(limit)) return { status: 'unknown', value: number(value), limit: number(limit) };
  return { status: value <= limit ? 'pass' : 'fail', value, limit };
}

function minimum(value, limit) {
  if (limit === undefined || limit === null) return { status: 'not_applicable', value: number(value), limit: null };
  if (!finite(value) || !finite(limit) || (value === 0 && limit > 0)) return { status: 'unknown', value: number(value), limit: number(limit) };
  return { status: value >= limit ? 'pass' : 'fail', value, limit };
}

export function assessRouteCost({ measurement, budgets = {} } = {}) {
  const warm = measurement?.warm;
  const cold = measurement?.cold;
  const checks = {
    cold_p95_ms: check(cold?.latency?.p95, budgets.cold_p95_ms),
    warm_p95_ms: check(warm?.latency?.p95, budgets.warm_p95_ms),
    warm_p99_ms: check(warm?.latency?.p99, budgets.warm_p99_ms),
    warm_max_ms: check(warm?.latency?.max, budgets.warm_max_ms),
    filesystem_reads: check(warm?.metrics?.filesystem_reads?.max, budgets.max_filesystem_reads),
    root_rescans: check(warm?.metrics?.root_rescans?.max, budgets.max_root_rescans),
    injected_bytes: check(warm?.metrics?.injected_bytes?.max, budgets.max_injected_bytes),
    estimated_tokens: check(warm?.metrics?.estimated_tokens?.max, budgets.max_estimated_tokens),
    tool_calls: check(warm?.metrics?.tool_calls?.max, budgets.max_tool_calls),
    retries: check(warm?.metrics?.retries?.max, budgets.max_retries),
    downstream_ms: check(warm?.metrics?.downstream_ms?.max, budgets.max_downstream_ms),
    candidates_after: check(warm?.metrics?.candidates_after?.max, budgets.max_candidates_after),
    verified_outcomes: minimum(warm?.outcome_quality?.verified_samples, budgets.min_verified_outcomes),
    outcome_quality: check(warm?.outcome_quality?.pass_rate, budgets.min_outcome_pass_rate),
  };
  const statuses = Object.values(checks).map(value => value.status);
  return Object.freeze({ pass: statuses.length > 0 && statuses.every(status => ['pass', 'not_applicable'].includes(status)), checks, unknown_checks: Object.keys(checks).filter(key => checks[key].status === 'unknown'), failed_checks: Object.keys(checks).filter(key => checks[key].status === 'fail') });
}
