---
phase: 12
slug: incremental-change-detection-and-watcher
status: verified
threats_open: 0
asvs_level: 1
created: 2026-07-15
---

# Phase 12 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Configured roots → fingerprint scanner | Filesystem content may be missing, inaccessible, or attempt to escape the configured root. | Local file names and content hashes |
| Portable observations → incremental assembly | Cached state and dirty-root observations may be stale, malformed, or incomplete. | Logical roots, relative paths, fingerprints, diagnostics |
| Filesystem notifications → controller | Events may be duplicated, omitted, reordered, filename-less, or flooded. | Dirty-root hints |
| Controller candidate → persisted baseline | Reconciliation can fail or observe another change while work is in flight. | Fingerprint state and registry outputs |
| Repository modules → runtime-owned tree | Installation crosses into Claude/Codex roots and must preserve unrelated state. | Owned runtime files, config, status, process identity |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-12-01 | Elevation of Privilege / Information Disclosure | fingerprint root traversal | high | mitigate | Canonical containment and portable-path validation are enforced by `src/registry/fingerprint.mjs`; root-escape and access-denial cases are covered in `tests/router.registry-diff.test.mjs`. | closed |
| T-12-02 | Tampering | persisted fingerprint state | high | mitigate | Versioned state validation, structured hashes, atomic writes, and clean-scan fallback are implemented in `src/registry/fingerprint.mjs` and exercised by registry diff tests. | closed |
| T-12-03 | Information Disclosure | snapshots/events/diagnostics | high | mitigate | Portable fingerprints retain logical roots and normalized relative paths while excluding absolute roots and filesystem metadata; serialization tests enforce the boundary. | closed |
| T-12-04 | Tampering | incremental observation merge | high | mitigate | `src/registry/build.mjs` validates and assembles complete replacements/removals; full-versus-incremental parity is verified after supported mutations. | closed |
| T-12-05 | Information Disclosure | registry diagnostics and fingerprints | high | mitigate | Local-path stripping remains enforced by the registry schema/build pipeline, with temporary-root leakage assertions in registry tests. | closed |
| T-12-06 | Denial of Service | dirty-root reparse boundary | medium | mitigate | Incremental acquisition reparses only explicitly dirty logical roots and performs deterministic canonical assembly over the complete observation set. | closed |
| T-12-07 | Denial of Service | debounce/event flood | high | mitigate | `src/registry/watcher.mjs` coalesces dirty roots, bounds latency, runs reconciliation single-flight, and schedules exactly one follow-up; watcher timing tests cover flooding. | closed |
| T-12-08 | Tampering | reconcile state persistence | high | mitigate | Candidate computation precedes publication, state advances only after both publications succeed, and failures retain the last valid baseline; watcher tests cover the failure path. | closed |
| T-12-09 | Tampering / Elevation of Privilege | installer-owned runtime files and controller process | high | mitigate | Lifecycle preflight, ownership evidence, bounded readiness, cooperative restart/shutdown, rollback, and ownership-safe cleanup are implemented and covered by lifecycle tests. | closed |
| T-12-10 | Information Disclosure | controller state | high | mitigate | Controller state contains logical roots and normalized relative paths only; lifecycle and watcher tests reject temporary absolute-root disclosure. | closed |
| T-12-SC | Tampering | package installation | low | accept | No package-manager operation or third-party watcher framework is introduced; production remains Node standard-library plus local ESM modules. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` count toward `threats_open`.*

---

## Accepted Risks Log

| Threat ID | Risk | Rationale | Accepted By | Date |
|-----------|------|-----------|-------------|------|
| T-12-SC | Package-installation tampering | The phase adds no dependency or package-manager operation, so the residual supply-chain surface is unchanged from the existing project baseline. | Plan-time security disposition | 2026-07-15 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-15 | 11 | 11 | 0 | Codex secure-phase workflow (ASVS L1) |

## Security Audit 2026-07-15

| Metric | Count |
|--------|-------|
| Threats found | 11 |
| Closed | 11 |
| Open | 0 |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-15
