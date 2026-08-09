# Phase 38: Cross-Runtime Native Feasibility - Research

**Researched:** 2026-08-06
**Domain:** Cross-runtime native host dispatch adapters + attributable observation (Claude Code and Codex)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
*(None — CONTEXT.md records no locked decisions.)*

### Claude's Discretion
> All implementation choices are at the agent's discretion. Use the ROADMAP goal, success criteria, and existing codebase conventions to guide decisions.

### Deferred Ideas (OUT OF SCOPE)
> None.

**Project constraints (from .claude/CLAUDE.md — binding for this phase):**
- Performance: Router hook must return within the `UserPromptSubmit` timeout and never delay prompt handling beyond ~100ms — fail-open, never block.
- Coexistence: Must not break existing `~/.claude/settings.json` hook bindings (gsd + context-mode + caveman) or ralph-loop's Stop-hook.
- Stdlib-only: Node.js stdlib only (`node:crypto`, `node:fs`, `node:path`, `node:os`, `node:child_process`). No npm dependencies, no native modules.
- File writes: Hook is read-only w.r.t. user code; it may persist only its own data files (cache, telemetry, weights, receipts).
- Fail-open: On any exception, pass through the original prompt unchanged. Never `decision: "block"`, never exit 2.
- Deny rules: No `.env`/secret paths in mode-map entries.
- No daemon: Independent autonomous execution daemon is out of scope (v1.6 Non-Goal).
- No prompt-path mutation/scanning/hashing/network/API/LLM/learning (HOST-04 + v1.6 Non-Goals).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HOST-01 | An operator can authorize a harmless local action in Claude Code and observe one real native invocation plus its attributable completion evidence; injected recommendation text alone does not pass. | §Architecture Patterns (Native Dispatch Adapter), §Code Examples (spawn+receipt), §Validation Architecture (anti-cheat test) |
| HOST-02 | An operator can authorize a harmless local action in Codex and observe one real native invocation plus its attributable completion evidence; injected recommendation text alone does not pass. | Same as HOST-01 applied to the Codex adapter (§Environment Availability confirms `~/.codex/hooks.json` UserPromptSubmit binding) |
| HOST-03 | An operator receives equivalent intent, authority, risk, pause, resume, and receipt outcomes in both runtimes, while an incompatible adapter disables autonomous dispatch only for that runtime and preserves truthful recommendations. | §Architecture Patterns (Shared Adapter Contract, Recommendation-Only Fallback, Pause/Resume as router-internal state) |
| HOST-04 | Prompt routing remains read-only and fail-open at warm p95 <=25ms, p99 <=50ms, hard max <100ms; startup briefing remains p95 <=50ms; normal injection remains <=120 tokens; neither path performs scans, hashing, network/API/LLM calls, mutation, or learning. | §Architecture Patterns (Hot path vs dispatch path separation), §Validation Architecture (perf budget tests), §Code Examples (tokenCount + hrtime) |
</phase_requirements>

## Summary

Phase 38 is a hard feasibility gate. It must prove that each installed runtime (Claude Code and Codex) can **natively invoke** an authorized harmless action and **attributably observe** its completion — and that "recommendation text or a test helper alone cannot pass." Downstream phases (39-46) build authority, leases, receipts, and learning on top of this proven boundary; if it fails, the architecture blocks and requires redesign.

The v1.5 Router this phase extends is **recommendation-only**: `inspectDecision()` produces a route and `formatInjection()` emits model-readable text into `additionalContext` (verified — `router.mjs:2846` `export function formatInjection`, `router.mjs:3724-3731` `emit()`). The model reads the text and acts; the harness never auto-runs slashes. The existing adapters at `src/adapters/{claude,codex}.mjs` are **discovery adapters** — they parse artifacts (SKILL.md, plugin.json, config.toml, settings.json) into normalized records with a descriptive `native_invocation` field (`src/adapters/claude.mjs:449` `runtime_variants: [{ runtime, native_identity, native_invocation: nativeInvocation }]`) and a descriptive `compileInvocation` (`src/adapters/claude.mjs:488` `function compileInvocation(record) { return { runtime, command: record.invocation.command, args: [...] }; }`). There is **no real native invocation and no receipt** anywhere in the codebase today (confirmed via graph query — zero `receipt` / `native_invocation` nodes; `grep` finds only the descriptive field).

The official Claude Code hooks contract `[VERIFIED: code.claude.com/docs/en/hooks]` confirms the load-bearing feasibility constraint: **`UserPromptSubmit` cannot auto-dispatch a tool, agent, or skill** — the model decides. `additionalContext` (and plain stdout) are the only injection channels; both are model-readable text. The hook **can spawn subprocesses** (the command runs as a shell process; children can spawn). **No pause/resume mechanism is exposed to any hook.** Exit 2 erases the prompt.

Therefore the only mechanism available to Router for a **real host-native invocation** (something that actually happens on the host, attributable, not recommendation text) is a **subprocess spawned via `node:child_process`** by a router-owned adapter — off the prompt hot path (HOST-04 forbids prompt-path mutation). This is already an established pattern: `router.mjs` spawns the evolve worker fire-and-forget via `spawn().unref()` (the `bumpEvolveTrigger()` path). Both runtimes support it identically — both hooks are Node subprocesses that can spawn children. The "runtime-native" distinction is the **hook binding surface** (`~/.claude/settings.json` vs `~/.codex/hooks.json`, verified) and the **observation event surface**, not the dispatch mechanism.

