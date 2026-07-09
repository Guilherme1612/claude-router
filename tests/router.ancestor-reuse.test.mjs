// tests/router.ancestor-reuse.test.mjs
//
// Phase 4 / ANC-01: contract tests for `applySurfaceFilter` (the post-filter
// on buildCorpus output) and the surface-state plumbing around it. The
// tests cover D-12's six categories plus the additional mtime cache,
// telemetry source-grep, and integration coverage from the plan.
//
// Style: `node:test` + `node:assert/strict` (matches the rest of the suite).
// Imports the real `applySurfaceFilter` + `buildCorpus` + `bm25Score` +
// `tokenize` from the deployed hook — no in-memory reimplementation.
//
// All surface-state work happens inside tmpdirs (D-04, T-04.2-01). The
// test process's `process.env.HOME` is mutated only briefly (Test 2)
// and restored in `afterEach`.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync, utimesSync, existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const mod = await import(HOOK);
const {
  applySurfaceFilter,
  buildCorpus,
  bm25Score,
  tokenize,
  _resetSurfaceCache,
} = mod;

// Real calibration fixtures (Test 8 reads these read-only).
const REPO = '/Users/guilherme/Desktop/ClaudeCode/Router-build';
const CALIBRATION_FIXTURES = JSON.parse(
  readFileSync(join(REPO, 'calibration-tasks.json'), 'utf8'),
);

// Clean the surface cache between tests so mtime / set references don't
// leak across cases (the cache is a module-level Map<dir, ...>).
afterEach(() => {
  _resetSurfaceCache();
});

