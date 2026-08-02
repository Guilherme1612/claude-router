# Phase 35: Per-Project Routing - Context

## Goal

Make project-scoped Claude skills discoverable from `~/.claude.json` and routable only when the active cwd is inside the owning project root.

## Decisions

- Preserve `ROUTER_PROJECT_SKILL_DIRS` as an additive compatibility override; `.claude.json` absolute `projects` keys become the canonical discovered roots.
- Reuse the manifest's existing `project_scoped_skills` collection and the existing fingerprint input. No second project watcher or alternate manifest shape.
- Gate corpus inclusion with a pure normalized string-prefix comparison (`root` or `root/child`), never filesystem reads on the prompt path.
- Keep project skills out of the corpus outside their owning root and fail open on malformed or relative project entries.

## Deferred

- Project-specific MCP policy remains the existing `ROUTER_PROJECT_MCP_JSON`/`ROUTER_PROJECT_CONFIG_PATH` seam; this phase only changes skill discovery and routing scope.