**Primary recommendation:** Build a shared `NativeDispatchAdapter` contract with two implementations (Claude, Codex) that: (1) spawns a harmless fixture via `child_process.spawn` under an authorized lease, (2) captures a receipt binding `invocation_identity` (adapter id, pid, command, args, lease id, idempotency key) to `completion_evidence` (exit code, stdout sha256, wall time, artifact ref), (3) runs strictly OFF the prompt hot path (a router-owned worker or a PostToolUse-adjacent lifecycle hook), and (4) truthfully reports `recommendation_only` mode when it cannot prove native dispatch, never claiming an invocation that did not happen. Pause/resume is a router-internal durable state machine (no host pause primitive exists). The anti-cheat test property: a test that only runs a fixture or only checks recommendation text produces no router-issued invocation identity and no linked receipt → fails.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Prompt routing (read-only) | Hook (UserPromptSubmit) | — | Stays on the hot path; recommendation-only; HOST-04 forbids any mutation here. |
| Native dispatch (real invocation) | Adapter (off hot path) | Worker (spawn fire-and-forget) | A real subprocess spawn is the only host-native mechanism available to a hook; must run off the prompt path. |
| Attributable observation (receipt) | Adapter | Receipt store (`~/.{claude,codex}/router/receipts/`) | The adapter that spawns is the only entity that can link invocation identity to completion evidence. |
| Pause / resume | Adapter (router-internal state) | Receipt store | No host pause primitive exists; pause is a durable `paused` receipt + idempotency key, resume re-spawns with the same key. |
| Recommendation-only fallback | Adapter | Prompt hot path | When an adapter cannot prove native dispatch, it reports `recommendation_only` and the prompt path emits text only — never a fake invocation. |
| Startup briefing | Hook (SessionStart) | Compiled continuity | p95 <=50ms; reads bounded pre-compiled state only. |
| Performance/latency guard | Hook | Perf test | `process.hrtime.bigint()` + `ROUTER_DEBUG_LATENCY` (existing pattern). |
| Token budget | Hook | Token cap | `tokenCount()` chars/4 + `<=120` token injection cap (HOST-04). |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js (ESM `.mjs`) | v22.22.3 `[VERIFIED: /Users/guilherme/.hermes/node/bin/node --version]` | Hook runtime | Same absolute binary every existing hook uses (settings.json + `~/.codex/hooks.json` both invoke it). |
| `node:child_process` | built-in | Real native invocation (`spawn`/`fork`) | The ONLY mechanism a hook has to cause a real host-native process. Stdlib, no deps. |
| `node:crypto` | built-in | Receipt integrity (sha256 of stdout, command, idempotency key) | Already used for prompt signatures; stdlib, sub-ms. |
| `node:fs` | built-in | Receipt store atomic writes (temp+rename) | Atomic publish pattern already used for `cache.json`. |
| `node:path` / `node:os` | built-in | Portable `~/.{claude,codex}/router/receipts/` paths | `os.homedir()` — no hardcoding. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Existing `src/adapters/{claude,codex}.mjs` | v3 (claude-adapter/3, codex-adapter/3) | Discovery + identity plumbing; the new dispatch adapter extends their `native_invocation`/`runtime_variants` shape | Identity continuity — receipts must reference the same `native_identity` the discovery adapter already emits. |
| Existing `src/intent/classify.mjs` | intent-policy-v1 | Intent disposition for "equivalent intent" (HOST-03) | Phase 38 does NOT extend it (Phase 39 owns AUTH), but the feasibility test fixtures need a stable intent label. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `child_process.spawn` (fire-and-forget off hot path) | A router-owned daemon | **Rejected** — v1.6 Non-Goal: "No independent autonomous execution daemon." |
| Spawn from PostToolUse hook | Spawn from a dedicated worker | PostToolUse couples dispatch to the model's tool calls (still recommendation-driven); a worker triggered by an active lease is cleaner. Either is feasible; pick one in planning. |
| `additionalContext` as proof of dispatch | Real spawn + receipt | **Rejected by success criteria** — "recommendation text alone cannot pass." |
| Host-native pause/resume primitive | Router-internal durable state machine | No hook exposes pause/resume `[VERIFIED: code.claude.com/docs/en/hooks]`; router-internal is the only option. |

**Installation:**
```bash
# No npm install. Stdlib only. No new packages.
```

**Version verification:** No packages to verify — Node stdlib APIs (`child_process`, `crypto`, `fs`, `path`, `os`) are stable since Node 14/18 and confirmed present in v22.22.3.

## Package Legitimacy Audit

> No external packages are installed by this phase. Stdlib-only is a hard project constraint (.claude/CLAUDE.md). The audit is therefore empty.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| _(none)_ | — | — | — | — | — | Stdlib only |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```text
                          PROMPT HOT PATH (read-only, HOST-04)
  user prompt ──► UserPromptSubmit hook ──► inspectDecision() ──► formatInjection()
                        │                        │                      │
                        │                  (recommendation only)         ▼
                        │                        │              additionalContext (<=120 tokens)
                        │                        │              emit() to stdout
                        │                        │
                        │                  NO spawn, NO mutation, NO hash, NO network
                        │
                        └──[ fail-open on any throw: pass-through, exit 0, never block ]


                          DISPATCH PATH (off hot path; under active lease)
  active lease ──► NativeDispatchAdapter.{claude,codex} ──► child_process.spawn(fixture)
                          │                                     │
                          │                                     ▼
                          │                              real host process (pid)
                          │                                     │
                          │                                     ▼
                          │                              exit code + stdout + wall time
                          │                                     │
                          ◄─────────────────────────────────────┘
                          │
                          ▼
                   Receipt store (~/.{claude,codex}/router/receipts/*.json, atomic)
                   { invocation_identity ◄──► completion_evidence }
                          │
                          ▼
                   PostToolUse hook (observer) ──► correlates tool call to receipt
                          │
                          ▼
                   telemetry (existing) + receipt linkage


                          RECOMMENDATION-ONLY FALLBACK
  adapter cannot prove native dispatch ──► adapter reports `recommendation_only`
                          │
                          ▼
                  prompt path emits text only; NO receipt claims `invoked`
```

