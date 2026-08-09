---
phase: 43-proportional-planning-and-production-dispatch
status: secured
threats_open: 0
asvs_level: 1
---

# Phase 43 Security Verification

## Threat register

| Threat | Severity | Status | Evidence |
|--------|----------|--------|----------|
| T-43-01 authority/scope widening in strategy selection | high | CLOSED | `planStrategy()` requires selected workflow and resolved closure identity; strategy facts do not grant dispatch authority. |
| T-43-02 tampered task/candidate descriptors | high | CLOSED | Unknown fields, invalid identities/dependencies, missing hard facts, non-finite values, and out-of-bound resources block before cost comparison. |
| T-43-03 resource exhaustion | medium | CLOSED | Finite resource contracts and explicit limits are required; dispatch rejects over-bound strategies. |
| T-43-04 information disclosure in strategy output | medium | CLOSED | Output is structured identifiers, bounded facts, costs, limits, and reason codes; prompt/history fields are excluded. |
| T-43-05 tampered or unrelated replan evidence | high | CLOSED | Replan requires matching strategy identity and an unfinished current work item, then re-applies hard constraints to the replacement. |
| T-43-06 retry multiplication / denial of service | high | CLOSED | `replan_count` permits one transition only; second attempts block and completed claims remain durable. |
| T-43-07 dispatch gate bypass | high | CLOSED | Strategy validation is additive; `validateInvocation` and `preDispatchGate` remain before native spawn in both adapters. |
| T-43-08 spoofed or lost lease checkpoints | high | CLOSED | Existing durable lease claims are re-read and failed claims cannot resume; Claude's shared resume claim path is covered by LEASE-05 tests. |
| T-43-09 checkpoint data disclosure | medium | CLOSED | Receipts/checkpoint strategy data contains bounded identifiers/status/reasons only. |
| T-43-SC package tampering | low | ACCEPTED | No package installation or new dependency was introduced; existing Node.js modules are used. |

## Verification evidence

- `node --test tests/phase-43/*.mjs tests/router.lease-resume.test.mjs tests/router.trust-invocation.test.mjs tests/router.trust-pregate.test.mjs`: 44 passed, 0 failed.
- `43-REVIEW.md` records and resolves the initial lease-claim and fail-open contract findings.
- Full-suite lifecycle/install/recovery/performance failures remain unrelated baseline findings and do not open a Phase 43 threat.

## Security Audit 2026-08-08

| Metric | Count |
|--------|-------|
| Threats found | 0 unresolved |
| Closed | 9 |
| Accepted low-risk | 1 |
| Open | 0 |
