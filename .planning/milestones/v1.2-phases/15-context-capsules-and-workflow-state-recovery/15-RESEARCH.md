# Phase 15: Context Capsules and Workflow-State Recovery - Research

**Researched:** 2026-07-16
**Domain:** Bounded local workflow-state persistence, authoritative-state reconciliation, and deterministic referential-prompt recovery
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Capsule contents and bounds

- **D-01:** Use a versioned, deterministic structured capsule with stable workflow identity, active goal summary, current workflow/phase/step, status, bounded artifact references, blocker summaries, freshness metadata, and provenance. Store references and compact facts, never raw prompts, full documents, transcripts, secrets, credentials, or arbitrary tool output.
- **D-02:** Treat the capsule as a resumability index, not a second source of truth. Every artifact entry carries a relative path or stable identifier, a compact type/status, and a freshness witness such as mtime, content fingerprint, version, or generation marker; full artifact contents remain at their authoritative location.
- **D-03:** Enforce explicit per-field and total size/count limits. Use deterministic truncation with a machine-readable `truncated`/`omitted_count` signal; never silently spill into unbounded history. Prefer the newest unresolved blockers and the artifacts needed for the next step.
- **D-04:** Persist one local capsule per project/workspace scope using schema validation and atomic replace. Preserve a last-known-good capsule only for recovery from a torn/corrupt write; retention is small and bounded rather than an event history.

### Workflow identity and ambiguity

- **D-05:** A workflow is uniquely resumable only when stable project/workspace scope, workflow kind, active goal identity, phase/plan/task position, and current status resolve to exactly one valid next action. Human-readable labels alone are not sufficient identity.
- **D-06:** Referential prompts such as `continue`, `finish it`, and `use the design` may resume automatically only when capsule evidence and authoritative state converge on one eligible workflow. Resolution must be deterministic and explainable with source precedence and a reason code.
- **D-07:** If zero or multiple eligible workflows remain after bounded reconciliation, do not guess. Ask exactly one focused question that names the smallest distinguishing choice; do not request the user to restate already-known context.
- **D-08:** Resume semantics follow the workflow state: `continue` advances the next incomplete valid step, `finish it` selects the remaining terminal work of the uniquely active workflow, and `use the design` requires one uniquely referenced design artifact connected to that workflow. These phrases do not broaden authorization or revive completed/abandoned work.

### Freshness and recovery

- **D-09:** Validate schema version, required identities, enum/state transitions, bounds, artifact reference safety, and freshness witnesses before trusting a capsule. Parse or validation failure marks the capsule corrupt; mismatched witnesses, superseded status, or changed authoritative artifacts mark it stale.
- **D-10:** Refresh from a bounded precedence chain: explicit current instruction, live execution/workflow state, authoritative phase/project state and referenced artifacts, then the last valid capsule as a hint. The capsule never overrides newer authoritative state.
- **D-11:** Rebuild only the fields needed to identify the next workflow action and rewrite the capsule atomically. Missing optional sources degrade with structured diagnostics; missing/conflicting identity-critical sources yield a focused question rather than speculative recovery.
- **D-12:** Recovery is read-bounded and local: targeted state/artifact summaries and fingerprints are allowed, but no full planning-directory scan, complete design-document load, conversation-history replay, network classifier, or background model call is required on the prompt hot path.

### Explicit override behavior

- **D-13:** A new explicit instruction has highest precedence over capsule intent whenever it names a different goal, phase, workflow, artifact, or requested action. The router follows the new instruction and updates/replaces the active capsule rather than trying to reconcile it into the stale workflow.
- **D-14:** Preserve displaced state only as a bounded supersession reference (previous workflow identity, status, and reason), sufficient for diagnostics or deliberate return. Do not merge incompatible goals or retain the prior raw request.
- **D-15:** An explicit instruction that changes scope or target but lacks one material discriminator asks one focused clarification. Safe read-only validation may run first; no state-changing workflow step is dispatched until the conflict is resolved.
- **D-16:** Completion, cancellation, and supersession are terminal capsule states. Minimal continuation must not reopen them unless the user explicitly identifies that prior workflow; otherwise the resolver uses the current uniquely active workflow or asks the focused question.

