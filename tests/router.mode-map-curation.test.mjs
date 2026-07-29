import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const { inspectDecision, loadModeMap, validateRouteTargets } =
  await import(join(homedir(), '.claude', 'hooks', 'router.mjs'));
const canonicalModeMap = JSON.parse(readFileSync(new URL('../mode-map.json', import.meta.url), 'utf8'));

const lifecycle = [
  ['gsd-ship', 'prepare the branch and pull request for release', 'walk me through acceptance of what was just built'],
  ['gsd-new-project', 'turn this idea into a scoped project with requirements and a roadmap', 'continue from the saved handoff and unfinished session state'],
  ['gsd-execute-phase', 'carry out every approved plan in the current phase', 'turn this idea into a scoped project with requirements and a roadmap'],
  ['gsd-quick', 'make this small repository change with tracked verification', 'carry out every approved plan in the current phase'],
  ['gsd-validate-phase', 'fill the missing automated checks for the completed phase', 'walk me through acceptance of what was just built'],
  ['gsd-verify-work', 'walk me through acceptance of what was just built', 'fill the missing automated checks for the completed phase'],
  ['gsd-resume-work', 'continue from the saved handoff and unfinished session state', 'turn this idea into a scoped project with requirements and a roadmap'],
  ['gsd-complete-milestone', 'archive the finished release cycle and prepare the next one', 'prepare the branch and pull request for release'],
];

const design = [
  ['brandkit', 'create a coherent logo palette typography and brand asset kit', 'make one dashboard screen minimal'],
  ['minimalist-ui', 'design a quiet editorial interface with restrained spacing and typography', 'make the interface raw and mechanical'],
  ['industrial-brutalist-ui', 'build a raw mechanical control panel with exposed structure', 'make a quiet editorial landing page'],
  ['image-to-code', 'turn this screenshot into a working responsive page', 'generate a new illustration for the page'],
  ['imagegen-frontend-web', 'generate the hero artwork and web visuals for this landing page', 'turn this screenshot into working code'],
  ['imagegen-frontend-mobile', 'generate polished visual assets for this mobile app screen', 'generate desktop landing page artwork'],
  ['redesign-existing-projects', 'audit and overhaul the interface already in this repository', 'design a new standalone logo kit'],
  ['stitch-design-taste', 'define semantic design tokens and a reusable component language', 'draw an architecture flow diagram'],
  ['excalidraw-diagram', 'draw an editable hand sketched system architecture diagram', 'implement a responsive page from a screenshot'],
  ['gpt-taste', 'polish this interface with premium motion and advanced interaction detail', 'create a restrained static editorial layout'],
];

function fixtureManifest() {
  return {
    commands: [],
    skills: [...lifecycle, ...design].map(([id]) => ({ id, name: id, description: 'Portable capability' })),
    plugin_skills: [],
    agents_store_skills: [],
    agents: [
      { id: 'safe-agent', name: 'safe-agent', description: 'Safe fixture worker', requires_mcp_not_in_manifest: [] },
      { id: 'blocked-agent', name: 'blocked-agent', description: 'Unavailable fixture worker', requires_mcp_not_in_manifest: ['fixture-mcp'] },
    ],
  };
}

function fixtureModeMap() {
  const ids = new Set([...lifecycle, ...design].map(([id]) => id));
  return {
    schema_version: 3,
    thresholds: { T_high: 0.6, T_low: 0.3, M: 0.2 },
    entries: canonicalModeMap.entries.filter(({ id }) => ids.has(id)),
  };
}

function inspect(prompt, manifest, modeMap) {
  return inspectDecision(prompt, {
    manifest,
    modeMap,
    cwd: process.cwd(),
    mutateCache: false,
    logTelemetry: false,
    emitInjection: false,
    bumpEvolution: false,
    includePrompt: false,
    weights: null,
  });
}

test('all eight lifecycle outcome prompts route through supplied neutral fixture objects', () => {
  const manifest = fixtureManifest();
  const modeMap = fixtureModeMap();
  for (const [id, prompt] of lifecycle) {
    const out = inspect(prompt, manifest, modeMap);
    assert.equal(out.selected_route?.id ?? out.selected_route?.mode, id, `${id}: ${prompt}`);
  }
});

test('lifecycle hard negatives never select the sibling route', () => {
  const manifest = fixtureManifest();
  const modeMap = fixtureModeMap();
  for (const [id, , negative] of lifecycle) {
    const out = inspect(negative, manifest, modeMap);
    assert.notEqual(out.selected_route?.id ?? out.selected_route?.mode, id, `${id} must reject: ${negative}`);
  }
});