// withTempDir — same shape as tests/router.freshness.test.mjs:17-21.
function withTempDir(fn) {
  const dir = join(tmpdir(), `router-ancestor-reuse-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  try { return fn(dir); } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
}

// Minimal corpus entry shape (matches what buildCorpus returns).
function corpusEntry(name) {
  return {
    entry: { name, description: `${name} description` },
    name: String(name),
    tokens: new Map([[name, 1]]),
    dl: 1,
  };
}

// Build a small synthetic manifest + corpus for the unit tests.
function makeFixture() {
  const manifest = {
    skills: [
      { name: 'alpha' },
      { name: 'beta' },
      { name: 'gamma' },
    ],
  };
  const corpus = [corpusEntry('alpha'), corpusEntry('beta'), corpusEntry('gamma')];
  return { manifest, corpus };
}

// --- TEST 1: happy path — real surface state, filter applied ------------
test('applySurfaceFilter drops stems not in the enabled set (happy path)', () => {
  withTempDir((tmp) => {
    // Write a .gsd-surface.json that explicitly removes 'beta'.
    // surface.cjs:resolveSurface honors explicitRemoves directly.
    writeFileSync(join(tmp, '.gsd-surface.json'), JSON.stringify({
      baseProfile: 'full',
      disabledClusters: [],
      explicitAdds: [],
      explicitRemoves: ['beta'],
    }));
    // Also drop a .gsd-profile marker so the base resolution lands on 'full'
    // (resolveSurface reads .gsd-profile if .gsd-surface.json is missing;
    // we wrote the file, so the file wins — but we want both to be present
    // for stability in case the harness reorders reads).
    writeFileSync(join(tmp, '.gsd-profile'), 'full');

    const { manifest, corpus } = makeFixture();
    const result = applySurfaceFilter(corpus, manifest, null, tmp);

    assert.equal(result.surface_status, 'applied',
      `surface_status should be 'applied' when .gsd-surface.json is present, got ${result.surface_status}`);
    assert.ok(result.surface_disabled_count > 0,
      `surface_disabled_count should be > 0 when filter dropped entries, got ${result.surface_disabled_count}`);
    // Original order is preserved; the surviving entries are alpha + gamma.
    assert.equal(result.corpus.length, 2,
      `filtered corpus should have 2 entries, got ${result.corpus.length}`);
    const names = result.corpus.map((c) => c.name);
    assert.deepEqual(names, ['alpha', 'gamma'],
      `surviving entries should be [alpha, gamma] in original order, got ${JSON.stringify(names)}`);
  });
});

// --- TEST 2: module-missing fail-open (load-bearing) ---------------------
test('applySurfaceFilter returns input corpus unchanged when surface.cjs is missing', () => {
  withTempDir((tmp) => {
    // Force the module sentinels into the unimportable state. This
    // exercises the load-bearing fail-open path (D-08: 'absent' = gsd-core
    // modules missing) without needing to actually delete the user's
    // gsd-core install.
    mod._setModulesUnimportableForTest(true);
    try {
      const { manifest, corpus } = makeFixture();
      const result = applySurfaceFilter(corpus, manifest, null, tmp);
      // fail-open: same array reference, no mutation.
      assert.equal(result.corpus, corpus,
        'corpus should be the same array reference (fail-open: no mutation)');
      assert.equal(result.surface_status, 'absent',
        `surface_status should be 'absent' when modules are unimportable, got ${result.surface_status}`);
      assert.equal(result.surface_disabled_count, 0,
        `surface_disabled_count should be 0 on absent path, got ${result.surface_disabled_count}`);
    } finally {
      mod._setModulesUnimportableForTest(false);
    }
  });
});

// --- TEST 3: malformed-state fail-open ----------------------------------
test('applySurfaceFilter returns input corpus unchanged when .gsd-surface.json is corrupt', () => {
  withTempDir((tmp) => {
    // Mid-write simulation: file exists but body is not valid JSON.
    writeFileSync(join(tmp, '.gsd-surface.json'), 'garbage not json');
    // Reset the cache so the helper actually re-reads the file (otherwise a
    // warm cache from a previous test could mask the read).
    const { manifest, corpus } = makeFixture();
    const result = applySurfaceFilter(corpus, manifest, null, tmp);
    // resolveSurface falls through to the .gsd-profile / 'full' default on
    // parse error — so the corpus has no entries dropped (all 3 survive,
    // matching the 'full' default), and the status is 'unconfigured'
    // (file is unparseable from the router's point of view per D-08).
    assert.equal(result.surface_status, 'unconfigured',
      `surface_status should be 'unconfigured' on corrupt state, got ${result.surface_status}`);
    assert.equal(result.corpus.length, corpus.length,
      `corpus length should be preserved (${corpus.length}), got ${result.corpus.length}`);
    const origNames = corpus.map((c) => c.name);
    const outNames = result.corpus.map((c) => c.name);
    assert.deepEqual(outNames, origNames,
      'all original stems should be present in the unconfigured case (corrupt = treated as no state)');
  });
});

// --- TEST 4: missing-state unconfigured ---------------------------------
test('applySurfaceFilter returns full corpus when no surface state file', () => {
  withTempDir((tmp) => {
    // tmp has neither .gsd-surface.json nor .gsd-profile.
    // resolveSurface defaults to 'full' base profile → all stems enabled.
    const { manifest, corpus } = makeFixture();
    const result = applySurfaceFilter(corpus, manifest, null, tmp);
    assert.equal(result.corpus.length, corpus.length,
      `corpus length should be preserved (${corpus.length}), got ${result.corpus.length}`);
    assert.equal(result.surface_status, 'unconfigured',
      `surface_status should be 'unconfigured' when no state file, got ${result.surface_status}`);
    const origNames = corpus.map((c) => c.name);
    const outNames = result.corpus.map((c) => c.name);
    assert.deepEqual(outNames, origNames,
      'all original stems should be present in the unconfigured case');
  });
});

// --- TEST 5: pipeline integration order (source-grep) -------------------
test('applySurfaceFilter is invoked in the pipeline between buildCorpus and bm25Score', () => {
  const src = readFileSync(HOOK, 'utf8');
  // Locate the call sites in main() — not the function definition. The
  // call is `const _sf = applySurfaceFilter(...)`; the definition is
  // `export function applySurfaceFilter(...)`. Likewise `bm25Score`
  // appears in several tests/examples — we need the one that comes
  // AFTER the applySurfaceFilter call site in main().
  const idxBuildCorpus = src.indexOf('const corpus = buildCorpus(');
  const idxApplyCall = src.indexOf('const _sf = applySurfaceFilter(');
  assert.ok(idxBuildCorpus >= 0, 'buildCorpus call must be present in main()');
  assert.ok(idxApplyCall >= 0, 'applySurfaceFilter call site must be present in main()');
  // The bm25Score call site we want is the one AFTER applySurfaceFilter.
  const idxBm25 = src.indexOf('bm25Score(queryTokens,', idxApplyCall);
  assert.ok(idxBm25 >= 0, 'bm25Score call site after applySurfaceFilter must be present in main()');
  // Strictly in order: buildCorpus < applySurfaceFilter-call < bm25Score.
  assert.ok(idxBuildCorpus < idxApplyCall,
    `buildCorpus (${idxBuildCorpus}) must come before applySurfaceFilter call (${idxApplyCall})`);
  assert.ok(idxApplyCall < idxBm25,
    `applySurfaceFilter call (${idxApplyCall}) must come before bm25Score (${idxBm25})`);
  // Bonus: bm25Score must be called with filteredCorpus, not the unfiltered corpus.
  const bm25Line = src.slice(idxBm25, idxBm25 + 80);
  assert.ok(bm25Line.includes('filteredCorpus'),
    `bm25Score should be called with filteredCorpus; saw: ${bm25Line}`);
});

// --- TEST 6: mtime cache warm hit ---------------------------------------
test('applySurfaceFilter mtime cache hits on warm path', () => {
  withTempDir((tmp) => {
    writeFileSync(join(tmp, '.gsd-surface.json'), JSON.stringify({
      baseProfile: 'full',
      disabledClusters: [],
      explicitAdds: [],
      explicitRemoves: [],
    }));
    writeFileSync(join(tmp, '.gsd-profile'), 'full');

    const { manifest, corpus } = makeFixture();
    // First call — cold path; populates the cache.
    const r1 = applySurfaceFilter(corpus, manifest, null, tmp);
    // Read the cache via the test-only accessor (exported in Plan 01).
    const cache1 = mod._getSurfaceCacheForTest(tmp);
    assert.ok(cache1, 'cache should be populated after first call');
    const set1 = cache1.enabledSet;
    assert.ok(set1 instanceof Set, 'cache.enabledSet should be a Set');
    // Second call — warm path; mtime unchanged → same Set reference reused.
    const r2 = applySurfaceFilter(corpus, manifest, null, tmp);
    const cache2 = mod._getSurfaceCacheForTest(tmp);
    assert.equal(cache2.enabledSet, set1,
      'warm path should reuse the same Set reference (not re-resolve)');
    assert.equal(r2.surface_status, r1.surface_status,
      'surface_status should match between warm calls');
  });
});

// --- TEST 7: mtime cache invalidation on mtime change -------------------
test('applySurfaceFilter mtime cache invalidates on mtime change', () => {
  withTempDir((tmp) => {
    // Initial state: full surface, nothing disabled.
    const surfaceFile = join(tmp, '.gsd-surface.json');
    writeFileSync(surfaceFile, JSON.stringify({
      baseProfile: 'full',
      disabledClusters: [],
      explicitAdds: [],
      explicitRemoves: [],
    }));
    writeFileSync(join(tmp, '.gsd-profile'), 'full');

    const { manifest, corpus } = makeFixture();
    // Cold call: status should be 'applied' (file present, explicitRemoves empty).
    const r1 = applySurfaceFilter(corpus, manifest, null, tmp);
    assert.equal(r1.surface_status, 'applied',
      `cold path should report 'applied' when .gsd-surface.json exists, got ${r1.surface_status}`);
    const set1 = mod._getSurfaceCacheForTest(tmp).enabledSet;

    // Advance mtime by 5 seconds and rewrite with a disabled cluster.
    const future = new Date(Date.now() + 5000);
    utimesSync(surfaceFile, future, future);
    writeFileSync(surfaceFile, JSON.stringify({
      baseProfile: 'full',
      disabledClusters: ['audit_review'],
      explicitAdds: [],
      explicitRemoves: [],
    }));

    const r2 = applySurfaceFilter(corpus, manifest, null, tmp);
    assert.equal(r2.surface_status, 'applied',
      `mtime-changed call should still be 'applied', got ${r2.surface_status}`);
    const set2 = mod._getSurfaceCacheForTest(tmp).enabledSet;
    assert.notEqual(set2, set1,
      'cold-after-mtime-change should produce a different Set reference (cache invalidated)');
  });
});

// --- TEST 8: disabled-cluster integration against a real fixture --------
test('disabled core_loop filters every core_loop stem; calibration fixture still resolves', () => {
  withTempDir((tmp) => {
    // Disable the core_loop cluster — this is what a user does with
    // `gsd-surface disable core_loop`. core_loop members (per CLUSTERS):
    // new-project, discuss-phase, plan-phase, execute-phase, help, update.
    writeFileSync(join(tmp, '.gsd-surface.json'), JSON.stringify({
      baseProfile: 'full',
      disabledClusters: ['core_loop'],
      explicitAdds: [],
      explicitRemoves: [],
    }));
    writeFileSync(join(tmp, '.gsd-profile'), 'full');

    // Load the real manifest + modeMap (the disabled-cluster integration
    // must exercise the real cluster map, not a stub).
    const manifest = mod.loadManifest();
    const modeMap = mod.loadModeMap();
    const corpus = buildCorpus(manifest, modeMap);
    assert.ok(corpus.length > 0, 'real manifest should produce a non-empty corpus');

    const result = applySurfaceFilter(corpus, manifest, modeMap, tmp);
    const filtered = result.corpus;
    // No entry in the filtered corpus has a name in the core_loop stem set.
    const coreLoop = new Set(['new-project', 'discuss-phase', 'plan-phase', 'execute-phase', 'help', 'update']);
    for (const e of filtered) {
      assert.ok(!coreLoop.has(String(e.name || '')),
        `filtered corpus should not contain core_loop stem '${e.name}'`);
    }

    // Run the dryRun pipeline (tokenize + bm25Score) on the filtered
    // corpus for fixture #1 — same shape as the calibration harness's
    // dryRun. Assert: it does not throw and does not pick a core_loop
    // stem as the top route.
    const fixture = CALIBRATION_FIXTURES.find((f) => f.id === 1);
    assert.ok(fixture, 'fixture #1 must exist in calibration-tasks.json');

    const queryTokens = tokenize(fixture.prompt);
    const scored = bm25Score(queryTokens, filtered);
    // bm25Score returns an array sorted by score desc, but only includes
    // entries with score > 0. So `scored.length` can be <= `filtered.length`.
    assert.ok(Array.isArray(scored),
      'bm25Score should return an array');

    // Top entry (if any) must not be a core_loop stem.
    const top = scored[0];
    if (top && top.entry) {
      const topName = String(top.entry.name || top.name || '');
      assert.ok(!coreLoop.has(topName),
        `top route for fixture #1 should not be a core_loop stem, got '${topName}'`);
    }
    // Pass criterion: pipeline did not throw (above assertions) and the
    // top entry is either absent (no match) or a non-core_loop stem. The
    // original fixture #1 routes to /gsd-debug (systematic-debugging),
    // which is in audit_review, not core_loop — so the integration holds.
  });
});

