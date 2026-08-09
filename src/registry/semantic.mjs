import { stableCapabilityId } from './identity.mjs';
import { stableStringify } from './schema.mjs';
import { evaluateEligibility } from './eligibility.mjs';
import { CONTRACT_FIELDS, validateContractFieldValue } from './contract.mjs';
import { AUTHORITY_CRITICAL_FIELDS } from './trust.mjs';

export const SEMANTIC_POLICY_VERSION = 'semantic-resolution-v1';
export const SEMANTIC_RETRIEVAL_POLICY_VERSION = 'semantic-retrieval-v1';

export const SEMANTIC_WORKFLOWS = Object.freeze([
  Object.freeze({
    workflow_id: 'relationship-inspection', goal: 'inspect',
    subjects: Object.freeze(['database', 'relationship']),
    operations: Object.freeze(['inspect', 'trace', 'map']),
    roles: Object.freeze(['relationship-analysis']),
    aliases: Object.freeze(['data model inspection', 'schema relationship analysis', 'dependency mapping']),
    evidence_needs: Object.freeze(['relationships', 'report']), max_capabilities: 1,
  }),
  Object.freeze({
    workflow_id: 'substantial-ui-redesign', goal: 'redesign',
    subjects: Object.freeze(['ui']),
    operations: Object.freeze(['redesign', 'implement', 'review']),
    roles: Object.freeze(['design-direction', 'ux-system', 'implementation', 'review']),
    aliases: Object.freeze(['substantial interface redesign', 'frontend overhaul', 'visual system improvement']),
    evidence_needs: Object.freeze(['design', 'tests', 'review']), max_capabilities: 4,
  }),
  Object.freeze({
    workflow_id: 'generic-inspection', goal: 'inspect',
    subjects: Object.freeze(['codebase']),
    operations: Object.freeze(['inspect', 'review', 'verify']),
    roles: Object.freeze(['inspection']),
    aliases: Object.freeze(['codebase inspection', 'repository analysis']),
    evidence_needs: Object.freeze(['report']), max_capabilities: 1,
  }),
]);

// Re-export so semantic.mjs establishes the dependency surface the plan
// requires (CONTRACT_FIELDS, AUTHORITY_CRITICAL_FIELDS). They document the
// trust boundary: resolveSemanticOutcome only reads fields with state 'known',
// and classifyEvidence already gates authority-critical fields before they
// reach 'known'. Keeping the imports live prevents future tree-shaking from
// silently dropping the trust-boundary contract.
void CONTRACT_FIELDS;
void AUTHORITY_CRITICAL_FIELDS;

function field(record, name) {
  return record?.contract?.fields?.[name];
}

function fieldState(record, name) {
  const envelope = field(record, name);
  if (!envelope || envelope.state !== 'known') return 'unknown';
  if (validateContractFieldValue(name, envelope.value)) return 'unknown';
  return 'known';
}

function knownValue(record, name) {
  if (fieldState(record, name) !== 'known') return null;
  return field(record, name).value;
}

function isSuperset(superset, subset) {
  if (!Array.isArray(subset) || !Array.isArray(superset)) return false;
  return subset.every(item => superset.includes(item));
}

function contractFitScore(record, outcome) {
  const outputs = knownValue(record, 'outputs');
  if (outputs === null) return null;
  if (!isSuperset(outputs, outcome.requires)) return null;
  const inputs = knownValue(record, 'inputs');
  return {
    outputs: outputs.slice().sort(),
    inputs: Array.isArray(inputs) ? inputs.slice().sort() : [],
  };
}

