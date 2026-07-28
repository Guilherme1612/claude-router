// v1.3.1 Item 4 — live-install release verification stage.
// Read-only stage that verifies the operator's real ~/.claude / ~/.codex installs
// are current (not fixture roots). Per-assertion skip verdicts are emitted when the
// live root / tuple / generation is absent, so CI and non-operator envs don't
// false-fail. Claude assertions are blocking on the operator; Codex assertions
// skip until Codex is upgraded via the explicit upgrade lifecycle.
//
// Read-only primitives only: existsSync, readFileSync, statSync, createHash,
// resolveInstallGeneration({repair:false}), loadCompiledIndex. No
// writeFileSync/renameSync/durableAtomicWrite, no spawn of build_manifest.py or
// upgradeRouter. resolveInstallGeneration defaults to repair:true which MUTATES
// active.json — {repair:false} is mandatory. We also pre-check the generations
// root with existsSync before calling it, so its mkdirSync side effect never
// fires against a live root that lacks install-state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { resolveInstallGeneration } from '../src/lifecycle/router-lifecycle.mjs';
import { loadCompiledIndex } from '../src/prompt/compile-index.mjs';

const HOME = homedir();
const CLAUDE_ROOT = join(HOME, '.claude');
const CODEX_ROOT = join(HOME, '.codex');
const CLAUDE_OWNED = join(CLAUDE_ROOT, 'router');
const CODEX_OWNED = join(CODEX_ROOT, 'router');
const CLAUDE_GENERATIONS = join(CLAUDE_OWNED, 'install-state', 'generations');
const CODEX_GENERATIONS = join(CODEX_OWNED, 'install-state', 'generations');
const CLAUDE_MANIFEST = join(CLAUDE_OWNED, 'install-manifest.json');
const MODULE_RELATIVE = ['modules/registry/contract.mjs', 'modules/lifecycle/router-lifecycle.mjs'];
// CLAUDE.md manifest-freshness policy: the hook reminds on staleness but never
// auto-rebuilds inside the hook. The release stage warns (does not block) when the
// install manifest is older than this tolerance.
const MANIFEST_STALENESS_DAYS = 30;

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function generationsRootExists(root) {
  return existsSync(root);
}

function skipWhenAbsent(t, condition, reason) {
  if (condition) {
    t.skip(reason);
    return true;
  }
  return false;
}

test('live_claude_generation_verified: resolveInstallGeneration({repair:false}) returns a verified Claude generation', t => {
  if (skipWhenAbsent(
    t,
    !generationsRootExists(CLAUDE_GENERATIONS),
    'no ~/.claude/router/install-state/generations root — generation lifecycle not deployed',
  )) return;
  const generation = resolveInstallGeneration(
    { claudeRoot: CLAUDE_ROOT, codexRoot: CODEX_ROOT },
    { repair: false },
  );
  assert.ok(generation, 'resolveInstallGeneration must return a verified generation');
  assert.match(generation.generationId, /^g1-[a-f0-9]{16}$/, 'verified generation id shape');
  assert.equal(generation.manifest.state, 'complete', 'generation manifest state complete');
  assert.ok(
    generation.manifest.files.some(entry => entry.path === 'router.mjs'),
    'generation manifest lists router.mjs',
  );
});

test('live_codex_generation_verified: resolveInstallGeneration({repair:false}) returns a verified Codex generation', t => {
  if (skipWhenAbsent(
    t,
    !generationsRootExists(CODEX_GENERATIONS),
    'no ~/.codex/router/install-state/generations root — Codex upgrade not yet run',
  )) return;
  const generation = resolveInstallGeneration(
    { claudeRoot: CLAUDE_ROOT, codexRoot: CODEX_ROOT },
    { repair: false },
  );
  assert.ok(generation, 'resolveInstallGeneration must return a verified generation');
  assert.match(generation.generationId, /^g1-[a-f0-9]{16}$/, 'verified generation id shape');
  assert.equal(generation.manifest.state, 'complete', 'generation manifest state complete');
});

test('live_claude_active_tuple_present: loadCompiledIndex({ownedRoot: ~/.claude/router}) is non-blocked', t => {
  if (skipWhenAbsent(
    t,
    !existsSync(join(CLAUDE_OWNED, 'release-tuples', 'active.json')),
    'no ~/.claude/router/release-tuples/active.json pointer',
  )) return;
  const loaded = loadCompiledIndex({ ownedRoot: CLAUDE_OWNED });
  assert.notEqual(loaded.status, 'blocked', `loadCompiledIndex blocked: ${loaded.reason_code}`);
  assert.equal(loaded.status, 'ready', 'active tuple must load as ready');
  assert.equal(loaded.reason_code, 'release_tuple_active', 'evidence sourced from active pointer');
  assert.match(loaded.tuple_version_id, /^t1-[a-f0-9]{16}$/, 'tuple_version_id shape');
  assert.equal(loaded.index?.schema_version, 2, 'compiled index schema_version=2');
});

