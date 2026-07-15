import { createHash } from 'node:crypto';
import { stableCapabilityId } from './identity.mjs';
import { canonicalizeCapability, stableStringify, validateCapability } from './schema.mjs';

const MAX_COLLECTION = 128;
const MAX_TOKEN_LENGTH = 64;
const SENSITIVE_KEYS = new Set([
  'absolute_path', 'local_path', 'path', 'prompt', 'raw_prompt', 'secret', 'token', 'password', 'credential',
]);

function fingerprint(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value), 'utf8').digest('hex');
}

function sorted(values) {
  return [...values].sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
}

function bounded(values) {
  return Array.isArray(values) ? values.slice(0, MAX_COLLECTION) : [];
}

function portable(value) {
  if (Array.isArray(value)) return bounded(value).map(portable);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (SENSITIVE_KEYS.has(key.toLowerCase()) || /secret|credential|password|raw.prompt/i.test(key)) continue;
    output[key] = portable(value[key]);
  }
  return output;
}

function tokens(value) {
  return [...new Set(String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(token => token.slice(0, MAX_TOKEN_LENGTH))
    .slice(0, MAX_COLLECTION))].sort();
}

function canonicalPolicy(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const policy = {
    schema_version: 1,
    policy_version: typeof source.policy_version === 'string' ? source.policy_version : 'mapping-policy-v1',
    precedence: ['explicit', 'identity', 'inheritance', 'lexical', 'advisory'],
    scores: {
      explicit: 10000,
      identity: 9500,
      inheritance: 9000,
      lexical_maximum: 8000,
      advisory_maximum: 7500,
      ...(source.scores || {}),
    },
    minimum_scores: {
      explicit: 10000,
      identity: 9000,
      inheritance: 8500,
      lexical: 5000,
      advisory: 6500,
      ...(source.minimum_scores || {}),
    },
    minimum_margins: {
      explicit: 1,
      identity: 500,
      inheritance: 1000,
      lexical: 1500,
      advisory: 1200,
      ...(source.minimum_margins || {}),
    },
    bands: {
      high: 8500,
      medium: 6500,
      low: 5000,
      ...(source.bands || {}),
    },
    bounds: { max_collection: MAX_COLLECTION, max_token_length: MAX_TOKEN_LENGTH },
  };
  for (const group of ['scores', 'minimum_scores', 'minimum_margins', 'bands']) {
    for (const value of Object.values(policy[group])) {
      if (!Number.isInteger(value) || value < 0 || value > 10000) throw new TypeError(`${group} values must be integer basis points`);
    }
  }
  return { ...policy, policy_fingerprint: fingerprint(policy) };
}

export const DEFAULT_MAPPING_POLICY = Object.freeze(canonicalPolicy());

function canonicalCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object' || !Array.isArray(candidate.records)) {
    throw new TypeError('candidate.records must be an array');
  }
  const records = candidate.records.map(record => {
    validateCapability(record);
    return { id: stableCapabilityId(record), ...canonicalizeCapability(record) };
  });
  return { schema_version: candidate.schema_version ?? 1, records: sorted(records) };
}

function scopeApplies(recordScope, requestedScope) {
  if (!requestedScope || recordScope.kind === 'global') return true;
  if (recordScope.kind !== requestedScope.kind || recordScope.repository !== requestedScope.repository) return false;
  return recordScope.kind !== 'worktree' || recordScope.worktree === requestedScope.worktree;
}

