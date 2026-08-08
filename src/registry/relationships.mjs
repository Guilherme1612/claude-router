import { stableCapabilityId } from './identity.mjs';
import { stableStringify } from './schema.mjs';

const MAX_EDGES = 128;
const MAX_EVIDENCE = 32;

const COMPILATION_DISPATCH_FIELDS = new Set([
  'inputs', 'preconditions', 'dependencies', 'permissions',
  'side_effects', 'reversibility', 'risk', 'invocation_kind',
  'scope', 'workflow_transitions', 'action', 'cost', 'completion',
  'native_invocation',
]);

export const COMPILATION_REASONS = Object.freeze([
  'compilation_ambiguous_tie',
  'compilation_incompatible_output',
  'compilation_missing_dependency',
  'compilation_native_collision',
  'compilation_stale_target',
  'compilation_unsafe_composition',
  'compilation_unresolvable_contract',
]);
const MIN_CONFIDENCE = 8500;
const RULES = Object.freeze({
  substitute: 'explicit-substitution',
  variant: 'shared-lineage',
  prerequisite: 'dependency-declaration',
  composition: 'composition-declaration',
  conflict: 'conflict-declaration',
  fallback: 'fallback-declaration',
  implementation: 'implementation-binding',
  alias: 'explicit-alias',
});
const ACYCLIC_TYPES = new Set(['prerequisite', 'composition', 'fallback', 'implementation']);

export const RELATIONSHIP_TYPES = Object.freeze(Object.keys(RULES).sort());

function sorted(values) {
  return [...values].sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
}

function canonicalEvidence(values) {
  if (!Array.isArray(values)) return [];
  return sorted(values.filter(value => value && typeof value === 'object').map(value => ({
    kind: typeof value.kind === 'string' ? value.kind.trim() : '',
    provenance: typeof value.provenance === 'string' ? value.provenance.trim() : '',
    confidence_basis_points: value.confidence_basis_points,
    freshness: typeof value.freshness === 'string' ? value.freshness.trim() : 'unknown',
    rule_version: typeof value.rule_version === 'string' ? value.rule_version.trim() : '',
  }))).slice(0, MAX_EVIDENCE);
}

function endpointId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function canonicalCandidate(value) {
  const sourceId = endpointId(value?.source_id);
  const targetId = endpointId(value?.target_id);
  return {
    schema_version: 1,
    id: typeof value?.id === 'string' && value.id.trim()
      ? value.id.trim()
      : `relationship:${value?.type || 'unknown'}:${sourceId || 'unknown'}:${targetId || 'unknown'}`,
    type: typeof value?.type === 'string' ? value.type.trim() : '',
    source_id: sourceId,
    target_id: targetId,
    confidence_basis_points: value?.confidence_basis_points,
    freshness: typeof value?.freshness === 'string' ? value.freshness.trim() : 'unknown',
    evidence: canonicalEvidence(value?.evidence),
  };
}

function reasonsFor(edge, recordsById) {
  const reasons = [];
  if (!Object.hasOwn(RULES, edge.type)) reasons.push('relationship_unknown_type');
  if (!edge.source_id || !edge.target_id) reasons.push('relationship_malformed_endpoint');
  if (edge.source_id && edge.source_id === edge.target_id) reasons.push('relationship_self_edge');
  const source = recordsById.get(edge.source_id);
  const target = recordsById.get(edge.target_id);
  if (edge.source_id && !source) reasons.push('relationship_dangling_source');
  if (edge.target_id && !target) reasons.push('relationship_dangling_target');
  if (source && (source.enabled === false || source.lifecycle !== 'ready')) reasons.push('relationship_source_inactive');
  if (target && (target.enabled === false || target.lifecycle !== 'ready')) reasons.push('relationship_target_inactive');
  if (!Number.isInteger(edge.confidence_basis_points)
    || edge.confidence_basis_points < MIN_CONFIDENCE
    || edge.confidence_basis_points > 10000) reasons.push('relationship_below_threshold');
  if (edge.freshness !== 'fresh') reasons.push('relationship_stale_evidence');
  if (edge.evidence.some(item => item.kind === 'conflict')) reasons.push('relationship_conflicting_evidence');
  if (edge.evidence.some(item => item.kind === 'lexical-similarity')
    && !edge.evidence.some(item => item.kind === RULES[edge.type])) reasons.push('relationship_similarity_only');
  if (RULES[edge.type] && !edge.evidence.some(item => (
    item.kind === RULES[edge.type]
    && item.provenance
    && item.rule_version
    && item.freshness === 'fresh'
    && Number.isInteger(item.confidence_basis_points)
    && item.confidence_basis_points >= MIN_CONFIDENCE
    && item.confidence_basis_points <= 10000
  ))) reasons.push('relationship_insufficient_evidence');
  return [...new Set(reasons)].sort();
}

