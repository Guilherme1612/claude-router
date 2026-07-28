// Phase 24 — Health admin CLI surface. Plan 24-01 shipped inspect (read-only).
// Plan 24-03 adds reset / dispose / recover (HLTH-05).
//
// D-5 (scope isolation): this module reads ~/.claude/router/health/ only. It
// must NOT depend on src/registry/activate.mjs or src/prompt/publish-index.mjs
// — health state is a sibling of evidence/, never a parent of registry/. The
// content-hash regression test in tests/router.health.admin.test.mjs enforces
// this at test time, and the W3 extended import gate (no import of the
// registry module, no write path to the weights artifact) defends all four
// protected artifacts at the import level too.
//
// D-4: the `health` subcommand family is distinct from the Phase 07
// `router doctor` / `router coverage` route-coverage diagnostics. router
// doctor reports router plumbing health; router health reports capability
// health. The one-line disambiguation is emitted by router-control.mjs
// usage(), not here.
//
// HLTH-05: reset/dispose/recover are all reversible by design — dispose
// renames rather than deletes; recover rebuilds from outcomes when the
// disposed file is missing. None of the three mutates outcomes.jsonl (the raw
// evidence is preserved across every admin command).

import { closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scoreCapability } from './score.mjs';

function canonical(command, ok, reasonCode, data = {}, warnings = []) {
  return { schema_version: 1, command, ok, reason_code: reasonCode, data, warnings: [...warnings].sort() };
}

// inspect is a read-only projection of outcomes.jsonl with bounded pagination.
// Never mutates state.json, registry/, or release-tuples/. Plan 24-03 extends
// it to surface a 'disposed' flag when state.disposed.json exists so the user
// can see health is currently disposed.
export function inspect({ healthRoot, limit = 100, offset = 0 } = {}) {
  const outcomesPath = join(healthRoot, 'outcomes.jsonl');
  const statePath = join(healthRoot, 'state.json');
  const disposedPath = join(healthRoot, 'state.disposed.json');
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
    disposed: existsSync(disposedPath) && !existsSync(statePath),
  });
}

// atomicWriteState — temp+rename+fsync with 0600 perms (mirrors store.mjs
// durableWrite). Used by reset and recover.
function atomicWriteState(statePath, state) {
  const tmp = `${statePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(state ?? {})}\n`, { mode: 0o600 });
  let fd;
  try { fd = openSync(tmp, 'r'); fsyncSync(fd); } catch { /* best-effort */ } finally { if (fd !== undefined) try { closeSync(fd); } catch { /* best-effort */ } }
  renameSync(tmp, statePath);
}

// reset — atomic-write state.json to '{}' (0600 perms). Does NOT touch
// outcomes.jsonl; the raw evidence is preserved. Returns canonical('health',
// true, 'reset_ok', { path }).
export function reset({ healthRoot } = {}) {
  const statePath = join(healthRoot, 'state.json');
  atomicWriteState(statePath, {});
  return canonical('health', true, 'reset_ok', { path: statePath });
}

// dispose — rename state.json → state.disposed.json (recoverable, not deleted).
// Does NOT touch outcomes.jsonl. Idempotent: if state.json is already gone and
// state.disposed.json exists, returns 'already_disposed'; if neither exists,
// returns 'nothing_to_dispose'.
export function dispose({ healthRoot } = {}) {
  const statePath = join(healthRoot, 'state.json');
  const disposedPath = join(healthRoot, 'state.disposed.json');
  if (!existsSync(statePath)) {
    if (existsSync(disposedPath)) return canonical('health', false, 'already_disposed', { disposed_path: disposedPath });
    return canonical('health', false, 'nothing_to_dispose', {});
  }
  // If a previously-disposed file exists, overwrite it with the current state
  // (the current state is strictly newer than the prior disposed snapshot).
  renameSync(statePath, disposedPath);
  return canonical('health', true, 'dispose_ok', { disposed_path: disposedPath });
}

// recover — if state.disposed.json exists, rename it → state.json (atomic).
// Otherwise rebuild state.json from outcomes.jsonl by re-deriving per-capability
// state via score.scoreCapability (Plan 24-02). Does NOT touch outcomes.jsonl.
// Returns canonical('health', true, 'recover_restored' | 'recover_rebuilt',
// { recovered_from, capability_count }).
export function recover({ healthRoot } = {}) {
  const statePath = join(healthRoot, 'state.json');
  const disposedPath = join(healthRoot, 'state.disposed.json');
  const outcomesPath = join(healthRoot, 'outcomes.jsonl');

  if (existsSync(disposedPath)) {
    // If state.json somehow also exists, state.json is authoritative — nothing
    // was restored from the disposed snapshot. Report that explicitly (WR-02:
    // the prior `recovered_from: 'disposed'` was misleading because no move
    // happened) and discard the stale disposed snapshot best-effort.
    if (existsSync(statePath)) {
      try { rmSync(disposedPath); } catch { /* best-effort */ }
      return canonical('health', true, 'recover_restored', { recovered_from: 'state_json_authoritative', capability_count: countCapabilities(statePath) });
    }
    renameSync(disposedPath, statePath);
    return canonical('health', true, 'recover_restored', { recovered_from: 'disposed', capability_count: countCapabilities(statePath) });
  }

  // Rebuild from outcomes.jsonl. A missing/corrupt outcomes file yields an
  // empty state (T-24-16 fail-open).
  const state = rebuildStateFromOutcomes(outcomesPath);
  atomicWriteState(statePath, state);
  return canonical('health', true, 'recover_rebuilt', { recovered_from: 'outcomes', capability_count: Object.keys(state).length });
}

function countCapabilities(statePath) {
  try {
    const parsed = JSON.parse(readFileSync(statePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed).length : 0;
  } catch { return 0; }
}

// rebuildStateFromOutcomes — group outcomes by capability_id and call
// scoreCapability for each group. A corrupt/missing outcomes file yields an
// empty object (T-24-16 fail-open, never throws). scoreCapability requires
// sample_count >= MINIMUM_SAMPLES to produce a non-null score; below the
// floor it returns tier='unjudged' which we still persist so the user sees
// the capability was observed.
function rebuildStateFromOutcomes(outcomesPath) {
  if (!existsSync(outcomesPath)) return {};
  const byCap = new Map();
  const lines = readFileSync(outcomesPath, 'utf8').split('\n');
  for (const line of lines) {
    if (line.length === 0) continue;
    let record;
    try { record = JSON.parse(line); } catch { continue; }
    if (!record || typeof record !== 'object') continue;
    const id = record.capability_id;
    if (typeof id !== 'string' || !id) continue;
    if (!byCap.has(id)) byCap.set(id, []);
    byCap.get(id).push(record);
  }
  const state = {};
  const now = Date.now();
  for (const [capId, outcomes] of byCap.entries()) {
    try {
      const scored = scoreCapability({ outcomes, contract: null, now });
      state[capId] = {
        usefulness_basis_points: scored.usefulness_basis_points,
        tier: scored.tier,
        sample_count: scored.sample_count,
        reason_codes: scored.reason_codes,
        rebuilt_at_ms: now,
      };
    } catch {
      // A single malformed group must not break the rebuild (T-24-16).
      state[capId] = { tier: 'unjudged', sample_count: outcomes.length, reason_codes: ['rebuild_skipped'], rebuilt_at_ms: now };
    }
  }
  return state;
}