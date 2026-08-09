---
phase: 41-manifest-vnext-and-trust-hardening
reviewed: 2026-08-08T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - src/adapters/dispatch/claude.mjs
  - src/adapters/dispatch/codex.mjs
  - src/adapters/dispatch/contract.mjs
  - src/cli/router-control.mjs
  - src/lifecycle/router-lifecycle.mjs
  - src/registry/contract.mjs
  - src/registry/eligibility.mjs
  - src/registry/schema.mjs
  - src/registry/trust.mjs
  - tests/helpers/inventory-fixture.mjs
  - tests/router.contract-eligibility.test.mjs
  - tests/router.contract-inspection.test.mjs
  - tests/router.trust-contract.test.mjs
  - tests/router.trust-evidence.test.mjs
  - tests/router.trust-invocation.test.mjs
  - tests/router.trust-pregate.test.mjs
findings:
  critical: 0
  warning: 5
  info: 5
  total: 10
status: issues_found
---

# Phase 41: Code Review Report

**Reviewed:** 2026-08-08
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

The Phase 41 trust-hardening work introduces an untrusted-evidence policy (`trust.mjs`), four new contract fields (`action`, `cost`, `completion`, `native_invocation`), a quarantine disposition in `eligibility.mjs`, and two pre-dispatch validation gates (`validateInvocation`, `preDispatchGate`) in the dispatch contract. The implementation is generally well-structured with defense-in-depth patterns and thorough test coverage. No critical security vulnerabilities were found. The issues below are warnings about gaps where tested security features are not wired into production paths, an undocumented divergence between runtime adapters, a fragile circular dependency, and inconsistent sanitization in the CLI.

## Warnings

### WR-01: preDispatchGate dependency and permission checks are dead code in production

**File:** `src/adapters/dispatch/claude.mjs:290`, `src/adapters/dispatch/codex.mjs:200`, `src/adapters/dispatch/contract.mjs:265-287`
**Issue:** The `preDispatchGate` function accepts a third `context` parameter that provides dependency availability and permission/effect state. Tests in `router.trust-pregate.test.mjs` (lines 77-94) verify that `dependency_missing` and `permission_effect_disallowed` are correctly detected when `context` is passed. However, both production callers invoke the gate as `preDispatchGate(action, adapter)` without any context argument. This means the dependency availability check (`action?.dependencies && context?.dependencies`) and the permission/effect check (`action?.permission_effect && context?.permission_effect`) are silently skipped — their `context?.` guards evaluate to `undefined`, making the entire branch dead. The gate appears to offer dependency and permission enforcement but only enforces structural checks (timeout, retry, output_bounds, completion_contract) in production. A reader or auditor reviewing the gate's code and tests would reasonably conclude dependencies and permissions are verified before dispatch when they are not.
**Fix:** Either wire the eligibility-evaluation context into the adapter dispatch path (passing the build-time eligibility results as the `context` argument), or add an explicit code comment and JSDoc annotation documenting that the context-dependent checks are test-only and production dispatch is fail-open for dependencies and permissions. If wiring is planned for a future phase, add a `// TODO(phase-XX): wire context` marker so the gap is tracked.

### WR-02: validateInvocation shell check misses string-valued shell option

**File:** `src/adapters/dispatch/contract.mjs:218`
**Issue:** The wrapper-injection guard checks `action?.shell === true` but Node's `child_process.spawn` accepts `shell` as `true`, `false`, or a string (the shell binary path). An action with `shell: '/bin/bash'` or `shell: 'sh'` would pass this validation because `'bin/bash' !== true`. The comment on line 154 states "shell:false enforced — reject shell:true or wrapper" but the implementation only rejects the boolean `true` case. The actual spawn calls in `claude.mjs:302` and `codex.mjs:212` do not pass `action.shell` to `spawn` (they rely on the default `shell: false`), so this is defense-in-depth only — the gap cannot be exploited through the current dispatch path. However, if a future refactor passes `action.shell` through to spawn, this incomplete check would allow shell interpretation of arguments.
**Fix:**
```javascript
// Reject any truthy shell value, not just boolean true
if (action?.shell) return { ok: false, reason: 'wrapper_injection' };
```
Or more explicitly:
```javascript
if (action?.shell === true || (typeof action?.shell === 'string' && action.shell.trim())) {
  return { ok: false, reason: 'wrapper_injection' };
}
```