// --- TEST 9: telemetry source-grep --------------------------------------
test('telemetry includes surface_status and surface_disabled_count (source-grep)', () => {
  const src = readFileSync(HOOK, 'utf8');

  // Decision-init defaults (D-08: the early-exit paths must see well-typed values).
  // Two specific defaults: surface_status: 'unconfigured' and surface_disabled_count: 0.
  const initDefaults = (src.match(/surface_status:\s*['"]unconfigured['"]/g) || []).length;
  assert.ok(initDefaults >= 1,
    `decision init should default surface_status to 'unconfigured' (saw ${initDefaults} hits)`);
  const initDisabled = (src.match(/surface_disabled_count:\s*0/g) || []).length;
  assert.ok(initDisabled >= 1,
    `decision init should default surface_disabled_count to 0 (saw ${initDisabled} hits)`);

  // Telemetry-write block: the per-line JSON must read these fields off
  // the decision object. Source-grep for `decision.surface_status` and
  // `decision.surface_disabled_count` (the same pattern used for
  // graphify_queried / graph_status).
  const telemStatus = (src.match(/decision\.surface_status/g) || []).length;
  assert.ok(telemStatus >= 1,
    `telemetry write should reference decision.surface_status (saw ${telemStatus} hits)`);
  const telemCount = (src.match(/decision\.surface_disabled_count/g) || []).length;
  assert.ok(telemCount >= 1,
    `telemetry write should reference decision.surface_disabled_count (saw ${telemCount} hits)`);
});
