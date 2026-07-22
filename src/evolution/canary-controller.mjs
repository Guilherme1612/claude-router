import { createHash } from 'node:crypto';
import {
  activateCandidate,
  executeRollback,
  previewRollback,
  recoverActiveVersion,
  recoverRollbackJournal,
} from '../registry/activate.mjs';
import { evidenceWindowFingerprint } from './evidence.mjs';

export const REQUIRED_GATES = Object.freeze([
  'safety', 'privacy', 'quality', 'context_budget', 'compatibility', 'latency',
]);

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

function stableValue(value, seen = new Set()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object') throw new TypeError('candidate inputs must be JSON values');
  if (seen.has(value)) throw new TypeError('candidate inputs must not be cyclic');
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => stableValue(item, seen));
    seen.delete(value);
    return result;
  }
  const result = {};
  for (const key of Object.keys(value).sort()) result[key] = stableValue(value[key], seen);
  seen.delete(value);
  return result;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function validToken(value) {
  return typeof value === 'string' && TOKEN.test(value);
}

export function proposeCandidate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { status: 'denied', reason_code: 'invalid_candidate' };
  const allowed = new Set(['source_evidence_fingerprint', 'policy_version', 'compiled_index_version', 'evaluation_inputs', 'proposal']);
  if (Object.keys(input).some((key) => !allowed.has(key))) return { status: 'denied', reason_code: 'unknown_candidate_field' };
  if (!/^[a-f0-9]{64}$/.test(input.source_evidence_fingerprint ?? '')) return { status: 'denied', reason_code: 'invalid_evidence_fingerprint' };
  if (!validToken(input.policy_version) || !validToken(input.compiled_index_version)) return { status: 'denied', reason_code: 'invalid_candidate_version' };
  if (!input.evaluation_inputs || typeof input.evaluation_inputs !== 'object' || !input.proposal || typeof input.proposal !== 'object') {
    return { status: 'denied', reason_code: 'missing_reproducibility_input' };
  }

  try {
    const content = stableValue({
      schema_version: 1,
      source_evidence_fingerprint: input.source_evidence_fingerprint,
      policy_version: input.policy_version,
      compiled_index_version: input.compiled_index_version,
      evaluation_inputs: input.evaluation_inputs,
      proposal: input.proposal,
    });
    const id = `candidate-${sha256(stableStringify(content))}`;
    return { status: 'proposed', candidate: deepFreeze({ id, ...content }) };
  } catch {
    return { status: 'denied', reason_code: 'invalid_reproducibility_input' };
  }
}

function rejected(candidate, reason_code, preserve_version, gates = {}) {
  return deepFreeze({
    status: 'evaluated',
    candidate_id: candidate?.id ?? null,
    promotable: false,
    reason_code,
    preserve_version: preserve_version ?? null,
    gates: stableValue(gates),
  });
}

export function evaluateCandidate({ candidate, evidence_window, gates, known_good_version = null } = {}) {
  if (!candidate || !Object.isFrozen(candidate) || !/^candidate-[a-f0-9]{64}$/.test(candidate.id ?? '')) {
    return rejected(candidate, 'invalid_candidate', known_good_version);
  }
  const { id: ignored, ...content } = candidate;
  if (`candidate-${sha256(stableStringify(content))}` !== candidate.id) return rejected(candidate, 'candidate_integrity_failed', known_good_version);
  if (!evidence_window || evidence_window.status !== 'validated') return rejected(candidate, 'unvalidated_evidence_window', known_good_version);
  if (!Object.isFrozen(evidence_window) || !Object.isFrozen(evidence_window.scope) || !Object.isFrozen(evidence_window.observations)) return rejected(candidate, 'mutable_evidence_window', known_good_version);
  if (evidence_window.schema_version !== 1
    || !['project', 'aggregate'].includes(evidence_window.scope?.kind)
    || (evidence_window.scope.kind === 'project' && !validToken(evidence_window.scope.project_id))
    || !Array.isArray(evidence_window.observations)
    || !Number.isSafeInteger(evidence_window.sample_count) || evidence_window.sample_count <= 0
    || evidence_window.sample_count !== evidence_window.observations.length
    || !Number.isFinite(evidence_window.weighted_samples) || evidence_window.weighted_samples < 0 || evidence_window.weighted_samples > evidence_window.sample_count
    || !Number.isSafeInteger(evidence_window.minimum_samples) || evidence_window.minimum_samples < 1
    || evidence_window.sufficient !== (evidence_window.sample_count >= evidence_window.minimum_samples)
    || evidence_window.weighting_policy !== 'exponential-half-life-v1') return rejected(candidate, 'invalid_evidence_window', known_good_version);
  const fingerprint = evidenceWindowFingerprint(evidence_window);
  if (evidence_window.fingerprint !== fingerprint || evidence_window.source_evidence_fingerprint !== fingerprint) return rejected(candidate, 'evidence_integrity_failed', known_good_version);
  if (candidate.source_evidence_fingerprint !== fingerprint) return rejected(candidate, 'candidate_evidence_mismatch', known_good_version);
  if (evidence_window.sufficient !== true) return rejected(candidate, evidence_window.reason_code ?? 'insufficient_evidence_samples', known_good_version);
  if (!gates || typeof gates !== 'object') return rejected(candidate, 'missing_hard_gates', known_good_version);

  for (const gate of REQUIRED_GATES) {
    const outcome = gates[gate];
    if (!outcome || outcome.pass !== true) {
      return rejected(candidate, outcome?.reason_code ?? `${gate}_uncertain`, known_good_version, gates);
    }
  }
  return deepFreeze({
    status: 'evaluated',
    candidate_id: candidate.id,
    promotable: true,
    reason_code: 'candidate_promotable',
    preserve_version: known_good_version,
    evidence: {
      sample_count: evidence_window.sample_count,
      weighted_samples: evidence_window.weighted_samples,
    },
    gates: stableValue(gates),
  });
}

