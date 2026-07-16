import { stableStringify } from '../registry/schema.mjs';

export const ESTIMATOR_VERSION = 'utf8-bytes-v1-ceil-div-3';
export const CONTEXT_CONTRACT_VERSION = 'workflow-context-contract-v1';

const PHASE_MAXIMA = Object.freeze({
  transition_facts: 2048,
  dependency_facts: 2048,
  artifact_summary: 6144,
  diagnostic: 2048,
});
const PHASE_TOTAL_MAX_BYTES = 12288;
const BROAD_SOURCE_CLASSES = new Set([
  'full_manifest', 'manifest_body', 'planning_tree', 'planning_directory',
  'conversation_history', 'complete_design_body', 'design_body',
]);

export const DEFAULT_CONTEXT_CONTRACT = Object.freeze({
  workflow_id: 'gsd-execute-phase',
  total_max_bytes: PHASE_TOTAL_MAX_BYTES,
  sources: Object.freeze([
    Object.freeze({ class: 'transition_facts', required: true, max_bytes: 2048, priority: 10 }),
    Object.freeze({ class: 'dependency_facts', required: true, max_bytes: 2048, priority: 20 }),
    Object.freeze({ class: 'artifact_summary', required: true, max_bytes: 6144, priority: 30 }),
    Object.freeze({ class: 'diagnostic', required: false, max_bytes: 2048, priority: 40 }),
  ]),
});

const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 512;
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const blocked = (reason_code, facts = {}) => ({ status: 'blocked', dispatch_eligible: false, reason_code, ...facts });

export function estimateRoutingTokens(canonicalValue) {
  const canonical = typeof canonicalValue === 'string' ? canonicalValue : stableStringify(canonicalValue);
  const canonical_bytes = Buffer.byteLength(canonical, 'utf8');
  return {
    estimator_version: ESTIMATOR_VERSION,
    canonical_bytes,
    estimated_tokens: Math.ceil(canonical_bytes / 3),
  };
}

export function validateContextContract(contract) {
  if (!contract || typeof contract !== 'object' || !validId(contract.workflow_id)) {
    return { valid: false, reason_code: 'context_contract_invalid' };
  }
  if (!positiveInteger(contract.total_max_bytes)) return { valid: false, reason_code: 'total_budget_invalid' };
  if (contract.total_max_bytes > PHASE_TOTAL_MAX_BYTES) return { valid: false, reason_code: 'total_budget_exceeds_phase_maximum' };
  if (!Array.isArray(contract.sources) || contract.sources.length === 0) return { valid: false, reason_code: 'context_contract_sources_invalid' };

  const classes = new Set();
  const priorities = new Set();
  for (const source of contract.sources) {
    if (!source || typeof source !== 'object' || !validId(source.class)
      || BROAD_SOURCE_CLASSES.has(source.class) || !(source.class in PHASE_MAXIMA)) {
      return { valid: false, reason_code: 'source_class_forbidden' };
    }
    if (classes.has(source.class)) return { valid: false, reason_code: 'source_class_duplicate' };
    if (typeof source.required !== 'boolean' || !positiveInteger(source.max_bytes)
      || !positiveInteger(source.priority)) return { valid: false, reason_code: 'source_contract_invalid' };
    if (source.max_bytes > PHASE_MAXIMA[source.class]) return { valid: false, reason_code: 'source_budget_exceeds_phase_maximum' };
    if (priorities.has(source.priority)) return { valid: false, reason_code: 'source_priority_ambiguous' };
    classes.add(source.class); priorities.add(source.priority);
  }
  return { valid: true, reason_code: 'context_contract_valid' };
}

function workflowToken(workflow) {
  const selection = workflow?.selection;
  if (workflow?.status !== 'selected' || workflow.dispatch_eligible !== true || !selection
    || !['transition_id', 'workflow_id', 'family', 'from', 'to'].every(key => validId(selection[key]))) return null;
  return selection;
}

function safeClosure(closure, token) {
  return closure?.status === 'resolved' && closure.dispatch_eligible === true
    && closure.workflow_id === token.workflow_id && closure.transition_id === token.transition_id
    && Array.isArray(closure.closure) && Array.isArray(closure.lifecycle_bindings);
}

function same(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function reuseFor(source, index) {
  if (source.class !== 'artifact_summary') return { status: 'not_applicable' };
  const candidates = (Array.isArray(index) ? index : []).filter(value => value?.canonical_id === source.canonical_id);
  if (candidates.length === 0) return { status: 'miss', reason_code: 'summary_not_found' };
  const exactIdentity = candidates.filter(value => same(value.identity, source.identity));
  if (exactIdentity.length === 0) return { status: 'miss', reason_code: 'summary_identity_mismatch' };
  const exactWitness = exactIdentity.filter(value => same(value.witness, source.witness));
  if (exactWitness.length === 0) return { status: 'miss', reason_code: 'summary_witness_mismatch' };
  const exactVersion = exactWitness.filter(value => value.summary_contract_version === source.summary_contract_version);
  if (exactVersion.length === 0) return { status: 'miss', reason_code: 'summary_contract_version_mismatch' };
  const selected = [...exactVersion].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)))[0];
  return { status: 'hit', value: selected.summary };
}

