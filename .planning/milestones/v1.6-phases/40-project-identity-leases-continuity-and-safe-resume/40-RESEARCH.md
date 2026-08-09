# Phase 40: Project Identity, Leases, Continuity, and Safe Resume - Research

**Researched:** 2026-08-07
**Domain:** Bounded project-goal authority lifecycle (leases, identity binding, revocation, durable resume, continuity briefings)
**Confidence:** HIGH

## Summary

Phase 40 is a **self-contained state-machine design problem** built entirely on Node.js stdlib and the project's own established patterns. No external packages are installed; there is no library to research. The research value is in mapping the six LEASE requirements onto the building blocks already shipped in Phases 38 (native dispatch + receipts) and 39 (authority taxonomy + policy evaluator), and cataloguing the design patterns the planner must follow.

The codebase already contains the load-bearing primitives: a 5-class authority taxonomy with `persistent_goal_action` (the LEASE-02 gate), a `dispatch-lease.json` marker pattern with minimal idempotency + pause/resume (the LEASE-05 seed), a `SCOPES = ['global','user','project','worktree']` vocabulary with `repository`+`worktree` binding (the LEASE-01 identity axis), a content-addressed `computeCompositeEpoch` fingerprint, an atomic receipt store (the LEASE-05 checkpoint surface), and a steward startup-pointer/state cooldown pattern (the LEASE-06 briefing-cadence foundation). Phase 40's job is to **promote these minimal/ad-hoc primitives into a durable, inspectable, revocable lease record with deterministic expiry and at-most-once resume** — not to invent new mechanisms.

**Primary recommendation:** Build a new `src/lease/` module family (`store.mjs`, `identity.mjs`, `policy.mjs`, `briefing.mjs`) that reuses the existing authority classifier, fingerprint, atomic-write, and receipt patterns — and wire lease creation, revocation, resume, and briefing into the router hot path behind the same fail-open + sealed-input + frozen-vocabulary conventions Phases 38/39 established. Do NOT touch `evaluateAuthorityPolicy`'s sealed signature; leases are an *input* to the policy (an authority source), never a bypass around it.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — discuss was skipped per `workflow.skip_discuss`.

### Claude's Discretion
All implementation choices are at the agent's discretion. Use the ROADMAP goal, success criteria, and existing codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LEASE-01 | Continuity and authority records bind to a stable repository, worktree, runtime, goal, schema generation, and project fingerprint so foreign or stale state cannot authorize work. | `SCOPES` + `scopeSuffix` + `computeCompositeEpoch` provide the identity vocabulary and content-addressed fingerprint; a new `lease/identity.mjs` composes repo+worktree+runtime+goal+schema-generation into a stable lease fingerprint. |
| LEASE-02 | Only an explicit outcome-persistent instruction creates a project-goal lease; an ordinary action request authorizes only the current task. | `classifyAuthority` already emits `persistent_goal_action` for prompts matching `PERSISTENT_GOAL_MARKERS`; lease creation gates on `authority_class === 'persistent_goal_action'` AND an explicit operator instruction. `one_turn_action` never creates a lease. |
| LEASE-03 | An operator can inspect each lease's goal, scope, allowed effects, confirmation effects, resource bounds, status, deterministic expiry, authority source, last safe checkpoint, and freshness evidence. | New `lease/store.mjs` with a schema-versioned lease record carrying all 9 inspection fields; reuse `stableStringify` + atomic temp+rename from receipt.mjs/state.mjs. Inspection is a pure read (no hot-path cost). |
| LEASE-04 | An operator can revoke an active lease, and revocation takes precedence over cached state, confidence, recommendations, pending startup work, and learned mappings. | A revocation flag on the lease record checked at every authority-resolution entry point; revocation is a durable atomic write that flips `status` to `revoked`. The hot path must consult the lease store BEFORE consulting cache/weights/telemetry-derived recommendations. |
| LEASE-05 | A valid unfinished lease resumes each incomplete action at most once across supported compaction or runtime restart paths by using durable action identities and idempotent checkpoint claims. | Generalize `claimIdempotency`/`releaseIdempotency` + `pauseImpl`/`resumeImpl` from `src/adapters/dispatch/claude.mjs:138-152,322-358` into a durable checkpoint claim keyed by `(lease_id, action_id)`; the in-memory `_idempotencySeen` Set becomes a durable record on the lease so it survives restart/compaction. |
| LEASE-06 | A first Router visit remains silent; a returning project receives at most one compact evidence-backed briefing, while completed/blocked/expired/revoked/corrupt/stale/unauthorized/foreign-project state never auto-runs. | Extend the steward `startup-pointer` + `state` cooldown pattern (`src/steward/startup-pointer.mjs`, `src/steward/state.mjs`) from suggestion-cooldown to project-continuity-briefing: first visit (no lease record) = silent; returning project with an active lease = one briefing; any invalid/non-active state = silent. The briefing is evidence-backed (receipt references), never fabricated. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Project fingerprint (repo+worktree+runtime+goal+schema-gen) | API / Backend (in-process hook) | — | Computed in the hook process from `process.cwd()` + `RUNTIME` + lease goal; never delegated to a daemon (the <100ms / no-subprocess constraint). |
| Lease creation (authority → lease record) | API / Backend | — | Pure function over the authority-classifier output + operator instruction; lease record written atomically under `~/.<runtime>/router/leases/`. |
| Lease inspection (read 9 fields) | API / Backend (CLI/control) | — | Read-only over the lease store; surfaces via the existing `router-control.mjs` CLI, not the hot path. |
| Lease revocation (durable status flip) | API / Backend | — | Atomic write flipping `status` to `revoked`; checked at every authority-resolution entry. |
| Durable resume (at-most-once checkpoint) | API / Backend (worker, off hot path) | Database / Storage | Checkpoint claims persist on the lease record; the dispatch worker (Phase 38 pattern) reads/writes them off the hot path. |
| Continuity briefing (first-visit silent / one briefing) | Frontend Server (hook startup) | — | Composed in the hook startup path from lease state + receipt evidence; injected via `additionalContext` (same channel as routing). |
| Lease freshness / staleness gating | API / Backend | — | mtime + expiry + fingerprint comparison; mirrors `checkFreshness` in router.mjs. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js stdlib (`node:crypto`, `node:fs`, `node:path`, `node:os`) | built-in (Node ≥18; runtime is v22.22.3) | All hashing, atomic writes, path resolution, identity | Zero dependencies — the CLAUDE.md hard constraint. Every existing module (`authority.mjs`, `receipt.mjs`, `state.mjs`, `fingerprint.mjs`) is stdlib-only. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/registry/schema.mjs` `stableStringify` | existing | Canonical JSON serialization for deterministic hashes | Every lease fingerprint / idempotency key / atomic write. `[VERIFIED: src/registry/schema.mjs]` |
| `src/registry/fingerprint.mjs` `computeCompositeEpoch` | existing | Content-addressed epoch over semantic routing inputs | Pattern reference for LEASE-01 project fingerprint (compose repo+worktree+runtime+goal+schema-gen). `[VERIFIED: src/registry/fingerprint.mjs:30-56]` |
| `src/intent/authority.mjs` `classifyAuthority` | existing (Phase 39) | 5-class authority taxonomy — `persistent_goal_action` is the LEASE-02 gate | Lease creation calls this; `one_turn_action` never creates a lease. `[VERIFIED: src/intent/authority.mjs:13-19,110-155]` |
| `src/adapters/dispatch/receipt.mjs` | existing (Phase 38) | Atomic publish + append + read receipt store | Pattern for the lease store (atomic temp+rename, fail-open try/catch). `[VERIFIED: src/adapters/dispatch/receipt.mjs:76-104]` |
| `src/steward/state.mjs` `mutationLock` + `durableWrite` | existing | mkdir-based mutation lock + fsync'd temp+rename | Pattern for concurrent-safe lease mutation. `[VERIFIED: src/steward/state.mjs:47-89]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `src/lease/` module family | Extend `src/intent/authority.mjs` with lease state | Rejected — authority.mjs is a pure policy evaluator (sealed input, no I/O). Mixing durable state into it breaks the AUTH-03 independence invariant and the self-contained-for-deploy property. Leases are an *input* to authority, not part of it. |
| In-memory idempotency Set (current Phase 38 pattern) | Durable idempotency claim on the lease record | Required for LEASE-05 — the in-memory `_idempotencySeen` Set (claude.mjs:139) is lost on compaction/restart. The claim must persist on the lease. |
| Separate leases dir per runtime | Single shared leases dir | Rejected — Phase 38 established per-runtime partition (`defaultReceiptRoot` → `~/.<runtime>/router/receipts/`). Leases must follow the same partition so a Codex lease cannot authorize Claude work (LEASE-01). |

