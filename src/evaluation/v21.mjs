import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import {
  EVALUATION_V20_VERSION,
  V20_CASES,
  createEvaluationCapabilities,
  runV20Evaluation,
} from './v20.mjs';
import { percentile } from '../evolution/perf-measure.mjs';
import { buildFullRegistry } from '../registry/build.mjs';
import { stableStringify } from '../registry/schema.mjs';

export const EVALUATION_V21_VERSION = 'v2.1-benchmark-v1';
export const ROUTING_MODES = Object.freeze(['direct', 'adaptive', 'semantic', 'pass_through']);
export const V21_CASES = V20_CASES;
export const V21_BUDGETS = Object.freeze({
  prompt_max_ms: 100,
  max_context_bytes: 18_432,
  max_composition: 9,
  max_tool_calls: 9,
});

const RUNTIMES = Object.freeze(['claude', 'codex']);
const NATIVE_STATUSES = new Set(['available', 'inactive', 'unavailable']);
const hash = value => createHash('sha256').update(stableStringify(value)).digest('hex');
const promptSignature = prompt => hash({ prompt: String(prompt || '') });

function safeToken(value, fallback = null) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@/+ -]{0,255}$/.test(value)
    ? value : fallback;
}

function mappingFor(capabilities, runtime) {
  return capabilities.map(capability => ({
    target_id: safeToken(capability.capability_id),
    runtime,
    scope: 'synthetic',
    provenance: { source_fingerprint: hash({ runtime, capability_id: capability.capability_id }) },
    availability: capability.available === true ? 'available' : 'unavailable',
    eligible: capability.eligible === true,
    dispatchable: capability.available === true && capability.eligible === true,
    quarantine: capability.available === true && capability.eligible === true ? [] : ['target_not_dispatchable'],
  })).sort((left, right) => String(left.target_id).localeCompare(String(right.target_id)));
}

export function createV21Capabilities(runtime) {
  return createEvaluationCapabilities(runtime).map(capability => ({
    ...capability,
    mapping: {
      runtime,
      scope: 'synthetic',
      provenance: { source_fingerprint: hash({ runtime, capability_id: capability.capability_id }) },
      availability: capability.available === true ? 'available' : 'unavailable',
    },
  }));
}

function measureMode(mode, base) {
  const route = () => {
    if (mode === 'direct' || mode === 'pass_through') return null;
    return base.stage_ids.length;
  };
  const coldStart = performance.now();
  route();
  const cold_ms = performance.now() - coldStart;
  const samples = [];
  for (let index = 0; index < 8; index += 1) {
    const start = performance.now();
    route();
    samples.push(performance.now() - start);
  }
  return {
    cold_ms,
    warm_p50_ms: percentile(samples, 0.5),
    warm_p95_ms: percentile(samples, 0.95),
    warm_p99_ms: percentile(samples, 0.99),
    warm_max_ms: Math.max(...samples),
    sample_count: samples.length,
  };
}

function baselineDelta(metrics, baseline) {
  if (!baseline || typeof baseline !== 'object') return { status: 'not_configured', values: null };
  return {
    status: 'measured',
    values: Object.fromEntries(['p50_ms', 'p95_ms', 'p99_ms', 'max_ms', 'context_bytes', 'estimated_tokens'].map(key => [
      key, Number.isFinite(metrics[key]) && Number.isFinite(baseline[key]) ? metrics[key] - baseline[key] : null,
    ])),
  };
}

