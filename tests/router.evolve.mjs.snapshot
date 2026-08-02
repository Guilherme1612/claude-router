// router.evolve.mjs — Phase-3 Evolution primitives (Plan 03-01 / Wave 1).
//
// Twelve pure-function exports that the future worker main() (Plan 03-02)
// composes into the evolution cycle:
//
//   1. correlateOutcomes      — D-04/D-05: telemetry -> {good,bad,unknown} labels
//   2. aggregatePerEntry      — D-05: per-entry {g,b,u} counts over outcomes
//   3. decayScores            — D-08: half g/b for stale entries; recompute score
//   4. proposeAdditions       — D-14.1: cluster confusion -> add-proposals
//   5. proposeEdits           — D-14.2: b/g ratio triggers signal_pattern edits
//   6. proposePrunes          — D-14.3: never-top-in-30d entries (not pinned)
//   7. applyMutation          — atomic-add: deep-clone map + pid-suffixed tmp path
//   8. revertMutation         — atomic-revert: same tmp path, no in-memory change
//   9. rotateTelemetry        — D-19: gzip+rename+truncate the telemetry file
//   10. readEvolutionState    — D-11: parse evolution-state.json or null
//   11. writeEvolutionState   — D-11: atomic temp+rename writer
//   12. writeWeights          — D-08: atomic temp+rename writer for weights.json
//
// Stdlib-only (D-29). No spawn, no main(), no isMain(), no process.exit — those
// land in Plan 03-02 alongside the worker. The hot path's main() (router.mjs)
// does NOT import this file in Plan 03-01.

import {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  renameSync,
  unlinkSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  createReadStream,
  createWriteStream,
  openSync,
  closeSync,
} from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';

// --- Constants (allowlists + thresholds) -----------------------------------