function safety(record, recordsById, requestedScope) {
  if (!record) return { safe: false, reason_code: 'target_absent' };
  if (record.lifecycle !== 'ready') return { safe: false, reason_code: 'target_not_ready' };
  if (record.dispatchable !== true) return { safe: false, reason_code: 'target_not_dispatchable' };
  if (!record.invocation?.command?.trim()) return { safe: false, reason_code: 'target_not_invocable' };
  if (!scopeApplies(record.scope, requestedScope)) return { safe: false, reason_code: 'target_out_of_scope' };
  const permissions = record.permissions || {};
  const grants = new Set(bounded(permissions.grants));
  const denied = new Set(bounded(permissions.denied));
  if (bounded(permissions.required).some(permission => denied.has(permission))) return { safe: false, reason_code: 'target_permission_denied' };
  if (bounded(permissions.required).some(permission => !grants.has(permission))) return { safe: false, reason_code: 'target_permission_incomplete' };
  for (const dependency of bounded(record.dependencies?.items)) {
    const dependencyRecord = recordsById.get(dependency.id);
    if (!dependency.available || (dependencyRecord && (!dependencyRecord.dispatchable || dependencyRecord.lifecycle !== 'ready'))) {
      return { safe: false, reason_code: 'target_dependency_incomplete' };
    }
  }
  if (bounded(record.conflicts).some(conflict => ['dispatch-blocking', 'build-blocking'].includes(conflict.severity))) {
    return { safe: false, reason_code: 'target_collision_blocked' };
  }
  return { safe: true, reason_code: 'target_safe' };
}

function mappingMetadata(record) {
  const mapping = record.mapping && typeof record.mapping === 'object' ? record.mapping : {};
  return {
    explicit: [...new Set([...bounded(mapping.explicit_subjects), ...bounded(mapping.declared_subjects), ...bounded(mapping.aliases)])].sort(),
    identity: [...new Set(bounded(mapping.identity_subjects))].sort(),
    subjects: [...new Set(bounded(mapping.subjects))].sort(),
    routeFamilies: [...new Set(bounded(mapping.route_families))].sort(),
    triggers: [...new Set([...bounded(mapping.triggers), record.name])].sort(),
  };
}

function evidence({ subjectId, targetId, tier, rule, contribution, accepted = false, reasonCode, provenance }) {
  return portable({
    schema_version: 1,
    subject_id: subjectId,
    target_id: targetId,
    tier,
    rule,
    contribution_basis_points: contribution,
    accepted,
    reason_code: reasonCode,
    ...(provenance ? { provenance } : {}),
  });
}

function lexicalScore(subjectId, record) {
  const subjectTokens = tokens(subjectId).filter(token => !['route', 'skill', 'agent', 'command'].includes(token));
  const metadata = mappingMetadata(record);
  const targetTokens = tokens([...metadata.triggers, ...metadata.routeFamilies, record.name].join(' '));
  if (!subjectTokens.length || !targetTokens.length) return 0;
  const targetSet = new Set(targetTokens);
  const overlap = subjectTokens.filter(token => targetSet.has(token)).length;
  return Math.round((overlap / new Set([...subjectTokens, ...targetTokens]).size) * 8000);
}

function confidence(score, policy, mapped) {
  let band = 'unmapped';
  if (mapped) {
    if (score >= policy.bands.high) band = 'high';
    else if (score >= policy.bands.medium) band = 'medium';
    else band = 'low';
  }
  return { basis_points: score, score: score / 10000, band };
}

