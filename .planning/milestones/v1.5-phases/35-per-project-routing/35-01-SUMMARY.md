---
phase: 35-per-project-routing
plan: 01
status: complete
requirements-completed: [PROJ-01, PROJ-03]
---

# Plan 01 Summary

The manifest builder now derives absolute project roots from `~/.claude.json` and unions them with the existing explicit project-skill override.

- Project `.claude/skills` entries are emitted in the existing `project_scoped_skills` collection.
- Duplicate roots are removed and relative config keys are ignored.
- Existing manifest fingerprint inputs already include the project entries, so discovery changes advance the epoch.

Verification: `router.build-manifest.test.mjs` passes 15/15.
