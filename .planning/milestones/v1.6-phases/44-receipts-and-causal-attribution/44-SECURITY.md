---
phase: 44-receipts-and-causal-attribution
status: secured
threats_open: 0
asvs_level: 1
---

# Phase 44 Security Verification

## Threat Register

| Threat | Severity | Status | Evidence |
|---|---:|---|---|
| T-44-01 unstable/spoofed pending identity | high | CLOSED | `receiptIdentityId()` uses fixed structured identity fields and excludes PID/timing; transition tests preserve one receipt id. |
| T-44-02 terminal state disappearance | high | CLOSED | Shared `RECEIPT_STATES`, atomic store writes, and both adapter terminal-path tests cover ignored/rejected/blocked/failed/completed behavior. |
| T-44-03 raw prompt or secret disclosure | high | CLOSED | Attribution is structured and bounded; prompt/content/environment/output fields are omitted and technical hashes are preserved without raw logs. |
| T-44-04 false outcome credit | high | CLOSED | `outcomeCredit()` requires completed state plus matching invocation and verified postcondition receipt ids; exit zero alone is insufficient. |
| T-44-05 selected/actual tampering or permission laundering | high | CLOSED | Selected/actual data is inspection evidence only; existing invocation, authority, strategy, path, runtime, and pre-dispatch gates remain authoritative before spawn. |
| T-44-06 cross-runtime receipt bleed | high | CLOSED | Claude/Codex receipt roots and Codex runtime validation remain intact; focused cross-runtime tests pass. |
| T-44-07 unbounded receipt/log growth | medium | CLOSED | Structured values are depth/length bounded and compact inspection whitelists fields; large raw logs are never stored. |
| T-44-SC package tampering | low | ACCEPTED | No new dependency or package install; Node.js built-ins and existing modules only. |

## Verification Evidence

- `node --test tests/phase-44/receipts.test.mjs tests/phase-38/*.mjs tests/phase-43/*.mjs`: 42 passed, 0 failed.
- `44-REVIEW.md`: no unresolved review findings.
- Existing Phase 38 native-dispatch, anti-cheat, partition, and pause/resume tests remain green.

## Security Audit 2026-08-08

| Metric | Count |
|---|---:|
| Threats found | 0 unresolved |
| Closed | 7 |
| Accepted low-risk | 1 |
| Open | 0 |