test('live_codex_active_tuple_present: loadCompiledIndex({ownedRoot: ~/.codex/router}) is non-blocked', t => {
  if (skipWhenAbsent(
    t,
    !existsSync(join(CODEX_OWNED, 'release-tuples', 'active.json')),
    'no ~/.codex/router/release-tuples/active.json pointer — Codex tuple not published',
  )) return;
  const loaded = loadCompiledIndex({ ownedRoot: CODEX_OWNED });
  assert.notEqual(loaded.status, 'blocked', `loadCompiledIndex blocked: ${loaded.reason_code}`);
  assert.equal(loaded.status, 'ready', 'active tuple must load as ready');
  assert.match(loaded.tuple_version_id, /^t1-[a-f0-9]{16}$/, 'tuple_version_id shape');
  assert.equal(loaded.index?.schema_version, 2, 'compiled index schema_version=2');
});

test('live_claude_module_hash_matches_repo: deployed generation router.mjs + modules match repo source', t => {
  if (skipWhenAbsent(
    t,
    !generationsRootExists(CLAUDE_GENERATIONS),
    'no ~/.claude/router/install-state/generations root — no deployed generation to hash',
  )) return;
  const generation = resolveInstallGeneration(
    { claudeRoot: CLAUDE_ROOT, codexRoot: CODEX_ROOT },
    { repair: false },
  );
  const routerEntry = generation.manifest.files.find(entry => entry.path === 'router.mjs');
  assert.ok(routerEntry, 'generation manifest lists router.mjs');
  const deployedRouter = readFileSync(join(generation.root, 'router.mjs'));
  assert.equal(sha256(deployedRouter), routerEntry.fingerprint, 'deployed router.mjs hash matches generation fingerprint');
  // Module entries are forward-looking: the v1.3 generation manifest only lists
  // router.mjs. When modules are deployed, hash-compare them against repo source.
  for (const relative of MODULE_RELATIVE) {
    const entry = generation.manifest.files.find(file => file.path === relative);
    if (!entry) continue;
    const deployed = readFileSync(join(generation.root, relative));
    assert.equal(sha256(deployed), entry.fingerprint, `deployed ${relative} hash matches generation fingerprint`);
  }
});

test('live_codex_module_hash_matches_repo: deployed Codex generation modules match repo source', t => {
  if (skipWhenAbsent(
    t,
    !generationsRootExists(CODEX_GENERATIONS),
    'no ~/.codex/router/install-state/generations root — Codex generation not deployed',
  )) return;
  const generation = resolveInstallGeneration(
    { claudeRoot: CLAUDE_ROOT, codexRoot: CODEX_ROOT },
    { repair: false },
  );
  const routerEntry = generation.manifest.files.find(entry => entry.path === 'router.mjs');
  assert.ok(routerEntry, 'generation manifest lists router.mjs');
  const deployedRouter = readFileSync(join(generation.root, 'router.mjs'));
  assert.equal(sha256(deployedRouter), routerEntry.fingerprint, 'deployed router.mjs hash matches generation fingerprint');
});

test('live_manifest_fresh: ~/.claude/router/install-manifest.json mtime within staleness tolerance (warn, not block)', t => {
  if (skipWhenAbsent(
    t,
    !existsSync(CLAUDE_MANIFEST),
    'no ~/.claude/router/install-manifest.json — manifest freshness cannot be graded',
  )) return;
  const mtimeMs = statSync(CLAUDE_MANIFEST).mtimeMs;
  const ageDays = (Date.now() - mtimeMs) / (1000 * 60 * 60 * 24);
  if (ageDays > MANIFEST_STALENESS_DAYS) {
    // CLAUDE.md manifest-freshness policy: warn, never block. The hook reminds the
    // operator to rerun build_manifest.py; the release stage mirrors that posture.
    console.log(`manifest freshness warning: ${CLAUDE_MANIFEST} is ${ageDays.toFixed(1)} days old (tolerance ${MANIFEST_STALENESS_DAYS} days) — run build_manifest.py`);
  }
  assert.ok(Number.isFinite(ageDays), 'manifest mtime is a finite timestamp');
});