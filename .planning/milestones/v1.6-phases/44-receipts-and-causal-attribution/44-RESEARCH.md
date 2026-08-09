# Phase 44 Research: Receipts and Causal Attribution

**Status:** Complete (inline recovery after Claude runtime authentication failure)

## Findings

- `src/adapters/dispatch/receipt.mjs` already provides the durable atomic JSON receipt, append-only JSONL audit log, redaction, byte hashing, and runtime-partitioned roots.
- `src/adapters/dispatch/claude.mjs` and `src/adapters/dispatch/codex.mjs` currently publish `invoked` only after spawn and publish `completed`/`failed` on exit. Both paths duplicate receipt construction and derive the receipt id from the post-spawn PID, so a pre-invocation pending record needs a stable identity id independent of PID.
- `src/adapters/dispatch/contract.mjs` owns the shared receipt state vocabulary and dispatch-boundary validation. Extending this vocabulary and adding pure receipt helpers keeps both runtime adapters on one contract.
- Phase 43 already propagates `strategy_plan` and `work_id` through invocation/completion receipts; Phase 44 should preserve those fields and add only bounded identity, selection/actual, evidence, and outcome-credit fields.
- `src/lease/store.mjs` and the Phase 40/43 tests establish durable, runtime-scoped checkpoint patterns. Phase 44 receipt persistence should reuse `ReceiptStore` rather than add a second database.

## Implementation constraints

- Keep prompt/startup paths free of receipt inspection, scanning, hashing, network calls, or learning; receipt enrichment occurs at dispatch/worker time.
- Store identifiers, bounded structured evidence, hashes, timings, and reason codes only. Never persist raw prompt text, secrets, environment, or file contents.
- Preserve Phase 38 compatibility: existing `completion_evidence.state` values and adapter APIs remain valid; additive `route_state`, identity, divergence, evidence, and outcome-credit fields carry the richer attribution contract.
- Outcome credit requires the same receipt id in invocation evidence and verified postcondition evidence. Process exit zero alone is insufficient.

## Verification map

| Requirement | Evidence |
|---|---|
| RCPT-01 | pending receipt test plus adapter pre-spawn persistence assertion |
| RCPT-02 | terminal-state vocabulary and transition/adapter failure-path tests |
| RCPT-03 | compact inspection test proving bounded fields and no raw prompt |
| RCPT-04 | causal outcome-credit tests for linked verified evidence vs exit zero/ignored/unrelated evidence |
| RCPT-05 | selected/actual divergence, alternatives, rejection, correction, substitution tests |