**Installation:**
```bash
# No npm install. Stdlib-only. New files are plain .mjs under src/lease/ and
# deployed via the lifecycle bundle (add to moduleNames in router-lifecycle.mjs).
```

**Version verification:** Not applicable — no external packages. Node runtime verified: `node --version` → `v22.22.3` `[VERIFIED: runtime probe]`. `rtk 0.43.0` present at `/Users/guilherme/.local/bin/rtk` `[VERIFIED: runtime probe]`.

## Package Legitimacy Audit

> No external packages are installed in this phase. The phase is stdlib-only per the CLAUDE.md hard constraint ("Any npm dependency at all in v1" is in the "What NOT to Use" table). The legitimacy gate is therefore not triggered.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | N/A — stdlib-only phase |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                        Operator prompt
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │  router.mjs hot path (fail-open)         │
        │  ┌───────────────┐  ┌──────────────────┐  │
        │  │ classifyIntent│→│ classifyAuthority │  │  Phase 39 (existing)
        │  └───────────────┘  └────────┬─────────┘  │
        │                              │            │
        │              authority_class │            │
        │                              ▼            │
        │  ┌──────────────────────────────────────┐ │
        │  │ lease/policy.mjs (NEW)                │ │
        │  │  resolveLeaseAuthority(fingerprint,  │ │
        │  │    authority_class, leaseStore)       │ │
        │  │  → { lease, authority_source, revoked }│ │
        │  └───────────────┬──────────────────────┘ │
        │                  │                        │
        │  ┌───────────────▼──────────────────────┐ │
        │  │ evaluateAuthorityPolicy (existing)   │ │  Phase 39 sealed evaluator
        │  │ + lease as authority.source input     │ │  (signature UNCHANGED)
        │  └───────────────┬──────────────────────┘ │
        │                  │                        │
        │      proceed / pause / ask / block        │
        └──────────────────┬─────────────────────────┘
                           │
              ┌────────────┴───────────────┐
              ▼                            ▼
   ┌─────────────────────┐      ┌──────────────────────┐
   │ lease/store.mjs     │      │ dispatch worker       │
   │  createLease()       │      │ (Phase 38, off path)  │
   │  revokeLease()      │      │  resume(lease_id,     │
   │  readLease()        │      │    action_id)         │
   │  claimCheckpoint()  │      │  → claimIdempotency  │
   │  releaseCheckpoint()│      │    (durable)         │
   └─────────┬───────────┘      └──────────┬───────────┘
             │                             │
             ▼                             ▼
   ┌─────────────────────┐      ┌──────────────────────┐
   │ ~/.<runtime>/router/│      │ receipts/ (Phase 38)  │
   │ leases/<lease_id>.json │   │  checkpoint evidence  │
   └─────────────────────┘      └──────────────────────┘

  Startup / continuity (LEASE-06):
   ┌─────────────────────┐      ┌──────────────────────┐
   │ lease/briefing.mjs   │ ←──  │ steward/startup-      │
   │  composeBriefing()   │      │ pointer.mjs (existing)│
   │  first-visit=silent  │      │  cooldown pattern      │
   │  returning=one brief │      └──────────────────────┘
   │  invalid=silent      │
   └─────────────────────┘