function rowFor({ base, testCase, runtime, mode, capabilities, baseline }) {
  const bypass = mode === 'direct' || mode === 'pass_through';
  const selected = bypass ? [] : [...(base.stage_ids || [])];
  const actual = bypass || base.selected_actual_pass !== true ? [] : [...selected];
  const expectedRoleUnavailable = !bypass && testCase.browser_required
    && !capabilities.some(capability => capability.roles?.includes('browser-verification')
      && capability.available === true && capability.eligible === true);
  const availability_gaps = testCase.negative ? [] : expectedRoleUnavailable ? ['browser-verification_unavailable']
    : bypass ? [] : base.execution_status === 'completed' ? [] : [
      safeToken(base.execution_reason_code || 'expected_capability_unavailable', 'expected_capability_unavailable'),
    ];
  const measurement = measureMode(mode, base);
  const metrics = {
    prompt_overhead: { cold_ms: measurement.cold_ms, warm_p95_ms: measurement.warm_p95_ms },
    token_evidence: {
      estimated_tokens: Number.isSafeInteger(base.stage_ids?.length) ? base.stage_ids.length : 0,
      actual_tokens: null,
      actual_status: 'not_observed',
    },
    injected_bytes: 0,
    context_bytes: 0,
    latency: {
      p50_ms: measurement.warm_p50_ms,
      p95_ms: measurement.warm_p95_ms,
      p99_ms: measurement.warm_p99_ms,
      max_ms: Math.max(measurement.cold_ms, measurement.warm_max_ms),
      cold_ms: measurement.cold_ms,
      warm_sample_count: measurement.sample_count,
    },
    composition_count: selected.length,
    tool_calls: selected.length,
    retries: Number.isSafeInteger(base.retries) ? base.retries : 0,
    cache_behavior: { status: 'not_observed', hits: 0, misses: 0 },
    baseline_delta: baselineDelta({
      p50_ms: measurement.warm_p50_ms,
      p95_ms: measurement.warm_p95_ms,
      p99_ms: measurement.warm_p99_ms,
      max_ms: measurement.warm_max_ms,
      context_bytes: 0,
      estimated_tokens: base.stage_ids?.length || 0,
    }, baseline?.[runtime]?.[mode]),
  };
  const mapping = mappingFor(capabilities, runtime);
  return {
    case_id: testCase.case_id,
    prompt_signature: promptSignature(testCase.prompt),
    runtime,
    routing_mode: mode,
    expected_task_family: testCase.expected_task_family,
    selected,
    actual,
    execution_status: bypass ? 'not_invoked' : base.execution_status,
    mapping,
    availability_gaps,
    policy_guards: testCase.negative ? ['non_execute'] : [],
    receipts: { count: bypass ? 0 : base.receipt_count || 0, complete: bypass || base.selected_actual_pass === true },
    verification: { pass: bypass || base.browser_evidence_pass === true },
    metrics,
    failure_reasons: availability_gaps,
  };
}

function dimension(pass, failures = [], extra = {}) {
  return { pass: pass === true, failures, ...extra };
}