function cyclicIds(edges) {
  const adjacency = new Map();
  for (const edge of edges) {
    if (!ACYCLIC_TYPES.has(edge.type)) continue;
    if (!adjacency.has(edge.source_id)) adjacency.set(edge.source_id, []);
    adjacency.get(edge.source_id).push(edge);
  }
  const cyclic = new Set();
  for (const edge of edges) {
    if (!ACYCLIC_TYPES.has(edge.type)) continue;
    const queue = [edge.target_id];
    const visited = new Set();
    for (let index = 0; index < queue.length && index <= MAX_EDGES; index += 1) {
      const current = queue[index];
      if (current === edge.source_id) {
        cyclic.add(edge.id);
        break;
      }
      if (visited.has(current)) continue;
      visited.add(current);
      for (const next of adjacency.get(current) || []) queue.push(next.target_id);
    }
  }
  return cyclic;
}

export function deriveRelationships({ records = [], candidates = [] } = {}) {
  const recordsById = new Map((Array.isArray(records) ? records : []).map(record => [
    stableCapabilityId(record),
    record,
  ]));
  const evaluated = sorted((Array.isArray(candidates) ? candidates : []).map(canonicalCandidate))
    .map(edge => ({ edge, reasons: reasonsFor(edge, recordsById) }));
  const cycleIds = cyclicIds(evaluated.filter(value => value.reasons.length === 0).map(value => value.edge));
  const active = [];
  const inactive = [];
  for (const value of evaluated) {
    const reasonCodes = [...value.reasons];
    if (cycleIds.has(value.edge.id)) reasonCodes.push('relationship_cycle');
    const relationship = {
      ...value.edge,
      validation_state: reasonCodes.length ? 'inactive' : 'active',
      reason_codes: [...new Set(reasonCodes)].sort(),
    };
    (reasonCodes.length ? inactive : active).push(relationship);
  }
  const safetyFirst = (left, right) => {
    const priority = value => ['conflict', 'prerequisite'].includes(value.type) ? 0 : 1;
    return priority(left) - priority(right) || stableStringify(left).localeCompare(stableStringify(right));
  };
  const boundedActive = [...active].sort(safetyFirst).slice(0, MAX_EDGES);
  const boundedInactive = sorted(inactive).slice(0, MAX_EDGES);
  const reasonCodes = [
    ...(active.length > MAX_EDGES ? ['relationship_active_overflow'] : []),
    ...(inactive.length > MAX_EDGES ? ['relationship_inactive_overflow'] : []),
  ];
  return {
    schema_version: 1,
    policy_version: 'relationship-rules-v1',
    edges: boundedActive,
    candidates: boundedInactive,
    ...(reasonCodes.length ? {
      overflow: {
        active: Math.max(0, active.length - MAX_EDGES),
        inactive: Math.max(0, inactive.length - MAX_EDGES),
      },
      reason_codes: reasonCodes,
    } : {}),
  };
}

