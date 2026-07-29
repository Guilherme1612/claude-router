// Phase 05 Plan 01: route target validation scaffold.
// Validates existing and future mode-map entries against the real manifest so
// route expansion cannot make missing-MCP agents dispatchable by accident.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const {
  inspectDecision,
  loadManifest,
  loadModeMap,
  validateRouteTargets,
} = await import(HOOK);

function fail(route, target, reason) {
  assert.fail(`route ${route.id || '<missing id>'} target ${target || '<missing target>'}: ${reason}`);
}

function validateModeMapTargets(manifest, modeMap) {
  const rows = validateRouteTargets(manifest, modeMap);
  for (const row of rows) {
    if (row.status !== 'ok') {
      fail({ id: row.id }, row.target, row.reason);
    }
  }
}

function fixtureManifest() {
  return {
    skills: [{ id: 'systematic-debugging', name: 'systematic-debugging', scope: 'global' }],
    plugin_skills: [{ id: 'find-skills', name: 'find-skills' }],
    agents_store_skills: [{ id: 'global-helper', name: 'global-helper', scope: 'global' }],
    commands: [{ id: 'gsd-debug', name: 'gsd-debug' }],
    agents: [
      { id: 'safe-agent', name: 'safe-agent', requires_mcp_not_in_manifest: [] },
      { id: 'blocked-agent', name: 'blocked-agent', requires_mcp_not_in_manifest: ['context7'] },
    ],
  };
}

test('real mode-map route targets resolve to known safe manifest entries', () => {
  const manifest = loadManifest();
  const modeMap = loadModeMap();
  if (!manifest || !modeMap) { assert.skip('manifest or mode map not available on this machine'); return; }
  validateModeMapTargets(manifest, modeMap);
});

test('source branches cover slash, skill, agent, and warn invoke kinds', () => {
  const manifest = fixtureManifest();
  const modeMap = {
    entries: [
      {
        id: 'gsd-debug',
        mode: 'gsd-debug',
        invoke_kind: 'slash',
        signal_patterns: ['failing test'],
        recommended_skills: ['systematic-debugging'],
        recommended_agents: [],
      },
      {
        id: 'find-skills',
        mode: null,
        invoke_kind: 'skill',
        signal_patterns: ['find a skill'],
        recommended_skills: ['find-skills'],
        recommended_agents: [],
      },
      {
        id: 'safe-agent-route',
        mode: null,
        invoke_kind: 'agent',
        signal_patterns: ['dispatch safe agent'],
        recommended_skills: [],
        recommended_agents: ['safe-agent'],
      },
      {
        id: 'blocked-agent-warning',
        mode: null,
        invoke_kind: 'warn',
        signal_patterns: ['use blocked agent'],
        recommended_skills: [],
        recommended_agents: [],
        warning: 'Agent blocked-agent needs MCP context7 which is not in manifest - wire it first',
      },
    ],
  };
  validateModeMapTargets(manifest, modeMap);
});

test('COV-11: blocked agents cannot appear under dispatching route kinds', () => {
  const manifest = fixtureManifest();
  const modeMap = {
    entries: [
      {
        id: 'bad-agent-route',
        mode: null,
        invoke_kind: 'agent',
        signal_patterns: ['dispatch blocked agent'],
        recommended_skills: [],
        recommended_agents: ['blocked-agent'],
      },
    ],
  };

  assert.throws(
    () => validateModeMapTargets(manifest, modeMap),
    /route bad-agent-route target blocked-agent: agent requires_mcp_not_in_manifest and cannot be a dispatch target/
  );
});

test('COV-12: warn entries cannot carry recommended missing-MCP agents as dispatch targets', () => {
  const manifest = fixtureManifest();
  const modeMap = {
    entries: [
      {
        id: 'bad-warn-route',
        mode: null,
        invoke_kind: 'warn',
        signal_patterns: ['warn blocked agent'],
        recommended_skills: [],
        recommended_agents: ['blocked-agent'],
        warning: 'Agent blocked-agent needs MCP context7 which is not in manifest - wire it first',
      },
    ],
  };

  assert.throws(
    () => validateModeMapTargets(manifest, modeMap),
    /route bad-warn-route target blocked-agent: warn route must not carry missing-MCP agents as dispatch targets/
  );
});

test('COV-12: warn entries do not imply dispatch wording', () => {
  const manifest = fixtureManifest();
  const modeMap = {
    entries: [
      {
        id: 'bad-warn-copy',
        mode: null,
        invoke_kind: 'warn',
        signal_patterns: ['warn but dispatch'],
        recommended_skills: [],
        recommended_agents: [],
        warning: 'Dispatch agent blocked-agent after wiring context7',
      },
    ],
  };

  assert.throws(
    () => validateModeMapTargets(manifest, modeMap),
    /route bad-warn-copy target <warning>: warn route must not imply Dispatch agent wording/
  );
});

test('missing-MCP agent remains warning-only despite strong prompt overlap', () => {
  const manifest = fixtureManifest();
  manifest.agents.find(({ id }) => id === 'blocked-agent').description =
    'prepare the branch and pull request for release with final verification';
  const modeMap = {
    schema_version: 3,
    thresholds: { T_high: 0.6, T_low: 0.3, M: 0.2 },
    entries: [
      {
        id: 'blocked-agent-warning',
        mode: null,
        invoke_kind: 'warn',
        signal_patterns: ['prepare the branch and pull request for release'],
        recommended_skills: [],
        recommended_agents: [],
        warning: 'blocked-agent requires fixture-mcp',
      },
    ],
  };

  assert.ok(validateRouteTargets(manifest, modeMap).every(({ status }) => status === 'ok'));
  const out = inspectDecision('prepare the branch and pull request for release', {
    manifest,
    modeMap,
    cwd: process.cwd(),
    mutateCache: false,
    logTelemetry: false,
    emitInjection: false,
    bumpEvolution: false,
  });
  assert.ok(!(out.candidates || []).some(({ id }) => id === 'blocked-agent'));
  assert.deepEqual(out.selected_route?.recommended_agents || [], []);
  assert.notEqual(out.selected_route?.invoke_kind, 'agent');
});
