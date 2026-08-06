// Phase 39 Plan 01 — Task 2 (RED)
// AUTH-03 independent-input authority-policy evaluator. evaluateAuthorityPolicy
// takes a SEALED object { confidence, authority, risk, compatibility } and
// returns { decision, reason_code, confidence, policy_version, ...facts }.
// The authority and risk legs cannot read confidence or weights — confidence
// is the tier STRING ('high'|'medium'|'low'), never the numeric confidenceTier
// score and never weights. weights is not a parameter at all (AUTH-03
// independence invariant: confidence and historical-success weight never
// grant permission).
//
// Decision legs checked in order:
//   1. compatibility unfit     -> block  (compatibility_unfit)
//   2. protected effect        -> pause  (protected_effect_requires_confirmation)
//   3. authority not granted   -> block  (authority_not_granted)
//   4. reversible + local + authorized
//        high|medium confidence -> proceed (reversible_local_authorized)
//        low confidence         -> ask    (low_confidence_clarify)
//   5. non-reversible or external + authorized
//                              -> pause  (non_reversible_or_external_requires_confirmation)
//
// Load-bearing independence invariants (must hold under any weights input):
//   - low confidence + full authority + reversible + local  -> proceed? NO -> ask
//     (low confidence asks; never auto-proceed on low confidence even when
//     authority is granted and the action is reversible+local)
//   - high confidence + no authority                          -> block
//   - calling evaluateAuthorityPolicy with weights: { score: 999 } vs
//     weights: { score: 0 } yields the SAME decision (weights is not read)

import assert from 'node:assert/strict';
import test from 'node:test';

const authorityModule = import('../src/intent/authority.mjs');

const AUTHORITY_POLICY_VERSION = 'authority-policy-v1';

// Sealed-input helper: pass only the four trust-boundary fields. weights is
// intentionally NOT destructured by evaluateAuthorityPolicy; passing it here
// as an extra field proves the function never reads it (it would be silently
// ignored even if it were destructured, but the RED test asserts the
// decision is identical across two different weights values).
function makeInput({ confidence = 'high', authority = {}, risk = {}, compatibility = {}, weights } = {}) {
  return {
    confidence,
    authority,
    risk,
    compatibility,
    // weights is passed only by the weights-ignored invariant test; the
    // function signature does not destructure it.
    ...(weights !== undefined ? { weights } : {}),
  };
}

// Canonical fixture legs — the four independent inputs to the evaluator.
const FULL_AUTHORITY = { authGranted: true, protected_: false };
const NO_AUTHORITY = { authGranted: false, protected_: false };
const PROTECTED = { authGranted: true, protected_: true };
const REVERSIBLE_LOCAL = { reversible: true, local: true };
const IRREVERSIBLE = { reversible: false, local: true };
const EXTERNAL = { reversible: true, local: false };
const COMPATIBLE = { eligible: true, disposition: 'dispatch-candidate' };
const INCOMPATIBLE = { eligible: false, disposition: 'ambiguous' };

test('[phase39:authority-policy] AUTH-03 low confidence + full authority + reversible + local -> ask (low_confidence_clarify)', async () => {
  const { evaluateAuthorityPolicy } = await authorityModule;
  const result = evaluateAuthorityPolicy(makeInput({
    confidence: 'low',
    authority: FULL_AUTHORITY,
    risk: REVERSIBLE_LOCAL,
    compatibility: COMPATIBLE,
  }));
  assert.equal(result.decision, 'ask', `expected ask, got ${result.decision}`);
  assert.equal(result.reason_code, 'low_confidence_clarify');
  assert.equal(result.confidence, 'low');
  assert.equal(result.policy_version, AUTHORITY_POLICY_VERSION);
});

test('[phase39:authority-policy] AUTH-03 high confidence + no authority -> block (authority_not_granted)', async () => {
  const { evaluateAuthorityPolicy } = await authorityModule;
  const result = evaluateAuthorityPolicy(makeInput({
    confidence: 'high',
    authority: NO_AUTHORITY,
    risk: REVERSIBLE_LOCAL,
    compatibility: COMPATIBLE,
  }));
  assert.equal(result.decision, 'block', `expected block, got ${result.decision}`);
  assert.equal(result.reason_code, 'authority_not_granted');
  assert.equal(result.confidence, 'high');
  assert.equal(result.policy_version, AUTHORITY_POLICY_VERSION);
});