export const GOOD_COMMANDS = new Set([
  'gsd-verify',
  'gsd-ship',
  'gsd-quick',
  'gsd-complete-milestone',
]);
export const BAD_COMMANDS = new Set([
  'gsd-debug',
  'gsd-undo',
  'gsd-forensics',
  'gsd-capture',
]);
export const GOOD_PHRASES = /\b(thanks|thank you|done|ship|shipped|looks good|perfect|great|nice work|that works|all good)\b/i;
export const BAD_PHRASES = /\b(wrong|redo|actually|not what i asked|try again|no[,.]?|that's not|nah,|incorrect|mistake)\b/i;

export const WINDOW_MINUTES = 30;
export const DECAY_DAYS = 14;
export const PRUNE_DAYS = 30;
export const CONFUSION_CLUSTER_MIN = 5;
export const EDIT_BAD_RATIO = 2;        // b > 2*g + 5
export const EDIT_BAD_RATIO_HIGH = 5;   // HIGH-tier: b > 5*g + 10
export const EDIT_BAD_RATIO_OFFSET = 5; // b > 2*g + 5 -> +5
export const EDIT_BAD_RATIO_HIGH_OFFSET = 10; // HIGH-tier: b > 5*g + 10 -> +10
export const ROTATION_SIZE_BYTES = 5 * 1024 * 1024;     // 5MB
export const DISK_BUDGET_BYTES = 100 * 1024 * 1024;     // 100MB
export const DEFAULT_MAX_SIGNAL_PATTERNS = 15;

// --- 1. correlateOutcomes --------------------------------------------------

/**
 * Correlate each telemetry entry E (with non-null suggested_mode) to the next
 * downstream event E' within WINDOW_MINUTES (default 30). E' classifies E as
 * 'good', 'bad', or 'unknown' per the GOOD/BAD command + phrase allowlists
 * (D-04). Cwd match is loose: a null cwd on either side is treated as a match
 * (WARNING 4 fix: `null === undefined` is false in JS, so a strict === would
 * break the match for partial-cwd telemetry lines).
 *
 * @param {Array<object>} telemetry - parsed JSONL lines
 * @param {object} [opts]
 * @param {number} [opts.windowMinutes=30]
 * @param {RegExp} [opts.goodPhrases=GOOD_PHRASES]
 * @param {RegExp} [opts.badPhrases=BAD_PHRASES]
 * @param {Set<string>} [opts.goodCommands=GOOD_COMMANDS]
 * @param {Set<string>} [opts.badCommands=BAD_COMMANDS]
 * @returns {Array<{prompt_signature, ts, cwd, suggested_mode, outcome, downstream_event: string|null}>}
 */
export function correlateOutcomes(telemetry, opts = {}) {
  const winMs = (opts.windowMinutes ?? WINDOW_MINUTES) * 60 * 1000;
  const goodPhrases = opts.goodPhrases ?? GOOD_PHRASES;
  const badPhrases = opts.badPhrases ?? BAD_PHRASES;
  const goodCommands = opts.goodCommands ?? GOOD_COMMANDS;
  const badCommands = opts.badCommands ?? BAD_COMMANDS;

  // Normalize and sort by ts ascending (preserves relative order on ties).
  const sorted = [...telemetry].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const out = [];

  for (let i = 0; i < sorted.length; i++) {
    const E = sorted[i];
    if (E.suggested_mode == null) continue; // pass-through: no correlation
    const eTs = E.ts || 0;
    let outcome = 'unknown';
    let downstream_event = null;

    // Look forward for the next qualifying event within winMs.
    for (let j = i + 1; j < sorted.length; j++) {
      const E2 = sorted[j];
      const dTs = (E2.ts || 0) - eTs;
      if (dTs > winMs) break; // window exceeded
      // Loose cwd match (WARNING 4 fix).
      if (E.cwd && E2.cwd && E.cwd !== E2.cwd) continue;
      // First qualifying downstream event wins.
      downstream_event = E2.prompt || E2.suggested_mode || E2.downstream_event || String(E2.ts || '');
      // Classify by command (slash) or phrase.
      const text = String(downstream_event || '');
      if (startsWithSlashCommand(text, badCommands) || badPhrases.test(text)) {
        outcome = 'bad';
      } else if (startsWithSlashCommand(text, goodCommands) || goodPhrases.test(text)) {
        outcome = 'good';
      } else {
        outcome = 'unknown';
      }
      break; // first match wins
    }

    out.push({
      prompt_signature: E.prompt_signature,
      ts: E.ts,
      cwd: E.cwd || null,
      suggested_mode: E.suggested_mode,
      outcome,
      downstream_event,
    });
  }
  return out;
}

function startsWithSlashCommand(text, commandSet) {
  // "/gsd-debug foo" -> gsd-debug; "gsd-debug foo" -> gsd-debug; case-insensitive
  const t = String(text || '').trim().toLowerCase();
  if (!t) return false;
  const stripped = t.startsWith('/') ? t.slice(1) : t;
  const first = stripped.split(/\s+/)[0];
  return commandSet.has(first);
}

// --- 2. aggregatePerEntry --------------------------------------------------

/**
 * Aggregate correlated outcomes into per-entry counts {g, b, u} keyed on the
 * mode-map entry `id` (e.g. 'gsd-debug'). The outcome's `suggested_mode` is
 * matched against (modeMap.entries[].id) (D-05).
 *
 * @param {Array<object>} outcomes - correlateOutcomes output
 * @param {object} modeMap - parsed mode-map.json
 * @returns {Map<string, {g: number, b: number, u: number}>}
 */
export function aggregatePerEntry(outcomes, modeMap) {
  const counts = new Map();
  const entryIds = new Set((modeMap?.entries || []).map((e) => String(e.id)));
  for (const o of outcomes) {
    const key = o.suggested_mode;
    if (key == null) continue;
    if (!entryIds.has(String(key))) continue; // only count entries in the mode-map
    if (!counts.has(String(key))) counts.set(String(key), { g: 0, b: 0, u: 0 });
    const c = counts.get(String(key));
    if (o.outcome === 'good') c.g++;
    else if (o.outcome === 'bad') c.b++;
    else c.u++;
  }
  return counts;
}

// --- 3. decayScores --------------------------------------------------------

/**
 * Halve g and b (integer division) for entries whose `updated_at` is older
 * than `decayDays`. Recompute `score = g / max(1, g + b)` (D-08).
 *
 * @param {{weights: Object<string, {g: number, b: number, u?: number, score: number, updated_at: string|number}>}} weights
 * @param {number} now - Date.now() in ms
 * @param {number} [decayDays=14]
 * @returns {object} new weights object (input not mutated)
 */
export function decayScores(weights, now, decayDays = DECAY_DAYS) {
  const msPerDay = 24 * 3600 * 1000;
  const cloned = {
    ...weights,
    weights: Object.fromEntries(
      Object.entries(weights?.weights || {}).map(([k, v]) => [k, { ...v }])
    ),
  };
  for (const [id, entry] of Object.entries(cloned.weights)) {
    const updated = entry.updated_at ? new Date(entry.updated_at).getTime() : 0;
    const ageDays = (now - updated) / msPerDay;
    if (ageDays > decayDays) {
      entry.g = Math.floor((entry.g || 0) / 2);
      entry.b = Math.floor((entry.b || 0) / 2);
      entry.score = entry.g / Math.max(1, entry.g + entry.b);
    }
  }
  return cloned;
}

// --- 4. proposeAdditions ----------------------------------------------------

/**
 * Cluster 'unknown' outcomes (top-2 mode confusion) and propose add-mutations
 * for clusters >= CONFUSION_CLUSTER_MIN. signal_patterns are 3-5 tokens
 * extracted from the cluster; never verbatim prompt text (D-14.1). New
 * entries are marked `initial_tier: 'low'` (D-17).
 *
 * @param {Array<object>} outcomes
 * @param {object} modeMap
 * @param {number} [minCluster=5]
 * @returns {Array<{kind: 'add', entry: object}>}
 */
export function proposeAdditions(outcomes, modeMap, minCluster = CONFUSION_CLUSTER_MIN) {
  // Cluster by (top-1 mode, top-2 mode confusion pair).
  const clusters = new Map();
  for (const o of outcomes) {
    if (o.outcome !== 'unknown') continue;
    if (!o.suggested_mode) continue;
    const key = String(o.suggested_mode);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(o);
  }

  const proposals = [];
  const existingPatterns = new Set();
  for (const e of (modeMap?.entries || [])) {
    for (const p of (e.signal_patterns || [])) existingPatterns.add(String(p).toLowerCase());
  }

  for (const [mode, cluster] of clusters) {
    if (cluster.length < minCluster) continue;
    // Extract tokens from prompt_signature (signature is hash; use downstream_event as proxy for tokens).
    const tokenCounts = new Map();
    const stop = new Set(['the', 'a', 'an', 'is', 'are', 'to', 'of', 'for', 'in', 'on', 'and', 'or', 'how', 'i', 'we', 'you', 'my', 'me', 'do', 'does']);
    for (const o of cluster) {
      const text = String(o.downstream_event || '');
      const toks = text.toLowerCase().match(/[a-z][a-z0-9_-]{1,}/g) || [];
      for (const t of toks) {
        if (stop.has(t)) continue;
        if (t.length < 3) continue;
        tokenCounts.set(t, (tokenCounts.get(t) || 0) + 1);
      }
    }
    // Drop tokens that already appear in any existing entry's signal_patterns.
    const sorted = [...tokenCounts.entries()].sort((a, b) => b[1] - a[1]);
    const newSignals = sorted
      .map(([t]) => t)
      .filter((t) => !existingPatterns.has(t))
      .slice(0, 5);
    if (newSignals.length < 2) continue;

    const id = 'auto-' + createHash('sha256').update(mode + ':' + newSignals.join(',')).digest('hex').slice(0, 8);
    proposals.push({
      kind: 'add',
      entry: {
        id,
        mode,
        invoke_kind: 'slash',
        signal_patterns: newSignals.slice(0, 5),
        recommended_skills: [],
        recommended_agents: [],
        args_hint: '',
        initial_tier: 'low',
        auto_generated: true,
      },
    });
  }
  return proposals;
}

// --- 5. proposeEdits --------------------------------------------------------

/**
 * For each mode-map entry whose per-entry {g, b} triggers the bad-ratio
 * (b > 2*g + 5), propose an edit that extends signal_patterns. HIGH-tier
 * entries require the sustained ratio (b > 5*g + 10) per D-14.2.
 *
 * @param {Map<string, {g: number, b: number}>} perEntry
 * @param {object} modeMap
 * @param {Array<object>} outcomes
 * @returns {Array<{kind: 'edit', id: string, signal_patterns: string[]}>}
 */
export function proposeEdits(perEntry, modeMap, outcomes) {
  const proposals = [];
  const entries = modeMap?.entries || [];
  const byMode = new Map();
  for (const o of outcomes) {
    if (o.outcome !== 'bad') continue;
    const k = String(o.suggested_mode || '');
    if (!byMode.has(k)) byMode.set(k, []);
    byMode.get(k).push(o);
  }
  const stop = new Set(['the', 'a', 'an', 'is', 'are', 'to', 'of', 'for', 'in', 'on', 'and', 'or', 'how', 'i', 'we', 'you', 'my', 'me', 'do', 'does']);
  for (const e of entries) {
    const c = perEntry.get(String(e.id));
    if (!c) continue;
    const isHigh = e.initial_tier === 'high' || e.tier === 'high';
    const ratioThresh = isHigh ? EDIT_BAD_RATIO_HIGH : EDIT_BAD_RATIO;
    const offsetThresh = isHigh ? EDIT_BAD_RATIO_HIGH_OFFSET : EDIT_BAD_RATIO_OFFSET;
    if (!(c.b > ratioThresh * c.g + offsetThresh)) continue;
    // Extract new sub-signals from the bad-cluster for this mode.
    const existing = new Set((e.signal_patterns || []).map((s) => String(s).toLowerCase()));
    const cluster = byMode.get(String(e.id)) || byMode.get(String(e.mode)) || [];
    const tokenCounts = new Map();
    for (const o of cluster) {
      const text = String(o.downstream_event || '');
      const toks = text.toLowerCase().match(/[a-z][a-z0-9_-]{1,}/g) || [];
      for (const t of toks) {
        if (stop.has(t)) continue;
        if (t.length < 3) continue;
        if (existing.has(t)) continue;
        tokenCounts.set(t, (tokenCounts.get(t) || 0) + 1);
      }
    }
    const newSignals = [...tokenCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 3);
    if (newSignals.length === 0) continue;
    const merged = [...(e.signal_patterns || []), ...newSignals].slice(0, DEFAULT_MAX_SIGNAL_PATTERNS);
    proposals.push({ kind: 'edit', id: e.id, signal_patterns: merged });
  }
  return proposals;
}

// --- 6. proposePrunes -------------------------------------------------------

/**
 * For each mode-map entry: if it has never been top in the last `pruneDays`
 * AND `pinned !== true`, propose a prune (D-14.3).
 *
 * @param {Array<object>} outcomes
 * @param {object} modeMap
 * @param {number} now - Date.now() in ms
 * @param {number} [pruneDays=30]
 * @returns {Array<{kind: 'prune', id: string}>}
 */
export function proposePrunes(outcomes, modeMap, now, pruneDays = PRUNE_DAYS) {
  const msPerDay = 24 * 3600 * 1000;
  const cutoff = now - pruneDays * msPerDay;
  const recentlyTop = new Set();
  for (const o of outcomes) {
    if ((o.ts || 0) < cutoff) continue;
    if (o.outcome === 'good' || o.outcome === 'bad') {
      if (o.suggested_mode) recentlyTop.add(String(o.suggested_mode));
    }
  }
  const proposals = [];
  for (const e of (modeMap?.entries || [])) {
    if (e.pinned === true) continue;
    if (recentlyTop.has(String(e.id)) || recentlyTop.has(String(e.mode))) continue;
    proposals.push({ kind: 'prune', id: e.id });
  }
  return proposals;
}

// --- 7. applyMutation -------------------------------------------------------

/**
 * Deep-clone the mode-map, apply the mutation, bump schema_version to 2 (D-13).
 * Returns {proposedMap, path} where path is the pid-suffixed temp path the
 * worker would rename-or-delete. Pure: no file I/O.
 *
 * @param {object} modeMap
 * @param {{kind: string, id?: string, entry?: object, signal_patterns?: string[]}} mutation
 * @param {string} [modeMapPath] - used to derive the tmp path
 * @returns {{proposedMap: object, path: string}}
 */
export function applyMutation(modeMap, mutation, modeMapPath = '/dev/null') {
  const proposedMap = JSON.parse(JSON.stringify(modeMap || { entries: [], schema_version: 1, thresholds: {} }));
  proposedMap.schema_version = 2;
  const entries = Array.isArray(proposedMap.entries) ? proposedMap.entries : [];
  proposedMap.entries = entries;

  if (mutation.kind === 'add') {
    entries.push(mutation.entry);
  } else if (mutation.kind === 'edit') {
    const idx = entries.findIndex((e) => e.id === mutation.id);
    if (idx >= 0) entries[idx] = { ...entries[idx], signal_patterns: mutation.signal_patterns };
  } else if (mutation.kind === 'prune') {
    proposedMap.entries = entries.filter((e) => e.id !== mutation.id);
  }

  const path = modeMapPath ? `${modeMapPath}.tmp.${process.pid}` : `/tmp/router-evolve-mode-map.tmp.${process.pid}`;
  return { proposedMap, path };
}

// --- 8. revertMutation ------------------------------------------------------

/**
 * Returns the input mode-map unchanged + the same tmp path the worker would
 * unlink. Pure: no file I/O.
 *
 * @param {object} modeMap
 * @param {object} _mutation
 * @param {string} [modeMapPath]
 * @returns {{proposedMap: object, path: string}}
 */
export function revertMutation(modeMap, _mutation, modeMapPath = '/dev/null') {
  const path = modeMapPath ? `${modeMapPath}.tmp.${process.pid}` : `/tmp/router-evolve-mode-map.tmp.${process.pid}`;
  return { proposedMap: modeMap, path };
}

// --- 9. rotateTelemetry -----------------------------------------------------

/**
 * If the telemetry file is >= opts.sizeBytes OR the oldest entry is older
 * than opts.decayDays, rotate:
 *   1. pipeline(readStream, gzip, writeStream) -> tmp .jsonl.gz
 *   2. renameSync(tmp, final .jsonl.gz)
 *   3. renameSync(telemetry, marker)
 *   4. writeFileSync(telemetry, '')
 *   5. unlinkSync(marker)
 * Disk-budget safety net (D-22): if archiveDir total > DISK_BUDGET_BYTES,
 * prune oldest archives until under budget.
 *
 * @param {string} telemetryPath
 * @param {string} archiveDir
 * @param {object} [opts]
 * @param {number} [opts.sizeBytes=5*1024*1024]
 * @param {number} [opts.decayDays=14]
 * @param {number} [opts.diskBudgetBytes=100*1024*1024]
 * @returns {Promise<{rotated: boolean, archivePath: string|null, linesRead: number, linesLost: number, prunedArchives: string[]}>}
 */
export async function rotateTelemetry(telemetryPath, archiveDir, opts = {}) {
  const sizeBytes = opts.sizeBytes ?? ROTATION_SIZE_BYTES;
  const decayDays = opts.decayDays ?? DECAY_DAYS;
  const diskBudgetBytes = opts.diskBudgetBytes ?? DISK_BUDGET_BYTES;
  const baseResult = { rotated: false, archivePath: null, linesRead: 0, linesLost: 0, prunedArchives: [] };

  if (!existsSync(telemetryPath)) return baseResult;
  const stat = statSync(telemetryPath);
  if (stat.size < sizeBytes) {
    // Could still rotate by age — peek at first line's ts.
    const firstTs = await readFirstTs(telemetryPath);
    if (firstTs == null) return baseResult;
    const ageDays = (Date.now() - firstTs) / (24 * 3600 * 1000);
    if (ageDays < decayDays) return baseResult;
  }

  // Count lines (best-effort).
  const linesRead = await countLines(telemetryPath);
  mkdirSync(archiveDir, { recursive: true });
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const finalGz = join(archiveDir, `telemetry-archive-${iso}.jsonl.gz`);
  const tmpGz = `${finalGz}.tmp.${process.pid}`;

  // 1. gzip
  await pipeline(createReadStream(telemetryPath), createGzip(), createWriteStream(tmpGz));
  // 2. rename to final
  renameSync(tmpGz, finalGz);
  // 3. rotate marker
  const marker = `${telemetryPath}.rotated.${process.pid}`;
  renameSync(telemetryPath, marker);
  // 4. truncate
  writeFileSync(telemetryPath, '');
  // 5. remove marker
  try { unlinkSync(marker); } catch { /* already gone */ }

  // Disk-budget safety net.
  const pruned = pruneArchivesToBudget(archiveDir, diskBudgetBytes);

  return { rotated: true, archivePath: finalGz, linesRead, linesLost: 0, prunedArchives: pruned };
}

async function readFirstTs(path) {
  return new Promise((resolve) => {
    let first = true;
    let resolved = false;
    const finish = (v) => { if (!resolved) { resolved = true; resolve(v); } };
    const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (!first) return;
      first = false;
      try {
        const o = JSON.parse(line);
        finish(o.ts || null);
      } catch {
        finish(null);
      }
      rl.close();
    });
    rl.on('close', () => finish(null));
    rl.on('error', () => finish(null));
  });
}

