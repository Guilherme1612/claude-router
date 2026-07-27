// Phase 24 — Health state persistence. Mirrors createPersistentEvidenceStore
// (src/evolution/evidence.mjs) but under ~/.claude/router/health/ — a SIBLING
// of evidence/, not a parent (D-5 scope isolation). 0600 perms on every file,
// 0700 on the dir, append-only JSONL for outcomes.jsonl.
//
// D-5: this module must NOT import src/registry/activate.mjs or
// src/prompt/publish-index.mjs. Health state is orthogonal to the authoritative
// registry and the active routing map (CONTEXT.md invariant).

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { validateOutcomeEnvelope } from './outcome-schema.mjs';

export function createHealthStore({ root } = {}) {
  const healthRoot = root || join(homedir(), '.claude', 'router', 'health');
  mkdirSync(healthRoot, { recursive: true, mode: 0o700 });
  const outcomesPath = join(healthRoot, 'outcomes.jsonl');

  return Object.freeze({
    healthRoot,
    outcomesPath,

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

    // readWindow returns records in the [fromMs, toMs] window. Wave 1 minimal
    // shape; Plan 24-02 Task 2 adds MAX_RETENTION_MS filtering, the `now`
    // parameter, and a corrupt_line_skipped counter.
    readWindow({ fromMs, toMs } = {}) {
      const records = [];
      if (!existsSync(outcomesPath)) return { records, total: 0 };
      const lines = readFileSync(outcomesPath, 'utf8').split('\n');
      for (const line of lines) {
        if (line.length === 0) continue;
        let record;
        try { record = JSON.parse(line); } catch { continue; }
        if (!record || typeof record !== 'object') continue;
        if (fromMs !== undefined && Number.isSafeInteger(record.timestamp_ms) && record.timestamp_ms < fromMs) continue;
        if (toMs !== undefined && Number.isSafeInteger(record.timestamp_ms) && record.timestamp_ms > toMs) continue;
        records.push(record);
      }
      return { records, total: records.length };
    },

    count() {
      if (!existsSync(outcomesPath)) return 0;
      const lines = readFileSync(outcomesPath, 'utf8').split('\n');
      return lines.filter((line) => line.length > 0).length;
    },
  });
}