### the agent's Discretion

- Exact module boundaries, filenames, JSON field names, schema-version representation, byte/count thresholds, reason-code vocabulary, and last-known-good retention count, provided they preserve D-01 through D-16 and are covered by deterministic tests.
- Exact focused-question wording and compact diagnostic format, provided only one material distinction is requested and no raw prompt content is persisted.

### Deferred Ideas (OUT OF SCOPE)

- Cross-machine capsule synchronization remains a future requirement.
- Workflow-first capability selection and declared context-budget enforcement remain Phase 16 scope.
- Shared multi-user policy and approval workflows remain out of scope for v1.2.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CTX-01 | Context capsules persist the active goal, workflow position, artifacts, blockers, and freshness without raw prompt history. | Versioned canonical schema, field/entry/byte bounds, privacy allowlist, relative-reference validation, freshness witnesses, and atomic last-known-good persistence. |
| CTX-02 | Minimal prompts such as `continue` resume a uniquely identifiable workflow without restating context. | Stable composite workflow identity, authoritative reconciliation, phrase-specific transition semantics, uniqueness gate, focused-question fallback, and reason-coded outcomes. |
| ORC-02 | Explicit user instructions override stale or conflicting capsule state. | Explicit-first precedence, conflict classification, bounded supersession metadata, terminal-state protection, and no-dispatch clarification for materially incomplete overrides. |
</phase_requirements>

## Summary

Phase 15 should extend the existing deterministic registry control-plane idioms rather than invent a second persistence or reconciliation architecture. The repository already has stable canonical serialization, SHA-256 fingerprints, portable-path validation, structured verdicts, immutable/atomic persistence, last-known-good recovery, and JSON-first CLI conventions in `src/registry/`. [VERIFIED: repository inspection] The approved design and implementation contract already divide this phase into capsule schema/persistence, bounded authoritative sources, and resume/refresh behavior. [VERIFIED: `docs/superpowers/specs/2026-07-14-dual-runtime-auto-updating-router-design.md`; `docs/superpowers/plans/2026-07-14-dual-runtime-auto-updating-router-implementation.md`]

The central design rule is that the capsule is an index and cache of resumability evidence, never workflow truth. Planning should make every automatic resume pass through four gates: capsule validity, witness freshness, authoritative identity reconciliation, and exactly-one eligible next action. Any gate failure must either refresh only the necessary fields or return one focused clarification; it must never broaden authorization, revive terminal work, or persist the triggering prompt. [VERIFIED: Phase 15 CONTEXT.md D-01 through D-16]

No new external dependency is justified. Node's standard library already supplies JSON parsing, hashing, path normalization/containment, bounded file reads, durable writes, fsync, and atomic rename, and the repository has working implementations of these patterns. [VERIFIED: repository inspection] Keep Phase 15 below the workflow-first capability-selection boundary: it may identify a canonical next workflow action and explain why, but selection of skills, agents, MCPs, tools, and declared context budgets belongs to Phase 16. [VERIFIED: ROADMAP.md Phase 15/16 boundaries]