### Recommended Project Structure
```
src/
├── adapters/
│   ├── claude.mjs            # EXISTING discovery adapter — extend, do not rewrite
│   ├── codex.mjs             # EXISTING discovery adapter — extend, do not rewrite
│   └── dispatch/             # NEW: native dispatch + receipt adapters
│       ├── contract.mjs      #   shared NativeDispatchAdapter interface
│       ├── claude.mjs         #   Claude Code native dispatch impl (child_process spawn)
│       ├── codex.mjs          #   Codex native dispatch impl (child_process spawn)
│       └── receipt.mjs        #   receipt shape + atomic store + idempotency
└── runtime/
    └── router.mjs             # EXISTING hook — minimal change: wire dispatch trigger off hot path
tests/
├── router.dispatch-native.claude.test.mjs   # HOST-01 anti-cheat
├── router.dispatch-native.codex.test.mjs    # HOST-02 anti-cheat
├── router.dispatch-parity.test.mjs           # HOST-03 equivalence + fallback
└── router.dispatch-perf.test.mjs             # HOST-04 latency/token budgets
```

### Pattern 1: Native Dispatch Adapter (shared contract, two impls)
**What:** A typed adapter interface that performs a real host-native invocation (subprocess spawn) and returns a receipt. Both runtime impls satisfy the same contract so HOST-03 equivalence is structural.
**When to use:** Whenever Phase 38 must prove "real native invocation" that "recommendation text or a test helper alone cannot pass."
**Example shape (sketch — exact fields decided in planning):**
```typescript
// Source: design doc §Native host dispatch adapters + codebase adapter shape
// (src/adapters/claude.mjs:449 runtime_variants, :488 compileInvocation)
interface NativeDispatchAdapter {
  readonly runtime: 'claude' | 'codex';
  readonly adapterVersion: string;
  canDispatch(): { ok: boolean; reason?: string };           // probe; false → recommendation_only
  invoke(action: AuthorisedAction): Promise<Receipt>;        // spawns child_process; NEVER on prompt hot path
  observe(receiptId: string): CompletionEvidence;            // reads receipt + verifies postcondition
  pause(receiptId: string): Receipt;                          // router-internal: durable 'paused' state
  resume(receiptId: string): Promise<Receipt>;               // re-spawn with same idempotency key
}
interface Receipt {
  schema_version: 1;
  receipt_id: string;            // stable, sha256-derived
  invocation_identity: { adapter: string; runtime: string; pid?: number; command: string; args: string[]; lease_id: string; idempotency_key: string; spawned_at: string };
  completion_evidence: { exit_code?: number; stdout_sha256?: string; wall_ms?: number; artifact_ref?: string; state: 'pending'|'invoked'|'paused'|'completed'|'failed'|'recommendation_only' };
  intent: string; authority: string; risk: string;            // equivalence tuples (HOST-03)
  provenance: { adapter: string; source_fingerprint: string };
}
```

### Pattern 2: Recommendation-Only Fallback (truthful, not silent)
**What:** When `canDispatch()` returns `{ ok: false }`, the adapter records a receipt with `completion_evidence.state = 'recommendation_only'` and the prompt path emits text only — it NEVER claims `invoked`. This satisfies HOST-03's "an incompatible adapter disables autonomous dispatch only for that runtime and preserves truthful recommendations."
**When to use:** A runtime without a bound UserPromptSubmit hook, a sandbox blocking `child_process`, or a missing `installed.json` marker.
**Anti-pattern:** Silently downgrading to text without a receipt — the audit trail loses the decision. Always emit a `recommendation_only` receipt.

### Pattern 3: Pause/Resume as Router-Internal Durable State
**What:** No host hook exposes pause/resume `[VERIFIED: code.claude.com/docs/en/hooks]`. Pause = write a receipt with `state: 'paused'` + an idempotency key. Resume = re-spawn using the same idempotency key; the receipt store rejects a duplicate `invoked` state for the same key (idempotent checkpoint claim — this is the Phase 40 LEASE-05 primitive, but Phase 38 ships the minimal version).
**When to use:** The "pause on protected effect" fixture in success criterion 3.

### Anti-Patterns to Avoid
- **Recommendation text as proof of dispatch:** `additionalContext` is model-readable text; the model acting on it is NOT a router-caused invocation. The anti-cheat test must fail this. (Confirmed: `UserPromptSubmit` cannot auto-dispatch any tool `[VERIFIED: code.claude.com/docs/en/hooks]`.)
- **Spawn on the prompt hot path:** HOST-04 forbids mutation/scanning/hashing/network on the prompt path. The spawn must be off the hot path (worker, or fire-and-forget `unref()` like the existing `bumpEvolveTrigger` pattern — `router.mjs` already uses `spawn().unref()` for the evolve worker).
- **A test helper as proof:** A fixture that runs itself is not proof — the test must verify the ROUTER adapter issued the invocation identity and linked the completion evidence. The receipt must contain an adapter-issued `invocation_identity` no test helper can forge.
- **Daemon:** v1.6 Non-Goal. Dispatch is hook-triggered or worker-triggered, not a standing process.
- **Exit 2 or `decision: "block"`:** The router must never erase a user prompt `[VERIFIED: code.claude.com/docs/en/hooks]` + project constraint.
- **Cross-runtime cache/receipt sharing:** Receipts are partitioned by runtime (`~/.claude/router/receipts/` vs `~/.codex/router/receipts/`) — same isolation discipline as v1.5 telemetry/cache (PARITY-02).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomic receipt publish | Custom lock file | `writeFileSync(temp)` + `renameSync(temp, dest)` (existing `cache.json` pattern) | POSIX atomic rename; crash-safe. |
| Prompt signature / receipt integrity | Custom hash | `node:crypto` `createHash('sha256')` (already used for prompt sigs) | Stdlib, sub-ms, no deps. |
| Runtime detection | New probe | Existing `detectRuntime()` (`router.mjs:83-92`) — `ROUTER_RUNTIME` env + `process.argv[1]` `.codex/` check | Already shipped (PARITY-01), zero IO. |
| Token counting | Custom tokenizer | Existing `tokenCount()` (`router.mjs:2755-2758`: `Math.ceil(String(text||'').length/4)`) + `TOKEN_CAP` | Already shipped (INJ-06). |
| Latency measurement | Custom timer | `process.hrtime.bigint()` + `ROUTER_DEBUG_LATENCY=1` (existing `router.perf.test.mjs` pattern) | Already shipped. |
| Discovery / identity | Re-scan | Existing `src/adapters/{claude,codex}.mjs` `discover()` + `normalizeArtifact()` | The dispatch adapter references the discovery adapter's `native_identity` — do not duplicate. |
| Intent label | Re-classify | Existing `classifyIntent()` (`src/intent/classify.mjs`) — Phase 38 only needs a stable intent string for the receipt's `intent` field | Phase 39 owns AUTH; Phase 38 must not widen intent semantics. |

