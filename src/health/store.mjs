// Phase 24 — Health state persistence. Mirrors createPersistentEvidenceStore
// (src/evolution/evidence.mjs) but under ~/.claude/router/health/ — a SIBLING
// of evidence/, not a parent (D-5 scope isolation). 0600 perms on every file,
// 0700 on the dir, append-only JSONL for outcomes.jsonl, atomic temp+rename+
// fsync for state.json.
//
// D-5: this module must NOT depend on src/registry/activate.mjs or
// src/prompt/publish-index.mjs. Health state is orthogonal to the authoritative
// registry and the active routing map (CONTEXT.md invariant).
//
// Reuse — do NOT redefine (RESEARCH "Don't Hand-Roll"): HALF_LIFE_MS,
// MAX_RETENTION_MS, MINIMUM_SAMPLES come from src/evolution/evidence.mjs so the
// health store shares the same decay/retention policy as the evidence store.

import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { HALF_LIFE_MS, MAX_RETENTION_MS, MINIMUM_SAMPLES } from '../evolution/evidence.mjs';
import { validateOutcomeEnvelope } from './outcome-schema.mjs';

export { HALF_LIFE_MS, MAX_RETENTION_MS, MINIMUM_SAMPLES };

const DEFAULT_COMPACT_MAX_BYTES = 1024 * 1024; // 1 MB

export function createHealthStore({ root } = {}) {
  const healthRoot = root || join(homedir(), '.claude', 'router', 'health');
  mkdirSync(healthRoot, { recursive: true, mode: 0o700 });
  const outcomesPath = join(healthRoot, 'outcomes.jsonl');
  const statePath = join(healthRoot, 'state.json');

  function readOutcomesLines() {
    if (!existsSync(outcomesPath)) return [];
    return readFileSync(outcomesPath, 'utf8').split('\n');
  }

  return Object.freeze({
    healthRoot,
    outcomesPath,
    statePath,

    // append validates the envelope first (T-24-01 trust boundary) and only
    // writes on acceptance. The validateOutcomeEnvelope call here is
    // defense-in-depth — observe.mjs already validates before returning; the
    // store re-validates so a future caller that bypasses observe.mjs still
    // cannot write a forbidden field to disk.
    append(record) {
      const validated = validateOutcomeEnvelope(record);
      if (validated.status !== 'accepted') return validated;
      appendFileSync(outcomesPath, `${JSON.stringify(validated.signal)}\n`, { flag: 'a', mode: 0o600 });
      return { status: 'stored', fingerprint: validated.signal.fingerprint };
    },

    // readWindow returns records in the [fromMs, toMs] window, filtered by
    // MAX_RETENTION_MS when `now` is supplied. Corrupt JSON lines are skipped
    // and counted in corrupt_line_skipped — never thrown (T-24-07).
    readWindow({ fromMs, toMs, now } = {}) {
      const records = [];
      let corrupt_line_skipped = 0;
      const lines = readOutcomesLines();
      const retentionFloor = Number.isSafeInteger(now) ? now - MAX_RETENTION_MS : null;
      for (const line of lines) {
        if (line.length === 0) continue;
        let record;
        try { record = JSON.parse(line); } catch { corrupt_line_skipped += 1; continue; }
        if (!record || typeof record !== 'object') { corrupt_line_skipped += 1; continue; }
        if (!Number.isSafeInteger(record.timestamp_ms)) { corrupt_line_skipped += 1; continue; }
        if (retentionFloor !== null && record.timestamp_ms < retentionFloor) continue;
        if (fromMs !== undefined && record.timestamp_ms < fromMs) continue;
        if (toMs !== undefined && record.timestamp_ms > toMs) continue;
        records.push(record);
      }
      return { records, total: records.length, corrupt_line_skipped };
    },

    count() {
      const lines = readOutcomesLines();
      return lines.filter((line) => line.length > 0).length;
    },

    // writeState — atomic temp+rename+fsync with 0600 perms (T-24-04). Mirrors
    // the durableWrite pattern in src/prompt/publish-index.mjs. Never throws on
    // a missing dir (mkdirSync 0o700 first); a corrupt state.json is treated as
    // null by readState, so a crash mid-write leaves the temp file orphaned and
    // the previous state.json intact (rename is atomic on POSIX).
    writeState(state) {
      const tmp = `${statePath}.tmp-${process.pid}-${Date.now()}`;
      writeFileSync(tmp, `${JSON.stringify(state ?? {})}\n`, { mode: 0o600 });
      // fsync the temp file's fd before rename so the bytes are durable on
      // disk; rename itself is atomic on POSIX. Best-effort — a fsync failure
      // still leaves the (complete) temp file for rename.
      let fd;
      try { fd = openSync(tmp, 'r'); fsyncSync(fd); } catch { /* best-effort */ } finally { if (fd !== undefined) try { closeSync(fd); } catch { /* best-effort */ } }
      renameSync(tmp, statePath);
      return { status: 'stored', path: statePath };
    },

    // readState returns null on missing or corrupt file — never throws (T-24-04
    // tampering mitigation: a corrupt state.json cannot break the admin path).
    readState() {
      if (!existsSync(statePath)) return null;
      try {
        const parsed = JSON.parse(readFileSync(statePath, 'utf8'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      } catch { return null; }
    },

    // compact — bounded compaction (HLTH-04). When outcomes.jsonl exceeds
    // maxBytes, records older than MAX_RETENTION_MS are dropped and a
    // compaction marker line is appended so the audit trail records the
    // compaction event (T-24-07 repudiation mitigation).
    compact({ maxBytes = DEFAULT_COMPACT_MAX_BYTES, now = Date.now() } = {}) {
      let stat;
      try { stat = statSync(outcomesPath); } catch { return { status: 'no_file', dropped: 0 }; }
      if (stat.size <= maxBytes) return { status: 'unchanged', dropped: 0 };

      const lines = readOutcomesLines();
      const retentionFloor = now - MAX_RETENTION_MS;
      const kept = [];
      let dropped = 0;
      let corrupt = 0;
      for (const line of lines) {
        if (line.length === 0) continue;
        let record;
        try { record = JSON.parse(line); } catch { corrupt += 1; continue; }
        if (!record || typeof record !== 'object') { corrupt += 1; continue; }
        // Preserve compaction marker lines (they carry compacted_at_ms).
        if (record.compacted_at_ms !== undefined) { kept.push(line); continue; }
        if (!Number.isSafeInteger(record.timestamp_ms) || record.timestamp_ms < retentionFloor) { dropped += 1; continue; }
        kept.push(line);
      }
      // WR-05: track corrupt/unreadable lines separately from retention-expired
      // drops so the compaction marker audit trail distinguishes the two (mirror
      // of readWindow's corrupt_line_skipped field).
      const marker = { compacted_at_ms: now, dropped, corrupt_line_skipped: corrupt, policy_version: 'health-policy-v1' };
      const rewritten = [...kept, JSON.stringify(marker)].join('\n');
      const tmp = `${outcomesPath}.compact-${process.pid}-${Date.now()}`;
      writeFileSync(tmp, `${rewritten}\n`, { mode: 0o600 });
      let fd;
      try { fd = openSync(tmp, 'r'); fsyncSync(fd); } catch { /* best-effort */ } finally { if (fd !== undefined) try { closeSync(fd); } catch { /* best-effort */ } }
      renameSync(tmp, outcomesPath);
      return { status: 'compacted', dropped };
    },
  });
}