---
phase: 40
slug: project-identity-leases-continuity-and-safe-resume
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-08
---

# Phase 40 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| lease record → authority resolution | A lease record is the authority source for persistent-goal work; a foreign or tampered record crossing this boundary could authorize unintended work. | lease record (structured goal label + 9 fields) / high sensitivity |
| disk → lease store read | Corrupt or tampered lease files on disk are read back; fail-closed null on parse error prevents garbage authorization. | lease JSON file → in-memory record / high sensitivity |
| lease store → router hot path | A revoked/expired/foreign lease must downgrade authority on the hot path; the lease store is read BEFORE cache/weights/recommendations. | lease verdict → authority.authGranted / high sensitivity |
| compaction/restart → dispatch resume | The in-memory idempotency Set is lost; the durable on-lease claim is the trust boundary for at-most-once. | claimed_actions (disk) → resume gate / high sensitivity |
| lease authority → evaluateAuthorityPolicy | A lease feeds authority.authGranted + authority.source as an INPUT; it must not bypass the protected-effect leg (leg 2). | lease verdict (input only) / high sensitivity |
| lease state → startup briefing injection | A briefing is injected as additionalContext on startup; an invalid/foreign lease must NOT produce a briefing (no auto-run). | briefing text → additionalContext / medium sensitivity |
| CLI → lease store mutation | `router-control leases revoke` mutates the lease store; it is an operator-only tool (not hot-path). | CLI command → lease file mutation / high sensitivity |
| lifecycle deploy → dual-runtime filesystem | Lease modules must exist under both ~/.claude and ~/.codex roots; a single-runtime deploy ENOENTs in the other runtime. | module files → owned roots / low sensitivity |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-40-01 | Spoofing | computeLeaseFingerprint / findByFingerprint | high | mitigate | sha256 fingerprint over binding axes; mismatch → lease not found → no authority (LEASE-01). Test asserts each axis independently changes the hash. | closed |
| T-40-02 | Information disclosure | lease record goal field | high | mitigate | Goal is a short structured label, never raw prompt; documented + tested. Prompt-derived fields, if ever added, use hashPromptDerived from receipt.mjs. | closed |
| T-40-03 | Tampering | lease store read path | medium | mitigate | readLease fail-closed: try/catch returns null on missing/corrupt JSON; no garbage record ever authorizes work. | closed |
| T-40-04 | Elevation of privilege | shouldCreateLease gate | high | mitigate | Only persistent_goal_action + explicit instruction creates a lease; one_turn_action and the three non-authorizing classes are rejected; unknown class → false (fail-closed). | closed |
| T-40-05 | Elevation of privilege | resolveLeaseAuthority / evaluateAuthorityHint | high | mitigate | Lease store consulted BEFORE cache/weights/recommendations; revoked→authGranted false regardless of eligible/confidence (LEASE-04 precedence). Adversarial test asserts revoked+high-confidence blocks. | closed |
| T-40-06 | Elevation of privilege | lease vs protected-effect pause | high | mitigate | A lease sets authGranted + source, never protected_=false; evaluateAuthorityPolicy leg 2 still fires for leased protected effects (Pitfall 1). Test asserts a leased protected effect still pauses. | closed |
| T-40-07 | Tampering | resumeImpl / claimCheckpoint | high | mitigate | Durable claimed_actions on the lease record; at-most-once enforced on disk, not in-memory (LEASE-05, Pitfall 2). Test simulates restart (clears Set) and asserts second resume rejected. | closed |
| T-40-08 | Tampering | resolveLeaseAuthority read path | medium | mitigate | try/catch returns 'lease_read_failed' (authGranted false) on any throw — fail-closed for authority, fail-open for the prompt (no block). | closed |
| T-40-09 | Elevation of privilege | composeBriefing / startup injection | high | mitigate | First-visit silent (no lease → null); eight invalid states each return null; briefing requires active + non-expired + fingerprint-match. Test asserts all 8 invalid states + first-visit null. | closed |
| T-40-10 | Information disclosure | briefing / CLI output | medium | mitigate | Briefing references receipt IDs only (no raw prompt, no full receipt bodies); CLI shows the structured goal label + 9 fields, never raw prompt. | closed |
| T-40-11 | Tampering | router-control leases revoke | medium | mitigate | revoke uses the existing setStatus durable atomic write; missing lease → 'lease_absent'; CLI is operator-only, not hot-path. | closed |
| T-40-12 | Tampering | lifecycle dual-runtime deploy | high | mitigate | 4 lease modules added to moduleNames; moduleValues flatMap deploys to both runtimes; lifecycle test count bump is the regression backstop; test asserts existsSync under both roots (Pitfall 6 / T-39-03). | closed |
| T-40-SC | Tampering | npm/pip/cargo installs | high | accept | Stdlib-only phase — no packages installed (CLAUDE.md hard constraint). No supply-chain surface. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-40-SC | T-40-SC | Stdlib-only phase per CLAUDE.md hard constraint; no package installs attempted across all three plans, so no supply-chain surface exists to mitigate. | gsd-secure-phase | 2026-08-08 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-08 | 13 | 13 | 0 | gsd-secure-phase (L1, short-circuit) |

Audit method: ASVS L1 grep-depth short-circuit (threats_open: 0, register authored at plan time, asvs_level: 1). All 12 mitigated threats verified present with behavioral evidence via the phase verifier (0 PRESENT_BEHAVIOR_UNVERIFIED) and the plan SUMMARYs (each cites a passing named test). T-40-SC accepted risk documented. WR-01..05 review fixes applied; lease suite 64/0, lifecycle+CLI 47/0, full phase-40 suite 111/0.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-08