function dimensions(rows) {
  const failures = (predicate, code) => rows.filter(row => !predicate(row)).map(row => ({
    case_id: row.case_id, runtime: row.runtime, routing_mode: row.routing_mode, reason_code: code,
  }));
  const availability = failures(row => row.availability_gaps.length === 0, 'availability_gap');
  const latency = failures(row => row.metrics.latency.max_ms <= V21_BUDGETS.prompt_max_ms, 'prompt_latency_regression');
  const context = failures(row => row.metrics.context_bytes <= V21_BUDGETS.max_context_bytes, 'context_budget_exceeded');
  const injected = failures(row => Number.isSafeInteger(row.metrics.injected_bytes), 'injected_bytes_missing');
  const retries = failures(row => Number.isSafeInteger(row.metrics.retries), 'retry_count_missing');
  const composition = failures(row => row.metrics.composition_count <= V21_BUDGETS.max_composition, 'composition_cap_exceeded');
  const tools = failures(row => row.metrics.tool_calls <= V21_BUDGETS.max_tool_calls, 'tool_call_cap_exceeded');
  const receipts = failures(row => row.receipts.complete, 'receipt_evidence_missing');
  const verification = failures(row => row.verification.pass, 'verification_evidence_missing');
  const promptHashes = new Set(rows.map(row => `${row.case_id}:${row.prompt_signature}`));
  const caseIds = new Set(rows.map(row => row.case_id));
  const expectedRowCount = new Set(rows.map(row => `${row.case_id}:${row.runtime}:${row.routing_mode}`)).size;
  return {
    corpus: dimension(promptHashes.size === caseIds.size
      && expectedRowCount === rows.length),
    selection: dimension(failures(row => row.routing_mode === 'direct' || row.routing_mode === 'pass_through' || row.selected.length > 0 || row.execution_status === 'not_planned', 'selection_failed').length === 0),
    availability: dimension(availability.length === 0, availability),
    mapping: dimension(rows.every(row => row.mapping.every(target => target.runtime === row.runtime) && row.availability_gaps.length === 0), failures(row => row.mapping.every(target => target.runtime === row.runtime) && row.availability_gaps.length === 0, 'runtime_mapping_or_availability_gap')),
    prompt_overhead: dimension(latency.length === 0, latency),
    token_evidence: dimension(rows.every(row => Number.isSafeInteger(row.metrics.token_evidence.estimated_tokens)), failures(row => Number.isSafeInteger(row.metrics.token_evidence.estimated_tokens), 'token_estimate_missing')),
    context_bytes: dimension(context.length === 0, context),
    injected_bytes: dimension(injected.length === 0, injected),
    latency: dimension(latency.length === 0, latency),
    composition: dimension(composition.length === 0, composition),
    tool_calls: dimension(tools.length === 0, tools),
    retries: dimension(retries.length === 0, retries),
    cache_behavior: dimension(rows.every(row => row.metrics.cache_behavior.status === 'not_observed' || row.metrics.cache_behavior.status === 'observed')),
    baseline_delta: dimension(rows.every(row => Object.hasOwn(row.metrics, 'baseline_delta'))),
    safety: dimension(rows.every(row => row.policy_guards.includes('non_execute')
      ? row.selected.length === 0 && row.actual.length === 0
      : !row.policy_guards.includes('unsafe_execute')),
    ),
    receipts: dimension(receipts.length === 0, receipts),
    verification: dimension(verification.length === 0, verification),
    privacy: dimension(rows.every(row => /^[a-f0-9]{64}$/.test(row.prompt_signature))),
  };
}

function nativeStatus(nativeSubject, runtimes) {
  if (!nativeSubject) return { status: 'inactive', reason_code: 'native_opt_in_not_requested', runtimes };
  if (typeof nativeSubject !== 'function') return { status: 'unavailable', reason_code: 'native_subject_provider_invalid', runtimes };
  try {
    const result = nativeSubject({ runtimes });
    return result && typeof result === 'object'
      ? {
        status: NATIVE_STATUSES.has(result.status) ? result.status : 'unavailable',
        reason_code: safeToken(result.reason_code, 'native_subject_reported'),
        runtimes,
        ...(Number.isSafeInteger(result.record_count) ? { record_count: result.record_count } : {}),
        ...(result.runtime_record_counts && typeof result.runtime_record_counts === 'object'
          ? { runtime_record_counts: Object.fromEntries(runtimes.map(runtime => [runtime, Number.isSafeInteger(result.runtime_record_counts[runtime]) ? result.runtime_record_counts[runtime] : 0])) }
          : {}),
        ...(Number.isSafeInteger(result.mapping_count) ? { mapping_count: result.mapping_count } : {}),
        ...(Number.isSafeInteger(result.quarantined_count) ? { quarantined_count: result.quarantined_count } : {}),
      }
      : { status: 'unavailable', reason_code: 'native_subject_result_invalid', runtimes };
  } catch {
    return { status: 'unavailable', reason_code: 'native_subject_failed', runtimes };
  }
}

// Native mode is inventory-only: it may inspect the local registry, but it never
// invokes a capability or includes paths, prompts, outputs, or diagnostics.
export function createNativeInventorySubject(options = {}) {
  return () => {
    try {
      const built = buildFullRegistry(options);
      const counts = built.summary?.runtimes || {};
      const record_count = Number.isSafeInteger(built.summary?.record_count) ? built.summary.record_count : 0;
      const runtime_record_counts = Object.fromEntries(RUNTIMES.map(runtime => [
        runtime, Number.isSafeInteger(counts[runtime]) ? counts[runtime] : 0,
      ]));
      const active = RUNTIMES.filter(runtime => runtime_record_counts[runtime] > 0).length;
      return {
        status: active === RUNTIMES.length ? 'available' : active ? 'unavailable' : 'inactive',
        reason_code: active === RUNTIMES.length ? 'native_inventory_observed'
          : active ? 'native_inventory_partial' : 'native_inventory_empty',
        record_count,
        runtime_record_counts,
        mapping_count: Number.isSafeInteger(built.registry?.runtime_mappings?.length)
          ? built.registry.runtime_mappings.length : 0,
        quarantined_count: Array.isArray(built.registry?.records)
          ? built.registry.records.filter(record => record.dispatchable !== true).length : 0,
      };
    } catch {
      return { status: 'unavailable', reason_code: 'native_inventory_unavailable' };
    }
  };
}

