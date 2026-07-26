import { stableCapabilityId } from './identity.mjs';
import { stableStringify } from './schema.mjs';

const MAX_EDGES = 128;
const MAX_EVIDENCE = 32;
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
  const bounded = sorted((Array.isArray(candidates) ? candidates : []).map(canonicalCandidate)).slice(0, MAX_EDGES);
  const evaluated = bounded.map(edge => ({ edge, reasons: reasonsFor(edge, recordsById) }));
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
  return {
    schema_version: 1,
    policy_version: 'relationship-rules-v1',
    edges: sorted(active),
    candidates: sorted(inactive),
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