function resultForSubject(subjectId, context) {
  const { records, recordsById, existingMappings, advisoryEvidence, lifecycle, policy, requestedScope } = context;
  const ledger = [];
  const claims = new Map(policy.precedence.map(tier => [tier, []]));
  const add = (tier, record, rule, score, provenance) => {
    const check = safety(record, recordsById, requestedScope);
    ledger.push(evidence({
      subjectId, targetId: record?.id || provenance?.target_id, tier, rule, contribution: score,
      reasonCode: check.reason_code, provenance,
    }));
    claims.get(tier).push({ target_id: record?.id || provenance?.target_id, score, rule, safe: check.safe, reason_code: check.reason_code });
  };

  for (const record of records) {
    const meta = mappingMetadata(record);
    if (meta.explicit.includes(subjectId)) add('explicit', record, 'explicit_subject', policy.scores.explicit);
    if (meta.identity.includes(subjectId)) add('identity', record, 'stable_identity_subject', policy.scores.identity);
  }
  for (const mapping of existingMappings) {
    if (mapping.subject_id !== subjectId) continue;
    const record = recordsById.get(mapping.target_id);
    const meta = record ? mappingMetadata(record) : { routeFamilies: [] };
    const event = bounded(lifecycle?.events).find(item => item?.canonical_id === mapping.target_id
      && item.authoritative === true && ['renamed', 'moved'].includes(item.primary));
    const sameIdentity = record && mapping.stable_identity === record.id;
    const familyMatches = !mapping.route_family || meta.routeFamilies.includes(mapping.route_family) || event?.route_family === mapping.route_family;
    if ((sameIdentity || event) && familyMatches) add('inheritance', record, 'authoritative_inheritance', policy.scores.inheritance);
    else ledger.push(evidence({ subjectId, targetId: mapping.target_id, tier: 'inheritance', rule: 'inheritance_rejected', contribution: 0, reasonCode: 'continuity_not_authoritative' }));
  }
  for (const record of records) {
    const meta = mappingMetadata(record);
    if (!meta.subjects.includes(subjectId) && lexicalScore(subjectId, record) === 0) continue;
    add('lexical', record, 'deterministic_lexical', lexicalScore(subjectId, record));
  }
  for (const advisory of advisoryEvidence) {
    if (advisory.subject_id !== subjectId || typeof advisory.target_id !== 'string') continue;
    const score = Math.max(0, Math.min(policy.scores.advisory_maximum, Number.isInteger(advisory.score_basis_points) ? advisory.score_basis_points : 0));
    add('advisory', recordsById.get(advisory.target_id), 'advisory_reentry', score, {
      target_id: advisory.target_id,
      resolver: String(advisory.resolver || 'unknown').slice(0, MAX_TOKEN_LENGTH),
      model_version: String(advisory.model_version || 'unknown').slice(0, MAX_TOKEN_LENGTH),
      policy_version: String(advisory.policy_version || 'unknown').slice(0, MAX_TOKEN_LENGTH),
    });
  }

  let chosenTier = null;
  let disposition = 'unmapped';
  let reasonCode = 'confidence_below_threshold';
  let winningRule = null;
  let targetId;
  let score = 0;
  let runnerUp = 0;
  let alternatives = [];
  for (const tier of policy.precedence) {
    const tierClaims = claims.get(tier);
    if (!tierClaims.length) continue;
    const safeClaims = tierClaims.filter(claim => claim.safe);
    const uniqueStrong = [...new Set(safeClaims.map(claim => claim.target_id))];
    if (['explicit', 'identity'].includes(tier) && tierClaims.length && !safeClaims.length) {
      chosenTier = tier;
      reasonCode = tierClaims[0].reason_code;
      winningRule = `${tier}_target_rejected`;
      alternatives = sorted(tierClaims.map(claim => ({ target_id: claim.target_id, score: claim.score / 10000, reason_code: claim.reason_code })));
      break;
    }
    if (['explicit', 'identity'].includes(tier) && uniqueStrong.length > 1) {
      chosenTier = tier;
      disposition = 'ambiguous';
      reasonCode = `${tier}_authority_conflict`;
      winningRule = `${tier}_conflict`;
      score = Math.max(...safeClaims.map(claim => claim.score));
      runnerUp = score;
      alternatives = sorted(safeClaims.map(claim => ({ target_id: claim.target_id, score: claim.score / 10000, reason_code: 'strong_conflict' })));
      break;
    }
    const ranked = [...safeClaims].sort((left, right) => right.score - left.score || left.target_id.localeCompare(right.target_id));
    if (!ranked.length) continue;
    chosenTier = tier;
    score = ranked[0].score;
    runnerUp = ranked[1]?.score || 0;
    const margin = score - runnerUp;
    alternatives = ranked.slice(1).map(claim => ({ target_id: claim.target_id, score: claim.score / 10000, reason_code: 'lower_ranked' }));
    winningRule = ranked[0].rule;
    if (score < policy.minimum_scores[tier]) reasonCode = 'confidence_below_threshold';
    else if (margin < policy.minimum_margins[tier]) reasonCode = 'winner_margin_below_threshold';
    else {
      disposition = 'mapped';
      reasonCode = 'mapped';
      targetId = ranked[0].target_id;
    }
    break;
  }

  const acceptedKey = disposition === 'mapped' ? `${chosenTier}:${targetId}` : null;
  const orderedEvidence = sorted(ledger.map(item => ({
    ...item,
    accepted: acceptedKey === `${item.tier}:${item.target_id}`,
    ...(acceptedKey && acceptedKey !== `${item.tier}:${item.target_id}` && item.reason_code === 'target_safe'
      ? { reason_code: 'stronger_or_higher_scoring_evidence' } : {}),
  })));
  const margin = Math.max(0, score - runnerUp);
  return {
    schema_version: 1,
    subject_id: subjectId,
    disposition,
    ...(targetId ? { target_id: targetId } : {}),
    active_registry_member: true,
    dispatchable: disposition === 'mapped',
    reason_code: reasonCode,
    winning_rule: winningRule,
    confidence: confidence(score, policy, disposition === 'mapped'),
    runner_up_score: runnerUp / 10000,
    margin: margin / 10000,
    evidence: orderedEvidence,
    alternatives: sorted(alternatives),
    policy_version: policy.policy_version,
    policy_fingerprint: policy.policy_fingerprint,
  };
}

