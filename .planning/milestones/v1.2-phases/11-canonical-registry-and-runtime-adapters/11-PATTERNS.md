# Phase 11: Canonical Registry and Runtime Adapters - Pattern Map

**Mapped:** 2026-07-14
**Files analyzed:** 8 new/modified files
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/registry/schema.mjs` | model/utility | transform | `tests/router.mjs.snapshot` | role-match |
| `src/registry/identity.mjs` | utility | transform | `src/lifecycle/router-lifecycle.mjs` | exact for hashing |
| `tests/router.registry-schema.test.mjs` | test | transform | `tests/router.lifecycle.test.mjs` | exact |
| `src/adapters/claude.mjs` | adapter/provider | file-I/O -> transform | `tests/router.mjs.snapshot` | role/data-flow match |
| `src/adapters/codex.mjs` | adapter/provider | file-I/O -> transform | `tests/router.mjs.snapshot` | role/data-flow match |
| `tests/router.adapters.test.mjs` | test | file-I/O | `tests/router.lifecycle.test.mjs` | exact fixture pattern |
| `src/registry/build.mjs` | service | batch/transform | `tests/router.mjs.snapshot` | role/data-flow match |
| `tests/router.registry-build.test.mjs` | test | batch/file-I/O | `tests/router.lifecycle.test.mjs` | exact fixture pattern |
| `install-router.mjs` | controller/config | request-response + file-I/O | `install-router.mjs` + `src/lifecycle/router-lifecycle.mjs` | exact extension point |

## Pattern Assignments

### `src/registry/schema.mjs` (model/utility, transform)

**Analog:** `tests/router.mjs.snapshot`

Use the existing explicit-category and pure-normalization style rather than a permissive catch-all. The current router enumerates supported inventory categories and normalizes array/object input without side effects:

```js
// tests/router.mjs.snapshot:463-490
const INVENTORY_COVERAGE_KEYS = [
  'skills', 'plugin_skills', 'agents_store_skills', 'agents', 'commands',
  'hooks', 'mcp_servers', 'unwired_mcp_refs',
];

function inventoryNames(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry?.name || entry?.id || '')).filter(Boolean);
  if (value && typeof value === 'object') return Object.keys(value);
  return [];
}
```

Copy the conventions: named ESM exports, plain objects/arrays, explicit supported values, pure functions, and deterministic error messages. `validateCapability` should reject invalid required fields and unknown lifecycle/severity values; `canonicalizeCapability` should sort only schema-owned set-like collections. `stableStringify` must recursively sort object keys but preserve semantically ordered arrays such as invocation arguments and precedence lists.

### `src/registry/identity.mjs` (utility, transform)

**Analog:** `src/lifecycle/router-lifecycle.mjs`

Reuse the repository's standard-library SHA-256 pattern:

```js
// src/lifecycle/router-lifecycle.mjs:5-12
import { createHash } from 'node:crypto';

