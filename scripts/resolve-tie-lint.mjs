#!/usr/bin/env node
// resolve-tie-lint.mjs — ROUTE-05 resolve-list lint gate (Phase 32-03).
//
// Deterministic, stdlib-only (node:fs / node:path) quality gate over a mode-map's
// slash-entry resolve lists. Emits a report and exits non-zero on violations:
//
//   NEAR-TIE        — two resolve members within a weight gap of 0.05 (or an implied
//                     rank tie when no weights are present) → the route is downgraded
//                     to `med` tier (it must never ship a confident-position suggestion).
//   STALE-TARGET    — a resolve member whose stripped name is absent from the active
//                     manifest's command inventory is quarantined (flagged, never shipped).
//
// Framework-neutral: reads only entry data; never hardcodes a framework/gsp* prefix.
//
// Usage:
//   node scripts/resolve-tie-lint.mjs [modeMapPath] [manifestPath]
// Env: MODE_MAP / MANIFEST override; defaults to ~/.claude/router/mode-map.json and
// claude-inventory-manifest.json in cwd, then ~/.claude/router/claude-inventory-manifest.json.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const TIE_GAP = 0.05; // members within this weight gap are a near-tie
export const GENERIC_FALLBACK_TIER = 'med'; // near-tie upgraded route tier downgrade target

function stripLeadingSlash(name = '') {
  return String(name).replace(/^\/+/, '');
}

// Build the set of present command names. Supports the combined runtime-tagged manifest
// shape (runtime_commands[ROUTER_RUNTIME]) as well as the flat `commands[]` inventory.
export function commandInventory(manifest, opts = {}) {
  const runtime = opts.runtime || process.env.ROUTER_RUNTIME || 'claude';
  const set = new Set();
  const rc = manifest && manifest.runtime_commands;
  const slice = rc && Array.isArray(rc[runtime]) ? rc[runtime] : null;
  if (slice) {
    for (const name of slice) set.add(stripLeadingSlash(name));
  }
  for (const c of (manifest && manifest.commands) || []) {
    set.add(stripLeadingSlash(c && (c.name || c.id)));
  }
  return set;
}

// Slash resolve lists can target a command or a routeable skill. Keep the strict gate's
// presence predicate aligned with the hook's buildTargetIndexes routeTargets set.
export function routeTargetInventory(manifest, opts = {}) {
  const set = commandInventory(manifest, opts);
  for (const collection of ['skills', 'plugin_skills', 'agents_store_skills']) {
    for (const entry of (manifest && manifest[collection]) || []) {
      if (collection === 'agents_store_skills' && entry?.scope !== 'global') continue;
      const name = stripLeadingSlash(entry && (entry.name || entry.id));
      if (name) set.add(name);
    }
  }
  return set;
}

function memberWeight(member) {
  const w = member && member.weight;
  return typeof w === 'number' && Number.isFinite(w) ? w : null;
}

// Lint a single mode-map against the active route-target inventory. Pure, deterministic.
// Returns { violations: [...], downgradedTiers: {id: tier}, quarantined: {id: [names]} }
export function lintModeMap(modeMap, manifest, opts = {}) {
  const commands = routeTargetInventory(manifest, opts);
  const violations = [];
  const downgradedTiers = {};
  const quarantined = {};
  const entries = (modeMap && modeMap.entries) || [];

  for (const entry of entries) {
    if (entry.invoke_kind !== 'slash') continue;
    const id = entry.id || entry.mode || '<no-id>';
    const resolve = Array.isArray(entry.resolve) ? entry.resolve : [];

    // NEAR-TIE (only meaningful for multi-member resolve lists): any two present weights
    // within TIE_GAP, or, when no weights are present anywhere, an implied rank tie
    // (equal/null ranks) -> downgrade to med.
    if (resolve.length >= 2) {
      const weights = resolve.map(memberWeight);
      let nearTie = false;
      if (weights.some((w) => w !== null)) {
        const present = weights.filter((w) => w !== null).sort((a, b) => b - a);
        for (let i = 0; i < present.length - 1 && !nearTie; i += 1) {
          if (present[i] - present[i + 1] < TIE_GAP) nearTie = true;
        }
      } else {
        // no weights anywhere: equal ranks imply an unresolved near-tie
        nearTie = true;
      }
      if (nearTie) {
        downgradedTiers[id] = GENERIC_FALLBACK_TIER;
        violations.push({
          type: 'near_tie', id, entry: id,
          detail: 'resolve members within tie gap — route downgraded to med',
        });
      }
    }

    // STALE-TARGET QUARANTINE: resolve members absent from the active manifest.
    // Runs for resolve lists of any length — a single-member list can still target an
    // absent/invented capability.
    const absent = resolve
      .map((member) => stripLeadingSlash(member && member.name))
      .filter(Boolean)
      .filter((name) => !commands.has(name));
    if (absent.length > 0) {
      quarantined[id] = absent;
      for (const name of absent) {
        violations.push({
          type: 'stale_target', id, entry: id, target: name,
          detail: 'resolve member absent from manifest command inventory — quarantined',
        });
      }
    }
  }

  return { violations, downgradedTiers, quarantined };
}

// CLI entry: emit a report and exit non-zero if any violation was found.
export function main(argv = process.argv.slice(2)) {
  const modeMapPath = process.env.MODE_MAP || argv[0] || join(homedir(), '.claude', 'router', 'mode-map.json');
  const manifestPath = process.env.MANIFEST || argv[1] ||
    (existsSyncSafe('claude-inventory-manifest.json') ? 'claude-inventory-manifest.json'
      : join(homedir(), '.claude', 'router', 'claude-inventory-manifest.json'));
  const modeMap = JSON.parse(readFileSync(modeMapPath, 'utf8'));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const { violations, downgradedTiers, quarantined } = lintModeMap(modeMap, manifest);
  for (const v of violations) {
    console.error(`[${v.type}] ${v.entry}${v.target ? ` -> ${v.target}` : ''}: ${v.detail}`);
  }
  if (Object.keys(downgradedTiers).length) {
    console.error(`downgraded-to-med: ${Object.keys(downgradedTiers).join(', ')}`);
  }
  if (Object.keys(quarantined).length) {
    for (const [id, names] of Object.entries(quarantined)) {
      console.error(`quarantined: ${id} -> ${names.join(', ')}`);
    }
  }
  return violations.length === 0;
}

function existsSyncSafe(p) {
  try { return Boolean(readFileSync(p, 'utf8')); } catch { return false; }
}

if (process.argv[1] && process.argv[1].endsWith('resolve-tie-lint.mjs')) {
  process.exit(main() ? 0 : 1);
}