**Primary recommendation:** Implement a small `src/context/` subsystem with a canonical capsule module and targeted source adapters, then expose one pure deterministic resolver whose outputs are `resume`, `clarify`, `override`, `refresh`, or `none`, each with stable reason codes and bounded evidence.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Capsule schema, validation, canonicalization, and bounds | API / Backend (local control plane) | Database / Storage | Business rules determine trusted shape; local storage only persists validated canonical bytes. |
| Atomic capsule persistence and last-known-good recovery | Database / Storage (local filesystem) | API / Backend | Crash safety and retention are storage concerns driven by control-plane policy. |
| Authoritative state readers and freshness witnesses | API / Backend (local control plane) | Database / Storage | Targeted adapters interpret GSD, git, execution, and artifact state without recursively ingesting it. |
| Referential-prompt resolution and explicit override | API / Backend (router control plane) | — | Deterministic precedence and workflow eligibility are routing-domain logic, not filesystem logic. |
| `router context`, `context refresh`, and `why-next` | CLI / Client | API / Backend | CLI formats stable resolver/persistence outputs; core modules own behavior. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js standard library (`node:fs`, `node:path`, `node:crypto`) | Existing project runtime | Bounded reads, safe paths, hashing, durable atomic writes | Already used by registry modules; preserves the zero-dependency lightweight contract. [VERIFIED: repository inspection] |
| Repository canonicalization primitives (`stableStringify`, `contentFingerprint`) | Current source | Byte-stable records and freshness/identity witnesses | Existing deterministic formats reduce drift across registry and context state. [VERIFIED: `src/registry/schema.mjs`; `src/registry/identity.mjs`] |
| `node:test` + `node:assert/strict` | Existing runtime | Unit and integration verification | All existing focused suites use native Node tests; no framework installation is needed. [VERIFIED: repository inspection] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/registry/activate.mjs` patterns | Current source | Durable staging, fsync, atomic rename, recovery, retention | Adapt its mechanics, but keep capsule storage distinct from immutable registry version bundles. [VERIFIED: repository inspection] |
| `src/registry/reconcile.mjs` verdict patterns | Current source | Stable reason codes, bounded evidence, corrective actions | Use for stale/corrupt/conflict/ambiguity diagnostics and explainability. [VERIFIED: repository inspection] |
| `src/registry/map.mjs` precedence patterns | Current source | Explicit-first deterministic resolution and conflict non-dispatchability | Reuse the pattern, not capability mapping itself, for capsule-vs-authority resolution. [VERIFIED: repository inspection] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Canonical JSON | YAML/TOML or a database | Adds parsing/dependency/state complexity with no requirement benefit; JSON matches existing control-plane state. |
| One active capsule plus bounded LKG | Event sourcing or transcript replay | Violates boundedness/privacy and makes recovery depend on history rather than current authority. |
| Targeted source adapters | Recursive `.planning/` scan | Easier discovery but violates D-12 and creates hot-path latency/token risk. |

**Installation:** None. No external packages should be added.

## Package Legitimacy Audit

Not applicable: Phase 15 should install no external packages. [VERIFIED: repository capabilities and approved implementation contract]

## Architecture Patterns

### System Architecture Diagram

```text
current prompt + stable workspace scope
                 |
                 v
       explicit-intent classifier (bounded lexical forms)
                 |
      +----------+-----------+
      | explicit target?     | referential continuation?
      v                      v
explicit override      load active capsule (bounded)
      |                      |
      |                validate schema/privacy/bounds
      |                      |
      |              fresh? -+-- no --> targeted refresh
      |                      |             |
      +----------------------+-------------+
                             v
              reconcile with authoritative adapters
             (live execution > project/phase > artifact)
                             |
                   eligible next actions
                             |
               +-------------+-------------+
               | exactly one | zero / multiple
               v             v
          resume outcome   one focused question
               |
        atomically persist refreshed/superseding capsule
```

### Recommended Project Structure

```text
src/
├── context/
│   ├── capsule.mjs       # schema, canonicalization, privacy bounds, load/save/freshness
│   ├── sources.mjs       # targeted authoritative state adapters and witnesses
│   └── resolve.mjs       # pure precedence, uniqueness, phrase semantics, diagnostics
└── cli/
    └── router-control.mjs # context/status/refresh/why-next presentation and exit codes