### WR-03: Circular dependency between contract.mjs and trust.mjs

**File:** `src/registry/contract.mjs:3`, `src/registry/trust.mjs:1`
**Issue:** `contract.mjs` imports `classifyEvidence` from `trust.mjs` (line 3), and `trust.mjs` imports `CONTRACT_POLICY` from `contract.mjs` (line 1). This creates a circular ESM dependency. It works at runtime because `trust.mjs` only accesses `CONTRACT_POLICY` inside the `classifyEvidence` function body (deferred to call time, not module-load time), so by the time `classifyEvidence` is called, `contract.mjs` has finished initializing and the live binding for `CONTRACT_POLICY` is resolved. Verified at runtime: `contract.mjs` loads successfully. However, this pattern is fragile — any future module-level use of `CONTRACT_POLICY` in `trust.mjs` (e.g., a constant derived from `CONTRACT_POLICY.structural_minimum_basis_points`) would throw a `ReferenceError` due to the temporal dead zone. The circular dependency is not documented in either file's header comments.
**Fix:** Break the cycle by moving `CONTRACT_POLICY` to a shared module (e.g., `src/registry/policy.mjs`) that both `contract.mjs` and `trust.mjs` import from. Alternatively, pass the threshold value as a parameter to `classifyEvidence` so `trust.mjs` does not need to import from `contract.mjs` at all:
```javascript
// trust.mjs — no import from contract.mjs
export function classifyEvidence(field, candidate, { structuralMinimum } = {}) {
  // ...
  if (candidate.confidence_basis_points < (structuralMinimum ?? 10000)) {
    return { trusted: false, reason_code: 'below_structural_minimum' };
  }
}
```

### WR-04: leasesCommand inspect does not sanitize expiry and authority_source fields

**File:** `src/cli/router-control.mjs:752-753`
**Issue:** The `leases inspect` subcommand sanitizes `lease_id`, `goal`, and `status` through `safeToken()`, but passes `expiry` and `authority_source` raw to the response data object without any sanitization. The comment on line 721 states "Never inlines raw prompt text — only the structured goal label and the 9 inspection fields (T-40-10 information disclosure mitigation)." While these fields originate from the trusted lease store directory (`~/.claude/router/leases/`), a tampered or corrupted lease file could contain arbitrary content in these fields. In `--format json` mode, the raw `expiry` (which should be a number timestamp but could be a string if tampered) and `authority_source` (an object with `kind`, `instruction`, `class` keys) are serialized directly into the JSON output. This is inconsistent with the sanitization applied to the other three fields and undermines the information-disclosure mitigation the comment claims.
**Fix:**
```javascript
leases.push({
  lease_id: safeToken(lease.lease_id, ''),
  goal: safeToken(lease.goal, ''),
  status: safeToken(lease.status, ''),
  expiry: Number.isSafeInteger(lease.expiry) ? lease.expiry : null,
  authority_source: {
    kind: safeToken(lease.authority_source?.kind, 'unknown'),
    instruction: safeToken(lease.authority_source?.instruction, 'unknown'),
    class: safeToken(lease.authority_source?.class, 'unknown'),
  },
});
```

### WR-05: Codex worker does not use deriveReceiptStrings — undocumented divergence from claude.mjs

**File:** `src/adapters/dispatch/codex.mjs:392-398`, `src/adapters/dispatch/claude.mjs:489-496`
**Issue:** The claude worker entrypoint calls `deriveReceiptStrings(lease)` to populate the receipt's `intent`, `authority`, and `risk` fields from the authority taxonomy (`classifyAuthority` + `evaluateAuthorityPolicy` from `intent/authority.mjs`). The codex worker entrypoint does not — it uses hardcoded string fallbacks (`'host-02-feasibility'`, `'operator-authorized'`, `'harmless-fixture'`) or the lease's explicit fields directly. The codex.mjs header comment (lines 1-22) explicitly states "The ONLY differences from claude.mjs are: 1. runtime='codex'... 2. Receipt partition path... 3. canDispatch() probes... 4. observe() validates receipt.runtime" — the authority classification integration is an unlisted 5th difference. This means codex dispatch receipts do not benefit from the AUTH-02 framing guard that demotes autonomous wording in example/retrospective contexts, and the two runtimes produce semantically different receipt strings for the same lease prompt.
**Fix:** Either add `deriveReceiptStrings` (and the `classifyAuthority`/`evaluateAuthorityPolicy` imports) to `codex.mjs` to achieve parity, or update the codex.mjs header comment to document this as an intentional 5th difference with a rationale for why the codex variant does not classify authority.