export function fingerprint(value) {
  return createHash('sha256').update(value).digest('hex');
}
```

`contentFingerprint(value)` should hash UTF-8 bytes from `stableStringify(value)`. `stableCapabilityId(record)` must enforce the evidence ladder from D-01 through D-04: explicit canonical ID/shared authoritative origin first; otherwise `runtime:type:native-identity`. Never use name/description/content similarity as merge evidence. Include project scope identity in IDs so global and worktree/project variants remain separate.

### `src/adapters/claude.mjs` and `src/adapters/codex.mjs` (adapter/provider, file-I/O -> transform)

**Analogs:** `tests/router.mjs.snapshot` and `src/lifecycle/router-lifecycle.mjs`

Preserve the established explicit-category coverage rather than silently dropping current surfaces:

```js
// tests/router.mjs.snapshot:135-147
function _inventoryToStemMap(manifest) {
  if (!manifest || typeof manifest !== 'object') return {};
  const out = {};
  const lists = ['skills', 'plugin_skills', 'agents_store_skills',
    'project_scoped_skills', 'agents', 'commands'];
  for (const key of lists) {
    const arr = Array.isArray(manifest[key]) ? manifest[key] : [];
    for (const e of arr) {
      if (!e || !e.name) continue;
      const stem = String(e.name);
      if (!(stem in out)) out[stem] = [];
    }
  }
  return out;
}
```

Follow the common contract exactly: `discoverRoots(options)`, `parseArtifact(path, options)`, `normalizeArtifact(nativeRecord)`, and `compileInvocation(record)`. Require explicit/supplied roots at the core API boundary; normalize paths with `resolve`; resolve symlinks and containment-check every discovered artifact before reading. Sort directory entries and observations before returning.

Keep parsing fail-open but diagnostic, matching the existing read convention while returning structured results instead of `null`:

```js
// tests/router.mjs.snapshot:445-451
export function loadManifest(path = MANIFEST) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}
```

For Phase 11, recognizable malformed artifacts become partial non-dispatchable observations with parse diagnostics; unsupported files/versions become build diagnostics. Preserve native invocation fields separately per runtime. Missing optional metadata remains explicitly unknown, while declared unavailable dependencies block dispatch.

Claude discovery must cover global skills, plugin skills, agents-store skills, agents, commands, hooks/bindings, and project `.claude` scope. Codex discovery must cover skills, plugins, agents, hooks, config metadata, MCP/tools/models/permissions, and project `.codex` scope. Portable provenance uses logical roots plus relative paths; absolute paths are local-diagnostic-only.

### `src/registry/build.mjs` (service, batch/transform)

**Analog:** `tests/router.mjs.snapshot`

The closest current aggregation pattern explicitly iterates categories, classifies every record, and accumulates deterministic summaries:

```js
// tests/router.mjs.snapshot:537-568
export function classifyInventoryEntry(category, entry, mapped = new Set()) {
  if (category === 'hooks') return 'diagnostic_only';
  if (category === 'mcp_servers' || category === 'unwired_mcp_refs') return 'dependency_only';
  if (category === 'project_scoped_skills') return 'project_scoped';
  if (category === 'agents' && hasMissingMcp(entry)) return 'blocked_missing_mcp';
  if (isProjectScoped(entry)) return 'project_scoped';
  if (['skills', 'plugin_skills', 'agents_store_skills', 'agents', 'commands'].includes(category)) {
    return isMapped(entry, mapped) ? 'routeable' : 'unmapped';
  }
  return 'excluded';
}
```

`buildFullRegistry(options)` should call both adapters, normalize all observations, group only on authoritative identity evidence, validate/canonicalize records, and return `{ registry, diagnostics, summary }`. Sort records by canonical ID and diagnostics by canonical ID then logical source. Preserve variants and typed metadata conflicts. Do not write active state, mode maps, hooks, pointers, or runtime-owned sources.

The current safe/blocked split is also a useful dependency precedent:

```js
// tests/router.mjs.snapshot:602-614
export function buildTargetIndexes(manifest) {
  const safeAgent = (entry) => !hasMissingMcp(entry);
  const blockedAgent = (entry) => hasMissingMcp(entry);
  return {
    commands: namesFromEntries(manifest?.commands),
    skills: namesFromEntries(manifest?.skills),
    safeAgents: namesFromEntries(manifest?.agents, safeAgent),
    blockedAgents: namesFromEntries(manifest?.agents, blockedAgent),
  };
}
```

### Registry tests (test, transform/file-I/O)

**Analog:** `tests/router.lifecycle.test.mjs`

Use isolated temporary roots with explicit paths and unconditional cleanup:

```js
// tests/router.lifecycle.test.mjs:15-35
function fixture({ withSettings = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'router-lifecycle-'));
  const claudeRoot = join(root, '.claude');
  const codexRoot = join(root, '.codex');
  // create only fixture-owned files under root
  return { root, options: { claudeRoot, codexRoot } };
}