export function resolveSemanticOutcome({ outcome, records = [], relationships = {} } = {}) {
  const recordsById = new Map();
  for (const candidate of Array.isArray(records) ? records : []) {
    try {
      recordsById.set(stableCapabilityId(candidate), candidate);
    } catch {
      // Invalid candidates cannot be semantically resolved.
    }
  }
  const requires = Array.isArray(outcome?.requires) ? outcome.requires : [];
  const candidates = [];
  for (const record of recordsById.values()) {
    if (record?.contract?.disposition !== 'dispatch-candidate') continue;
    const fit = contractFitScore(record, { requires });
    if (fit === null) continue;
    const {
      eligibility: _authoredEligibility,
      dispatch_eligible: _authoredDispatchEligible,
      ...authoritative
    } = record;
    const eligibility = evaluateEligibility({
      record: authoritative,
      records: [...recordsById.values()],
      relationships,
    });
    if (!eligibility.eligible) continue;
    candidates.push({
      stable_id: stableCapabilityId(record),
      contract_fields: {
        inputs: fit.inputs,
        outputs: fit.outputs,
        dependencies: knownValue(record, 'dependencies') || [],
        action: knownValue(record, 'action') || 'unknown',
      },
      eligibility_summary: {
        eligible: eligibility.eligible,
        reason_codes: eligibility.reason_codes,
      },
      _fit: fit,
    });
  }
  if (candidates.length === 0) {
    return {
      schema_version: 1,
      policy_version: SEMANTIC_POLICY_VERSION,
      status: 'unresolved',
      reason_codes: ['no_semantic_match'],
    };
  }
  if (candidates.length > 1) {
    // Detect ambiguous ties: candidates with identical contract fit scores.
    const byFit = new Map();
    for (const candidate of candidates) {
      const fitKey = stableStringify(candidate._fit);
      if (!byFit.has(fitKey)) byFit.set(fitKey, []);
      byFit.get(fitKey).push(candidate);
    }
    for (const group of byFit.values()) {
      if (group.length > 1) {
        return {
          schema_version: 1,
          policy_version: SEMANTIC_POLICY_VERSION,
          status: 'ambiguous',
          candidates: group.map(c => c.stable_id).sort(),
          reason_codes: ['ambiguous_tie'],
        };
      }
    }
  }
  // Deterministic tiebreak: sort candidates by stable_id before selecting so
  // the candidates[0] pick is byte-identical regardless of input record ordering
  // (Map insertion order). Consistent with compileRelationshipGraph / deriveRelationships.
  candidates.sort((a, b) => a.stable_id.localeCompare(b.stable_id));
  const match = candidates[0];
  return {
    schema_version: 1,
    policy_version: SEMANTIC_POLICY_VERSION,
    status: 'resolved',
    match: {
      stable_id: match.stable_id,
      contract_fields: match.contract_fields,
      eligibility_summary: match.eligibility_summary,
    },
    reason_codes: [],
  };
}

const RETRIEVAL_LIMITS = Object.freeze({ max_candidates: 16, max_terms: 128, max_roles: 16 });

