---
phase: 35-per-project-routing
status: passed
audited: 2026-08-01
---

# Phase 35 Security Audit

- Only absolute `projects` keys from `~/.claude.json` are accepted as project roots; relative keys fail closed.
- The prompt path performs string comparison only and never reads a project filesystem or follows a project-provided path.
- A project skill is exposed only for `root` or `root/child`, preventing sibling and prefix-collision leakage.
- Project content remains in the existing manifest fingerprint, so stale cached routes recompute after project add/remove changes.

Result: no Phase 35 security findings.
