# Router Inventory Auto-Update Audit

**Audited:** 2026-07-14  
**Scope:** Global skills, plugin skills, agents, commands, hooks, manifest freshness, mode-map routing, cache invalidation, and live diagnostics.  
**Verdict:** **FAIL** for automatic, intervention-free add/change/delete handling.

## Executive Summary

The manifest builder correctly discovers additions and removals **when it is run manually**. The always-on router does not run it. The hook only considers the manifest stale when either:

1. `build_manifest.py` is newer than the manifest, or
2. the manifest is older than seven days.

Changes to skill, agent, command, hook, plugin, or settings files are not part of the freshness calculation. A fresh manifest can therefore remain silently incorrect after inventory changes. Once declared stale, the hook only emits a reminder to run the builder; it deliberately does not rebuild.

Even after rebuilding, newly discovered assets do not automatically receive semantic routes. They enter the inventory as `unmapped` unless an existing `mode-map.json` entry already names them. The current live runtime reports 279 discovered items but only 31 routeable items and 195 unmapped items.

## Acceptance Matrix

| Change | Discovered after manual rebuild | Detected immediately by live hook | Automatically route-mapped | Automatically made safe after deletion | Result |
|---|---:|---:|---:|---:|---|
| Add global skill | Yes | No | No | N/A | Fail |
| Change global skill description | Yes | No | No route recalibration | N/A | Fail |
| Delete global skill | Yes | No | No cleanup | Removed from corpus after rebuild; stale target reported | Partial |
| Add agent | Yes | No | No | N/A | Fail |
| Delete agent | Yes | No | No cleanup | Removed from corpus after rebuild; stale target reported | Partial |
| Add plugin/gsd command | Yes | No | No | N/A | Fail |
| Delete plugin/gsd command | Yes | No | No cleanup | Schema-backed slash route may incorrectly remain `ok` | Fail |
| Add `~/.claude/commands/*.md` | No | No | No | N/A | Fail |
| Add/delete hook file | Yes | No | Not applicable; hooks are diagnostic-only | Binding is not added/removed automatically | Fail for lifecycle automation |
| Change hook binding in settings | Yes after rebuild | No | Not applicable | No automatic reconciliation | Fail |

## Findings

### Critical — Removed slash commands can remain valid routing targets

`validateRouteTargets()` treats a slash entry whose `mode === id` as an intentional schema route whenever `modeMap.schema_version` exists. It does not require the command to exist in the rebuilt manifest.

Isolated reproduction after deleting a command:

```json
{"id":"gone-command","invoke_kind":"slash","status":"ok","reason":"route targets resolve"}
```

The same test correctly classified deleted skill and agent targets as `stale_target`. A deleted command can therefore leave a route that tells the model to run a command that no longer exists.

### High — Inventory changes do not trigger manifest rebuilding

`checkFreshness()` compares only manifest age and builder mtime. It does not watch or fingerprint:

- `~/.claude/skills/`
- `~/.agents/skills/`
- plugin skill directories
- `~/.claude/agents/`
- plugin agent directories
- plugin/GSD command directories
- `~/.claude/hooks/`
- `~/.claude/settings.json`
- plugin installation metadata

The design explicitly keeps rebuilding out of the prompt hook for latency reasons. Staleness produces a reminder, not an automatic update.

### High — Discovery is not semantic mapping

After a manual rebuild, new skills, agents, and commands enter the BM25 corpus, but route coverage still classifies them as `unmapped` unless `mode-map.json` already references their name. There is no automatic mode-map creation, route selection, signal-pattern generation, calibration, or approval step.

This means a new asset can influence raw BM25 ranking without having a reviewed invocation contract, while the formal route inventory still reports it as unmapped. The system provides recommendations through health/coverage output, but does not apply them.

### High — `~/.claude/commands/` is not scanned

The builder only recursively scans `commands/*.md` under:

- `~/.claude/plugins/`
- `~/.claude/gsd-core/`

