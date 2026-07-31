---
phase: 27
slug: mutation-safety-infrastructure
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-29
---

# Phase 27 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| disk (cache.json) → hook process | Cached routes are read from an untrusted on-disk cache and enter the hot path. | Cached route identifiers and recommendations |
| disk (manifest) → hook process | The manifest supplies the current trusted capability identifiers used to validate cached routes. | Capability identifiers |
| mode-map.json (disk) → builder process | The builder reads and validates the curated mode map before publication. | Routing configuration |
| perf-measure.mjs → CI gate | Regression results decide whether a mutation is safe to ship. | Latency measurements and pass/fail status |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-27-01 | Tampering | cache.json → cache-hit path | high | mitigate | `routeTargetsExist` rejects stale capability targets and forces recomputation; focused poisoned-cache tests pass. | closed |
| T-27-02 | Tampering | weights.json mtime → cacheKey | high | mitigate | `weightsMtime` is folded into `cacheKey`; routing telemetry exposes only the derived `routing_version`; invalidation tests pass. | closed |
| T-27-03 | Denial of Service | formatInjection output size | medium | mitigate | `capRouteRender` limits output to 1 mode, 3 skills, 2 agents, and 1 command before injection; integration tests pass. | closed |
| T-27-04 | Information Disclosure | telemetry routing_version field | low | accept | `routing_version` is mtime-derived and contains no prompt text or secret material; existing redaction remains in place. | closed |
| T-27-05 | Denial of Service | routeTargetsExist on cache-hit path | medium | mitigate | Validation reuses loaded indexes and fail-opens on internal errors; focused fail-open tests pass. | closed |
| T-27-06 | Denial of Service | mode-map.json bloat via curation | medium | mitigate | Builder rejects mode maps larger than 30,000 bytes; 30,000/30,001-byte boundary tests pass. | closed |
| T-27-07 | Denial of Service | hot-path latency regression after mode-map expansion | high | mitigate | `assessMutationSafetyRegression` enforces p95 < 40ms and max < 100ms; boundary and live-corpus tests pass. | closed |
| T-27-08 | Tampering | canary gate ceiling relaxation | high | mitigate | The separate mutation gate leaves `assessCalibration` at p95 < 25ms; regression test confirms the locked ceiling. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-27-01 | T-27-04 | The mtime-derived routing version contains no prompt content or secret material and remains covered by existing telemetry redaction. | Phase 27 plan | 2026-07-29 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-29 | 8 | 8 | 0 | Codex secure-phase audit |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-29
