---
phase: 23
slug: intent-safe-state-aware-execution
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-27
---

# Phase 23 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| User prompt → classifier | Natural-language prompt text crosses into deterministic regex/structure classification. No `eval`/`Function` ever executed. | untrusted text (may contain quoted/code-block injection, negation, multilingual tokens) |
| Classifier → action mapper | Disposition + reason_code + policy_version only — never raw prompt text. | structured disposition enum |
| Contract authority → dispatch | Workflow-transition authority read only from `contract.fields.workflow_transitions`; discovery records are evidence, never authority. | contract envelope value |
| State evidence → dispatch | `readStateSource` re-reads fresh state per dispatch; `freshness === 'fresh'` gate. | STATE.md snapshot + freshness flag |
| Approval → destructive dispatch | Approval token binds SHA-256 fingerprint + args + targets + effects + proposalVersion; stale/mismatch/missing fails CLOSED. | approval token + capability fingerprint |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-23-01 | Spoofing/Tampering | classify.mjs (quoted/code-block injection) | high | mitigate | `quoted` disposition returned for code-block/quoted prompts; no `eval`/`Function` of prompt content (ASVS V5). Verified: `grep -nE 'eval\(|Function\(' src/intent/classify.mjs` = NONE; disposition `quoted` at classify.mjs:84. | closed |
| T-23-02 | Tampering | classify.mjs (negation bypass "don't run X") | high | mitigate | Negation/prohibition checked before execute-verb via `NEGATION` regex with `APOS` char class (ASCII `'`, U+2018, U+2019); execute branch gated by `!NEGATION.test`. Verified: classify.mjs:29-34. | closed |
| T-23-03 | Elevation of privilege | approval.mjs (destructive dispatched without approval) | critical | mitigate | `needsApproval(contract)` gate after capability selection; execute intent never satisfies it; blocked returns `approval_missing`. Verified: approval.mjs:43,122-131. | closed |
| T-23-04 | Tampering | approval.mjs (stale approval reused for new args/targets) | high | mitigate | Token binds fingerprint+args+targets+effects+proposalVersion; mismatch → `approval_stale`/`approval_mismatch`. Verified: approval.mjs:116-118. | closed |
| T-23-05 | Elevation of privilege | actions.mjs (hook invoked as task tool) | high | mitigate | `if (record.type === 'hook') continue` (EXEC-09) before contract matching. Verified: actions.mjs:106,122. | closed |
| T-23-06 | Spoofing | actions.mjs (hardcoded gsd- fallback) | medium | mitigate | Reads `contract.fields.workflow_transitions` only. Verified: `grep -c 'gsd-' src/orchestrator/actions.mjs` = 0; envelope at actions.mjs:58. | closed |
| T-23-07 | Elevation of privilege | actions.mjs (discovery treated as authority) | medium | mitigate | Only `entry?.eligible === true` capabilities selected. Verified: actions.mjs:77. | closed |
| T-23-08 | Tampering | actions.mjs (stale STATE.md dispatch) | high | mitigate | `readStateSource` per dispatch; `freshness !== 'fresh'` → blocked `authoritative_evidence_stale`. Verified: transitions.mjs:86. | closed |
| T-23-09 | Elevation of privilege | approval.mjs (permission elevation via approval) | high | mitigate | Approval authorizes only a capability the runtime already permits; eligibility permission gate upstream. Verified: needsApproval cannot grant eligibility. | closed |
| T-23-V4 | Access Control | approval.mjs (approval is the access-control boundary for destructive) | high | mitigate | Distinct gate from execute intent; bound to exact fingerprint+args+targets+effects+version; stale/mismatch/missing fails CLOSED with `approval_expected_missing` (CR-01 fix). Verified: approval.mjs:138. | closed |
| T-23-V5 | Input Validation | classify.mjs (prompt as untrusted) | medium | mitigate | Deterministic regex/structure rules; no eval/Function; args bounded by `stableStringify`. Verified: classify.mjs no eval/Function. | closed |
| T-23-V6 | Cryptography | approval.mjs (fingerprint hashing) | medium | mitigate | Reuses `contentFingerprint`/`createHash('sha256')` from `identity.mjs`; never hand-rolled. Verified: approval.mjs:8,67. | closed |
| T-23-V7 | Error Handling | dispatch path (fail-closed on unknown/ambiguous/stale/mismatch) | high | mitigate | Every blocked path returns `dispatch_eligible: false` + stable `reason_code`. Verified: actions.mjs:49-54. | closed |
| T-23-V8 | Data Protection | classify.mjs (raw prompt retention) | medium | mitigate | Classifier emits disposition + reason_code + policy_version only; no raw prompt in return or log. Verified: classify.mjs return shape. | closed |
| T-23-SC | Tampering | (none — stdlib only, no package installs) | n/a | accept | Phase 23 installs no npm/pip/cargo packages; supply-chain gate not applicable. | closed (accepted) |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-23-01 | T-23-SC | Phase 23 is stdlib-only (no npm/pip/cargo installs). Supply-chain / dependency-confusion threat is not applicable; no third-party code introduced into the hook runtime. | Claude (security-auditor L1) | 2026-07-27 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-27 | 15 | 15 | 0 | gsd-secure-phase (ASVS L1, grep-depth, plan-authored register, short-circuit) |

### Audit Notes

- **Register origin:** `register_authored_at_plan_time: true` — threat register parsed from `<threat_model>` blocks in 23-01/02/03-PLAN.md.
- **ASVS level:** 1 (grep-depth verification sufficient per short-circuit rule: `threats_open: 0 AND register_authored_at_plan_time: true AND asvs_level == 1`).
- **Code review cross-check:** gsd-code-review (commit a4dad04) found CR-01 (critical security fail-open in `verifyApproval` when `expected` token omitted/malformed) — directly violated the T-23-V4/T-23-03 fail-closed constraint. Fixed: strict `requireExpectedToken` + new `approval_expected_missing` reason_code, fail-closed. Re-verified: 18/18 approval tests + 16/16 dispatch-integration tests green.
- **No HIGH-severity open threats** → phase advancement not blocked.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-27