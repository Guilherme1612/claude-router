# Phase 59 Context: Production Acceptance and Release Truth

## Goal

Certify the final v1.9 live installation, evidence, performance, planning state, archive, and tag as one consistent release truth.

## Decisions

- Reuse the existing installer, live snapshot, observability report, release preflight, evaluation, archive verifier, and serial test entry points.
- Treat a verified empty active tuple as safe only when the candidate is eligible, all verification gates pass, and dispatchable count is exactly zero. Never relabel that state as an active semantic tuple.
- Keep live UAT bounded to harmless native fixtures and reversible lifecycle operations; preserve user-owned state and do not fabricate a production dispatch where the live inventory is recommendation-only.
- Run a pre-archive preflight to prove all non-archive lanes, then archive/tag and rerun the complete preflight with peeled tag equality.

## Acceptance boundary

The release must report the live correlation gap and graph remediation state honestly. A missing real owner-authorized live dispatch remains a documented acceptance limitation if the inventory remains zero-dispatchable; it cannot be converted into a synthetic success.