**Key insight:** Phase 38's net new surface is the **dispatch + receipt** layer. Everything else (discovery, identity, runtime detection, token budget, latency, atomic write) already exists and must be reused, not rebuilt.

## Runtime State Inventory

> This is a greenfield feature phase (new dispatch+receipt layer), not a rename/migration. But Phase 38 must NOT corrupt existing runtime state. Inventory of existing state the new dispatch path coexists with:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data (Claude) | `~/.claude/router/{cache.json, telemetry.jsonl, shadow-log.jsonl, shadow-state.json, calibration.json, weights.json, evolution-state.json, installed.json (via ~/.codex/router/installed.json marker)}` | None — new `receipts/` dir is additive; never write to these from dispatch. |
| Stored data (Codex) | `~/.codex/router/{cache.json, telemetry.jsonl, mode-map.json, installed.json}` | None — same isolation. `installed.json` confirmed: `{"schema_version":1,"managed_by":"claude-router","control_authority_root":"/Users/guilherme/.claude/router"}` `[VERIFIED: /Users/guilherme/.codex/router/installed.json]` |
| Live service config (Claude) | `~/.claude/settings.json` `UserPromptSubmit` binding (1 entry, router.mjs, timeout 5) + `PostToolUse` matcher `Skill\|Agent\|Task` router.mjs observer binding `[VERIFIED: ~/.claude/settings.json hooks]` | Additive only — do NOT touch existing bindings. New dispatch trigger may reuse the PostToolUse observer or a new worker; either is additive. |
| Live service config (Codex) | `~/.codex/hooks.json` `UserPromptSubmit` binding (router.mjs, timeout 10) `[VERIFIED: ~/.codex/hooks.json:65-71]` | Additive only. |
| OS-registered state | None (no daemon, no Task Scheduler, no launchd) | None. |
| Secrets/env vars | `ROUTER_RUNTIME` env override (`router.mjs:85-87`); `ROUTER_CONTEXT_*` env (`router.mjs:3753-3755`); `ROUTER_DEBUG_LATENCY` | None — reuse existing env conventions; no new secret paths. |
| Build artifacts | `~/.claude/router/src/` (deployed copy of repo `src/`); `~/.claude/router/modules/`; `src/adapters/{claude,codex}.mjs` deployed | New `src/adapters/dispatch/` must be added to the deploy bundle (`src/lifecycle/router-lifecycle.mjs` bundle list). |

**Nothing found in category:** "OS-registered state" — verified by `ls ~/.claude/router/` (no launchd/Task Scheduler artifacts; the evolve worker is `spawn().unref()`, not a registered daemon).

## Common Pitfalls

### Pitfall 1: Treating recommendation text as proof of dispatch
**What goes wrong:** A test asserts that `additionalContext` contains `Run /gsd-X` and that a skill later ran — and marks HOST-01 passed. But the model acted on text; Router did not cause the invocation. Downstream phases build autonomy on a false foundation.
**Why it happens:** The v1.5 path is exactly this (recommend → model acts). It's the path of least resistance.
**How to avoid:** The HOST-01/02 test must assert a **router-issued `invocation_identity`** (adapter id + pid + command + idempotency key) in a receipt, AND linked `completion_evidence` (exit code + stdout sha256), AND that removing the adapter from the test causes the receipt to be absent or `recommendation_only`. The anti-cheat property: a test helper running the fixture alone must NOT produce a receipt with `state: 'invoked'`.
**Warning signs:** A test that only checks `additionalContext` content, or that runs a fixture directly without the adapter in the loop.

### Pitfall 2: Spawning on the prompt hot path
**What goes wrong:** `child_process.spawnSync` in `inspectDecision()` blows the <25ms p95 budget and violates HOST-04's "no mutation on the prompt path."
**Why it happens:** It's the obvious place to "just invoke it."
**How to avoid:** The dispatch path is OFF the prompt hot path — a worker (fire-and-forget `spawn().unref()`, the existing `bumpEvolveTrigger` pattern) or a separate lifecycle hook. The prompt path only emits the action policy; the dispatch path executes it.
**Warning signs:** `spawnSync` or `execSync` anywhere in `inspectDecision` or `formatInjection`.

