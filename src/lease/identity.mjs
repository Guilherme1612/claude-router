// src/lease/identity.mjs — Phase 40, Plan 01 (LEASE-01).
//
// Pure six-axis lease fingerprint. Mirrors the
// computeCompositeEpoch pattern from src/registry/fingerprint.mjs:
// createHash('sha256').update(stableStringify(...)).digest('hex') over an
// order-canonicalized input. No fs/os import — every axis arrives as an
// argument so the function is self-contained for the deploy bundle and
// deterministic under test.
//
// Axes (LEASE-01 identity binding):
//   repo, worktree, runtime, goal, schema_generation, project_fingerprint
//
// A lease created under one six-axis tuple MUST NOT authorize work for a
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
  return createHash('sha256')
    .update(stableStringify({
      repo,
      worktree,
      runtime,
      goal,
      schema_generation: schemaGeneration,
      project_fingerprint: projectFingerprint,
    }), 'utf8')
    .digest('hex');
}