const REGISTRY_PUBLICATION = Object.freeze({
  activateCandidate,
  executeRollback,
  previewRollback,
  recoverActiveVersion,
  recoverRollbackJournal,
});

function recoveryBlock(result) {
  return result?.recovery_status === 'recovery_required'
    || (result?.recovery_status === 'blocked' && result.reason_code !== 'no_valid_history');
}

export function applyCanaryDecision({
  evaluation,
  demonstrated_benefit,
  activation,
  ownedRoot = activation?.ownedRoot,
  known_good_version = null,
  published_version = null,
  rollback_reason = null,
  publication = REGISTRY_PUBLICATION,
} = {}) {
  const candidateId = evaluation?.candidate_id ?? null;
  if (!evaluation || typeof evaluation.promotable !== 'boolean') {
    return { status: 'rejected', candidate_id: candidateId, reason_code: 'invalid_canary_evaluation', active_version: known_good_version };
  }

  if (!evaluation.promotable && !published_version) {
    return { status: 'rejected', candidate_id: candidateId, reason_code: evaluation.reason_code, active_version: known_good_version };
  }

  const journal = publication.recoverRollbackJournal({ ownedRoot });
  if (recoveryBlock(journal)) {
    return { status: 'recovery_required', candidate_id: candidateId, reason_code: journal.reason_code, active_version: known_good_version };
  }
  const recovered = publication.recoverActiveVersion({ ownedRoot });
  if (recoveryBlock(recovered)) {
    return { status: 'recovery_required', candidate_id: candidateId, reason_code: recovered.reason_code, active_version: known_good_version };
  }

  if (!evaluation.promotable) {
    if (!known_good_version) {
      return { status: 'recovery_required', candidate_id: candidateId, reason_code: 'missing_known_good_version', active_version: recovered.version_id ?? null };
    }
    const preview = publication.previewRollback({ ownedRoot, destination: known_good_version });
    if (preview.preview_status !== 'ready') {
      return { status: 'recovery_required', candidate_id: candidateId, reason_code: preview.reason_code, active_version: recovered.version_id ?? published_version };
    }
    const rollback = publication.executeRollback({
      ownedRoot,
      preview,
      confirmation: known_good_version,
      reason: rollback_reason || 'rollback',
    });
    if (rollback.rollback_status !== 'rolled_back') {
      return { status: 'recovery_required', candidate_id: candidateId, reason_code: rollback.reason_code, active_version: recovered.version_id ?? published_version };
    }
    return { status: 'rolled_back', candidate_id: candidateId, reason_code: evaluation.reason_code, active_version: known_good_version };
  }

  const benefitStatus = demonstrated_benefit?.status;
  if (benefitStatus !== 'demonstrated' && benefitStatus !== 'safety_correction') {
    return {
      status: 'preserved',
      candidate_id: candidateId,
      reason_code: demonstrated_benefit?.reason_code ?? 'benefit_not_demonstrated',
      active_version: recovered.version_id ?? known_good_version,
    };
  }
  if (!activation || activation.ownedRoot !== ownedRoot) {
    return { status: 'rejected', candidate_id: candidateId, reason_code: 'invalid_activation_input', active_version: recovered.version_id ?? known_good_version };
  }
  const activated = publication.activateCandidate(activation);
  if (activated.activation_status !== 'activated') {
    return {
      status: activated.activation_status === 'recovery_required' ? 'recovery_required' : 'rejected',
      candidate_id: candidateId,
      reason_code: activated.reason_code,
      active_version: recovered.version_id ?? known_good_version,
    };
  }
  return { status: 'promoted', candidate_id: candidateId, reason_code: demonstrated_benefit.reason_code, active_version: activated.version_id };
}