export function mapCandidateRegistry(options = {}) {
  const policy = canonicalPolicy(options.policy || DEFAULT_MAPPING_POLICY);
  let canonical;
  try {
    canonical = canonicalCandidate(options.candidate);
  } catch (error) {
    const canonicalFailure = {
      schema_version: 1,
      policy_version: policy.policy_version,
      policy_fingerprint: policy.policy_fingerprint,
      candidate_fingerprint: null,
      subjects: [],
      evidence_ledger: [],
      advisory_requests: [],
      summary: { mapped: 0, unmapped: 0, ambiguous: 0, disposition: 'invalid_candidate', reason_code: 'candidate_validation_failed' },
    };
    return { ...canonicalFailure, report_fingerprint: fingerprint(canonicalFailure) };
  }
  const candidateFingerprint = fingerprint(canonical);
  const reconciliation = options.reconciliation || {};
  if (reconciliation.disposition && reconciliation.disposition !== 'eligible') {
    throw new TypeError('mapping requires an eligible reconciliation');
  }
  if (reconciliation.candidate_fingerprint && reconciliation.candidate_fingerprint !== candidateFingerprint) {
    throw new TypeError('reconciliation candidate fingerprint does not match the exact candidate');
  }
  const recordsById = new Map(canonical.records.map(record => [record.id, record]));
  const existingMappings = sorted(bounded(options.existingMappings).map(portable));
  const advisoryEvidence = sorted(bounded(options.advisoryEvidence).map(portable));
  const subjectIds = new Set();
  for (const record of canonical.records) {
    const meta = mappingMetadata(record);
    for (const id of [...meta.explicit, ...meta.identity, ...meta.subjects]) if (typeof id === 'string' && id.trim()) subjectIds.add(id.trim());
  }
  for (const item of [...existingMappings, ...advisoryEvidence]) if (typeof item.subject_id === 'string' && item.subject_id.trim()) subjectIds.add(item.subject_id.trim());
  const context = {
    records: canonical.records,
    recordsById,
    existingMappings,
    advisoryEvidence,
    lifecycle: portable(options.lifecycle || { events: [] }),
    policy,
    requestedScope: portable(options.requestedScope),
  };
  const subjects = [...subjectIds].sort().map(subjectId => resultForSubject(subjectId, context));
  const evidenceLedger = sorted(subjects.flatMap(subject => subject.evidence));
  const advisoryRequests = subjects
    .filter(subject => subject.disposition === 'unmapped')
    .slice(0, MAX_COLLECTION)
    .map(subject => ({ schema_version: 1, subject_id: subject.subject_id, reason_code: subject.reason_code, policy_fingerprint: policy.policy_fingerprint }));
  const summary = {
    mapped: subjects.filter(subject => subject.disposition === 'mapped').length,
    unmapped: subjects.filter(subject => subject.disposition === 'unmapped').length,
    ambiguous: subjects.filter(subject => subject.disposition === 'ambiguous').length,
    disposition: subjects.some(subject => subject.disposition === 'ambiguous') ? 'ambiguous' : 'complete',
  };
  const canonicalReport = {
    schema_version: 1,
    policy_version: policy.policy_version,
    policy_fingerprint: policy.policy_fingerprint,
    candidate_fingerprint: candidateFingerprint,
    subjects,
    evidence_ledger: evidenceLedger,
    advisory_requests: advisoryRequests,
    summary,
  };
  return { ...canonicalReport, report_fingerprint: fingerprint(canonicalReport) };
}