export function relationshipReferences(graph, knownEndpointIds = []) {
  const known = new Set(knownEndpointIds);
  const values = [
    ...(Array.isArray(graph?.edges) ? graph.edges : []),
    ...(Array.isArray(graph?.candidates) ? graph.candidates : []),
  ];
  const edges = [];
  for (const relationship of values) {
    if (typeof relationship?.id !== 'string' || !relationship.id.trim()) continue;
    for (const [suffix, endpoint] of [['source', relationship.source_id], ['target', relationship.target_id]]) {
      if (typeof endpoint !== 'string' || !endpoint.trim() || !known.has(endpoint.trim())) continue;
      edges.push({
        id: `${relationship.id}:${suffix}`,
        type: 'relationship',
        from_id: relationship.id.trim(),
        to_id: endpoint.trim(),
      });
    }
  }
  return sorted(edges);
}

function compilationField(record, name) {
  return record?.contract?.fields?.[name];
}

function variantPairKey(left, right) {
  return [left, right].sort().join('\0');
}

export function compileRelationshipGraph({ records = [], relationships = {} } = {}) {
  const recordsById = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    try {
      recordsById.set(stableCapabilityId(record), record);
    } catch {
      // Invalid records cannot participate in compilation.
    }
  }
  const edges = Array.isArray(relationships?.edges) ? relationships.edges : [];
  const diagnostics = [];

  // Build variant/conflict edge pair set for collision and ambiguous-tie exemption.
  const variantPairs = new Set();
  const conflictPairs = new Set();
  for (const edge of edges) {
    if (edge?.type === 'variant' && edge.source_id && edge.target_id) {
      variantPairs.add(variantPairKey(edge.source_id, edge.target_id));
    }
    if (edge?.type === 'conflict' && edge.source_id && edge.target_id) {
      conflictPairs.add(variantPairKey(edge.source_id, edge.target_id));
    }
  }

  // Native-identity collision: same native_type, different stable id, no variant edge.
  const nativeGroups = new Map();
  for (const [id, record] of recordsById) {
    const nativeType = record?.native_type;
    if (typeof nativeType !== 'string' || !nativeType) continue;
    if (!nativeGroups.has(nativeType)) nativeGroups.set(nativeType, []);
    nativeGroups.get(nativeType).push(id);
  }
  for (const ids of nativeGroups.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        if (variantPairs.has(variantPairKey(ids[i], ids[j]))) continue;
        diagnostics.push({
          subject_ids: [ids[i], ids[j]].sort(),
          reason_codes: ['compilation_native_collision'],
        });
      }
    }
  }

  // Ambiguous ties: identical outputs/inputs contract values, no variant/conflict edge.
  const RISK_ORDER = ['unknown', 'low', 'medium', 'high', 'critical', 'unacceptable'];
  const fitGroups = new Map();
  for (const [id, record] of recordsById) {
    if (record?.contract?.disposition !== 'dispatch-candidate') continue;
    const outputs = compilationField(record, 'outputs');
    const inputs = compilationField(record, 'inputs');
    if (!outputs || outputs.state !== 'known' || !inputs || inputs.state !== 'known') continue;
    const fitKey = stableStringify([outputs.value, inputs.value]);
    if (!fitGroups.has(fitKey)) fitGroups.set(fitKey, []);
    fitGroups.get(fitKey).push(id);
  }
  for (const ids of fitGroups.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const pairKey = variantPairKey(ids[i], ids[j]);
        if (variantPairs.has(pairKey) || conflictPairs.has(pairKey)) continue;
        diagnostics.push({
          subject_ids: [ids[i], ids[j]].sort(),
          reason_codes: ['compilation_ambiguous_tie'],
        });
      }
    }
  }

  // Stale targets and missing dependencies.
  for (const edge of edges) {
    if (!edge || typeof edge !== 'object') continue;
    if (edge.freshness === 'stale') {
      diagnostics.push({
        subject_ids: [edge.source_id, edge.target_id].filter(Boolean).sort(),
        reason_codes: ['compilation_stale_target'],
      });
    }
    if (edge.type === 'prerequisite' && edge.target_id && !recordsById.has(edge.target_id)) {
      diagnostics.push({
        subject_ids: [edge.source_id, edge.target_id].filter(Boolean).sort(),
        reason_codes: ['compilation_missing_dependency'],
      });
    }
  }

  // Composition I/O compatibility.
  for (const edge of edges) {
    if (!edge || edge.type !== 'composition') continue;
    const source = recordsById.get(edge.source_id);
    const target = recordsById.get(edge.target_id);
    if (!source || !target) continue;
    const sourceOutputs = compilationField(source, 'outputs');
    const targetInputs = compilationField(target, 'inputs');
    if (!sourceOutputs || sourceOutputs.state !== 'known' || !targetInputs || targetInputs.state !== 'known') {
      diagnostics.push({
        subject_ids: [edge.source_id, edge.target_id].filter(Boolean).sort(),
        reason_codes: ['compilation_unresolvable_contract'],
      });
      continue;
    }
    const outputs = Array.isArray(sourceOutputs.value) ? sourceOutputs.value : [];
    const inputs = Array.isArray(targetInputs.value) ? targetInputs.value : [];
    const intersection = outputs.filter(value => inputs.includes(value));
    if (intersection.length === 0) {
      diagnostics.push({
        subject_ids: [edge.source_id, edge.target_id].filter(Boolean).sort(),
        reason_codes: ['compilation_incompatible_output'],
      });
    }
    // Unsafe composition: target risk exceeds source risk, or target permissions not subset of source.
    const sourceRisk = compilationField(source, 'risk');
    const targetRisk = compilationField(target, 'risk');
    // Defense-in-depth: treat an unrecognized risk enum value as UNSAFE (highest
    // level) rather than -1 (which indexOf returns for unknown strings and would
    // silently rank as safest). A { state: 'known', value: 'garbage' } field must
    // not slip past the strict compilation gate as lowest-risk.
    const riskLevel = (envelope) => {
      if (envelope?.state !== 'known') return 0;
      const idx = RISK_ORDER.indexOf(envelope.value);
      return idx === -1 ? RISK_ORDER.length - 1 : idx;
    };
    const sourceRiskLevel = riskLevel(sourceRisk);
    const targetRiskLevel = riskLevel(targetRisk);
    if (targetRiskLevel > sourceRiskLevel) {
      diagnostics.push({
        subject_ids: [edge.source_id, edge.target_id].filter(Boolean).sort(),
        reason_codes: ['compilation_unsafe_composition'],
      });
    }
    const sourcePerms = compilationField(source, 'permissions');
    const targetPerms = compilationField(target, 'permissions');
    if (sourcePerms?.state === 'known' && targetPerms?.state === 'known') {
      const sourcePermSet = new Set(Array.isArray(sourcePerms.value) ? sourcePerms.value : []);
      const targetPermArr = Array.isArray(targetPerms.value) ? targetPerms.value : [];
      if (targetPermArr.some(perm => !sourcePermSet.has(perm))) {
        diagnostics.push({
          subject_ids: [edge.source_id, edge.target_id].filter(Boolean).sort(),
          reason_codes: ['compilation_unsafe_composition'],
        });
      }
    }
  }

  // Unresolvable contracts: dispatch-candidate with unknown DISPATCH_FIELDS field.
  for (const [id, record] of recordsById) {
    if (record?.contract?.disposition !== 'dispatch-candidate') continue;
    const fields = record?.contract?.fields;
    if (!fields) continue;
    for (const fieldName of COMPILATION_DISPATCH_FIELDS) {
      const envelope = fields[fieldName];
      if (!envelope || envelope.state !== 'known') {
        diagnostics.push({
          subject_ids: [id],
          reason_codes: ['compilation_unresolvable_contract'],
        });
        break;
      }
    }
  }

  const sortedDiagnostics = sorted(diagnostics);
  const reasonCodes = [...new Set(sortedDiagnostics.flatMap(d => d.reason_codes))].sort();
  return {
    schema_version: 1,
    policy_version: 'compilation-rules-v1',
    diagnostics: sortedDiagnostics,
    compiled: sortedDiagnostics.length === 0,
    reason_codes: reasonCodes,
  };
}