tests/
├── router.context-capsule.test.mjs
├── router.context-sources.test.mjs
└── router.context-resume.test.mjs
```

Keeping `resolve.mjs` separate is a research recommendation within planner discretion: it prevents persistence/parsing side effects from contaminating deterministic eligibility tests and avoids overloading `capsule.mjs` with orchestration policy. [VERIFIED: existing repository favors focused pure registry modules]

### Pattern 1: Validate, canonicalize, then persist

**What:** Construct a candidate capsule, reject forbidden/unsafe fields and invalid transitions, deterministically bound/canonicalize it, compute its fingerprint, write a complete temporary file with mode `0600`, fsync, then atomically replace the active file. Preserve at most a small bounded LKG file.

**When to use:** Every capsule creation, refresh, status transition, or explicit supersession.

```javascript
// Source: repository patterns in src/registry/schema.mjs and src/registry/activate.mjs
const canonical = canonicalizeCapsule(validateCapsule(candidate));
const bytes = `${stableStringify(canonical)}\n`;
writeDurableTemporary(tempPath, bytes, 0o600);
renameSync(tempPath, activePath);
```

### Pattern 2: Allowlisted persistence with deterministic bounds

**What:** Build persisted output from an explicit field allowlist, not by deleting known sensitive keys from arbitrary input. Apply field limits before total-byte enforcement; sort set-like collections before selecting/truncating; record `truncated` and `omitted_count` alongside each bounded collection.

**When to use:** Goal summary, blockers, artifact references, diagnostics, provenance, supersession, and next-action candidates.

**Why:** A denylist can miss novel prompt/tool-output keys, while an allowlist makes CTX-01 auditable and stable. [VERIFIED: Phase 15 privacy constraints; repository portable-output patterns]

### Pattern 3: Witness-based freshness, not age alone

**What:** Each authoritative source returns a compact value plus a witness (`mtime_ms` plus size where adequate, or canonical content fingerprint/version/generation marker where identity-critical). Freshness compares stored witnesses to freshly probed targeted sources. `updated_at` is diagnostic metadata, not proof of truth.

**When to use:** STATE/ROADMAP status, design/spec/plan artifact references, execution checkpoint, and stable project/workspace identity.

### Pattern 4: Pure resolution with explicit outcome algebra

**What:** Make resolver input/output serializable and side-effect-free. Recommended outcomes are:

- `resume`: one eligible next action and supporting witnesses;
- `override`: explicit current instruction displaced capsule intent;
- `refresh`: capsule was stale/corrupt and authoritative state uniquely rebuilt it;
- `clarify`: zero/multiple candidates or a material discriminator is missing;
- `none`: no active resumable workflow.

Each outcome should include stable `reason_code`, bounded evidence, and `dispatchable`; only `resume`/fully specified `override` may be dispatchable.

### Pattern 5: Targeted authoritative adapters

**What:** Give each source reader an explicit file/path, byte ceiling, allowed headings/keys, and structured missing/malformed result. Compose source results in D-10 precedence order rather than letting readers merge state themselves.

**When to use:** `.planning/STATE.md`, `.planning/ROADMAP.md`, the active phase's exact artifacts, execution checkpoint files, and git branch/dirty summaries.

### Anti-Patterns to Avoid

- **Persisting sanitized prompts:** Even redacted prompt text is still raw prompt history; derive bounded structured facts before persistence.
- **Capsule-wins merge:** A capsule is a hint/cache and must never overwrite newer live or authoritative status.
- **Timestamp-only freshness:** A recent capsule can already be stale after an artifact or phase transition.
- **Recursive recovery scan:** Do not use globbing over all `.planning/` content on the prompt path.
- **Label-only identity:** Phase names, artifact basenames, and goal prose cannot uniquely prove continuity.
- **Resolver-side dispatch:** Phase 15 resolves the next workflow action but must not select Phase 16 capabilities or perform state-changing work.
- **Silent truncation:** Every omission must be machine-readable and deterministic.
- **Multiple clarification questions:** Reduce ambiguity to the smallest material discriminator and ask exactly one question.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cryptographic freshness fingerprints | Custom checksum | `node:crypto` SHA-256 and existing `contentFingerprint` | Existing deterministic, collision-resistant project primitive. |
| Canonical JSON serialization | Ad hoc `JSON.stringify` over insertion-ordered objects | Existing `stableStringify`/canonicalization pattern | Equivalent input must produce byte-stable capsules and fingerprints. |
| Crash-safe replacement | In-place overwrite | Temporary durable write + fsync + `renameSync` | Prevents torn active state; mirrors proven activation behavior. |
| Path containment | Prefix/string checks | `node:path` normalization plus explicit absolute/traversal rejection | Avoids `..`, separator, and platform-path escape errors. |
| Workflow history store | Transcript/event database | One bounded current capsule plus LKG | Meets privacy and bounded-retention constraints. |
| General natural-language intent model | Prompt-time classifier/model call | Explicit phrase/action forms plus stable identity and authoritative state | Required deterministic local behavior; model-based workflow selection is out of scope. |

**Key insight:** The hard part is not storage; it is proving that stale cached evidence and current authority converge on one safe workflow transition. Keep persistence boring and make reconciliation explicit and testable.

## Common Pitfalls

### Pitfall 1: Conflating capsule validity with freshness
**What goes wrong:** A schema-valid capsule is resumed after phase/artifact/execution state changed.
**Why it happens:** Validation checks shape while freshness checks external witnesses; they are distinct gates.
**How to avoid:** Return separate `validity_status` and `freshness_status`, and require both before automatic resume.
**Warning signs:** `updated_at` is the only freshness input or stale fixtures still resolve to `resume`.

### Pitfall 2: Refresh becoming an unbounded discovery pass
**What goes wrong:** Recovery scans all planning artifacts to compensate for incomplete capsule identity.
**Why it happens:** Broad discovery is simpler than defining source contracts.
**How to avoid:** Derive exact source paths from stable workspace/workflow/phase identity; cap bytes and entries per adapter; clarify when identity-critical paths cannot be derived.
**Warning signs:** recursive `readdir`, glob, or full-document reads in `src/context/sources.mjs`.

### Pitfall 3: Explicit override merged into the old goal
**What goes wrong:** A new goal inherits blockers/artifacts from the displaced workflow.
**Why it happens:** Generic deep merge treats all fields as compatible.
**How to avoid:** Explicit identity conflict creates a new active identity and only a bounded supersession reference to the old state.
**Warning signs:** old artifact IDs remain active after goal/workflow replacement.

### Pitfall 4: Resuming terminal work
**What goes wrong:** `continue` revives complete, cancelled, abandoned, or superseded work.
**Why it happens:** Resolver checks for a capsule but not eligible status transitions.
**How to avoid:** Encode terminal status in validation and candidate eligibility; require explicit prior-workflow identification to reopen.
**Warning signs:** terminal fixtures produce a dispatchable action.

### Pitfall 5: `use the design` accepts basename coincidence
**What goes wrong:** Multiple designs or a stale path are resolved by a human label.
**Why it happens:** Artifact labels are treated as identity.
**How to avoid:** Require exactly one workflow-connected design reference with a safe relative path and matching witness.
**Warning signs:** resolver succeeds without checking artifact type, workflow link, and fingerprint/mtime witness.

### Pitfall 6: Privacy assertions only inspect happy-path output
**What goes wrong:** Raw text leaks through validation errors, diagnostics, LKG, CLI JSON, or corrupt-recovery paths.
**Why it happens:** Tests check only the canonical capsule.
**How to avoid:** Seed unique canary secrets/raw prompts/tool output into every input and assert absence across active/LKG bytes, outcomes, exceptions, and CLI stdout/stderr.
**Warning signs:** generic error serialization includes source values.

### Pitfall 7: Atomic rename without durability or containment
**What goes wrong:** Power loss loses the supposedly saved capsule, or a symlink/path escape redirects writes.
**Why it happens:** `rename` is treated as the whole atomic-write protocol.
**How to avoid:** Validate owned-root containment, reject symlinked targets, use restricted modes, fsync the file and containing directory where supported, and recover from LKG on malformed/torn state.
**Warning signs:** direct `writeFileSync(activePath, ...)` or caller-provided absolute capsule paths.

## Code Examples

### Safe relative artifact reference

```javascript
// Source: repository pattern in src/registry/schema.mjs
function normalizeArtifactRef(value) {
  if (typeof value !== 'string' || value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) {
    throw new TypeError('artifact path must be project-relative');
  }
  const normalized = posix.normalize(value.replaceAll('\\', '/'));
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new TypeError('artifact path must remain within project scope');
  }
  return normalized;
}
```

### Deterministic uniqueness gate

```javascript
// Source: derived from Phase 15 D-05 through D-08 and existing deterministic map patterns
const eligible = candidates
  .filter(candidate => candidate.authoritative && candidate.transition_valid)
  .sort((a, b) => a.workflow_id.localeCompare(b.workflow_id));