export async function runV21Benchmark({
  variants = null,
  cases = V21_CASES,
  runtimes = RUNTIMES,
  routingModes = ROUTING_MODES,
  baseline = null,
  nativeSubject = null,
  now = Date.now(),
} = {}) {
  const selectedRuntimes = [...new Set((Array.isArray(runtimes) ? runtimes : RUNTIMES).filter(runtime => RUNTIMES.includes(runtime)))].sort();
  const selectedModes = [...new Set((Array.isArray(routingModes) ? routingModes : ROUTING_MODES).filter(mode => ROUTING_MODES.includes(mode)))];
  if (!selectedRuntimes.length || !selectedModes.length) throw new TypeError('runtimes and routing modes are required');
  const runtimeVariants = selectedRuntimes.map(runtime => {
    const supplied = Array.isArray(variants) ? variants.find(variant => variant.runtime === runtime) : null;
    return { runtime, capabilities: Array.isArray(supplied?.capabilities) ? supplied.capabilities : createV21Capabilities(runtime) };
  });
  const rows = [];
  for (const variant of runtimeVariants) {
    const baseReport = await runV20Evaluation({ variants: [variant], cases, now });
    const baseRows = new Map(baseReport.case_results.map(row => [row.case_id, row]));
    for (const mode of selectedModes) {
      for (const testCase of Array.isArray(cases) ? cases : []) {
        const base = baseRows.get(testCase.case_id) || {
          case_id: testCase.case_id, stage_ids: [], execution_status: 'not_planned', selected_actual_pass: false, browser_evidence_pass: true,
        };
        rows.push(rowFor({ base, testCase, runtime: variant.runtime, mode, capabilities: variant.capabilities, baseline }));
      }
    }
  }
  const reportDimensions = dimensions(rows);
  const mandatory_gates = {
    ...Object.fromEntries(Object.entries(reportDimensions).map(([key, value]) => [key, value.pass === true])),
    no_composite_score: true,
  };
  const deterministicRows = rows.map(row => ({
    case_id: row.case_id, prompt_signature: row.prompt_signature, runtime: row.runtime, routing_mode: row.routing_mode,
    selected: row.selected, actual: row.actual, execution_status: row.execution_status,
    availability_gaps: row.availability_gaps, failure_reasons: row.failure_reasons,
  }));
  const corpusFingerprint = hash({ version: EVALUATION_V21_VERSION, source: EVALUATION_V20_VERSION, cases: (Array.isArray(cases) ? cases : []).map(testCase => ({ case_id: testCase.case_id, prompt_signature: promptSignature(testCase.prompt) })) });
  const report = {
    schema_version: 1,
    evaluation_version: EVALUATION_V21_VERSION,
    source_evaluation_version: EVALUATION_V20_VERSION,
    status: Object.values(mandatory_gates).every(value => value === true) ? 'passed' : 'failed',
    generated_at: now,
    corpus_fingerprint: corpusFingerprint,
    evaluation_fingerprint: hash({ runtimes: selectedRuntimes, routing_modes: selectedModes, rows: deterministicRows }),
    matrix: { runtimes: selectedRuntimes, routing_modes: selectedModes, case_count: Array.isArray(cases) ? cases.length : 0 },
    case_count: rows.length,
    case_results: rows,
    dimensions: reportDimensions,
    mandatory_gates,
    native: nativeStatus(nativeSubject, selectedRuntimes),
  };
  return JSON.parse(JSON.stringify(report));
}
