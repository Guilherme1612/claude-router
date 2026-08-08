import { CONTRACT_POLICY } from './contract.mjs';

export const AUTHORITY_CRITICAL_FIELDS = Object.freeze(new Set([
  'permissions',
  'side_effects',
  'risk',
  'reversibility',
  'invocation_kind',
]));

export const TRUSTED_PROVENANCE = Object.freeze(new Set([
  'adapter',
  'correction',
]));

export function classifyEvidence(field, candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return { trusted: false, reason_code: 'untrusted_evidence_rejected' };
  }
  if (candidate.provenance === 'authored') {
    return { trusted: false, reason_code: 'authored_evidence_rejected' };
  }
  if (AUTHORITY_CRITICAL_FIELDS.has(field)) {
    if (!TRUSTED_PROVENANCE.has(candidate.provenance)) {
      return { trusted: false, reason_code: 'untrusted_evidence_rejected' };
    }
    if (!Number.isInteger(candidate.confidence_basis_points)
      || candidate.confidence_basis_points < CONTRACT_POLICY.structural_minimum_basis_points) {
      return { trusted: false, reason_code: 'below_structural_minimum' };
    }
    return { trusted: true, reason_code: '' };
  }
  return { trusted: true, reason_code: '' };
}