```

Trace the primary use case (LEASE-05 resume): a paused lease + a restart → the hook startup path calls `lease/briefing.mjs` → finds an active, non-expired, non-revoked lease matching the current project fingerprint → composes one evidence-backed briefing (receipt references) → injects via `additionalContext`. The operator resumes → the dispatch worker calls `resume(lease_id, action_id)` → `claimCheckpoint` checks the durable idempotency record on the lease → if already-claimed, reject (at-most-once) → if unclaimed, claim + re-invoke. A foreign-project fingerprint never matches → silent.

### Recommended Project Structure
```
src/
├── lease/                    # NEW — Phase 40 lease lifecycle
│   ├── identity.mjs          # project fingerprint (repo+worktree+runtime+goal+schema-gen)
│   ├── store.mjs             # atomic lease CRUD + durable checkpoint claims
│   ├── policy.mjs            # resolve lease authority (revocation precedence, expiry)
│   └── briefing.mjs          # LEASE-06 first-visit-silent / one-briefing composer
├── intent/                   # existing — Phase 39 (UNCHANGED sealed signature)
│   └── authority.mjs
├── adapters/dispatch/        # existing — Phase 38 (lease-05 resume generalization)
│   └── claude.mjs            # generalize claimIdempotency → lease.claimCheckpoint
├── steward/                  # existing — briefing-cadence foundation
│   ├── startup-pointer.mjs
│   └── state.mjs
└── lifecycle/
    └── router-lifecycle.mjs  # add src/lease/*.mjs to moduleNames