async function countLines(path) {
  return new Promise((resolve) => {
    let n = 0;
    const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    rl.on('line', () => { n++; });
    rl.on('close', () => resolve(n));
    rl.on('error', () => resolve(n));
  });
}

function pruneArchivesToBudget(archiveDir, budgetBytes) {
  if (!existsSync(archiveDir)) return [];
  const entries = readdirSync(archiveDir)
    .filter((f) => f.startsWith('telemetry-archive-') && f.endsWith('.jsonl.gz'))
    .map((f) => {
      const p = join(archiveDir, f);
      const s = statSync(p);
      return { path: p, size: s.size, mtime: s.mtimeMs };
    });
  let total = entries.reduce((acc, e) => acc + e.size, 0);
  if (total <= budgetBytes) return [];
  entries.sort((a, b) => a.mtime - b.mtime);
  const pruned = [];
  for (const e of entries) {
    if (total <= budgetBytes) break;
    try { unlinkSync(e.path); total -= e.size; pruned.push(e.path); } catch { /* skip */ }
  }
  if (pruned.length) {
    process.stderr.write(`archive_budget_prune removed=${pruned.length} bytes_freed=${pruned.reduce((a, e) => a, 0)}\n`);
  }
  return pruned;
}

// --- 10. readEvolutionState -------------------------------------------------

