# Phase 44 Patterns

| New/changed file | Closest existing pattern | Reuse rule |
|---|---|---|
| `src/adapters/dispatch/receipt.mjs` | existing atomic `publishAtomic`, `ReceiptStore`, `redact`, `hashBytes` | Extend the current store and keep fail-open file I/O; do not add a database. |
| `src/adapters/dispatch/contract.mjs` | existing `RECEIPT_STATES`, `buildReceipt`, pure validation helpers | Keep the shared contract as the only receipt vocabulary and pure transition seam. |
| `src/adapters/dispatch/claude.mjs` | existing `invokeImpl`, child `exit` handler, `pauseImpl`/`resumeImpl` | Add stable pending → invoked → terminal transitions without changing native spawn or gate ordering. |
| `src/adapters/dispatch/codex.mjs` | Claude adapter variant and runtime partition check | Mirror receipt enrichment while preserving Codex-only installed-marker and cross-runtime checks. |
| `tests/phase-44/receipts.test.mjs` | `tests/phase-38/*adapter.test.mjs`, `tests/phase-43/replan.test.mjs` | Use built-in `node:test`, strict assertions, temp HOME/receipt roots, and poll real child completion. |

## Data-flow boundary

`structured action → stable pending receipt → native invocation receipt → linked terminal evidence → compact inspection`.

The pending receipt is the causal anchor. A PID, exit code, later success, or recommendation text cannot replace the stable receipt identity or verified postcondition link.
