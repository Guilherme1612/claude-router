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

import { randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { HALF_LIFE_MS, MAX_RETENTION_MS, MINIMUM_SAMPLES } from '../evolution/evidence.mjs';
import { validateOutcomeEnvelope } from './outcome-schema.mjs';

export { HALF_LIFE_MS, MAX_RETENTION_MS, MINIMUM_SAMPLES };

const DEFAULT_COMPACT_MAX_BYTES = 1024 * 1024; // 1 MB
const waitArray = new Int32Array(new SharedArrayBuffer(4));

function mutationLock(root, { timeout_ms = 2_000, stale_ms = 30_000 } = {}) {
  const path = join(root, '.mutation.lock');
  const deadline = Date.now() + timeout_ms;
  const token = randomUUID();
  while (Date.now() <= deadline) {
    try {
      mkdirSync(path, { mode: 0o700 });
      writeFileSync(join(path, 'owner.json'), JSON.stringify({
        token, pid: process.pid, started_at: Date.now(),
      }), { mode: 0o600 });
      return {
        acquired: true,
        release() {
          try {
            const owner = JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8'));
            if (owner.token === token) rmSync(path, { recursive: true, force: true });
          } catch { /* lock ownership changed or root unavailable */ }
        },
      };
    } catch (error) {
      if (error.code !== 'EEXIST') return { acquired: false, reason_code: 'mutation_lock_failed' };
      try {
        const owner = JSON.parse(readFileSync(join(path, 'owner.json'), 'utf8'));
        let alive = true;
        try { process.kill(owner.pid, 0); } catch { alive = false; }
        if (!alive && Date.now() - owner.started_at > stale_ms) {
          rmSync(path, { recursive: true, force: true });
          continue;
        }
      } catch { /* owner publication may still be in progress */ }
      Atomics.wait(waitArray, 0, 0, 10);
    }
  }
  return { acquired: false, reason_code: 'mutation_lock_timeout' };
}

export function createHealthStore({ root, lock: lockOptions } = {}) {
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
      const lock = mutationLock(healthRoot, lockOptions);
      if (!lock.acquired) return { status: 'denied', reason_code: lock.reason_code };
      try {
        const duplicate = readOutcomesLines().some((line) => {
          if (!line) return false;
          try { return JSON.parse(line)?.fingerprint === validated.signal.fingerprint; } catch { return false; }
        });
        if (duplicate) return { status: 'duplicate', reason_code: 'duplicate_fingerprint', fingerprint: validated.signal.fingerprint };
        appendFileSync(outcomesPath, `${JSON.stringify(validated.signal)}\n`, { flag: 'a', mode: 0o600 });
        return { status: 'stored', fingerprint: validated.signal.fingerprint };
      } finally {
        lock.release();
      }
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
        // WR-02: skip compaction markers (audit-trail records with no
        // timestamp_ms) WITHOUT counting them as corrupt — they are legitimate
        // records explicitly preserved by compact. Counting them inflated
        // corrupt_line_skipped by one per compaction and masked real
        // corruption.
        if (record.compacted_at_ms !== undefined) continue;
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
      const lock = mutationLock(healthRoot, lockOptions);
      if (!lock.acquired) return { status: 'blocked', reason_code: lock.reason_code, dropped: 0 };
      try {
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
          if (!Number.isSafeInteger(record.timestamp_ms)) { corrupt += 1; continue; }
          if (record.timestamp_ms < retentionFloor) { dropped += 1; continue; }
          kept.push(line);
        }
        const marker = { compacted_at_ms: now, dropped, corrupt_line_skipped: corrupt, policy_version: 'health-policy-v1' };
        const rewritten = [...kept, JSON.stringify(marker)].join('\n');
        const tmp = `${outcomesPath}.compact-${process.pid}-${Date.now()}`;
        writeFileSync(tmp, `${rewritten}\n`, { mode: 0o600 });
        let fd;
        try { fd = openSync(tmp, 'r'); fsyncSync(fd); } catch { /* best-effort */ } finally { if (fd !== undefined) try { closeSync(fd); } catch { /* best-effort */ } }
        renameSync(tmp, outcomesPath);
        return { status: 'compacted', dropped };
      } finally {
        lock.release();
      }
    },
  });
}