```

### Pattern 1: Sealed-input policy evaluator (AUTH-03 independence — DO NOT VIOLATE)
**What:** `evaluateAuthorityPolicy` destructures only `{ confidence, authority, risk, compatibility }` — `weights` is not a parameter, `confidence` is the tier string, never the numeric score.
**When to use:** Any new policy logic that decides proceed/pause/ask/block.
**Example:**
```javascript
// Source: src/intent/authority.mjs:184-189 [VERIFIED]
export function evaluateAuthorityPolicy({
  confidence,
  authority = {},
  risk = {},
  compatibility = {},
} = {}) {
  // authority.authGranted is the ONLY authority signal.
  // A lease contributes to authority.authGranted (it is an authority SOURCE),
  // never a bypass around the sealed check chain.
```
**Lease integration rule:** A lease makes `authority.authGranted = true` AND `authority.source = 'lease:<lease_id>'`. It does NOT skip legs 1 (compatibility), 2 (protected effect → pause), or 5 (non-reversible → pause). A revoked lease sets `authority.authGranted = false` regardless of prior confidence (LEASE-04 precedence).

### Pattern 2: Atomic durable write (temp + fsync + rename)
**What:** Write to a temp file, fsync, rename, fsync the directory.
**When to use:** Every lease mutation (create, revoke, checkpoint claim, status flip).
**Example:**
```javascript
// Source: src/steward/state.mjs:81-89 [VERIFIED]
function durableWrite(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(tmp, `${stableStringify(value)}\n`, { mode: 0o600 });
  let fd;
  try { fd = openSync(tmp, 'r'); fsyncSync(fd); } finally { if (fd !== undefined) closeSync(fd); }
  renameSync(tmp, path);
  try { fd = openSync(dirname(path), 'r'); fsyncSync(fd); } catch { /* best effort */ }
  finally { if (fd !== undefined) try { closeSync(fd); } catch { /* best effort */ } }
}
```

### Pattern 3: Durable idempotency claim (LEASE-05 at-most-once)
**What:** The Phase 38 in-memory Set must become a durable record on the lease so it survives compaction/restart.
**When to use:** Every resume attempt.
**Example (current in-memory — must become durable):**
```javascript
// Source: src/adapters/dispatch/claude.mjs:138-145 [VERIFIED]
const _idempotencySeen = new Set();
function claimIdempotency(key) {
  if (!key) return true;
  if (_idempotencySeen.has(key)) return false;
  _idempotencySeen.add(key);
  return true;
}
```
**Phase 40 promotion:** `lease.claimCheckpoint(lease_id, action_id)` reads the lease record, checks the `claimed_actions` set on disk, atomically adds `action_id` if absent, returns `{ claimed: true }` or `{ claimed: false, reason: 'already_claimed' }`. The claim is durable; a restart re-reads the lease.

### Pattern 4: Fail-open + no `decision: 'block'` on the hot path
**What:** Any throw → exit 0, no `additionalContext`. The router NEVER erases a prompt.
**When to use:** Every lease read/write on the hot path.
**Example:**
```javascript
// Source: src/runtime/router.mjs (fail-open wrapper, established Phase 1/38/39) [VERIFIED]
// Lease operations follow the same contract: a lease-store throw MUST NOT block the prompt.
```

### Pattern 5: Per-runtime partition (LEASE-01 cross-runtime isolation)
**What:** `~/.claude/router/leases/` for Claude, `~/.codex/router/leases/` for Codex — a Codex lease cannot authorize Claude work.
**When to use:** Lease store path resolution.
**Example:**
```javascript
// Source: src/adapters/dispatch/receipt.mjs:66-69 [VERIFIED]
export function defaultReceiptRoot(runtime) {
  const dir = runtime === 'codex' ? '.codex' : '.claude';
  return join(homedir(), dir, 'router', 'receipts');
}
// Lease store mirrors this: defaultLeaseRoot(runtime) → ~/.<runtime>/router/leases/
```

### Pattern 6: Frozen vocabulary (LEASE-02 lease-creation gate)
**What:** `AUTHORITY_CLASSES` and `PERSISTENT_GOAL_MARKERS` are frozen; lease creation must reference them, not redefine them.
**Example:**
```javascript
// Source: src/intent/authority.mjs:13-19,35-39 [VERIFIED]
export const AUTHORITY_CLASSES = Object.freeze([
  'advice', 'inspection', 'one_turn_action', 'persistent_goal_action', 'non_authorizing_discussion',
]);
const PERSISTENT_GOAL_MARKERS = new RegExp(
  '\\b(until\\s+done|keep\\s+going|finish\\s+(?:it\\s+)?all'
  + '|autonomously\\b.*\\buntil|end-to-end|don' + APOS + '?t\\s+stop)\\b', 'i'
);
// LEASE-02: lease creation requires authority_class === 'persistent_goal_action'
//           AND an explicit operator instruction. one_turn_action NEVER creates a lease.
```

### Anti-Patterns to Avoid
- **Mixing lease state into `evaluateAuthorityPolicy`:** breaks the AUTH-03 sealed-input invariant. The lease is an *input* (`authority.authGranted`, `authority.source`), not part of the evaluator.
- **In-memory idempotency for LEASE-05:** the Phase 38 `_idempotencySeen` Set is lost on compaction/restart — violates "at most once across supported compaction or runtime restart paths."
- **Auto-running continuity (LEASE-06):** "First visits remain silent" is a hard constraint. Fabricated/eager startup continuity is in the Out-of-Scope table. A briefing is *evidence-backed* (receipt references) or absent.
- **Lease as a bypass around protected-effect pause (LEASE-04 vs AUTH-05):** a lease does NOT override leg 2 of `evaluateAuthorityPolicy`. A persistent-goal lease for a destructive effect STILL pauses for host-mediated confirmation.
- **Hardcoding `/Users/guilherme`:** use `os.homedir()` (established CLAUDE.md constraint).
- **Raw prompt text in lease records:** receipts/telemetry use `hashPromptDerived` (redact-then-hash) — lease records must do the same. The goal is a *short structured* field, never the raw prompt.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic durable writes | Custom fsync/rename logic | Reuse `src/steward/state.mjs:durableWrite` pattern | Already handles temp+fsync+rename+dir-fsync; proven in steward + receipt stores. |
| Mutation lock | Custom lock file | Reuse `src/steward/state.mjs:mutationLock` (mkdir-based, stale-PID recovery) | Already handles deadlock/stale-owner recovery via `process.kill(pid,0)` probe. |
| Content-addressed fingerprint | Custom hashing | Reuse `computeCompositeEpoch` shape from `src/registry/fingerprint.mjs:30-56` | Already canonicalizes array order + excludes volatile fields (timestamps/paths). |
| Project scope binding | Custom scope enum | Reuse `SCOPES = ['global','user','project','worktree']` from `src/registry/schema.mjs:5` + `scopeSuffix` from `src/registry/identity.mjs:7` | The vocabulary is already frozen and validated by `validateScope`. |
| Authority classification | Re-classify in lease code | Call `classifyAuthority` from `src/intent/authority.mjs` | Single source of truth; re-classifying risks drift on the spoofing guards (T-39-01). |
| Receipt / checkpoint evidence | New evidence store | Reuse `src/adapters/dispatch/receipt.mjs` `ReceiptStore` | Already atomic + append + read; checkpoint evidence is a receipt with `state: 'paused'`. |
| Briefing cadence (first-visit / cooldown) | New cooldown system | Extend `src/steward/startup-pointer.mjs` cooldown pattern | Already implements cooldown-until + dismiss + snooze with durable writes. |

**Key insight:** Every mechanism Phase 40 needs has a proven seed in the codebase. The phase is a *promotion* (in-memory → durable, ad-hoc marker → schema'd record, suggestion-cooldown → continuity-briefing-cadence), not a greenfield build. Custom solutions would duplicate the atomic-write, fingerprint, and mutation-lock patterns that steward/receipt/fingerprint already prove.

## Runtime State Inventory

> Phase 40 introduces **new** persisted state (lease records). It does not rename or migrate existing state. The inventory below documents the new state and the existing state Phase 40 reads/extends.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (new) | `~/.<runtime>/router/leases/<lease_id>.json` (new — lease records with goal, scope, effects, bounds, expiry, authority source, status, checkpoint, freshness) | New code writes these (atomic, per-runtime partition). No migration of existing data. |
| Stored data (existing, read-only) | `~/.<runtime>/router/receipts/` (Phase 38 receipt store) | Read for checkpoint evidence + briefing composition; never mutated by lease code. |
| Stored data (existing, read-only) | `~/.<runtime>/router/steward/startup-pointer.json` (cooldown) | Read/extended for LEASE-06 briefing cadence; the pointer's cooldown pattern is the model. |
| Live service config | None — Router has no daemon (CLAUDE.md Out-of-Scope: "Independent autonomous daemon"). The watcher (registry/watcher.mjs) is a separate concern; leases are not watcher state. | None. |
| OS-registered state | None — leases are plain files under `~/.<runtime>/router/`, not OS-registered. | None. |
| Secrets/env vars | `ROUTER_RUNTIME` env override (existing, `detectRuntime` in router.mjs:83-92). Lease code must respect the same runtime detection — a lease is runtime-bound. | Code must use `RUNTIME` (the module-level cached value), never re-detect. |
| Build artifacts | `src/lease/*.mjs` must be added to `moduleNames` in `src/lifecycle/router-lifecycle.mjs:384-422` so they deploy to both `ownedRoot` and `codexOwnedRoot` (Phase 38/39 parity — T-39-03 regression backstop). | Add 4 new module names; bump lifecycle test count. |

**Nothing found in category:** "Live service config" and "OS-registered state" — verified by the CLAUDE.md Out-of-Scope table ("Independent autonomous daemon" is excluded) and by `grep` confirming lease files live under `~/.<runtime>/router/`.

## Common Pitfalls

### Pitfall 1: Lease as an AUTH-05 bypass
**What goes wrong:** A persistent-goal lease for a destructive effect auto-proceeds because "the operator already authorized the goal."
**Why it happens:** Treating the lease as a blanket authority that skips the protected-effect pause (leg 2 of `evaluateAuthorityPolicy`).
**How to avoid:** A lease sets `authority.authGranted = true` and `authority.source = 'lease:<id>'`. It does NOT set `authority.protected_ = false`. The protected-effect vocabulary (`PROTECTED_EFFECT_TOKENS`) still triggers `pause` regardless of lease status. A lease widens *what the operator is trying to do*; it never widens *what is safe to do without confirmation*.
**Warning signs:** A test where a leased destructive effect proceeds without a `pause`/`ask` decision.

### Pitfall 2: In-memory idempotency surviving restart (LEASE-05 violation)
**What goes wrong:** The Phase 38 `_idempotencySeen` Set (claude.mjs:139) is used as-is for lease resume; a compaction/restart loses it, so an action resumes twice.
**Why it happens:** The Set is process-local; it cannot survive compaction (the hook process is re-spawned) or restart.
**How to avoid:** `claimCheckpoint` reads + writes the `claimed_actions` set ON the lease record (durable). The in-memory Set remains only as a hot-path fast-path; a durable read is authoritative on the resume path.
**Warning signs:** A resume test that passes in-process but fails after a simulated restart (delete the in-memory Set, re-read the lease).

### Pitfall 3: Foreign-project lease authorizing work (LEASE-01 violation)
**What goes wrong:** A lease created in repo A / worktree W / Claude runtime is presented in repo B / worktree X / Codex runtime and authorizes work.
**Why it happens:** The lease fingerprint omits one of the six required axes (repo, worktree, runtime, goal, schema generation, project fingerprint).
**How to avoid:** The lease fingerprint is a sha256 over the canonical tuple of ALL six axes. The hot path recomputes the current project fingerprint and compares it to the lease's `project_fingerprint` field; a mismatch → the lease is `foreign` and never authorizes.
**Warning signs:** A test where a lease from a different `process.cwd()` or `RUNTIME` is rejected.

### Pitfall 4: Auto-running continuity on first visit (LEASE-06 violation)
**What goes wrong:** The hook emits a briefing on a project's first Router visit because a stale/foreign lease record exists.
**Why it happens:** Not checking that the lease is (a) for THIS project fingerprint, (b) active, (c) non-expired, (d) non-revoked, (e) fresh.
**How to avoid:** The briefing composer is a pure function that returns `null` (silent) unless ALL validity predicates pass AND a lease record exists for the current fingerprint. First visit = no record = silent. The eight invalid states (completed/blocked/expired/revoked/corrupt/stale/unauthorized/foreign) each map to a distinct `briefing_status` that produces no injection.
**Warning signs:** A briefing emitted on a clean clone with no prior lease.

### Pitfall 5: Lease record leaking raw prompt text
**What goes wrong:** The lease `goal` field stores the operator's raw prompt, leaking PII/secrets into `~/.<runtime>/router/leases/`.
**Why it happens:** Copying the raw prompt into the goal field.
**How to avoid:** The goal is a *short structured* field (operator-declared goal label), never the raw prompt. If a prompt-derived field is needed, use `receipt.mjs:hashPromptDerived` (redact-then-hash) — same privacy contract as telemetry/receipts.
**Warning signs:** A lease record containing natural-language prompt text.

### Pitfall 6: Deploying lease modules to only one runtime (T-39-03 regression)
**What goes wrong:** `src/lease/*.mjs` is added to `moduleNames` but the flatMap deploys to only `ownedRoot` (Claude), so Codex lease code ENOENTs.
**Why it happens:** The `moduleValues` flatMap over `[p.ownedRoot, p.codexOwnedRoot]` (router-lifecycle.mjs:423) is the mechanism — new modules must ride it, not a custom deploy.
**How to avoid:** Add the 4 new module names to the existing `moduleNames` array; the flatMap handles both runtimes. Bump the lifecycle test count.
**Warning signs:** A lifecycle test that deploys only `~/.claude/router/modules/lease/`.

## Code Examples

### LEASE-01: Project fingerprint (compose the six axes)
```javascript
// Source: pattern from src/registry/fingerprint.mjs:30-56 [VERIFIED]
import { createHash } from 'node:crypto';
import { stableStringify } from '../registry/schema.mjs';

// Six axes per LEASE-01: repo, worktree, runtime, goal, schema generation, project fingerprint.
export function computeLeaseFingerprint({ repo, worktree, runtime, goal, schemaGeneration, projectFingerprint }) {
  return createHash('sha256').update(stableStringify({
    repo, worktree, runtime, goal, schema_generation: schemaGeneration,
    project_fingerprint: projectFingerprint,
  }), 'utf8').digest('hex');
}
```

### LEASE-02: Lease creation gate (only persistent_goal_action)
```javascript
// Source: src/intent/authority.mjs:13-19,147-152 [VERIFIED]
// classifyAuthority returns authority_class; lease creation requires the exact
// 'persistent_goal_action' value AND an explicit operator instruction.
import { classifyAuthority } from '../intent/authority.mjs';

export function shouldCreateLease(prompt, intent, explicitInstruction) {
  const { authority_class } = classifyAuthority(prompt, { intent });
  // one_turn_action, advice, inspection, non_authorizing_discussion → NO lease
  return authority_class === 'persistent_goal_action' && explicitInstruction === true;
}
```

### LEASE-03: Lease record schema (the 9 inspection fields)
```javascript
// The 9 inspectable fields per LEASE-03 (verbatim from the requirement):
//   goal, scope, allowed effects, confirmation effects, resource bounds,
//   status, deterministic expiry, authority source, last safe checkpoint,
//   freshness evidence.
{
  schema_version: 1,
  policy_version: 'lease-policy-v1',
  lease_id: '<sha256>',
  project_fingerprint: '<LEASE-01 six-axis hash>',
  goal: '<operator-declared short label, NOT raw prompt>',
  scope: { repo, worktree, runtime, schema_generation },
  allowed_effects: ['reversible', 'local'],
  confirmation_effects: ['protected_effect'],   // from PROTECTED_EFFECT_TOKENS
  resource_bounds: { max_wall_ms, max_invocations, max_tokens },
  status: 'active',                              // active|paused|completed|blocked|expired|revoked
  expiry: { deterministic_at_ms, tz: 'UTC' },
  authority_source: { kind: 'operator', instruction: 'explicit', class: 'persistent_goal_action' },
  last_safe_checkpoint: { receipt_id, action_id, state: 'paused', at_ms },
  freshness_evidence: { lease_mtime_ms, fingerprint_match: true },
  claimed_actions: [],                           // LEASE-05 durable idempotency set
}
```

### LEASE-04: Revocation precedence (checked at every authority resolution)
```javascript
// Revocation takes precedence over cached state, confidence, recommendations,
// pending startup work, and learned mappings. The hot path MUST consult the
// lease store BEFORE cache/weights/telemetry-derived recommendations.
export function resolveLeaseAuthority(leaseId, leaseStore) {
  const lease = leaseStore.read(leaseId);
  if (!lease) return { authGranted: false, source: 'none', reason: 'lease_absent' };
  if (lease.status === 'revoked') return { authGranted: false, source: 'lease:revoked', reason: 'revoked' };
  if (lease.status === 'expired' || lease.expiry.deterministic_at_ms <= Date.now())
    return { authGranted: false, source: 'lease:expired', reason: 'expired' };
  if (!lease.freshness_evidence.fingerprint_match)
    return { authGranted: false, source: 'lease:foreign', reason: 'fingerprint_mismatch' };
  return { authGranted: true, source: `lease:${lease.lease_id}`, lease };
}
```

### LEASE-05: Durable checkpoint claim (generalize the in-memory Set)
```javascript
// Source: src/adapters/dispatch/claude.mjs:138-145,322-358 [VERIFIED] — promote to durable
export function claimCheckpoint(leaseStore, leaseId, actionId) {
  return leaseStore.mutate(leaseId, (lease) => {
    if (!Array.isArray(lease.claimed_actions)) lease.claimed_actions = [];
    if (lease.claimed_actions.includes(actionId)) {
      return { changed: false, claimed: false, reason: 'already_claimed' };
    }
    lease.claimed_actions.push(actionId);
    return { changed: true, claimed: true };
  });
}
```

### LEASE-06: Briefing cadence (extend the steward cooldown pattern)
```javascript
// Source: src/steward/startup-pointer.mjs (cooldown pattern) [VERIFIED]
// First visit (no lease) → silent. Returning project with active lease → one briefing.
// Eight invalid states → silent.
export function composeBriefing({ projectFingerprint, leaseStore, now = Date.now() }) {
  const lease = leaseStore.findByFingerprint(projectFingerprint);
  if (!lease) return null;                                  // first visit → silent
  const INVALID = new Set(['completed','blocked','expired','revoked','corrupt','stale','unauthorized','foreign']);
  if (INVALID.has(lease.status)) return null;               // invalid → silent
  if (lease.expiry.deterministic_at_ms <= now) return null; // expired → silent
  if (!lease.freshness_evidence.fingerprint_match) return null; // foreign → silent
  // At most one briefing: check the steward cooldown / dismissed state.
  return { briefing: true, lease_id: lease.lease_id, evidence: lease.last_safe_checkpoint };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-memory `_idempotencySeen` Set (Phase 38) | Durable `claimed_actions` set on the lease record (Phase 40) | Phase 40 | Resume survives compaction/restart (LEASE-05 at-most-once across restart paths). |
| `dispatch-lease.json` ad-hoc marker (Phase 38) | Schema-versioned lease record with 9 inspection fields (Phase 40) | Phase 40 | Leases are inspectable, revocable, expiry-bounded (LEASE-03/04). |
| Steward suggestion cooldown (Phase 23+) | Project-continuity briefing cadence (Phase 40) | Phase 40 | First-visit silent; returning project one evidence-backed briefing (LEASE-06). |
| `one_turn_action` only (Phase 39) | `persistent_goal_action` → lease (Phase 40) | Phase 40 | Bounded project-goal authority is persistable (LEASE-02). |

**Deprecated/outdated:**
- The Phase 38 `dispatch-lease.json` marker as the sole lease representation: Phase 40 promotes it to a schema'd record. The marker may remain as the *trigger* (the hook's existence check), but the *state* lives in the lease store.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "Supported compaction or runtime restart paths" (LEASE-05) means the hook process is re-spawned (UserPromptSubmit fires per prompt) and the dispatch worker is a detached subprocess — not a long-lived daemon (which is Out-of-Scope). | Architecture Patterns, LEASE-05 | If the harness provides a compaction-event hook the planner must wire resume into that event; the durable checkpoint claim still applies. Low risk — the durable claim is correct either way. |
| A2 | The `project_fingerprint` axis of LEASE-01 is the existing `computeCompositeEpoch` output (or a derivative of it), not a new fingerprint mechanism. | LEASE-01, Code Examples | If a distinct project-only fingerprint is required, the planner adds a `computeProjectFingerprint` that omits mode-map/weights (which `computeCompositeEpoch` includes). Low risk — same pattern. |
| A3 | The eight invalid briefing states (LEASE-06) map to distinct `briefing_status` reason codes but all produce no injection. | LEASE-06, Pitfall 4 | If the operator wants a *diagnostic* (non-acting) line for some invalid states (e.g. "lease X is stale — run /router-control leases"), the planner adds a one-line diagnostic distinct from the evidence-backed briefing. Medium risk — the requirement says "never auto-runs", not "never emits any line". |

**Note:** All in-repo discrete values (enums, paths, function signatures, regex patterns) cited in this research were read directly from source this session and tagged `[VERIFIED: path:lines]` with verbatim quotes alongside the claim. No `[ASSUMED]` discrete values appear in code examples.

## Open Questions (RESOLVED)

1. **LEASE-05 "supported compaction paths" — which harness events count?**
   - What we know: The hook is `UserPromptSubmit`-fired (per prompt). The dispatch worker is detached. There is no long-lived daemon.
   - What's unclear: Whether the harness emits a compaction lifecycle event the router can hook for resume, or whether resume is purely "next prompt re-reads the lease store."
   - RESOLVED: Design resume as "next-prompt re-read" (the only guaranteed path). If a compaction hook exists, it's additive. The durable checkpoint claim makes either path safe. (Implemented: Plan 02 resume reads the durable checkpoint on the next prompt; no compaction hook wired.)

2. **LEASE-06 "evidence-backed briefing" — what evidence format?**
   - What we know: Receipts carry `receipt_id`, `completion_evidence.state`, `wall_ms`, `stdout_sha256`. The briefing must be evidence-backed.
   - What's unclear: Whether the briefing should inline receipt summaries (token cost) or reference receipt IDs (operator inspects via CLI).
   - RESOLVED: Reference receipt IDs in the briefing; the operator inspects via the existing `router-control.mjs` CLI. Keeps the briefing compact (CLAUDE.md: normal injection ≤120 tokens). (Implemented: Plan 03 briefing references receipt IDs.)

3. **Lease expiry — deterministic wall-clock vs. invocation-count vs. both?**
   - What we know: LEASE-03 requires "deterministic expiry." `resource_bounds` (max_invocations) is a separate field.
   - What's unclear: Whether expiry is purely wall-clock (a timestamp) or also bounded by `max_invocations` / `max_wall_ms` / `max_tokens`.
   - RESOLVED: Both — `expiry.deterministic_at_ms` is the wall-clock deadline; `resource_bounds` are the per-action budgets. A lease is expired when ANY bound is crossed. The planner makes this a single `isExpired(lease, now)` predicate. (Implemented: Plan 01 `buildLeaseRecord` emits `expiry.deterministic_at_ms` + `resource_bounds`; `isExpired` enforces `expiry` + `max_invocations`; `max_wall_ms`/`max_tokens` stored, enforcement deferred — see Plan 01 frontmatter.)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (stdlib only) | All lease modules | ✓ | v22.22.3 | — |
| `rtk` (test runner wrapper) | Validation suite | ✓ | 0.43.0 | `node --test` directly |
| `node:test` + `node:assert/strict` | Test framework | ✓ | built-in (Node 22) | — |
| git | Graphify / commits | ✓ | (repo is git) | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` |
| Config file | none (inline `test()` calls) |
| Quick run command | `rtk node --test tests/router.lease*.test.mjs tests/router.authority*.test.mjs tests/router.steward*.test.mjs` |
| Full suite command | `rtk node --test tests/*.test.mjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LEASE-01 | Foreign/stale fingerprint rejected (cross-runtime, cross-worktree, cross-schema-gen) | unit (adversarial) | `rtk node --test tests/router.lease-identity.test.mjs` | ❌ Wave 0 |
| LEASE-02 | Only persistent_goal_action + explicit instruction creates a lease; one_turn_action never | unit | `rtk node --test tests/router.lease-creation.test.mjs` | ❌ Wave 0 |
| LEASE-03 | Inspect returns all 9 fields; missing/expired/revoked reflected in status | unit | `rtk node --test tests/router.lease-inspect.test.mjs` | ❌ Wave 0 |
| LEASE-04 | Revocation precedence over cache/weights/pending-startup/learned; revoked lease blocks even with high confidence | unit (adversarial) | `rtk node --test tests/router.lease-revoke.test.mjs` | ❌ Wave 0 |
| LEASE-05 | At-most-once resume across simulated restart (delete in-memory Set, re-read lease); double-resume rejected | unit | `rtk node --test tests/router.lease-resume.test.mjs` | ❌ Wave 0 |
| LEASE-06 | First visit silent; returning project one briefing; 8 invalid states silent | unit | `rtk node --test tests/router.lease-briefing.test.mjs` | ❌ Wave 0 |
| AUTH regression | Phase 39 authority tests unchanged (sealed signature) | regression | `rtk node --test tests/router.authority*.test.mjs tests/router.approval.test.mjs` | ✅ existing |
| HOST-04 regression | Lease hot-path check does not blow <100ms budget | perf | `rtk node --test tests/router.perf*.test.mjs` | ✅ existing (extend) |
| Lifecycle regression | New lease modules deploy to both runtimes (count bump) | lifecycle | `rtk node --test tests/router.lifecycle.test.mjs` | ✅ existing (extend) |

### Sampling Rate
- **Per task commit:** `rtk node --test tests/router.lease*.test.mjs tests/router.authority*.test.mjs`
- **Per wave merge:** `rtk node --test tests/router.lease*.test.mjs tests/router.authority*.test.mjs tests/router.steward*.test.mjs tests/router.adapters.test.mjs`
- **Phase gate:** Full suite green before `/gsd-verify-work`: `rtk node --test tests/*.test.mjs`

### Wave 0 Gaps
- [ ] `tests/router.lease-identity.test.mjs` — LEASE-01 (project fingerprint, cross-runtime/worktree/schema-gen rejection)
- [ ] `tests/router.lease-creation.test.mjs` — LEASE-02 (persistent_goal_action gate, one_turn_action never)
- [ ] `tests/router.lease-inspect.test.mjs` — LEASE-03 (9-field inspection)
- [ ] `tests/router.lease-revoke.test.mjs` — LEASE-04 (revocation precedence, adversarial)
- [ ] `tests/router.lease-resume.test.mjs` — LEASE-05 (durable at-most-once across simulated restart)
- [ ] `tests/router.lease-briefing.test.mjs` — LEASE-06 (first-visit silent, one briefing, 8 invalid states)
- [ ] `src/lease/identity.mjs`, `src/lease/store.mjs`, `src/lease/policy.mjs`, `src/lease/briefing.mjs` — new modules
- [ ] Add the 4 new module names to `src/lifecycle/router-lifecycle.mjs` `moduleNames` + bump lifecycle test count

*(Framework install: none — `node:test` is built-in.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Leases are not user authentication; they are operator-authority delegation. |
| V3 Session Management | yes | Lease = bounded session: deterministic expiry, revocation, at-most-once. Standard control: lease record with `expiry.deterministic_at_ms` + `status: 'revoked'` + durable `claimed_actions`. |
| V4 Access Control | yes | LEASE-01/04: foreign/stale/revoked state cannot authorize. Standard control: per-runtime partition + fingerprint match check at every authority resolution; revocation precedence. |
| V5 Input Validation | yes | Lease goal is a short structured field, never raw prompt. `stableStringify` canonicalizes. `validateScope` (schema.mjs:90-98) validates scope enum. |
| V6 Cryptography | yes | `createHash('sha256')` for lease_id + project_fingerprint (never hand-roll). Atomic writes via `durableWrite` (fsync). |

### Known Threat Patterns for the Lease/Authority stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Foreign-project lease authorizing work | Spoofing / Elevation of privilege | LEASE-01 six-axis fingerprint; mismatch → `foreign` → no authority (Pitfall 3). |
| Stale lease (old schema generation) authorizing work | Tampering / Elevation of privilege | `freshness_evidence.fingerprint_match` + `schema_generation` axis; mismatch → rejected. |
| Revoked lease continuing to authorize (cached state) | Elevation of privilege | LEASE-04: lease store consulted BEFORE cache/weights/recommendations; revocation is a durable atomic flip (Pitfall: precedence). |
| Double-resume after compaction/restart | Tampering | LEASE-05: durable `claimed_actions` on the lease record; at-most-once enforced on disk, not in-memory (Pitfall 2). |
| Lease bypassing protected-effect confirmation | Elevation of privilege | Lease sets `authGranted`, never `protected_=false`; AUTH-05 leg 2 still fires (Pitfall 1). |
| Raw prompt text leaking into lease record | Information disclosure | Goal is a short structured field; prompt-derived fields use `hashPromptDerived` (redact-then-hash) (Pitfall 5). |
| Lease module deployed to one runtime only | Tampering | `moduleValues` flatMap over `[ownedRoot, codexOwnedRoot]` (T-39-03 regression pattern) (Pitfall 6). |

## Sources

### Primary (HIGH confidence)
- `src/intent/authority.mjs` (read directly this session) — 5-class taxonomy, `persistent_goal_action`, sealed-input `evaluateAuthorityPolicy`, `PROTECTED_EFFECT_TOKENS`, `PERSISTENT_GOAL_MARKERS`.
- `src/intent/classify.mjs` (read directly) — 8-disposition intent classifier feeding authority.
- `src/registry/fingerprint.mjs` (read directly) — `computeCompositeEpoch` content-addressed fingerprint pattern.
- `src/registry/identity.mjs` (read directly) — `scopeSuffix` encoding `@{kind}:{repository}:{worktree}`.
- `src/registry/schema.mjs` (read directly) — `SCOPES = ['global','user','project','worktree']`, `validateScope`.
- `src/adapters/dispatch/claude.mjs` (read directly) — `dispatch-lease.json` marker, `claimIdempotency`/`releaseIdempotency`, `pauseImpl`/`resumeImpl`, `deriveReceiptStrings`.
- `src/adapters/dispatch/receipt.mjs` (read directly) — atomic `publishAtomic`, `append`, `read`, `ReceiptStore`, `redact`/`hashPromptDerived`.
- `src/steward/state.mjs` (read directly) — `mutationLock`, `durableWrite`, cooldown/dismiss/snooze.
- `src/steward/startup-pointer.mjs` (read directly) — `compileStartupPointer`/`loadStartupPointer` cooldown pattern, size bound.
- `src/orchestrator/approval.mjs` (read directly) — `bindApproval`/`verifyApproval` fail-closed token pattern.
- `src/runtime/router.mjs` (read directly, lines 1-1874) — `detectRuntime`, `RUNTIME`, `DISPATCH_LEASE_MARKER`, `evaluateAuthorityHint`, `checkFreshness`, fail-open contract.
- `src/lifecycle/router-lifecycle.mjs` (read directly) — `moduleNames` deploy list, `moduleValues` flatMap over both runtime roots, atomic generation switch.
- `.planning/REQUIREMENTS.md` (read directly) — LEASE-01..06 verbatim, Out-of-Scope table.
- `.planning/phases/39-intent-authority-risk-and-invocation-policy/39-SECURITY.md` (read directly) — threat-register + ASVS pattern established by Phase 39.
- `.claude/CLAUDE.md` (project instructions, in context) — stdlib-only constraint, fail-open, no-raw-prompt, per-runtime partition, <100ms budget.

### Secondary (MEDIUM confidence)
- `.planning/phases/39-intent-authority-risk-and-invocation-policy/39-VALIDATION.md` — test-framework + sampling pattern established by Phase 39.

### Tertiary (LOW confidence)
- None. No external sources consulted (all search providers disabled in config; this is an internal design problem with established patterns).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — stdlib-only, no external packages, established by CLAUDE.md hard constraint and confirmed by `node --version`.
- Architecture: HIGH — every pattern (atomic write, fingerprint, mutation lock, sealed policy, per-runtime partition, receipt store, steward cooldown) read directly from source this session with verbatim quotes.
- Pitfalls: HIGH — derived from the requirements' explicit constraints (LEASE-01 six-axis binding, LEASE-04 revocation precedence, LEASE-05 at-most-once across restart, LEASE-06 eight invalid states) and from the existing T-39-xx threat register.

**Research date:** 2026-08-07
**Valid until:** 2026-09-06 (stable — internal design; no fast-moving external dependencies). The graph was built at commit `3e0c0da`, 1 commit behind `e92062b` (current) — treat semantic relationships as approximate but the directly-read source files are current.