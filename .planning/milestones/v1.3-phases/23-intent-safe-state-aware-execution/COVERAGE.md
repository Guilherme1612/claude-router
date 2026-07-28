# API Coverage — Phase 23

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

No external API integration: Phase 23 is stdlib-only Node ESM (no `node_modules`, no network, no LLM, no embeddings). The "integration" in `tests/router.dispatch-integration.test.mjs` and `dispatch-integration` test names refers to in-process composition of existing `src/orchestrator/*` + `src/registry/*` + `src/context/*` modules, not an external API surface. The hook wiring is deferred to Phase 26 (REL-01/REL-02). [VERIFIED: `.claude/CLAUDE.md` "Node.js stdlib only", "Per-prompt LLM API call" prohibition, `23-RESEARCH.md` "No external package is needed."]