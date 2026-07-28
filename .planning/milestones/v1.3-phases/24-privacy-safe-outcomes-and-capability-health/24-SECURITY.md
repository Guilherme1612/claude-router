---
phase: 24
slug: privacy-safe-outcomes-and-capability-health
status: verified
register_authored_at_plan_time: false
threats_open: 0
asvs_level: 1
created: 2026-07-28
---

# Phase 24 — Security

## Trust Boundaries

| Boundary | Description | Data Crossing |
|---|---|---|
| Telemetry → outcome observer | Runtime evidence is reduced to a bounded allowlisted envelope. | Local event metadata; raw prompt and arbitrary output are forbidden. |
| Outcome envelope → local store | Validated records enter an append-only local file and derived state. | Stable IDs, bounded tokens, timestamps, reason codes. |
| Local store → health scoring | Bounded windows become usefulness and health observations. | Local records only; no network primitive exists in `src/health`. |
| Admin CLI → health state | Inspect/reset/dispose/recover may change health-owned state only. | Explicit local command and health-directory files. |
| Canary candidate → active health policy | Candidate thresholds pass the existing six-gate controller before atomic activation. | Versioned weights, boundaries, evidence window, policy ID. |

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|---|---|---|---|---|---|---|
| T-24-01 | Information disclosure | outcome-schema/store | critical | mitigate | Strict field allowlist rejects prompt text, secrets, arbitrary output, unbounded strings, and invalid signatures; privacy suite passes. | closed |
| T-24-02 | Information disclosure | src/health | high | mitigate | No HTTP, HTTPS, network, DNS, or fetch imports; all analysis remains local. | closed |
| T-24-03 | Tampering | store | high | mitigate | Schema fingerprint validation, restrictive permissions, atomic writes, corruption skipping, bounded retention, and shared mutation lock. | closed |
| T-24-04 | Elevation of privilege | admin CLI | critical | mitigate | Admin commands operate only under the health-owned root; protected registry, activation, publication, and weight artifacts remain byte-identical. | closed |
| T-24-05 | Path traversal | thresholds | high | mitigate | Policy identifiers are format-validated before path construction; traversal regression tests pass. | closed |
| T-24-06 | Tampering | canary bridge | high | mitigate | Reuses the existing six-gate canary controller, rejects insufficient evidence, writes atomically, and preserves known-good recovery. | closed |
| T-24-07 | Denial of service / data loss | compaction | high | mitigate | Append and compaction share a fail-closed lock; concurrent mutation cannot be discarded; retention and file size are bounded. | closed |
| T-24-08 | Spoofing / integrity | health observations | medium | mitigate | Stable local capability IDs, SHA-256 content fingerprints, bounded reason codes, evidence windows, counts, freshness, and confidence are validated. | closed |

## Accepted Risks Log

None.

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|---|---:|---:|---:|---|
| 2026-07-28 | 8 | 8 | 0 | Codex inline ASVS L1 audit |

## Sign-Off

- [x] All threats have a disposition
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-28