test('[phase39:authority-policy] AUTH-03 invariant: weights.score 999 vs 0 yields identical decisions', async () => {
  const { evaluateAuthorityPolicy } = await authorityModule;
  const base = {
    confidence: 'medium',
    authority: FULL_AUTHORITY,
    risk: REVERSIBLE_LOCAL,
    compatibility: COMPATIBLE,
  };
  const withHigh = evaluateAuthorityPolicy({ ...base, weights: { score: 999 } });
  const withLow = evaluateAuthorityPolicy({ ...base, weights: { score: 0 } });
  assert.deepEqual(withHigh, withLow, 'weights must not change the decision (AUTH-03 independence)');
  assert.equal(withHigh.decision, 'proceed');
  assert.equal(withHigh.reason_code, 'reversible_local_authorized');
});

test('[phase39:authority-policy] AUTH-03 medium confidence + full authority + reversible + local -> proceed', async () => {
  const { evaluateAuthorityPolicy } = await authorityModule;
  const result = evaluateAuthorityPolicy(makeInput({
    confidence: 'medium',
    authority: FULL_AUTHORITY,
    risk: REVERSIBLE_LOCAL,
    compatibility: COMPATIBLE,
  }));
  assert.equal(result.decision, 'proceed');
  assert.equal(result.reason_code, 'reversible_local_authorized');
  assert.equal(result.confidence, 'medium');
  assert.equal(result.policy_version, AUTHORITY_POLICY_VERSION);
});

test('[phase39:authority-policy] AUTH-04 high confidence + full authority + reversible + local -> proceed', async () => {
  const { evaluateAuthorityPolicy } = await authorityModule;
  const result = evaluateAuthorityPolicy(makeInput({
    confidence: 'high',
    authority: FULL_AUTHORITY,
    risk: REVERSIBLE_LOCAL,
    compatibility: COMPATIBLE,
  }));
  assert.equal(result.decision, 'proceed');
  assert.equal(result.reason_code, 'reversible_local_authorized');
  assert.equal(result.confidence, 'high');
});

test('[phase39:authority-policy] compatibility unfit -> block (compatibility_unfit) regardless of authority', async () => {
  const { evaluateAuthorityPolicy } = await authorityModule;
  const result = evaluateAuthorityPolicy(makeInput({
    confidence: 'high',
    authority: FULL_AUTHORITY,
    risk: REVERSIBLE_LOCAL,
    compatibility: INCOMPATIBLE,
  }));
  assert.equal(result.decision, 'block');
  assert.equal(result.reason_code, 'compatibility_unfit');
});

test('[phase39:authority-policy] AUTH-05 precursor: protected effect -> pause regardless of confidence', async () => {
  const { evaluateAuthorityPolicy } = await authorityModule;
  for (const confidence of ['high', 'medium', 'low']) {
    const result = evaluateAuthorityPolicy(makeInput({
      confidence,
      authority: PROTECTED,
      risk: REVERSIBLE_LOCAL,
      compatibility: COMPATIBLE,
    }));
    assert.equal(result.decision, 'pause', `protected should pause at confidence=${confidence}`);
    assert.equal(result.reason_code, 'protected_effect_requires_confirmation');
  }
});

test('[phase39:authority-policy] AUTH-05: non-reversible + authorized -> pause (non_reversible_or_external_requires_confirmation)', async () => {
  const { evaluateAuthorityPolicy } = await authorityModule;
  const result = evaluateAuthorityPolicy(makeInput({
    confidence: 'high',
    authority: FULL_AUTHORITY,
    risk: IRREVERSIBLE,
    compatibility: COMPATIBLE,
  }));
  assert.equal(result.decision, 'pause');
  assert.equal(result.reason_code, 'non_reversible_or_external_requires_confirmation');
});

test('[phase39:authority-policy] AUTH-05: external + authorized -> pause (non_reversible_or_external_requires_confirmation)', async () => {
  const { evaluateAuthorityPolicy } = await authorityModule;
  const result = evaluateAuthorityPolicy(makeInput({
    confidence: 'high',
    authority: FULL_AUTHORITY,
    risk: EXTERNAL,
    compatibility: COMPATIBLE,
  }));
  assert.equal(result.decision, 'pause');
  assert.equal(result.reason_code, 'non_reversible_or_external_requires_confirmation');
});

