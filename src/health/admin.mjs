// Phase 24 — Health admin CLI surface. Wave 1 ships inspect only; reset /
// dispose / recover land in Plan 24-03 (Wave 3).
//
// D-5 (scope isolation): this module reads ~/.claude/router/health/outcomes.jsonl
// only. It must NOT depend on src/registry/activate.mjs or
// src/prompt/publish-index.mjs — health state is a sibling of evidence/, never
// a parent of registry/. The content-hash regression test in Plan 24-03 Task 2
// enforces this at test time.
//
// D-4: the `health` subcommand family is distinct from the Phase 07
// `router doctor` / `router coverage` route-coverage diagnostics. router
// doctor reports router plumbing health; router health reports capability
// health. The one-line disambiguation is emitted by router-control.mjs
// usage(), not here.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function canonical(command, ok, reasonCode, data = {}, warnings = []) {
  return { schema_version: 1, command, ok, reason_code: reasonCode, data, warnings: [...warnings].sort() };
}

// inspect is a read-only projection of outcomes.jsonl with bounded pagination.
// Never mutates state.json, registry/, or release-tuples/.
export function inspect({ healthRoot, limit = 100, offset = 0 } = {}) {
  const outcomesPath = join(healthRoot, 'outcomes.jsonl');
  const records = [];
  if (existsSync(outcomesPath)) {
    const lines = readFileSync(outcomesPath, 'utf8').split('\n');
    for (const line of lines) {
      if (line.length === 0) continue;
      let record;
      try { record = JSON.parse(line); } catch { continue; }
      if (!record || typeof record !== 'object') continue;
      records.push(record);
    }
  }
  const total = records.length;
  const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? limit : 100;
  const safeOffset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
  const window = records.slice(safeOffset, safeOffset + safeLimit);
  return canonical('health', true, 'inspect_ok', {
    records: window,
    total,
    limit: safeLimit,
    offset: safeOffset,
    truncated: safeOffset + window.length < total,
  });
}