function cleanup(f) {
  rmSync(f.root, { recursive: true, force: true });
}
```

Copy the existing `node:test`/strict-assert import style and `try/finally` cleanup. Tests must never default to or inspect live homes. Add canary files immediately outside supplied roots and assert they are not read. Test both traversal-order permutations and compare stable bytes. Schema tests should cover invalid values, semantic array order, evidence-gated IDs, rename/move stability, scope separation, and unknown optional fields. Adapter tests should cover every required native category, malformed recognizable artifacts, unsupported versions, symlink escape, invocation preservation, and unavailable declared dependencies. Build tests should cover parity, conflicts, duplicate/shared-origin merge rules, deterministic reports, no active-state mutation, and absence of absolute paths in portable bytes.

### `install-router.mjs` (controller/config, request-response + file-I/O)

**Analogs:** itself and `src/lifecycle/router-lifecycle.mjs`

Keep the thin CLI controller pattern:

```js
// install-router.mjs:52-63
try {
  const claudeRoot = path.resolve(arg('claude-root', path.join(os.homedir(), '.claude')));
  const codexRoot = path.resolve(arg('codex-root', path.join(os.homedir(), '.codex')));
  const options = { claudeRoot, codexRoot, /* explicit derived paths */ };
```

Deployment/build mechanics belong behind lifecycle functions. Preserve complete-preflight-before-mutation and atomic rename:

```js
// src/lifecycle/router-lifecycle.mjs:14-19,83-93
function atomicWrite(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.tmp.${process.pid}`;
  writeFileSync(temporary, value);
  renameSync(temporary, file);
}

// Complete preflight before the first mutation.
const sourceBytes = readFileSync(p.sourceRouter);
const settings = validatedSettings(p.settingsPath);
```

Extend the owned-file manifest rather than inventing a second installer. Build the initial candidate under a router-owned location distinct from active state, include deployed modules/candidate/report fingerprints in ownership evidence, preserve unrelated Claude/Codex config, report exact additions, and verify readiness. A build failure must produce a usable diagnosis and must not leave a partial install.

## Shared Patterns

### Standard-library-only ESM

Use only `node:` and local imports. Existing enforcement is in `tests/router.lifecycle.test.mjs:179-186`; extend its production-file list to the new registry/adapters. No network or package installation path.

### Deterministic boundaries

Sort filesystem traversal, logical roots, normalized observations, canonical records, conflicts, diagnostics, and summaries at their owning boundaries. Do not generically sort arrays whose order is invocation or precedence semantics.

### Validation and diagnostics

Use explicit type/shape validation with stable messages (see `src/lifecycle/router-lifecycle.mjs:58-70`). Separate visibility from dispatchability. Keep severity typed as informational, dispatch-blocking, or build-blocking.

### Installation safety

Use preflight, ownership fingerprints, temporary-file rename, rollback of newly created files, and readiness checks (`src/lifecycle/router-lifecycle.mjs:77-149`). Preserve settings/additions, as asserted by `tests/router.settings-diff.test.mjs:74-129` and idempotency at lines 146-170.

## No Analog Found

No file is wholly without an analog. The repository has no existing runtime-neutral canonical schema or dual-runtime adapter, so their domain rules must come from `11-CONTEXT.md` and `11-RESEARCH.md`; the coding, filesystem, aggregation, hashing, testing, and installer patterns above are established locally.

## Metadata

**Analog search scope:** `src/`, `tests/`, `install-router.mjs`, approved Phase 11 implementation plan
**Primary analogs read:** 5 (`src/lifecycle/router-lifecycle.mjs`, `install-router.mjs`, `tests/router.lifecycle.test.mjs`, `tests/router.settings-diff.test.mjs`, `tests/router.mjs.snapshot`)
**Pattern extraction date:** 2026-07-14