A command placed directly in `~/.claude/commands/` was not discovered in the isolated test. Plugin/GSD commands were discovered correctly.

### Medium — Deleted skill/agent routes require manual cleanup

After a rebuild, deleted skills and agents leave the matchable corpus and are reported as stale route targets. This prevents them from scoring through their former manifest entries, but the mode-map records remain until manually removed or edited. Diagnostics recommend the repair but do not perform it.

### Medium — Hook lifecycle is inventory-only

Hooks are intentionally excluded from the matchable routing corpus because they are event-bound rather than prompt-invokable. Adding a hook file only makes it diagnostic inventory after a rebuild; it does not register the hook in `settings.json`. Deleting a file does not remove its settings binding. File inventory and event binding therefore need reconciliation.

### Medium — Project skill discovery is hardcoded

The builder has a fixed `PROJECT_SKILL_DIRS` list that currently includes AutomaticTrading. New project-local `.claude/skills` directories outside that list are not discovered automatically.

### Correct behavior — Cache invalidation after a real rebuild

Once the manifest is rebuilt, its mtime changes and the route cache key changes. Mode-map, graph, and surface mtimes also participate in cache invalidation. Cache invalidation is therefore correct **after** the upstream files are updated; it does not solve inventory-change detection.

### Correct behavior — Safety and diagnostics

- Missing-MCP agents are excluded from automatic dispatch.
- Hooks and MCP servers are classified as diagnostics/dependencies instead of false route gaps.
- Missing/corrupt manifests fail open rather than blocking prompts.
- Health, routes, unmapped, and coverage commands expose actionable next fixes.
- Focused lifecycle suite passed 46/46.

## Executed Evidence

### Isolated add/delete manifest test

The temporary builder test added one skill, agent, plugin command, and hook:

```json
{"skills":["audit-skill"],"agents":["audit-agent"],"commands":["audit-command"],"hooks":["audit-hook.js"]}
```

After moving all four out of their scanned locations and rerunning the builder:

```json
{"skills":[],"agents":[],"commands":[],"hooks":[]}
```

Conclusion: builder add/delete behavior works; automatic triggering does not exist.

### Focused suite

```text
tests: 46
pass: 46
fail: 0
```

Covered freshness, cache mtime invalidation, inventory coverage, route-target safety, and live health utilities.

### Live runtime snapshot

```text
Manifest freshness: fresh
Hook status: ok
Discovered: 279
Routeable: 31
Unmapped: 195
Blocked missing-MCP agents: 8
Diagnostic-only hooks: 24
```

The overall doctor status is `warn`, primarily because large portions of the inventory remain unmapped and some agents require absent MCP servers.

## Required Changes for the Requested Guarantee

1. Add a cheap inventory fingerprint outside the hot path, covering all scanned roots plus settings/plugin metadata.
2. Trigger an atomic manifest rebuild from a filesystem watcher, install/uninstall hooks, or a debounced background worker—not synchronously inside `UserPromptSubmit`.
3. Include `~/.claude/commands/` and dynamically discover project-local skill roots.
4. Revalidate every mode-map target after rebuild and quarantine/remove deleted targets before routing.
5. Remove the schema-backed slash-command existence bypass, or replace it with an explicit allowlist for true virtual routes.
6. Add a proposal-and-validation pipeline for new unmapped assets: classify → propose route → calibration → safety checks → atomic activation.
7. Reconcile hook files with `settings.json` bindings and report orphan file/orphan binding states separately.
8. Add end-to-end tests that mutate temporary inventory roots and prove add/change/delete propagation through rebuild, mapping, cache invalidation, and routing.

## Final Determination

The system is reliable at **manual snapshot rebuild + diagnostics + cache invalidation**, but it is not a self-updating inventory and routing control plane. Adding, changing, or deleting skills, agents, commands, or hooks still requires intervention to rebuild the manifest and, for routeable assets, update and validate the mode map. A deleted schema-backed slash command is currently the most serious correctness gap.
