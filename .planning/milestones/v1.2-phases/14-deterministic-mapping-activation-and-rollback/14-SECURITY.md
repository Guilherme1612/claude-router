---
phase: 14
slug: deterministic-mapping-activation-and-rollback
status: verified
threats_open: 0
register_authored_at_plan_time: true
asvs_level: 1
block_on: high
created: 2026-07-16
last_audited: 2026-07-16
---

# Phase 14 — Security

> Per-phase security contract: plan-time threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Candidate and advisory evidence -> deterministic mapper | Malformed, stale, reordered, or non-authoritative evidence must not gain mapping authority. | Candidate registry, reconciliation evidence, advisory evidence |
| Mapper -> verification and activation | Downstream mutation depends on canonical mapping results and exact fingerprints. | Mapping report, reason codes, fingerprints |
| Verification evidence -> immutable version store | Caller-controlled or stale gate claims must not publish authority. | Verification envelope, runner identities, exact-input fingerprints |
| Immutable store -> active pointer | Filesystem races and incomplete durability must not corrupt the mutable authority. | Version payloads, manifests, `active.json` |
| Historical version -> recovery and rollback | Old or corrupt history must be reverified under current production policy. | Immutable version, compatibility verdict, rollback preview |
| Operator or automation -> control CLI | Untrusted arguments, stdin, and rendering requests enter inspection and mutation control. | Command, version ID, confirmation, format, reason |
| Repository source -> installed runtime roots | Owned modules are deployed beside unrelated user configuration. | Installer manifest, module bytes, runtime configuration |
| Watcher mapper -> verifier -> activator | Ambiguous mapping or recovery state must fail closed before mutation. | Canonical summary, subjects, verification result |
| Rollback -> durable audit journal | Pointer mutation must remain privately attributable across interruption. | Intent and completion records, sequence, fingerprints |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation and evidence | Status |
|-----------|----------|-----------|----------|-------------|-------------------------|--------|
| T-14-01 | Tampering | candidate join | high | mitigate | Canonical exact-candidate validation and target predicates in `src/registry/map.mjs:322`; adversarial join coverage in `tests/router.registry-map.test.mjs`. | closed |
| T-14-02 | Elevation of Privilege | advisory evidence | high | mitigate | Non-overriding advisory tier in `src/registry/map.mjs:66`; advisory authority regressions in `tests/router.registry-map.test.mjs:71`. | closed |
| T-14-03 | Spoofing | continuity claims | high | mitigate | Stable-identity continuity checks in `src/registry/map.mjs`; spoofed continuity coverage in `tests/router.registry-map.test.mjs:164`. | closed |
| T-14-04 | Repudiation | mapping explanation | medium | mitigate | Canonical fingerprints and ordered decision ledger in `src/registry/map.mjs:11,322`; deterministic permutation coverage in `tests/router.registry-map.test.mjs`. | closed |
| T-14-05 | Information Disclosure | evidence ledger | medium | mitigate | Portable evidence projection and secret/path rejection coverage in `tests/router.registry-map.test.mjs:270` and `tests/router.privacy.test.mjs`. | closed |
| T-14-06 | Denial of Service | mapper inputs | medium | mitigate | Fixed input bounds in `src/registry/map.mjs:5`; bounded-input regressions in `tests/router.registry-map.test.mjs:113`. | closed |
| T-14-07 | Tampering | version store and pointer | high | mitigate | Manifest hashing, contained writes, atomic pointer publication, and fsync in `src/registry/activate.mjs:109,146`; corruption and symlink regressions in `tests/router.registry-activate.test.mjs`. | closed |
| T-14-07A | Tampering | verification/publication TOCTOU | high | mitigate | Pre-publication destination identity and digest revalidation in `src/registry/activate.mjs`; replacement/symlink injection regressions in `tests/router.registry-activate.test.mjs`. | closed |
| T-14-08 | Elevation of Privilege | activation gate | high | mitigate | Production runner identity and exact-input verification in `src/registry/validate.mjs:56,92` and `src/registry/activate.mjs`; substitution coverage in `tests/router.registry-activate.test.mjs`. | closed |
| T-14-09 | Spoofing | rollback destination | high | mitigate | Exact contained immutable version verification in `src/registry/activate.mjs:109`; invalid-destination and corruption coverage in `tests/router.registry-activate.test.mjs`. | closed |
| T-14-10 | Denial of Service | retention/recovery | medium | mitigate | Deterministic known-good recovery and bounded retention in `src/registry/activate.mjs`; recovery ordering coverage in `tests/router.registry-activate.test.mjs:162`. | closed |
| T-14-11 | Repudiation | activation outcomes | medium | mitigate | Stable bounded activation and rollback event records in `src/registry/activate.mjs`; audit assertions in `tests/router.registry-activate.test.mjs`. | closed |
| T-14-12 | Information Disclosure | persisted manifests and audit | medium | mitigate | Portable structured persistence plus privacy suite coverage in `tests/router.privacy.test.mjs` and activation tests. | closed |
| T-14-13 | Elevation of Privilege | rollback confirmation | high | mitigate | Exact destination confirmation and fresh preview binding in `src/cli/router-control.mjs:198`; confirmation coverage in `tests/router.control-cli.test.mjs:139`. | closed |
| T-14-14 | Tampering | CLI version/path arguments | high | mitigate | Bounded parsing and contained activation APIs in `src/cli/router-control.mjs:9` and `src/registry/activate.mjs`; invalid-path coverage in CLI tests. | closed |
| T-14-14A | Tampering | rollback publication race | high | mitigate | Shared pointer publication revalidation in `src/registry/activate.mjs:146`; destination replacement injection coverage in activation and CLI tests. | closed |
| T-14-15 | Tampering | runtime installation | high | mitigate | Ownership manifest and refusal of unowned overwrite in `src/lifecycle/router-lifecycle.mjs:52,212`; installer safety coverage in `tests/router.lifecycle.test.mjs`. | closed |
| T-14-16 | Repudiation | text/JSON rendering | medium | mitigate | Shared canonical result rendering in `src/cli/router-control.mjs`; renderer parity coverage in `tests/router.control-cli.test.mjs`. | closed |
| T-14-17 | Information Disclosure | CLI output | medium | mitigate | Bounded portable projections in `src/cli/router-control.mjs:9,79`; privacy/control-character coverage in CLI and privacy tests. | closed |
| T-14-18 | Denial of Service | CLI input and diff | medium | mitigate | Fixed limits and truncation metadata in `src/cli/router-control.mjs:9,79`; large-history coverage in `tests/router.control-cli.test.mjs:102`. | closed |
| T-14-04-01 | Tampering | controller configuration | high | mitigate | Installer-owned shared activation paths in `src/lifecycle/router-lifecycle.mjs:52,212`; dual-runtime ownership coverage in lifecycle tests. | closed |
| T-14-04-02 | Elevation of Privilege | watcher ambiguity guard | high | mitigate | Fail-closed ambiguity before activation in `src/registry/watcher.mjs:325`; watcher ambiguity regressions in `tests/router.registry-watcher.test.mjs`. | closed |
| T-14-04-03 | Denial of Service | recovery retry | medium | mitigate | Deterministic recovery without authority advance in `src/registry/watcher.mjs:14`; retry-state coverage in watcher tests. | closed |
| T-14-05-01 | Spoofing | verification envelope | high | mitigate | Exact-input fingerprints and production identity checks in `src/registry/validate.mjs:56,92` and `src/registry/activate.mjs`; substitution matrix in activation tests. | closed |
| T-14-05-02 | Tampering | equivalence gate | high | mitigate | Canonical incremental/full comparison in `src/registry/validate.mjs:13,38`; deliberate mismatch coverage in watcher tests. | closed |
| T-14-05-03 | Repudiation | calibration accounting | medium | mitigate | Phase 14 fixture evaluation and threshold accounting in `router.calibrate.mjs:81,82`; mismatch/accounting coverage in `tests/router.calibrate.test.mjs`. | closed |
| T-14-06-01 | Tampering | active pointer CAS | high | mitigate | Owned lock spans reread, compare, rename, and fsync in `src/registry/activate.mjs:146`; real cross-process race coverage in `tests/router.registry-activate.test.mjs:130`. | closed |
| T-14-06-02 | Elevation of Privilege | historical versions | high | mitigate | Production/current-policy known-good checks in `src/registry/activate.mjs:109`; incompatible-history coverage in `tests/router.registry-activate.test.mjs:162`. | closed |
| T-14-06-03 | Repudiation | rollback journal | high | mitigate | Durable rollback intent/completion and restart reconciliation in `src/registry/activate.mjs`; journal failure-injection coverage in activation tests. | closed |
| T-14-07-01 | Information Disclosure | diff and preview | medium | mitigate | Bounded deterministic metadata in `src/cli/router-control.mjs:79`; output privacy regressions in CLI and privacy tests. | closed |
| T-14-07-02 | Tampering | corrupt active projection | high | mitigate | Semantic active-source preflight with stable `invalid_active_version` verdict in `src/cli/router-control.mjs:22`; corrupt-active coverage in `tests/router.control-cli.test.mjs:199`. | closed |
| T-14-07-03 | Denial of Service | large history | medium | mitigate | Stable total/returned/truncated/limit metadata in `src/cli/router-control.mjs:79`; 300-entry history coverage in CLI tests. | closed |