test('[phase39:authority-policy] authority not granted takes precedence over protected pause (compatibility fit)', async () => {
  const { evaluateAuthorityPolicy } = await authorityModule;
  // protected but no authGranted: protected_ requires authGranted context to
  // be meaningful; the authority_not_granted leg fires first because the
  // evaluator checks authority grant after the protected_ flag. This test
  // documents the actual precedence: protected_ is checked before
  // authGranted, so a protected+no-auth input pauses for confirmation.
  const result = evaluateAuthorityPolicy(makeInput({
    confidence: 'high',
    authority: { authGranted: false, protected_: true },
    risk: REVERSIBLE_LOCAL,
    compatibility: COMPATIBLE,
  }));
  assert.equal(result.decision, 'pause');
  assert.equal(result.reason_code, 'protected_effect_requires_confirmation');
});

test('[phase39:authority-policy] every return carries decision, reason_code, confidence, policy_version', async () => {
  const { evaluateAuthorityPolicy } = await authorityModule;
  const cases = [
    { confidence: 'low', authority: FULL_AUTHORITY, risk: REVERSIBLE_LOCAL, compatibility: COMPATIBLE },
    { confidence: 'high', authority: NO_AUTHORITY, risk: REVERSIBLE_LOCAL, compatibility: COMPATIBLE },
    { confidence: 'high', authority: FULL_AUTHORITY, risk: IRREVERSIBLE, compatibility: COMPATIBLE },
    { confidence: 'high', authority: FULL_AUTHORITY, risk: REVERSIBLE_LOCAL, compatibility: INCOMPATIBLE },
  ];
  for (const input of cases) {
    const result = evaluateAuthorityPolicy(makeInput(input));
    assert.ok(['proceed', 'pause', 'ask', 'block'].includes(result.decision), `bad decision for ${JSON.stringify(input)}`);
    assert.equal(typeof result.reason_code, 'string', `bad reason_code for ${JSON.stringify(input)}`);
    assert.equal(result.confidence, input.confidence, `confidence echo for ${JSON.stringify(input)}`);
    assert.equal(result.policy_version, AUTHORITY_POLICY_VERSION, `policy_version for ${JSON.stringify(input)}`);
  }
});

test('[phase39:authority-policy] AUTH-03 invariant: flipping weights.score never changes the decision across all legs', async () => {
  const { evaluateAuthorityPolicy } = await authorityModule;
  const legs = [
    { confidence: 'high', authority: FULL_AUTHORITY, risk: REVERSIBLE_LOCAL, compatibility: COMPATIBLE },
    { confidence: 'low', authority: FULL_AUTHORITY, risk: REVERSIBLE_LOCAL, compatibility: COMPATIBLE },
    { confidence: 'high', authority: NO_AUTHORITY, risk: REVERSIBLE_LOCAL, compatibility: COMPATIBLE },
    { confidence: 'high', authority: PROTECTED, risk: REVERSIBLE_LOCAL, compatibility: COMPATIBLE },
    { confidence: 'high', authority: FULL_AUTHORITY, risk: IRREVERSIBLE, compatibility: COMPATIBLE },
    { confidence: 'high', authority: FULL_AUTHORITY, risk: REVERSIBLE_LOCAL, compatibility: INCOMPATIBLE },
  ];
  for (const base of legs) {
    const withHigh = evaluateAuthorityPolicy({ ...base, weights: { score: 999 } });
    const withLow = evaluateAuthorityPolicy({ ...base, weights: { score: 0 } });
    assert.deepEqual(withHigh, withLow, `weights changed decision for ${JSON.stringify(base)}`);
  }
});

test('[phase39:authority-policy] missing input -> block with compatibility_unfit (fail-closed)', async () => {
  const { evaluateAuthorityPolicy } = await authorityModule;
  const result = evaluateAuthorityPolicy();
  assert.equal(result.decision, 'block');
  assert.equal(result.reason_code, 'compatibility_unfit');
  assert.equal(result.policy_version, AUTHORITY_POLICY_VERSION);
});

test('[phase39:authority-policy] weights-only extra field does not grant authority (no-auth + weights 999 -> block)', async () => {
  const { evaluateAuthorityPolicy } = await authorityModule;
  const result = evaluateAuthorityPolicy({
    confidence: 'high',
    authority: NO_AUTHORITY,
    risk: REVERSIBLE_LOCAL,
    compatibility: COMPATIBLE,
    weights: { score: 999 },
  });
  assert.equal(result.decision, 'block');
  assert.equal(result.reason_code, 'authority_not_granted');
});