if (eligible.length !== 1) {
  return focusedClarification(eligible, eligible.length ? 'multiple_eligible' : 'no_eligible');
}
return { outcome: 'resume', dispatchable: true, action: eligible[0].next_action };
```

### Bounded source read contract

```javascript
// Source: Phase 15 D-11/D-12; use project-standard node:fs primitives
function readBounded(path, maxBytes) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) {
    return { status: 'unavailable', reason_code: 'source_out_of_bounds' };
  }
  return { status: 'available', bytes: readFileSync(path), witness: { mtime_ms: stat.mtimeMs, size: stat.size } };
}
```

## State of the Art

| Old Approach | Current Project Approach | When Changed | Impact |
|--------------|--------------------------|--------------|--------|
| Prompt/history replay for continuity | Structured bounded capsule plus authoritative source witnesses | Approved v1.2 design, 2026-07-14 | Privacy-safe deterministic recovery without full-history injection. |
| Cached state as truth | Cached capsule as resumability index/hint | Phase 15 locked context, 2026-07-16 | Stale state cannot override live/project authority. |
| Best-effort ambiguous continuation | Exactly-one eligibility or one focused question | Phase 15 locked context, 2026-07-16 | Prevents speculative dispatch and authorization broadening. |
| In-place mutable state writes | Durable atomic replace with bounded LKG | Proven in Phase 14 and inherited by Phase 15 | Corrupt/torn state can recover without exposing partial bytes. |

**Deprecated/outdated:**
- The earlier design sketch included `conversation_id` and “recent conversation intent”; Phase 15's locked contract is stricter: one project/workspace capsule and no raw conversation/history replay. A thread identifier may be used only if it is a stable bounded identity and does not create transcript retention. [VERIFIED: approved design compared with Phase 15 CONTEXT.md]
- The implementation-plan sketch placed resume behavior mostly in `capsule.mjs`; separating a pure resolver is preferable now that D-05 through D-16 define substantial transition/override policy. [VERIFIED: codebase modularity and locked context]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | None. Recommendations are derived from current repository code and locked project artifacts. | — | — |

## Open Questions (RESOLVED)

1. **Numeric capsule bounds and active/LKG retention - RESOLVED**
   - Adopted decision: Plan 15-01 Task 1 makes every per-field, count, and total-byte ceiling an explicit exported constant in `src/context/capsule.mjs`; the executable boundary values are fixed by the Task 1 CTX-01 tests for exact-limit, over-limit, multibyte UTF-8, and permutation-stable truncation behavior. The plan deliberately does not embed duplicate numeric literals in planning prose: the exported constants and their tests are the single executable numeric contract. Plan 15-01 Task 2 fixes retention exactly at **one active capsule and one LKG capsule** under the owned workspace root, with no event archive or additional history. [VERIFIED: `15-01-PLAN.md` Tasks 1-2]

2. **Authoritative checkpoint/source formats - RESOLVED**
   - Adopted decision: Plan 15-02 Task 1 accepts only exact, caller-derived paths for `.planning/STATE.md`, `.planning/ROADMAP.md`, the exact active phase artifact, the exact execution/checkpoint state, and one uniquely referenced design artifact. Readers extract only approved headings/keys and return `{status, reason_code, value?, witness?}` with mtime/size or canonical SHA-256/version/generation witnesses; there is no directory recursion or basename search. Local git authority is restricted to `git symbolic-ref --short -q HEAD` and `git status --porcelain=v1 -uno`, projected to branch identity and bounded dirty count/category facts without filenames or diff bodies. Unknown, missing, malformed, unsafe, or oversized identity-critical forms remain reason-coded and non-dispatchable rather than being guessed. [VERIFIED: `15-02-PLAN.md` Task 1]

3. **CLI and command naming - RESOLVED**
   - Adopted decision: Plan 15-03 Task 2 extends the existing `src/cli/router-control.mjs` controller with the JSON-first routes **`context`** (status/inspection), **`context refresh`** (the capsule-mutating refresh route), **`context resolve`** (deterministic resolution), and top-level **`why-next`** (read-only explanation). These preserve existing argument parsing, JSON/text envelope, stderr, and exit-code conventions; only uniquely resolved refresh/override outcomes may atomically save, while clarification/none outcomes do not mutate or dispatch. [VERIFIED: `15-03-PLAN.md` Task 2 and plan artifacts]

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified). Phase 15 is a local Node.js code/config change using the existing runtime and standard library.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Native `node:test` with `node:assert/strict` |
| Config file | None; repository uses direct `node --test` commands |
| Quick run command | `node --test tests/router.context-capsule.test.mjs tests/router.context-sources.test.mjs tests/router.context-resume.test.mjs` |
| Full suite command | `node --test tests/*.test.mjs` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CTX-01 | Bounded privacy-safe schema, safe references, witnesses, deterministic truncation, atomic save/LKG corrupt recovery | unit + filesystem integration | `node --test tests/router.context-capsule.test.mjs` | No - Wave 0 |
| CTX-02 | `continue`, `finish it`, and `use the design` resolve exactly one valid action or one focused question | unit + integration | `node --test tests/router.context-resume.test.mjs` | No - Wave 0 |
| ORC-02 | Explicit target/action wins over stale/conflicting capsule without merging goals; incomplete conflict does not dispatch | unit + integration | `node --test tests/router.context-resume.test.mjs` | No - Wave 0 |
| CTX-01/02 | Targeted STATE/ROADMAP/artifact/execution readers obey byte/entry budgets and report missing/malformed/stale witnesses | unit + filesystem integration | `node --test tests/router.context-sources.test.mjs` | No - Wave 0 |

### Sampling Rate

- **Per task commit:** Run the focused test file changed by that task.
- **Per wave merge:** `node --test tests/router.context-*.test.mjs tests/router.registry-activate.test.mjs tests/router.control-cli.test.mjs`
- **Phase gate:** `node --test tests/*.test.mjs` plus static privacy scan for forbidden capsule keys and broad prompt-path reads.

### Wave 0 Gaps

- [ ] `tests/router.context-capsule.test.mjs` - CTX-01 schema/privacy/persistence boundary fixtures.
- [ ] `tests/router.context-sources.test.mjs` - bounded authoritative-source and witness fixtures.
- [ ] `tests/router.context-resume.test.mjs` - CTX-02 and ORC-02 transition/override/ambiguity matrix.
- [ ] Shared fixture helpers for temporary owned roots, exact GSD state files, design references, corrupt capsules, and canary secrets (may remain local to test files if small).

### Required Matrix Beyond Happy Paths

- Equivalent input in different object/entry order yields identical bytes and fingerprint.
- Every field at limit, over limit, and multibyte UTF-8 limit.
- Absolute, traversal, backslash, symlink, missing, oversized, and changed artifact references.
- Active, waiting, blocked, complete, cancelled, abandoned, and superseded statuses.
- Fresh, stale, corrupt, schema-unknown, torn-write, missing-active, and valid-LKG cases.
- Explicit same-workflow instruction, explicit different workflow/goal/phase/artifact, incomplete override, and referential-only prompt.
- Zero, one, and multiple eligible workflows; zero, one, and multiple linked design artifacts.
- Canary raw prompt, transcript, secret, credential, tool output, and full document body absent from active/LKG/CLI/error bytes.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Local project-scoped state; no authentication boundary added in this phase. |
| V3 Session Management | No | Capsule lifecycle is workflow state, not an authenticated session. |
| V4 Access Control | Yes | Explicit instruction cannot broaden authority; only validated project-owned paths and non-dispatching ambiguous outcomes. |
| V5 Input Validation | Yes | Strict versioned schema, enums, bounds, portable relative paths, transition validation, and allowlisted persisted fields. |
| V6 Cryptography | Yes (integrity witness only) | Standard-library SHA-256 fingerprints; no custom cryptography and no claim of hostile-storage authenticity. |

### Known Threat Patterns for Node.js local state

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal or absolute artifact escape | Tampering / Information Disclosure | Normalize portable relative paths, reject absolute/`..`, bind reads to stable project root. |
| Symlink redirection during read/write | Tampering / Information Disclosure | `lstat`, reject symlink payload/target, operate under owned root, revalidate before mutation. |
| Torn or partial capsule write | Tampering / Denial of Service | Durable temporary write, fsync, atomic rename, validate active then bounded LKG recovery. |
| Raw prompt/secret leakage via diagnostics or backups | Information Disclosure | Persist from allowlist, bounded structured errors, canary non-leakage tests across all surfaces. |
| Stale capsule dispatch | Spoofing / Elevation of Privilege | Authoritative witness reconciliation and exactly-one eligibility before dispatchable outcome. |
| Explicit instruction merged with stale authority | Elevation of Privilege | Explicit-first replacement/supersession semantics; no state-changing dispatch while material target is unresolved. |
| Malicious/oversized local state | Denial of Service | Pre-read stat ceilings, bounded parsers/collections, no recursive scan or network/model fallback. |

## Sources

### Primary (HIGH confidence)

- `15-CONTEXT.md` - D-01 through D-16, planner discretion, phase boundary, and deferred scope. [VERIFIED: repository inspection]
- `.planning/REQUIREMENTS.md` - CTX-01, CTX-02, ORC-02, privacy prohibition. [VERIFIED: repository inspection]
- `.planning/ROADMAP.md` - Phase 15 success criteria and Phase 16 boundary. [VERIFIED: repository inspection]
- `docs/superpowers/specs/2026-07-14-dual-runtime-auto-updating-router-design.md` - context resolver, capsule, recovery, privacy, CLI, and orchestration contract. [VERIFIED: repository inspection]
- `docs/superpowers/plans/2026-07-14-dual-runtime-auto-updating-router-implementation.md` - three-slice Phase 15 implementation contract and intended files/tests. [VERIFIED: repository inspection]
- `src/registry/schema.mjs`, `identity.mjs`, `activate.mjs`, `map.mjs`, `reconcile.mjs` - current canonicalization, identity, atomic persistence, precedence, and verdict patterns. [VERIFIED: repository inspection]
- `tests/*.test.mjs` - existing native Node test infrastructure. [VERIFIED: repository inspection]

### Secondary (MEDIUM confidence)

- None required; this is a project-specific, standard-library phase with sufficient authoritative local contracts.

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - current source proves the required standard-library primitives and zero-dependency patterns.
- Architecture: HIGH - locked Phase 15 decisions and approved design/implementation contracts define responsibility and scope.
- Pitfalls: HIGH - derived directly from explicit failure behavior in D-01 through D-16 and proven Phase 14 safety patterns.

**Research date:** 2026-07-16
**Valid until:** 2026-08-15 (stable internal architecture; refresh if Phase 15 context or preceding control-plane modules change)
