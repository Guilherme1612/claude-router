---
phase: 39
slug: intent-authority-risk-and-invocation-policy
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-06
---

# Phase 39 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| untrusted prompt → classifyAuthority | Untrusted operator prompt text crosses into the authority classifier; regex-deterministic, no eval/Function, no prompt retention | untrusted text → authority class |
| sealed evaluator input → authority/risk legs | `{ confidence, authority, risk, compatibility }` enforces AUTH-03 independence — confidence/weights cannot cross into authority/risk decisions | sealed struct → policy decision |
| route suggestion → additionalContext | Pause/ask policy decision surfaced as sentinel-wrapped suggestion; hook never blocks (fail-open) | policy decision → injected context |
| action-mapper → dispatch invoke | gateAction is the enforceable boundary: proceed→invoke(), pause→bound approval token + paused receipt, ask→clarify | gate verdict → dispatch |
| paused receipt → approval token resume | Resumes only via verifyApproval with presented+fresh token; stale/mismatched fails closed | presented token → resumed action |
| protected-effect vocabulary source | PROTECTED_EFFECT_TOKENS in authority.mjs is single source of truth; approval.mjs imports it | capability side_effects → protected set |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-39-01 | Spoofing | classifyAuthority — prompt injection via quoted/example/retrospective/policy framing with autonomous wording | high | mitigate | Abstaining dispositions short-circuit before execute; `autonomousWordingIsText` detects EXAMPLE/RETROSPECTIVE/POLICY framing and demotes to non_authorizing_discussion. Test `e.g. autonomously finish it` → non_authorizing_discussion (AUTH-02, green) | closed |
| T-39-02 | Elevation of privilege | evaluateAuthorityPolicy — confidence or weights granting authority | high | mitigate | Sealed-input signature destructures `{ confidence, authority, risk, compatibility }`; weights not a parameter; confidence is tier string used only in proceed/ask branch, never to permit. Test: weights.score 999 vs 0 → identical decisions (AUTH-03, green) | closed |
| T-39-03 | Tampering | moduleNames deploy list — new module missing from one runtime | medium | mitigate | `intent/authority.mjs` appended to moduleNames; moduleValues flatMap deploys to both ownedRoot and codexOwnedRoot; lifecycle test count 259→261 regression backstop (green) | closed |
| T-39-04 | Elevation of privilege | gateAction — protected effect proceeding autonomously despite confidence/authority | high | mitigate | evaluateAuthorityPolicy checks protected_ before authority and confidence; gateAction maps pause to status 'paused', dispatch_eligible false, bound approval token; verifyApproval fails closed. Test: protected effect → paused regardless of confidence (AUTH-05, green) | closed |
| T-39-05 | Tampering | approval token — stale token bound to old args resuming a different action | high | mitigate | verifyApproval re-derives expected via bindApproval over current args; stale → approval_stale, mismatch → approval_mismatch (approval.mjs:150,153). Integration test mismatched token → approval_mismatch (AUTH-05, green) | closed |
| T-39-06 | Denial of service | router.mjs hot path — policy throw blocking the hook | high | mitigate | Policy call inside existing fail-open wrapper: any throw → exit 0, no additionalContext; hook never emits `decision: 'block'`. Latency budget warm p95 ≤25ms, max <100ms (HOST-04, UAT-confirmed) | closed |
| T-39-07 | Tampering | protected-effect bypass — capability side_effects omits protected token | medium | mitigate | PROTECTED_EFFECT_TOKENS centralization + eligibility gates independently re-check side_effects/reversibility/risk; validateContractFieldValue enforces enum validity; needsApproval backstops on irreversible + high/critical/unacceptable risk (AUTH-05, green) | closed |
| T-39-08 | Information disclosure | dispatch receipt leaking raw prompt text | low | accept | Receipt threads intent/authority/risk as short string fields (authority_class, decision/reason_code, risk level), never raw prompt; telemetry uses sha256 signatures (CLAUDE.md privacy) | closed (accepted) |
| T-39-SC-a | Tampering | npm/pip/cargo installs (39-01) | high | mitigate | No packages installed — stdlib-only module; no supply-chain surface | closed |
| T-39-SC-b | Tampering | npm/pip/cargo installs (39-02) | high | mitigate | No packages installed — stdlib-only wiring; no supply-chain surface | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-39-01 | T-39-08 | Dispatch receipt carries only short structured fields (authority class, decision/reason_code, risk level); raw prompt text never threaded. Telemetry already uses sha256 signatures per CLAUDE.md privacy constraint. Low severity, no PII path. | gsd-secure-phase | 2026-08-06 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-06 | 10 | 10 | 0 | gsd-secure-phase (L1, short-circuit: register authored at plan time + asvs L1 + threats_open 0) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-06