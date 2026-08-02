---
phase: 33-shadow-log-observer
status: passed
audited: 2026-08-01
---

# Phase 33 Security Audit

- Raw prompt text, command arguments, tool input/output, transcript paths, and raw invoked capability names are not persisted.
- Prompt and invocation correlation uses SHA-256 signatures; shadow records are written append-only with mode `0600` under a `0700` router directory.
- Cache-hit rows, stale rows, other-runtime rows, malformed payloads, duplicate settlements, and active Stop recursion are excluded or ignored.
- Observer errors fail open and do not alter routing or block hook completion.

Result: no Phase 33 security findings.