*All 32 threats are closed. With `block_on: high`, no blocking or below-threshold open threats remain.*

---

## Threat Flags

The `local-control-cli` implementation flag in `14-03-SUMMARY.md` maps to T-14-13 through T-14-18. No unregistered threat flags remain.

---

## Accepted Risks Log

No accepted risks.

---

## Verification Evidence

- Register origin: plan-time (`<threat_model>` present in all seven Phase 14 plans).
- ASVS depth: L1 presence verification at the cited implementation boundaries.
- Focused security regression command: `node --test tests/router.registry-map.test.mjs tests/router.registry-activate.test.mjs tests/router.registry-watcher.test.mjs tests/router.control-cli.test.mjs tests/router.lifecycle.test.mjs tests/router.calibrate.test.mjs tests/router.privacy.test.mjs`.
- Result: 85 tests passed, 0 failed, 0 skipped (2026-07-16).
- Independent phase verification: `14-VERIFICATION.md` records all 6 observable truths and MAP-01/ACT-01 as verified with the full 498-test suite passing.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open Blocking | Open Non-Blocking | Run By |
|------------|---------------|--------|---------------|-------------------|--------|
| 2026-07-16 | 32 | 32 | 0 | 0 | gsd-security-auditor (generic-agent workaround) |

---

## Sign-Off

- [x] All threats have a disposition.
- [x] All mitigation controls are present at ASVS L1 depth.
- [x] Threat flags are mapped to registered threats.
- [x] Accepted risks are documented (none).
- [x] `threats_open: 0` confirmed under `block_on: high`.
- [x] `status: verified` set in frontmatter.

**Approval:** verified 2026-07-16
