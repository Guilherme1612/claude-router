---
phase: 01-router-core-closed-loop-mode-map-calibration-gate
plan: 06
subsystem: router
tags: [gap-closure, routing, signal-patterns, calibration]
status: complete
completed_date: 2026-07-09
tasks: 2
---

# Phase 1 Plan 06: Gap Closure — Exploration/Review Prompt Routing Summary

Closed the Phase 1 routing gap where composite exploration/review prompts could under-route because review and exploration terms split BM25 confidence across adjacent entries.

## One-liner

Added composite natural-language signal patterns for exploration and review prompts, then verified calibration stayed green and the originally failing live-style prompt no longer routes as low confidence.

## What Was Built

- Updated `mode-map.json` exploration/review entries with composite phrases such as "explore and review", "look for bugs", "phase ready", and "review this".
- Verified the canonical calibration gate stayed above threshold after the signal-pattern update.
- Smoke-checked the originally failing prompt shape: "Explore this database, review it, look for bugs, and make it phase ready."

## Verification

- `node /Users/guilherme/.claude/router/router.calibrate.mjs` passed the calibration gate.
- The live-style exploration/review prompt produced a non-low route with router injection semantics preserved.
- No hook contract, sentinel, manifest shape, or fail-open behavior changes were introduced.

## Outcome

The gap-closure plan is complete. Phase 1 has matching plan and summary artifacts for all six plans.