## Info

### IN-01: hasUnsafeAuthoredContent key regex matches "path" substring broadly

**File:** `src/registry/contract.mjs:263`
**Issue:** The key-name heuristic `/secret|token|password|raw|body|path/i` flags any object key containing the substring "path" (e.g., `relative_path`, `file_path`, `router_path`, `artifact_path`). When `hasUnsafeAuthoredContent` recurses into object-valued contract fields (like `scope`, `completion`, or `native_invocation`), any child key containing "path" triggers an `injection_bearing` quarantine reason. No current contract field values contain such keys, so there are no false positives today. However, if a future overlay correction or adapter enhancement adds a `path`-named property to any contract field value object, the capability would be silently quarantined.
**Fix:** Use word-boundary matching or exact key comparison: `/secret|token|password|raw|body|(^|_)path(_|$)/i` or check `key === 'path'` separately from the substring match.

### IN-02: DESTRUCTIVE_PATTERNS are designed for single-string args, not split args

**File:** `src/adapters/dispatch/contract.mjs:164-172`
**Issue:** The destructive target patterns (e.g., `/rm\s+-rf\s+\/(\s|$)/`) are tested against individual args as single strings (test at `router.trust-invocation.test.mjs:80` uses `['rm -rf /']`). If args were properly split into `['rm', '-rf', '/']`, no single arg would match any pattern. Since the actual spawn never passes `action.args` to the child process (it always uses `[fixturePath]`), this is defense-in-depth only and the gap has no production impact. The patterns would not catch a properly tokenized destructive command if args were ever used in the future.
**Fix:** If args are ever passed to spawn in a future phase, add multi-arg pattern matching that checks sequences of args (e.g., `args.includes('rm') && args.includes('-rf') && args.includes('/')`), not just individual arg strings.

### IN-03: dependencyState BFS loop processes 129 items, not MAX_RELATIONSHIPS (128)

**File:** `src/registry/eligibility.mjs:111`
**Issue:** The loop condition `index < queue.length && index <= MAX_RELATIONSHIPS` allows `index` to reach 128 (the value of `MAX_RELATIONSHIPS`), processing indices 0 through 128 inclusive — 129 items total. The overflow check `queue.length > MAX_RELATIONSHIPS` at line 121 then returns `'unknown'` if more than 128 items were queued. This is an off-by-one in the conservative direction (processes one extra item before declaring overflow), so it does not cause incorrect eligibility results. It is slightly inconsistent with the `MAX_RELATIONSHIPS` constant's implied bound.
**Fix:** Change `index <= MAX_RELATIONSHIPS` to `index < MAX_RELATIONSHIPS` for exact bound, or document that the +1 is intentional as a safety margin.

### IN-04: QUARANTINE_REASON_TOKEN is dead code

**File:** `src/registry/eligibility.mjs:156`
**Issue:** The constant `QUARANTINE_REASON_TOKEN = /^[a-z0-9][a-z0-9._-]{0,63}$/i` is declared at line 156 but never referenced anywhere in `eligibility.mjs`. The actual quarantine reason validation in `schema.mjs:216` uses an inline regex with the same pattern. This is unused dead code that could confuse a reader into thinking the validation lives in `eligibility.mjs`.
**Fix:** Remove the unused constant, or export it from `eligibility.mjs` and import it in `schema.mjs` to eliminate the duplication.

### IN-05: quarantined receipt state declared but unused in adapter code

**File:** `src/adapters/dispatch/contract.mjs:39`
**Issue:** `RECEIPT_STATES` includes `'quarantined'` (line 39) and the test at `router.trust-quarantine.test.mjs:152` verifies its presence, but no adapter code (`claude.mjs`, `codex.mjs`, or `contract.mjs`) ever writes a receipt with `state: 'quarantined'`. Quarantine is a per-capability eligibility disposition (`eligibility.mjs`), not a per-invocation receipt state. The declaration appears forward-looking (for a future phase that might block dispatch of quarantined capabilities at the adapter layer) but is currently unused.
**Fix:** Add a comment noting the state is reserved for future use, or remove it until the adapter code that produces it is implemented.

---

_Reviewed: 2026-08-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_