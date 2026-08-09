# Phase 58 Context: Outcome and Graph Observability

## Goal

Make live observability useful without adding receipt I/O or correlation work to the prompt hot path.

## Decisions

- Reuse the existing JSONL telemetry, shadow, receipt, health, and audit stores.
- Add only a scalar `route_id` anchor to newly emitted telemetry; receipt attribution already accepts the same action route identity.
- Perform correlation in one standard-library-only report command after routing, never while producing prompt-time injection.
- Persist counts, bounded classifications, hashes/identifiers, and remediation codes only; never copy prompts, commands, stdout, stderr, cwd values, or raw JSONL lines.
- Treat `graph_missing` as an actionable open classification until a local graph is available or the operator explicitly marks the capability not applicable.

## Scope boundary

This phase does not add a database, daemon, dashboard, network service, graph builder, or automatic capability installation. Historical null telemetry remains historical evidence; the report distinguishes it from derived current outcome classifications.

## Evidence target

The report must show, per runtime, parse health, selected/ignored/rejected/substituted/completed/failed/accepted classifications, telemetry-to-receipt linkage, native identity and verification counts, health outcome kinds, graph-missing remediation state, and privacy-safe audit/shadow/controller-compatible counts.