/**
 * Read + parse evolution-state.json. Returns the parsed object on success or
 * `null` on any error (missing file, malformed JSON, EACCES, ...) — fail-open
 * per D-11.
 *
 * @param {string} statePath
 * @returns {object|null}
 */
export function readEvolutionState(statePath) {
  try {
    if (!existsSync(statePath)) return null;
    const text = readFileSync(statePath, 'utf8');
    if (!text.trim()) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// --- 11. writeEvolutionState ------------------------------------------------

/**
 * Atomic temp+rename write of evolution-state.json. Returns true on success.
 *
 * @param {string} statePath
 * @param {object} state
 * @returns {boolean}
 */
export function writeEvolutionState(statePath, state) {
  try {
    const tmp = `${statePath}.tmp.${process.pid}`;
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, statePath);
    return true;
  } catch {
    return false;
  }
}

// --- 12. writeWeights -------------------------------------------------------

/**
 * Atomic temp+rename write of weights.json. Separate from writeEvolutionState
 * (WARNING 5 fix): the two files have different shapes and lifecycles.
 *
 * @param {string} weightsPath
 * @param {object} weights
 * @returns {boolean}
 */
export function writeWeights(weightsPath, weights) {
  try {
    const tmp = `${weightsPath}.tmp.${process.pid}`;
    writeFileSync(tmp, JSON.stringify(weights, null, 2));
    renameSync(tmp, weightsPath);
    return true;
  } catch {
    return false;
  }
}

// --- Convenience: re-export the pathToFileURL helper for Plan 03-02 ---------
// Plan 03-02's worker uses pathToFileURL to import router.mjs. Re-exported
// here so the worker can pull it from one place.
export { pathToFileURL, homedir, mkdtempSync, mkdirSync };

// --- Plan 03-02: worker main() + isMain() + subcommand dispatch -------------
// The worker composes the 12 pure primitives above into the full evolution
// cycle: lock → read inputs → correlate → aggregate → decay → propose →
// apply-or-revert → write weights + state → rotate → release + reset.
//
// `run` subcommand (default): execute the worker once.
// `status` subcommand:       print a one-screen JSON summary (D-26).
//
// The worker is intentionally lazy + fail-open:
//   - any import failure → exit 0 silently
//   - any read failure   → skip that step, continue
//   - any throw          → finally clause releases the lock and resets trigger

// --- Path constants --------------------------------------------------------

const _HOME = homedir();
const _RUNTIME = process.env.ROUTER_RUNTIME === 'codex' ? 'codex' : 'claude';
const _RUNTIME_DIR = join(_HOME, `.${_RUNTIME}`);
const _HOOKS_DIR = join(_RUNTIME_DIR, 'hooks');
const _ROUTER_DIR = join(_RUNTIME_DIR, 'router');
const _MANIFEST = join(_ROUTER_DIR, 'claude-inventory-manifest.json');
const _MODE_MAP = join(_ROUTER_DIR, 'mode-map.json');
const _WEIGHTS_FILE = join(_ROUTER_DIR, 'weights.json');
const _EVOLUTION_STATE_FILE = join(_ROUTER_DIR, 'evolution-state.json');
const _TRIGGER_FILE = join(_ROUTER_DIR, '.evolve-trigger');
const _LOCK = join(_ROUTER_DIR, '.evolve.lock');
const _TELEMETRY = join(_ROUTER_DIR, 'telemetry.jsonl');
// Calibration fixture path can be overridden by ROUTER_EVOLVE_PROJECT_DIR env.
const _TASKS_PATH = process.env.ROUTER_EVOLVE_PROJECT_DIR
  ? join(process.env.ROUTER_EVOLVE_PROJECT_DIR, 'calibration-tasks.json')
  : join(process.cwd(), 'calibration-tasks.json');
const _HOOK_PATH = join(_HOOKS_DIR, 'router.mjs');
const _CALIBRATE_PATH = process.env.ROUTER_EVOLVE_PROJECT_DIR
  ? join(process.env.ROUTER_EVOLVE_PROJECT_DIR, 'router.calibrate.mjs')
  : join(process.cwd(), 'router.calibrate.mjs');

// --- Helpers ---------------------------------------------------------------

// Read the live telemetry.jsonl into an array of parsed JSON lines. Archive
// directories are read separately by the worker as needed.
function readTelemetryLines(telemetryPath) {
  const lines = [];
  try {
    const content = readFileSync(telemetryPath, 'utf8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try { lines.push(JSON.parse(line)); } catch { /* skip malformed */ }
    }
  } catch { /* file missing */ }
  return lines;
}

// Run the in-process calibration against a candidate modeMap. Returns the
// right-pick rate as a number in [0, 1]. Uses router.calibrate.mjs's pure
// dryRun + evaluate (D-16 DRY).
function runCalibration(calibrate, manifest, modeMap, tasks) {
  let right = 0;
  for (const task of tasks) {
    try {
      const result = calibrate.dryRun(task.prompt, manifest, modeMap, task.cwd || process.cwd());
      const { ok } = calibrate.evaluate(task, result);
      if (ok) right++;
    } catch { /* skip on any per-task error */ }
  }
  return right / Math.max(1, tasks.length);
}

// --- Worker main() ---------------------------------------------------------

export async function runWorker(opts = {}) {
  // 1. Acquire lock (D-03 / RESEARCH section 4). openSync('wx') throws EEXIST
  //    when another worker is running. We wait 100ms, retry once, then exit 0
  //    silently if still held — the next prompt's bumpEvolveTrigger will retry.
  const paths = {
    manifest: opts.manifest || _MANIFEST,
    modeMap: opts.modeMap || _MODE_MAP,
    weights: opts.weights || _WEIGHTS_FILE,
    state: opts.state || _EVOLUTION_STATE_FILE,
    trigger: opts.trigger || _TRIGGER_FILE,
    lock: opts.lock || _LOCK,
    telemetry: opts.telemetry || _TELEMETRY,
    tasks: opts.tasks || _TASKS_PATH,
    hook: opts.hook || _HOOK_PATH,
    calibrate: opts.calibrate || _CALIBRATE_PATH,
    archiveDir: opts.archiveDir || _ROUTER_DIR,
  };

  let lockFd;
  try {
    lockFd = openSync(paths.lock, 'wx');
  } catch (e) {
    if (e && e.code === 'EEXIST') {
      await new Promise((r) => setTimeout(r, 100));
      try { lockFd = openSync(paths.lock, 'wx'); } catch { return { ok: false, reason: 'lock_contended' }; }
    } else {
      return { ok: false, reason: 'lock_open_failed' };
    }
  }

  try {
    // 2. Read inputs
    let manifest, modeMap, tasks;
    try { manifest = JSON.parse(readFileSync(paths.manifest, 'utf8')); }
    catch { return { ok: false, reason: 'manifest_read_failed' }; }
    try { modeMap = JSON.parse(readFileSync(paths.modeMap, 'utf8')); }
    catch { return { ok: false, reason: 'mode_map_read_failed' }; }
    try { tasks = JSON.parse(readFileSync(paths.tasks, 'utf8')); }
    catch { return { ok: false, reason: 'tasks_read_failed' }; }
    const telemetry = readTelemetryLines(paths.telemetry);
    const router = await import(pathToFileURL(paths.hook).href).catch(() => null);
    const calibrate = await import(pathToFileURL(paths.calibrate).href).catch(() => null);

    // 3. Correlate + aggregate + decay
    const outcomes = correlateOutcomes(telemetry, 14);
    const perEntry = aggregatePerEntry(outcomes, modeMap);
    const existingWeights = (router && router.loadWeights ? router.loadWeights(paths.weights) : null) || { weights: {} };
    const decayed = decayScores(existingWeights, Date.now(), 14);
    for (const [k, v] of perEntry.entries()) {
      const prev = decayed.weights[k] || {};
      decayed.weights[k] = { ...prev, ...v, score: v.g / Math.max(1, v.g + v.b), updated_at: new Date().toISOString() };
    }
    decayed.schema_version = 2;
    decayed.blend = 0.15;
    decayed.decay_days = 14;
    decayed.updated_at = new Date().toISOString();

    // 4. Propose mutations
    const additions = proposeAdditions(outcomes, modeMap);
    const edits = proposeEdits(perEntry, modeMap, outcomes);
    const prunes = proposePrunes(outcomes, modeMap, Date.now());
    const proposals = [...additions, ...edits, ...prunes];

    // 5. Apply each proposal with calibration-delta gate (D-13/D-15/D-16).
    //    WARNING 3 (PITFALL 8): skip mutations if the user edited mode-map.json
    //    since the last worker run (compare mtime vs evolution-state's
    //    last_mutation_at).
    const evoState = readEvolutionState(paths.state);
    const lastMutationAtMs = evoState && evoState.last_mutation_at
      ? new Date(evoState.last_mutation_at).getTime() : 0;
    let modeMapMtimeMs = 0;
    try { modeMapMtimeMs = statSync(paths.modeMap).mtimeMs; } catch { modeMapMtimeMs = 0; }
    const userRecentlyEdited = lastMutationAtMs > 0 && modeMapMtimeMs > lastMutationAtMs;
    if (userRecentlyEdited) {
      try { process.stderr.write(`__router_evolve_user_recently_edited=true\n`); } catch {}
    }

    let currentMap = modeMap;
    let preRate = (userRecentlyEdited || !calibrate)
      ? 0
      : runCalibration(calibrate, manifest, currentMap, tasks);
    let mutationsApplied = 0;
    let mutationsReverted = 0;

    for (const mutation of proposals) {
      if (userRecentlyEdited || !calibrate) {
        mutationsReverted++;
        try { process.stderr.write(`__router_evolve_mutation=${mutation.kind}:${(mutation.entry && mutation.entry.id) || mutation.id || ''}+skip_user_edit\n`); } catch {}
        continue;
      }
      const { proposedMap, path } = applyMutation(currentMap, mutation, paths.modeMap);
      writeFileSync(path, JSON.stringify(proposedMap, null, 2));
      const postRate = runCalibration(calibrate, manifest, proposedMap, tasks);
      if (postRate >= preRate) {
        renameSync(path, paths.modeMap); // APPLY
        mutationsApplied++;
        currentMap = proposedMap;
        try { process.stderr.write(`__router_evolve_mutation=${mutation.kind}:${(mutation.entry && mutation.entry.id) || mutation.id || ''}+apply\n`); } catch {}
      } else {
        unlinkSync(path); // REVERT
        mutationsReverted++;
        try { process.stderr.write(`__router_evolve_mutation=${mutation.kind}:${(mutation.entry && mutation.entry.id) || mutation.id || ''}+revert\n`); } catch {}
      }
      // Recompute preRate from the post-apply state so the next iteration
      // sees a fresh baseline (BLOCKER 2 fix).
      preRate = postRate >= preRate ? postRate : preRate;
    }

    // 6. Write weights.json + evolution-state.json
    writeWeights(paths.weights, decayed);
    const newEvoState = {
      schema_version: 1,
      last_mutation_at: mutationsApplied > 0
        ? new Date().toISOString()
        : (evoState ? evoState.last_mutation_at : null),
      last_revert_at: mutationsReverted > 0 ? new Date().toISOString() : (evoState ? evoState.last_revert_at : null),
      mutations_applied: mutationsApplied,
      mutations_reverted: mutationsReverted,
      right_pick_history: [
        ...(evoState && Array.isArray(evoState.right_pick_history) ? evoState.right_pick_history : []),
        { ts: new Date().toISOString(), right: Math.round(preRate * tasks.length), total: tasks.length },
      ],
      per_entry: Object.fromEntries(perEntry),
    };
    writeEvolutionState(paths.state, newEvoState);

    // 7. Rotate telemetry
    await rotateTelemetry(paths.telemetry, paths.archiveDir);

    return { ok: true, mutationsApplied, mutationsReverted };
  } finally {
    // 8. Release lock + reset trigger
    try { closeSync(lockFd); } catch {}
    try { unlinkSync(paths.lock); } catch {}
    try { writeFileSync(paths.trigger, '0'); } catch {}
  }
}

// --- Status subcommand (D-26) ---------------------------------------------

export async function printStatus(opts = {}) {
  const paths = {
    weights: opts.weights || _WEIGHTS_FILE,
    state: opts.state || _EVOLUTION_STATE_FILE,
    hook: opts.hook || _HOOK_PATH,
  };
  const router = await import(pathToFileURL(paths.hook).href).catch(() => null);
  const weights = router && router.loadWeights ? router.loadWeights(paths.weights) : null;
  const state = readEvolutionState(paths.state);
  const lastHist = (state && state.right_pick_history && state.right_pick_history.length)
    ? state.right_pick_history[state.right_pick_history.length - 1]
    : null;
  const total = lastHist ? lastHist.total : 0;
  const right = lastHist ? lastHist.right : 0;
  const summary = {
    total_prompts_in_last_calibration: total,
    right_pick_rate: total > 0 ? (right / total) : null,
    weight_blend: weights && typeof weights.blend === 'number' ? weights.blend : 0.15,
    last_mutation_at: state ? state.last_mutation_at : null,
    mutations_applied: state ? state.mutations_applied : 0,
    mutations_reverted: state ? state.mutations_reverted : 0,
    per_entry_outcomes: weights ? weights.weights : {},
    decay_days: weights && typeof weights.decay_days === 'number' ? weights.decay_days : 14,
  };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

// --- isMain() guard + subcommand dispatch ----------------------------------

const _isMain = () => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1] || '').href;
  } catch {
    return false;
  }
};

if (_isMain()) {
  const subcommand = process.argv[2] || 'run';
  if (subcommand === 'status') {
    printStatus().then(() => process.exit(0)).catch(() => process.exit(0));
  } else if (subcommand === 'run') {
    runWorker().then(() => process.exit(0)).catch(() => process.exit(0));
  } else {
    process.exit(1);
  }
}

// --- D-16: import router.mjs scoring fns (lazy, fail-open) -----------------
// Plan 03-02's worker main() does the same import; this is a sanity check that
// the url construction works. The actual usage in Plan 03-02 is awaited at
// runtime so a router.mjs load failure produces a no-op worker (D-16: NOT a
// re-implementation).
const ROUTER_HOOK_URL = pathToFileURL(_HOOK_PATH).href;
export const ROUTER_HOOK_HREF = ROUTER_HOOK_URL;
