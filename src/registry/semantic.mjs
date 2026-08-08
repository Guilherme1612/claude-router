import { stableCapabilityId } from './identity.mjs';
import { stableStringify } from './schema.mjs';
import { evaluateEligibility } from './eligibility.mjs';
import { CONTRACT_FIELDS, validateContractFieldValue } from './contract.mjs';
import { AUTHORITY_CRITICAL_FIELDS } from './trust.mjs';

export const SEMANTIC_POLICY_VERSION = 'semantic-resolution-v1';

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