function sourceBytes(source, reuse) {
  if (reuse.status === 'hit') return estimateRoutingTokens(reuse.value);
  if (positiveInteger(source.canonical_bytes)) {
    return {
      estimator_version: ESTIMATOR_VERSION,
      canonical_bytes: source.canonical_bytes,
      estimated_tokens: Math.ceil(source.canonical_bytes / 3),
    };
  }
  return estimateRoutingTokens(source.value ?? source.reference ?? null);
}

function sourceFact(source, rule, accounting, reuse, reason_code) {
  return {
    canonical_id: source.canonical_id,
    class: source.class,
    ...(reason_code ? { reason_code } : {}),
    canonical_bytes: accounting.canonical_bytes,
    estimated_tokens: accounting.estimated_tokens,
    ...(reason_code ? {} : { max_bytes: rule.max_bytes, required: rule.required, priority: rule.priority }),
    reuse_status: reuse.status,
    ...(reuse.reason_code ? { reuse_reason_code: reuse.reason_code } : {}),
  };
}

/**
 * Produce a deterministic JSON-ready load plan from already-resolved workflow,
 * closure, contract, and bounded descriptors. This function performs no I/O.
 */
export function planContextLoad(options = {}) {
  const token = workflowToken(options.workflow);
  if (!token) return blocked('workflow_not_dispatch_eligible');
  if (!safeClosure(options.closure, token)) return blocked('dependency_closure_not_dispatch_eligible');

  const validation = validateContextContract(options.contract);
  if (!validation.valid) return blocked(validation.reason_code);
  if (options.contract.workflow_id !== token.workflow_id) return blocked('context_contract_workflow_mismatch');

  const rules = new Map(options.contract.sources.map(source => [source.class, source]));
  const descriptors = Array.isArray(options.sources) ? options.sources : [];
  for (const source of descriptors) {
    if (!source || typeof source !== 'object' || !validId(source.class)
      || BROAD_SOURCE_CLASSES.has(source.class) || !rules.has(source.class)) return blocked('source_class_forbidden');
    if (!validId(source.canonical_id)) return blocked('source_descriptor_invalid');
  }

  const unique = new Set();
  for (const source of descriptors) {
    const key = `${source.class}\u0000${source.canonical_id}`;
    if (unique.has(key)) return blocked('source_identity_ambiguous');
    unique.add(key);
  }
  const ordered = [...descriptors].sort((left, right) => {
    const priority = rules.get(left.class).priority - rules.get(right.class).priority;
    return priority || left.canonical_id.localeCompare(right.canonical_id);
  });

  const included = [];
  const omitted = [];
  let totalBytes = 0;
  let totalTokens = 0;
  for (const source of ordered) {
    const rule = rules.get(source.class);
    const reuse = reuseFor(source, options.summaryIndex);
    const accounting = sourceBytes(source, reuse);
    const exceedsSource = accounting.canonical_bytes > rule.max_bytes;
    const exceedsTotal = totalBytes + accounting.canonical_bytes > options.contract.total_max_bytes;
    if (exceedsSource || exceedsTotal) {
      if (rule.required) {
        return blocked('required_source_budget_exceeded', {
          blocker: { canonical_id: source.canonical_id, class: source.class, actual_bytes: accounting.canonical_bytes, max_bytes: exceedsSource ? rule.max_bytes : options.contract.total_max_bytes },
        });
      }
      omitted.push(sourceFact(source, rule, accounting, reuse, 'optional_source_budget_exceeded'));
      continue;
    }
    included.push(sourceFact(source, rule, accounting, reuse));
    totalBytes += accounting.canonical_bytes;
    totalTokens += accounting.estimated_tokens;
  }

  const baseline = options.baseline;
  const regression_delta = baseline && Number.isSafeInteger(baseline.canonical_bytes)
    && Number.isSafeInteger(baseline.estimated_tokens)
    ? { canonical_bytes: totalBytes - baseline.canonical_bytes, estimated_tokens: totalTokens - baseline.estimated_tokens }
    : null;
  return {
    status: 'planned', dispatch_eligible: true, reason_code: 'context_load_planned',
    workflow_id: token.workflow_id, transition_id: token.transition_id,
    report: {
      contract_version: CONTEXT_CONTRACT_VERSION,
      estimator_version: ESTIMATOR_VERSION,
      total_max_bytes: options.contract.total_max_bytes,
      canonical_bytes: totalBytes,
      estimated_tokens: totalTokens,
      included_sources: included,
      omitted_sources: omitted,
      regression_delta,
    },
  };
}
