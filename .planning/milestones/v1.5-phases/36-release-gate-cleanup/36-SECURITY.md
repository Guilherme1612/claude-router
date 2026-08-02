---
phase: 36-release-gate-cleanup
status: passed
audited: 2026-08-01
---

# Phase 36 Security Audit

- Controller replacement stops only a process whose PID and configuration fingerprint match the owned router state; the final fallback is SIGKILL only after cooperative shutdown and SIGTERM.
- Runtime noise filters use exact prefixes or suffix matches and keep `plugins/installed_plugins.json` visible as the authoritative plugin signal.
- Symlink escapes and cycles remain diagnostics and their content is excluded before reads; real-home readiness no longer converts safe exclusions into stale-root state.
- The live operator shell quarantined the unsafe candidate and returned `invalid_active_version`; no untrusted candidate was activated.

Result: no Phase 36 security findings.