function textValues(value) {
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

function tokenSet(values) {
  return new Set(textValues(values).flatMap(value => String(value).toLowerCase().match(/[a-z0-9]+/g) || []));
}

function overlap(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let hits = 0;
  for (const value of a) if (b.has(value)) hits += 1;
  return hits / Math.max(a.size, b.size);
}

function contractValue(record, fieldName, fallback = null) {
  const value = knownValue(record, fieldName);
  return value === null ? fallback : value;
}

function workflowFor(intent, declarations) {
  const hints = new Set(textValues(intent?.workflow_hints));
  const workflows = Array.isArray(declarations) && declarations.length ? declarations : SEMANTIC_WORKFLOWS;
  const matching = workflows.filter(workflow => (
    hints.has(workflow.workflow_id)
    || (workflow.goal === intent?.goal && overlap(workflow.subjects, intent?.subjects) > 0)
  ));
  return (matching.length ? matching : workflows.filter(workflow => (
    overlap(workflow.subjects, intent?.subjects) > 0
    || overlap(workflow.operations, intent?.operations) > 0
  ))).slice(0, RETRIEVAL_LIMITS.max_candidates);
}

function candidateDiagnostics(record, intent, workflow, eligibility) {
  const semantic = record?.semantic || {};
  const contractRoles = contractValue(record, 'lifecycle_role', record?.composition?.roles || []);
  const roles = [...new Set([
    ...textValues(record?.composition?.roles),
    ...textValues(contractRoles),
    ...textValues(semantic.operations),
  ])];
  const intentTerms = [intent?.goal, intent?.subjects, intent?.operations, intent?.evidence_needs].flat();
  const recordTerms = [semantic.intents, semantic.subjects, semantic.operations, semantic.outputs, semantic.aliases, roles].flat();
  const intentFit = Math.round(10000 * overlap(intentTerms, recordTerms));
  const requiredRoles = textValues(workflow?.roles).slice(0, RETRIEVAL_LIMITS.max_roles);
  const coveredRoles = requiredRoles.filter(role => roles.includes(role));
  const availability = record?.invocation?.availability === 'available' && record?.enabled !== false;
  const authority = contractValue(record, 'authority', record?.authority?.ceiling || 'unknown');
  const risk = contractValue(record, 'risk', record?.risk?.level || 'unknown');
  const cost = contractValue(record, 'cost', record?.cost?.latency || 'unknown');
  const evidence = textValues(semantic.evidence).length
    ? textValues(semantic.evidence)
    : (record?.contract?.fields?.outputs?.evidence_class ? [record.contract.fields.outputs.evidence_class] : []);
  const workflowCoverage = {
    covered_roles: coveredRoles.sort(),
    required_roles: requiredRoles.sort(),
    complete: requiredRoles.length === 0 || coveredRoles.length === requiredRoles.length,
  };
  const eligible = availability && eligibility.eligible === true;
  return {
    stable_id: stableCapabilityId(record),
    workflow_id: workflow.workflow_id,
    intent_fit: intentFit,
    workflow_coverage: workflowCoverage,
    availability: { available: availability, state: record?.invocation?.availability || 'unknown' },
    authority: { value: authority, eligible: eligibility.gates?.authority === 'passed' },
    risk: { value: risk, eligible: eligibility.gates?.risk === 'passed' },
    cost: { value: cost, context_bytes: record?.cost?.context_bytes ?? null, tool_calls: record?.cost?.tool_calls ?? null },
    evidence: { values: evidence.slice(0, RETRIEVAL_LIMITS.max_terms), strength: evidence.length ? 'present' : 'unknown' },
    eligibility: {
      eligible,
      policy_eligible: eligibility.eligible === true,
      reason_codes: [...(eligibility.reason_codes || [])].sort(),
    },
    score: intentFit + (workflowCoverage.complete ? 3000 : coveredRoles.length * 500),
  };
}

/**
 * Retrieve explainable semantic candidates from already-built local records.
 * Discovery and contract construction stay off this path; eligibility remains
 * the single execution gate and every diagnostic dimension is independent.
 */
export function retrieveSemanticCandidates({ intent, records = [], relationships = {}, workflows } = {}) {
  if (!intent || typeof intent !== 'object') {
    return { schema_version: 1, policy_version: SEMANTIC_RETRIEVAL_POLICY_VERSION, status: 'unresolved', dispatch_eligible: false, reason_codes: ['invalid_structured_intent'], candidates: [] };
  }
  const declarations = workflows || SEMANTIC_WORKFLOWS;
  const workflowCandidates = workflowFor(intent, declarations);
  const diagnostics = [];
  for (const record of Array.isArray(records) ? records : []) {
    if (!record || record?.contract?.disposition !== 'dispatch-candidate') continue;
    const eligibility = evaluateEligibility({ record, records, relationships });
    for (const workflow of workflowCandidates) {
      diagnostics.push(candidateDiagnostics(record, intent, workflow, eligibility));
    }
  }
  diagnostics.sort((left, right) => right.score - left.score || left.stable_id.localeCompare(right.stable_id));
  const candidates = diagnostics.slice(0, RETRIEVAL_LIMITS.max_candidates);
  const eligible = candidates.filter(candidate => candidate.eligibility.eligible && candidate.workflow_coverage.complete);
  if (!eligible.length) {
    return {
      schema_version: 1,
      policy_version: SEMANTIC_RETRIEVAL_POLICY_VERSION,
      status: 'unresolved',
      dispatch_eligible: false,
      reason_codes: ['no_eligible_semantic_candidate'],
      fallback: { kind: 'missing-capability', workflow_ids: workflowCandidates.map(item => item.workflow_id).sort() },
      candidates,
    };
  }
  const best = eligible[0];
  const tied = eligible.filter(candidate => candidate.score === best.score && candidate.workflow_id === best.workflow_id);
  if (tied.length > 1) {
    return {
      schema_version: 1,
      policy_version: SEMANTIC_RETRIEVAL_POLICY_VERSION,
      status: 'ambiguous',
      dispatch_eligible: false,
      reason_codes: ['semantic_candidate_tie'],
      fallback: { kind: 'clarification', candidates: tied.map(item => item.stable_id).sort() },
      candidates,
    };
  }
  return {
    schema_version: 1,
    policy_version: SEMANTIC_RETRIEVAL_POLICY_VERSION,
    status: 'resolved',
    dispatch_eligible: intent.dispatch_eligible === true,
    reason_codes: intent.dispatch_eligible === true ? ['semantic_candidate_resolved'] : ['recommendation_only_intent'],
    workflow_id: best.workflow_id,
    selected: best,
    match: best,
    candidates,
  };
}

export const resolveSemanticCandidates = retrieveSemanticCandidates;
export const rankSemanticCandidates = retrieveSemanticCandidates;
