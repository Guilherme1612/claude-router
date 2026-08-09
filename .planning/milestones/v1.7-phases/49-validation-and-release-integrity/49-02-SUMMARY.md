---
phase: 49-validation-and-release-integrity
plan: 02
status: complete
completed: 2026-08-09
---

# Plan 49-02 Summary

Extended `scripts/release-v17-gate.mjs` to verify fresh Claude/Codex installed closure, canonical manager projections, archive invariant in final mode, and local tag-to-HEAD identity. Phase mode writes structured pre-archive evidence without pretending a tag or archive exists.

Verification: `rtk node scripts/release-v17-gate.mjs --phase --no-tests` passes with both installed runtimes and the v1.7 planning projection.