### Pitfall 3: Assuming Claude and Codex hooks differ when they don't (and vice versa)
**What goes wrong:** Over-engineering a "Codex-specific" dispatch when both runtimes are Node subprocesses that spawn children identically — OR under-engineering by assuming the PostToolUse matcher surface is identical (it isn't: Codex `hooks.json` PostToolUse has no matcher; Claude uses `Skill|Agent|Task`).
**Why it happens:** "Cross-runtime" invites assuming divergence.
**How to avoid:** The dispatch MECHANISM (child_process) is identical. The DIFFERENCE is the hook binding/observation surface. Verify each runtime's actual bindings (`~/.claude/settings.json` vs `~/.codex/hooks.json`) — do not assume.
**Warning signs:** Code branching on runtime inside the spawn path (should branch only at the binding/observation seam).

### Pitfall 4: Pause/resume as a host primitive
**What goes wrong:** Searching for a "pause this process" hook API; assuming `continue: false` is "pause" (it stops Claude entirely — not a resume).
**Why it happens:** The design doc says "pause" and "resume."
**How to avoid:** Pause/resume is a **router-internal durable state machine** — a receipt with `state: 'paused'` + an idempotency key. Resume re-spawns with the same key. No host primitive exists `[VERIFIED: code.claude.com/docs/en/hooks]`.
**Warning signs:** Any code expecting a host "resume" callback or a deferred-continuation API.

### Pitfall 5: Forgetting the 10,000-char `additionalContext` cap
**What goes wrong:** A verbose receipt preview overflows the cap and is replaced with a file path + preview, breaking the model's ability to read the route.
**Why it happens:** v1.5 injection is small; adding receipt previews can grow it.
**How to avoid:** Keep normal injection ≤120 tokens (HOST-04). Large receipts stay in `~/.{claude,codex}/router/receipts/`; the prompt/startup path only injects a compact reference + one-line summary. (The 10,000-char cap is documented `[VERIFIED: code.claude.com/docs/en/hooks]`.)

## Code Examples

### Existing emit() — the recommendation-text channel (do NOT extend to "proof")
```javascript
// Source: /Users/guilherme/.claude/hooks/router.mjs:3724-3731
function emit(additionalContext) {
  writeSync(1, JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext,
    },
  }));
}
```
`additionalContext` is model-readable text. The model acts; Router does not. This is the recommendation-only surface — NOT proof of dispatch.

### Existing runtime detection (reuse, do not rebuild)
```javascript
// Source: /Users/guilherme/.claude/hooks/router.mjs:83-92
export function detectRuntime() {
  try {
    const override = process.env.ROUTER_RUNTIME;
    if (override === 'claude' || override === 'codex') return override;
    if (String(process.argv[1] || '').includes('.codex/')) return 'codex';
    return 'claude';
  } catch {
    return 'claude';
  }
}
```

### Existing fire-and-forget spawn pattern (the off-hot-path dispatch precedent)
```javascript
// Source: /Users/guilherme/.claude/hooks/router.mjs (bumpEvolveTrigger / router.evolve.mjs spawn)
// Pattern: spawn().unref() — fire-and-forget, never blocks the prompt path.
// The dispatch adapter uses the same pattern: spawn the harmless fixture,
// capture completion off the hot path, write a receipt.
import { spawn } from 'node:child_process';
function dispatchFireAndForget(fixtureCmd, receiptStore) {
  const child = spawn(fixtureCmd, { stdio: ['ignore', 'pipe', 'pipe'] });
  child.unref();                          // never block the prompt path
  const startNs = process.hrtime.bigint();
  const chunks = [];
  child.stdout.on('data', (c) => chunks.push(c));
  child.on('exit', (code) => {
    const stdout = Buffer.concat(chunks);
    const receipt = {
      invocation_identity: { adapter: 'claude-dispatch/1', pid: child.pid, command: fixtureCmd, idempotency_key: '...', lease_id: '...' },
      completion_evidence: { exit_code: code, stdout_sha256: createHash('sha256').update(stdout).digest('hex'), wall_ms: Number(process.hrtime.bigint() - startNs) / 1e6, state: code === 0 ? 'completed' : 'failed' },
    };
    receiptStore.publishAtomic(receipt);  // temp + rename (existing cache.json pattern)
  });
}
```

### Existing token budget (reuse for HOST-04 ≤120 tokens)
```javascript
// Source: /Users/guilherme/.claude/hooks/router.mjs:2755-2758
export function tokenCount(text) {
  return Math.ceil(String(text || '').length / 4);
}
const TOKEN_CAP = 500;          // existing INJ-06 cap
// Phase 38 injection must stay <=120 tokens (HOST-04) — enforce a tighter cap
// for any dispatch-related line in the prompt/startup path.
```

### Existing discovery adapter's native_invocation field (identity continuity for receipts)
```javascript
// Source: /Users/guilherme/Desktop/ClaudeCode/Router-build/src/adapters/claude.mjs:449
runtime_variants: [{ runtime, native_identity: String(nativeRecord.data.native_identity || nativeRecord.name), native_invocation: nativeInvocation }]
// Source: /Users/guilherme/Desktop/ClaudeCode/Router-build/src/adapters/claude.mjs:488
function compileInvocation(record) { return { runtime, command: record.invocation.command, args: [...record.invocation.args] }; }
```
The dispatch adapter's `invocation_identity` must reference the SAME `native_identity` the discovery adapter emits, so a receipt is traceable to a manifest capability. Do NOT invent a parallel identity space.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| v1.5: recommendation-only `additionalContext` (model acts on text) | v1.6 Phase 38: real native invocation via `child_process` + receipt (router causes the invocation) | This phase | Router becomes a control plane, not a recommender. |
| `compileInvocation` descriptive (returns command+args, never spawns) | `NativeDispatchAdapter.invoke()` performative (actually spawns, captures exit) | This phase | "Proof of dispatch" becomes possible. |
| No receipt / no completion evidence | Durable receipt with `invocation_identity ◄─► completion_evidence` | This phase | Causal attribution (Phase 44) has a substrate. |
| No pause/resume | Router-internal `paused` receipt + idempotency key | This phase | LEASE-05 (Phase 40) has its primitive. |

**Deprecated/outdated:**
- Any approach that treats `additionalContext` text + model action as "dispatch" — explicitly rejected by HOST-01/02 success criteria.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `child_process.spawn` off the prompt hot path (fire-and-forget `unref()`) is compliant with HOST-04 because the prompt path itself does not spawn. | Architecture Patterns | If the harness counts the unref'd child against the prompt latency budget, the budget blows. Mitigation: measure end-to-end; if it counts, move dispatch to a PostToolUse-triggered or worker-only path. |
| A2 | The "harmless local fixture" is a small Node script the adapter spawns (e.g., writes a temp file with a known content hash, exits 0). | Validation Architecture | If the fixture needs to be a real skill/agent invocation, the router cannot cause it directly (UserPromptSubmit cannot auto-dispatch tools `[VERIFIED]`); the phase would need a different proof object. Recommendation: keep the fixture a plain host process so the proof is a real spawn. |
| A3 | Codex's `hooks.json` PostToolUse surface (no matcher) can still be used as an observer for receipt correlation, OR the dispatch proof uses only the spawn+receipt and not PostToolUse. | Architecture Patterns | If Codex PostToolUse cannot be used for correlation, the receipt's completion evidence still stands on its own (exit+stdout hash) — the observer is enhancement, not the proof. |
| A4 | The deploy bundle (`src/lifecycle/router-lifecycle.mjs`) is the mechanism that copies `src/adapters/dispatch/*` into `~/.claude/router/modules/adapters/` and `~/.codex/router/...`. | Runtime State Inventory | If the bundle is not extended, the new adapter won't reach the installed runtime. Planner must add a bundle-list update task. |
| A5 | Phase 38 ships the MINIMAL pause/resume (idempotency key + `paused` state); full lease semantics arrive in Phase 40. | Pattern 3 | If the planner scopes pause/resume fully into Phase 38, it overruns the phase boundary. Keep minimal. |

**Note:** A1-A5 are `[ASSUMED]` because they are design decisions the CONTEXT.md explicitly leaves to the agent's discretion. They are flagged here so /gsd-discuss-phase / planning can confirm them.

## Open Questions (RESOLVED)

> Resolved during Phase 38 planning — the plans follow each chosen answer.

1. **Where exactly does the dispatch trigger fire?** Three candidate seams: (a) a new router-owned lifecycle hook, (b) the existing PostToolUse router.mjs observer (currently shadow-log only), (c) a fire-and-forget worker spawned from the prompt path (like `bumpEvolveTrigger`).
   - What we know: All three are additive and off the prompt hot path.
   - What's unclear: Which composes cleanest with the active-lease trigger (Phase 40) without pre-empting Phase 40's design.
   - Recommendation: Pick (c) for the feasibility fixture (lowest coupling), leaving (b) for Phase 44 observation. Planning decides.
   - **RESOLVED: (c) fire-and-forget worker** (Plan 38-01 T1 wires an unref'd spawn modeled on `bumpEvolveTrigger`; (b) reserved for Phase 44 observation).

2. **What is the canonical "harmless local fixture"?**
   - What we know: It must be a real host process the adapter spawns, with deterministic exit + stdout so the receipt's `stdout_sha256` is reproducible.
   - What's unclear: Should it live in `tests/fixtures/` (repo) or `~/.claude/router/fixtures/` (deployed)?
   - Recommendation: Repo `tests/fixtures/dispatch/harmless.mjs`; the deploy bundle copies it. Anti-cheat: the test asserts the adapter spawned IT (pid + command), not that the file exists.
   - **RESOLVED: repo `tests/fixtures/dispatch/harmless.mjs`**, deployed via the bundle list (Plan 38-03 T2 registers it; anti-cheat asserts adapter-issued pid + command, not file existence).

3. **Does the receipt store need a GC/retention policy in Phase 38?**
   - What we know: HOST-04 forbids scanning/hashing on hot paths; receipt reads must be bounded.
   - What's unclear: Phase 44 owns causal attribution + inspection; Phase 38 may only need append-only.
   - Recommendation: Append-only `~/.{claude,codex}/router/receipts.jsonl` (one file per runtime) with atomic append (existing `telemetry.jsonl` pattern). GC deferred to Phase 44.
   - **RESOLVED: append-only per-runtime `receipts.jsonl` + atomic publish**, no GC in Phase 38 (Plan 38-01 T1; GC deferred to Phase 44).

4. **How is "equivalent intent, authority, risk" proven equivalent across runtimes (HOST-03)?**
   - What we know: The receipt carries `intent`, `authority`, `risk` fields populated from the same sources (intent from `classifyIntent`, authority from the lease fixture, risk from a static fixture class).
   - What's unclear: Is a structural equality assertion (same field values) sufficient, or does the test need a behavioral equivalence (same observable outcome)?
   - Recommendation: Structural equality on the receipt tuple + same terminal `state` on both runtimes. Behavioral equivalence is Phase 44's causal test.
   - **RESOLVED: structural equality** on the receipt tuple + same terminal `state` (Plan 38-02 T2; behavioral equivalence deferred to Phase 44).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `/Users/guilherme/.hermes/node/bin/node` | Hook runtime (both runtimes) | ✓ | v22.22.3 `[VERIFIED]` | — |
| `node:child_process` | Native dispatch spawn | ✓ | stdlib (Node 18+) | — |
| `~/.claude/settings.json` UserPromptSubmit binding | Claude prompt path | ✓ | 1 entry, router.mjs, timeout 5 `[VERIFIED: ~/.claude/settings.json]` | — |
| `~/.codex/hooks.json` UserPromptSubmit binding | Codex prompt path | ✓ | 1 entry, router.mjs, timeout 10 `[VERIFIED: ~/.codex/hooks.json:65-71]` | — |
| `~/.codex/router/installed.json` marker | Codex runtime detection / control authority root | ✓ | `{"managed_by":"claude-router","control_authority_root":"/Users/guilherme/.claude/router"}` `[VERIFIED]` | — |
| `rtk` CLI | Test command (`rtk node --test ...`) | ✓ | 0.43.0 `[VERIFIED]` | `node --test` directly if rtk unavailable |
| `~/.claude/router/src/adapters/` (deployed) | Adapter deploy target | ✓ | mirrors repo `src/adapters/` | — |
| `~/.codex/router/src/adapters/` | Codex adapter deploy | ✓ (mirror exists) | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` — this section is required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) + `node:assert/strict` |
| Config file | none (built-in runner; `package.json` absent — project is stdlib-only) |
| Quick run command | `rtk node --test tests/router.adapters.test.mjs` |
| Full suite command | `rtk node --test tests/*.test.mjs` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HOST-01 | Claude: authorized harmless fixture → real native invocation identity + linked completion evidence; recommendation text or test helper alone fails | integration + anti-cheat | `rtk node --test tests/router.dispatch-native.claude.test.mjs` | ❌ Wave 0 |
| HOST-02 | Codex: same semantic fixture → real native invocation identity + linked completion evidence; recommendation text or test helper alone fails | integration + anti-cheat | `rtk node --test tests/router.dispatch-native.codex.test.mjs` | ❌ Wave 0 |
| HOST-03 | Equivalent intent/authority/risk/pause/resume/receipt on both runtimes; incompatible adapter → `recommendation_only`, no autonomous dispatch | parity + fallback | `rtk node --test tests/router.dispatch-parity.test.mjs` | ❌ Wave 0 |
| HOST-04 | Warm p95 <=25ms, p99 <=50ms, max <100ms (prompt); startup p95 <=50ms; injection <=120 tokens; no scans/hashing/network/LLM/mutation/learning on hot path | perf + invariant | `rtk node --test tests/router.dispatch-perf.test.mjs` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `rtk node --test tests/router.dispatch-native.claude.test.mjs tests/router.dispatch-native.codex.test.mjs tests/router.dispatch-parity.test.mjs tests/router.dispatch-perf.test.mjs`
- **Per wave merge:** `rtk node --test tests/*.test.mjs`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/router.dispatch-native.claude.test.mjs` — HOST-01 anti-cheat (RED first: assert that recommendation-only path fails, that test-helper-only path fails, that adapter-spawn path produces a receipt with `invocation_identity` + `completion_evidence`)
- [ ] `tests/router.dispatch-native.codex.test.mjs` — HOST-02 anti-cheat (same structure, Codex adapter)
- [ ] `tests/router.dispatch-parity.test.mjs` — HOST-03 equivalence + recommendation-only fallback
- [ ] `tests/router.dispatch-perf.test.mjs` — HOST-04 latency (hrtime) + token (tokenCount) + hot-path invariants (no spawn/scan/hash/network on prompt path)
- [ ] `tests/fixtures/dispatch/harmless.mjs` — the harmless fixture (deterministic exit 0 + known stdout)
- [ ] `src/adapters/dispatch/{contract,claude,codex,receipt}.mjs` — the new adapter + receipt store
- [ ] Deploy bundle update in `src/lifecycle/router-lifecycle.mjs` to ship the new adapter + fixture

*(If no gaps: would say "None — existing test infrastructure covers all phase requirements" — but Phase 38 is greenfield, so all gaps are new.)*

## Security Domain

> `security_enforcement` is `true` (`.planning/config.json`); ASVS level 1. This phase introduces a NEW native dispatch surface — security review is mandatory.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Dispatch is authorized by an operator-issued lease fixture, not a credential system (Phase 40 owns lease authority). |
| V3 Session Management | no | No sessions; receipts are stateless append-only records. |
| V4 Access Control | yes | The dispatch adapter must refuse to invoke when `canDispatch()` returns false (recommendation-only). Only an authorized lease fixture triggers invoke. No confidence value grants permission (AUTH-03, Phase 39 — but Phase 38 must not violate it). |
| V5 Input Validation | yes | The `action` passed to `invoke()` must be a typed contract; fixture command + args validated against `commandReference()`-style portability/path-escape rules already in `src/adapters/claude.mjs:280-289` (`portableTarget`, `splitShellTokens`, reject `..`, root containment). Never spawn an arbitrary user string. |
| V6 Cryptography | yes (minimal) | `node:crypto` sha256 for receipt integrity + stdout hashing. Never hand-roll. Never log raw prompt text (existing privacy invariant — `router.mjs` hashes prompt signatures). |
| V7 Error Handling & Logging | yes | Fail-open: any adapter throw → `recommendation_only` receipt, never exit 2, never block. Receipts contain no raw prompt text (only hashes + route metadata — existing telemetry privacy invariant). |
| V8 Data Protection | yes | Receipts are local-only (`~/.{claude,codex}/router/receipts/`); never exported (v1.6 Non-Goal: no automatic sharing of private data). |
| V12 Files & Resources | yes | The fixture writes only to a temp dir it owns; the adapter validates the fixture path is contained (existing `within()` pattern, `src/adapters/claude.mjs:10`). |

### Known Threat Patterns for the Native Dispatch Surface

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt-path command injection (a crafted prompt causes the adapter to spawn an attacker command) | Tampering / Elevation | The adapter NEVER spawns from prompt text. The fixture command is a fixed, validated path from the lease fixture, not derived from the prompt. `commandReference()` + `portableTarget()` reject `..`, root escape, unsupported tokens (`src/adapters/claude.mjs:280-289`). |
| Recommendation text forging a receipt (model emits text that looks like a receipt) | Spoofing | Receipts are written ONLY by the adapter process to `receipts/` with an adapter-issued `invocation_identity` (incl. pid + adapter version). The prompt path cannot write receipts. Anti-cheat test verifies the receipt's `adapter` field. |
| Test helper masquerading as native invocation | Spoofing | The receipt must include `pid` of a process the adapter spawned + `stdout_sha256` of that process's stdout. A test helper running the fixture has no adapter-issued pid. |
| Cross-runtime receipt bleed (a Claude receipt authorizes a Codex dispatch) | Elevation | Receipts partitioned by runtime dir (`~/.claude/router/receipts/` vs `~/.codex/router/receipts/`); receipt's `runtime` field validated on read. Same discipline as v1.5 telemetry (PARITY-02). |
| Receipt store unbounded growth / DoS | Denial | Append-only `.jsonl` with atomic append (existing `telemetry.jsonl` pattern); GC deferred to Phase 44. Phase 38 fixtures produce bounded receipts. |
| Hot-path mutation via spawn | DoS / performance | Spawn is OFF the prompt hot path (HOST-04). Perf test asserts no `spawnSync`/`execSync` in the prompt path. |
| Secret leakage into receipt | Information disclosure | Receipts store only hashes + command + exit + wall time — no env, no prompt text, no file contents (only `stdout_sha256`, not stdout itself). Existing privacy invariant preserved. |
| Path-escape via fixture path | Elevation | `within(root, candidate)` + `realpathSync` (existing `src/adapters/claude.mjs:10, 38-48`); fixture path must resolve inside the repo or `~/.{claude,codex}/router/`. |

## Sources

### Primary (HIGH confidence)
- `docs/superpowers/specs/2026-08-02-router-v1.6-autonomous-control-plane-design.md` — v1.6 design spec (read this session); authoritative for the adapter / native-invocation / receipt model and the Cross-Runtime Feasibility Gate checklist (§Cross-Runtime Feasibility Gate: 7 items).
- `/Users/guilherme/.claude/hooks/router.mjs` — v1.5 production hook (read this session); `detectRuntime()` :83-92, `formatInjection()` :2846, `emit()` :3724-3731, `tokenCount()` :2755-2758, `inspectDecision()` :3127+, `main()` :3515+, `bumpEvolveTrigger`/spawn-unref pattern.
- `/Users/guilherme/Desktop/ClaudeCode/Router-build/src/adapters/claude.mjs` — discovery adapter (read this session); `createAdapter` :342, `compileInvocation` :488, `runtime_variants`/`native_invocation` :449, `commandReference`/`portableTarget`/`within` :10, 246-289.
- `/Users/guilherme/Desktop/ClaudeCode/Router-build/src/adapters/codex.mjs` — Codex discovery adapter (read this session); reuses `createAdapter`, `layout` for codex home.
- `/Users/guilherme/Desktop/ClaudeCode/Router-build/src/intent/classify.mjs` — intent classifier (read this session); `INTENT_DISPOSITIONS`, `classifyIntent()`.
- `~/.claude/settings.json` `hooks` (read this session) — UserPromptSubmit (1 entry) + PostToolUse (`Skill|Agent|Task` observer) bindings.
- `~/.codex/hooks.json` (read this session) — `UserPromptSubmit` binding :65-71 (router.mjs, timeout 10).
- `~/.codex/router/installed.json` (read this session) — Codex control authority marker.
- Official Claude Code hooks reference — `https://code.claude.com/docs/en/hooks` (fetched this session via WebFetch). Confirmed: `UserPromptSubmit` cannot auto-dispatch tools; `additionalContext` + plain stdout are the only injection channels; hooks can spawn subprocesses; NO pause/resume exposed; exit 2 erases prompt; 10,000-char cap on `additionalContext`.

### Secondary (MEDIUM confidence)
- `.claude/CLAUDE.md` project instructions (read via system context) — hook contract, constraints, coexistence, stdlib-only, fail-open, no daemon.
- `.planning/milestones/v1.5-ROADMAP.md` (read this session) — v1.5 shipped phases 30-37.1; the v1.5 base Phase 38 extends.
- `.planning/REQUIREMENTS.md` (read this session) — HOST-01..04 definitions + v1.6 out-of-scope table.
- `.planning/ROADMAP.md` (read this session) — Phase 38 success criteria + dependency on Phase 37.1.
- `tests/router.adapters.test.mjs` (read this session) — adapter test fixture conventions (`mkdtempSync`, portable-path assertions).
- `tests/router.coexistence.test.mjs` (read this session) — coexistence test conventions (`spawnSync` hook driver).
- `tests/router.dispatch-integration.test.mjs` (read this session) — existing dispatch-gate matrix (Phase 23) — describes the recommendation-text surface Phase 38 must NOT count as proof.

### Tertiary (LOW confidence)
- None. All claims are verified against the codebase this session or the official hooks doc.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — stdlib-only, no new packages; Node v22.22.3 verified; child_process/crypto/fs stable since Node 14.
- Architecture: HIGH — grounded in the v1.6 design spec (authoritative) + the actual v1.5 code (read) + the official hooks contract (fetched). The central feasibility conclusion (subprocess spawn off hot path + receipt) is the ONLY mechanism consistent with all constraints.
- Pitfalls: HIGH — derived from the verified hook contract and the existing code patterns.
- Test strategy: HIGH — anti-cheat property is structurally enforceable (adapter-issued `invocation_identity` no test helper can forge).

**Research date:** 2026-08-06
**Valid until:** 2026-09-05 (30 days — stable; the hook contract and stdlib APIs are not fast-moving. Re-verify the official hooks doc if the harness version advances.)