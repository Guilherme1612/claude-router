---
phase: 28-coverage-audit-guard
reviewed: 2026-07-29T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - build-manifest.mjs
  - coverage-baseline.json
  - src/coverage/audit.mjs
  - src/lifecycle/router-lifecycle.mjs
  - tests/router.build-manifest.test.mjs
  - tests/router.coexistence.test.mjs
  - tests/router.coverage-audit.test.mjs
  - tests/router.freshness.test.mjs
  - tests/router.installer-coexistence.test.mjs
  - tests/router.lifecycle.test.mjs
  - tests/router.safety-release.test.mjs
  - /Users/guilherme/.claude/hooks/router.mjs
findings:
  critical: 1
  warning: 0
  info: 0
  total: 1
status: issues_found
---

# Phase 28: Code Review Report

**Reviewed:** 2026-07-29T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Final iteration confirms CR-01 through CR-05 are closed. One additional live-validator parity gap remains: the strict audit accepts project-scoped skills as global mode-map targets. The focused scope remains green (the updated coverage suite included the CR-05 regression), but it has no project-scope forward-target parity case.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-06: Project-scoped skills are accepted as global route targets

**File:** `src/coverage/audit.mjs:49,68`
**Issue:** `routeableSkill` excludes only non-global `agents_store_skills`; every `project_scoped_skills` row is still inserted into `indexes.skill`. A mode-map entry recommending a project-only skill therefore creates no forward diagnostic. The record itself is classified `expected_scope_project`, so the report has neither a reverse gap nor a forward diagnostic and `--strict-coverage` can exit zero. The installed live validator's `knownSkillTargets` deliberately contains only global skills, plugin skills, and global agent-store skills (`/Users/guilherme/.claude/hooks/router.mjs:623-643`) and reports the identical target as `stale_target`. This violates COV-03 forward orphan detection and the promised live-validator parity.
**Fix:**
```js
routeableSkill: (
  category !== 'project_scoped_skills'
  && (category !== 'agents_store_skills' || entry?.scope === 'global')
),
```
Add a parity test with one `project_scoped_skills` entry and a non-warn route recommending it; assert the live validator and audit both produce a stale-target diagnostic and strict builder mode exits non-zero.

---

_Reviewed: 2026-07-29T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
