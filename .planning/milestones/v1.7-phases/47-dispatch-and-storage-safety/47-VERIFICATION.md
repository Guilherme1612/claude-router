---
phase: 47-dispatch-and-storage-safety
status: passed
verified: 2026-08-09
---

# Phase 47 Verification

## Requirements

- **SAFE-01 — PASS:** durable claims are private, exclusive, and shared across fresh workers; normal and resume dispatch use the same claim seam.
- **SAFE-02 — PASS:** dispatch requires finite timeout/retry/output/completion bounds and the shared runner records timeout, overflow, and contract failures without retaining raw output.
- **SAFE-03 — PASS:** persisted IDs are validated before path construction and paths are contained below canonical store roots; private modes are enforced.
- **SAFE-04 — PASS:** lease creation holds the mutation lock across read, collision check, and durable write.
- **SAFE-05 — PASS:** Claude and Codex use the same claim and bounded-runner behavior with runtime-partitioned receipts.

## Evidence

- `rtk node --test tests/router.dispatch-safety.test.mjs tests/router.storage-safety.test.mjs tests/router.lease-creation.test.mjs tests/router.lease-identity.test.mjs tests/router.lease-inspect.test.mjs tests/router.lease-briefing.test.mjs tests/router.lease-revoke.test.mjs tests/router.lease-resume.test.mjs tests/router.trust-pregate.test.mjs tests/phase-38/*.test.mjs tests/phase-44/receipts.test.mjs` — **119/119 passed**.
- `rtk node --test tests/phase-43/replan.test.mjs tests/router.storage-safety.test.mjs tests/router.lease-creation.test.mjs` — **15/15 passed** after retaining safe legacy `lease-*` fixture compatibility.
- `rtk git diff --check` — **passed**.

## Scope boundary

The repository-wide suite currently reports 1594/1604 passing, with ten failures in installer ownership/reinstall behavior, an existing SAF-03 timing measurement, an existing detached evolution-worker path assertion, and a Phase 44 semantic-substitution boundary assertion. None touches the Phase 47 dispatch/storage files or requirements; they remain release-integrity work for Phase 49 and are not waived as Phase 47 evidence.

