import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

const { inspectDecision, validateRouteTargets } =
  await import(join(homedir(), '.claude', 'hooks', 'router.mjs'));

const lifecycle = [
  ['gsd-ship', 'prepare the branch and pull request for release', 'release-ready pull request'],
  ['gsd-new-project', 'turn this idea into a scoped project with requirements and a roadmap', 'existing project roadmap'],
  ['gsd-execute-phase', 'carry out every approved plan in the current phase', 'draft a plan for the phase'],
  ['gsd-quick', 'make this small repository change with tracked verification', 'design a multi-phase roadmap'],
  ['gsd-validate-phase', 'fill the missing automated checks for the completed phase', 'manually accept the finished feature'],
  ['gsd-verify-work', 'walk me through acceptance of what was just built', 'add more unit tests'],
  ['gsd-resume-work', 'continue from the saved handoff and unfinished session state', 'start a brand new project'],
  ['gsd-complete-milestone', 'archive the finished release cycle and prepare the next one', 'publish the current pull request'],
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
    commands: lifecycle.map(([id]) => ({ id, name: id, description: 'Portable lifecycle workflow' })),
    skills: design.map(([id]) => ({ id, name: id, description: 'Portable design capability' })),
    plugin_skills: [],
    agents_store_skills: [],
    agents: [
      { id: 'safe-agent', name: 'safe-agent', description: 'Safe fixture worker', requires_mcp_not_in_manifest: [] },
      { id: 'blocked-agent', name: 'blocked-agent', description: 'Unavailable fixture worker', requires_mcp_not_in_manifest: ['fixture-mcp'] },
    ],
  };
}

function fixtureModeMap() {
  const route = ([id, positive]) => ({
    id,
    mode: lifecycle.some(([name]) => name === id) ? id : null,
    invoke_kind: lifecycle.some(([name]) => name === id) ? 'slash' : 'skill',
    signal_patterns: [positive],
    recommended_skills: lifecycle.some(([name]) => name === id) ? [] : [id],
    recommended_agents: [],
  });
  return {
    schema_version: 3,
    thresholds: { T_high: 0.6, T_low: 0.3, M: 0.2 },
    entries: [...lifecycle, ...design].map(route),
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
  });
}

test('all 18 implicit outcome prompts route through supplied neutral fixture objects', () => {
  const manifest = fixtureManifest();
  const modeMap = fixtureModeMap();
  for (const [id, prompt] of [...lifecycle, ...design]) {
    const out = inspect(prompt, manifest, modeMap);
    assert.equal(out.selected_route?.id ?? out.selected_route?.mode, id, `${id}: ${prompt}`);
  }
});

test('family hard negatives never select the sibling route', () => {
  const manifest = fixtureManifest();
  const modeMap = fixtureModeMap();
  for (const [id, , negative] of [...lifecycle, ...design]) {
    const out = inspect(negative, manifest, modeMap);
    assert.notEqual(out.selected_route?.id ?? out.selected_route?.mode, id, `${id} must reject: ${negative}`);
  }
});

test('fixture routing is isolated from live manifest and mode-map paths', () => {
  const manifest = fixtureManifest();
  const modeMap = fixtureModeMap();
  const beforeManifest = structuredClone(manifest);
  const beforeModeMap = structuredClone(modeMap);
  const out = inspectDecision('turn this screenshot into a working responsive page', {
    manifest,
    modeMap,
    manifestPath: '/definitely/not/the/live/manifest.json',
    modeMapPath: '/definitely/not/the/live/mode-map.json',
    mutateCache: false,
    logTelemetry: false,
    emitInjection: false,
    bumpEvolution: false,
  });

  assert.equal(out.selected_route?.id ?? out.selected_route?.mode, 'image-to-code');
  assert.deepEqual(manifest, beforeManifest);
  assert.deepEqual(modeMap, beforeModeMap);
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