test('all ten design outcome prompts route through supplied neutral fixture objects', () => {
  const manifest = fixtureManifest();
  const modeMap = fixtureModeMap();
  for (const [id, prompt] of design) {
    const out = inspect(prompt, manifest, modeMap);
    assert.equal(out.selected_route?.id ?? out.selected_route?.mode, id, `${id}: ${prompt}`);
  }
});

test('portable fixture owns exactly the 18 curated typed targets', () => {
  const manifest = fixtureManifest();
  const modeMap = fixtureModeMap();
  const expected = new Set([...lifecycle, ...design].map(([id]) => id));
  assert.equal(modeMap.entries.length, expected.size);
  assert.deepEqual(new Set(manifest.skills.map(({ id }) => id)), expected);
  for (const entry of modeMap.entries) {
    assert.equal(entry.invoke_kind, 'skill');
    assert.deepEqual(entry.recommended_skills, [entry.id]);
  }
});

test('design hard negatives never select the sibling route', () => {
  const manifest = fixtureManifest();
  const modeMap = fixtureModeMap();
  for (const [id, , negative] of design) {
    const out = inspect(negative, manifest, modeMap);
    assert.notEqual(out.selected_route?.id ?? out.selected_route?.mode, id, `${id} must reject: ${negative}`);
  }
});

test('canonical schema-v3 map has no undeclared canonical collision', () => {
  const modeMap = canonicalModeMap;
  for (const [id] of design) {
    const entries = modeMap.entries.filter((entry) => entry.id === id);
    assert.equal(entries.length, 1, `${id} must have exactly one route`);
    assert.equal(entries[0].invoke_kind, 'skill');
    assert.deepEqual(entries[0].recommended_skills, [id]);
  }
  const diagnostics = validateRouteTargets(fixtureManifest(), modeMap);
  assert.deepEqual(diagnostics.filter(({ status }) => status === 'pattern_collision'), []);
});

test('schema-v3 map caps every entry at six output-anchored patterns', () => {
  const modeMap = canonicalModeMap;
  assert.equal(modeMap.schema_version, 3);
  for (const entry of modeMap.entries) {
    assert.ok(entry.signal_patterns.length >= 1 && entry.signal_patterns.length <= 6, entry.id);
    for (const pattern of entry.signal_patterns) {
      const value = typeof pattern === 'string' ? pattern : pattern.value;
      assert.notEqual(value, entry.id, `${entry.id} must not route from its skill name`);
    }
  }
});

test('installed mode map matches the repository canonical source', () => {
  assert.deepEqual(loadModeMap(), canonicalModeMap);
});

test('fixture routing is isolated from live manifest and mode-map paths', () => {
  const manifest = fixtureManifest();
  const modeMap = fixtureModeMap();
  const beforeManifest = structuredClone(manifest);
  const beforeModeMap = structuredClone(modeMap);
  const out = inspectDecision('make this small repository change with tracked verification', {
    manifest,
    modeMap,
    manifestPath: '/definitely/not/the/live/manifest.json',
    modeMapPath: '/definitely/not/the/live/mode-map.json',
    mutateCache: false,
    logTelemetry: false,
    emitInjection: false,
    bumpEvolution: false,
    weights: null,
  });

  assert.equal(out.selected_route?.id ?? out.selected_route?.mode, 'gsd-quick');
  assert.deepEqual(manifest, beforeManifest);
  assert.deepEqual(modeMap, beforeModeMap);
});

test('synthetic inspection ignores adversarial live evolution weights', () => {
  const manifest = fixtureManifest();
  const modeMap = fixtureModeMap();
  const prompt = 'make this small repository change with tracked verification';
  const baseline = inspect(prompt, manifest, modeMap);
  const adversarial = inspectDecision(prompt, {
    manifest,
    modeMap,
    weights: { blend: 1, weights: { 'gsd-quick': { score: -1_000 } } },
  });

  assert.equal(baseline.selected_route?.id, 'gsd-quick');
  assert.notEqual(adversarial.selected_tier, baseline.selected_tier);
});

test('missing-MCP agents remain absent from validation-safe candidates and dispatch targets', () => {
  const manifest = fixtureManifest();
  const modeMap = fixtureModeMap();
  modeMap.entries.push({
    id: 'blocked-warning',
    mode: null,
    invoke_kind: 'warn',
    signal_patterns: ['unavailable specialist'],
    recommended_skills: [],
    recommended_agents: [],
    warning: 'blocked-agent requires fixture-mcp',
  });

  assert.ok(validateRouteTargets(manifest, modeMap).every(({ status }) => status === 'ok'));
  const out = inspect('unavailable specialist', manifest, modeMap);
  assert.ok(!(out.candidates || []).some(({ id, name }) => id === 'blocked-agent' || name === 'blocked-agent'));
  assert.ok(!(out.selected_route?.recommended_agents || []).includes('blocked-agent'));
});
