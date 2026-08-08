// src/lease/identity.mjs — Phase 40, Plan 01 (LEASE-01).
//
// Pure lease fingerprint. Mirrors the
// computeCompositeEpoch pattern from src/registry/fingerprint.mjs:
// createHash('sha256').update(stableStringify(...)).digest('hex') over an
// order-canonicalized input. No fs/os import — every axis arrives as an
// argument so the function is self-contained for the deploy bundle and
// deterministic under test.
//
// Axes (LEASE-01 identity binding):
//   repo, worktree, runtime, schema_generation, project_fingerprint
//
// `goal` is NOT part of the fingerprint. It is an operator-declared label
// stored on the lease record as metadata only (see policy.mjs). The hot path
// has no operator-declared goal (the prompt only yields an authority_class
// enum), so hashing goal would make the lookup fingerprint never match the
// creation fingerprint (CR-01: LEASE-04 precedence was non-functional). Keying
// by project identity — not by the authority class of the current prompt — is
// the correct binding: a lease authorizes work for the PROJECT.
//
// A lease created under one five-axis tuple MUST NOT authorize work for a
// different fingerprint (T-40-01 spoofing mitigation): findByFingerprint in
// store.mjs matches only the exact hash this function emits. A null/undefined
// project_fingerprint is rejected with an explicit Error rather than hashed
// to a null axis (LEASE-03 empty edge — see PLAN must_haves).

import { createHash } from 'node:crypto';
import { stableStringify } from '../registry/schema.mjs';

export function computeLeaseFingerprint({
  repo,
  worktree,
  runtime,
  goal,
  schemaGeneration,
  projectFingerprint,
} = {}) {
  if (projectFingerprint === null || projectFingerprint === undefined) {
    throw new Error('invalid_project_fingerprint');
  }
  // goal is accepted for API symmetry but is NOT hashed — it is stored on the
  // lease record as operator-declared metadata only (see header + policy.mjs).
  return createHash('sha256')
    .update(stableStringify({
      repo,
      worktree,
      runtime,
      schema_generation: schemaGeneration,
      project_fingerprint: projectFingerprint,
    }), 'utf8')
    .digest('hex');
}