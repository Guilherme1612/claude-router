// Phase 05 Plan 01: route target validation scaffold.
// Validates existing and future mode-map entries against the real manifest so
// route expansion cannot make missing-MCP agents dispatchable by accident.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const { loadManifest, loadModeMap } = await import(HOOK);

const INVOKE_KINDS = new Set(['slash', 'skill', 'agent', 'warn']);

function stripLeadingSlash(value) {
  return String(value || '').replace(/^\/+/, '');
}

function namesFrom(entries, predicate = () => true) {
  return new Set((entries || [])
    .filter(predicate)
    .map((entry) => stripLeadingSlash(entry.name || entry.id))
    .filter(Boolean));
}

function buildTargetIndexes(manifest) {
  const safeAgent = (entry) => !Array.isArray(entry.requires_mcp_not_in_manifest)
    || entry.requires_mcp_not_in_manifest.length === 0;
  const blockedAgent = (entry) => Array.isArray(entry.requires_mcp_not_in_manifest)
    && entry.requires_mcp_not_in_manifest.length > 0;
  const globalAgentsStore = (entry) => String(entry.scope || '') === 'global';

  return {
    globalSkills: namesFrom(manifest.skills),
    pluginSkills: namesFrom(manifest.plugin_skills),
    globalAgentsStoreSkills: namesFrom(manifest.agents_store_skills, globalAgentsStore),
    commands: namesFrom(manifest.commands),
    safeAgents: namesFrom(manifest.agents, safeAgent),
    blockedAgents: namesFrom(manifest.agents, blockedAgent),
  };
}

function knownSkillTargets(indexes) {
  return new Set([
    ...indexes.globalSkills,
    ...indexes.pluginSkills,
    ...indexes.globalAgentsStoreSkills,
  ]);
}

function fail(route, target, reason) {
  assert.fail(`route ${route.id || '<missing id>'} target ${target || '<missing target>'}: ${reason}`);
}

function validateEntryShape(entry) {
  assert.ok(entry.id, `route ${entry.id || '<missing id>'} target <entry>: missing id`);
  assert.ok(entry.invoke_kind, `route ${entry.id || '<missing id>'} target <entry>: missing invoke_kind`);
  assert.ok(INVOKE_KINDS.has(entry.invoke_kind), `route ${entry.id} target ${entry.invoke_kind}: invalid invoke_kind`);
  assert.ok(Array.isArray(entry.signal_patterns), `route ${entry.id} target signal_patterns: must be an array`);
  assert.ok(entry.signal_patterns.length > 0, `route ${entry.id} target signal_patterns: must be non-empty`);
  assert.ok(Array.isArray(entry.recommended_skills), `route ${entry.id} target recommended_skills: must be an array`);
  assert.ok(Array.isArray(entry.recommended_agents), `route ${entry.id} target recommended_agents: must be an array`);
}

function validateSlashEntry(entry, indexes, routeIds) {
  const mode = stripLeadingSlash(entry.mode);
  if (!mode) fail(entry, '<mode>', 'slash route requires a mode');
  if (!indexes.commands.has(mode) && !routeIds.has(mode)) {
    fail(entry, mode, 'slash mode must match a manifest command or intentional mode-map route id');
  }
}

function validateSkillEntry(entry, indexes) {
  const skills = knownSkillTargets(indexes);
  for (const target of entry.recommended_skills) {
    const name = stripLeadingSlash(target);
    if (!skills.has(name)) fail(entry, name, 'recommended skill is not in global/plugin/global-agents-store skill inventory');
  }
}

function validateAgentTargets(entry, indexes) {
  for (const target of entry.recommended_agents) {
    const name = stripLeadingSlash(target);
    if (indexes.blockedAgents.has(name)) {
      fail(entry, name, 'agent requires_mcp_not_in_manifest and cannot be a dispatch target');
    }
    if (!indexes.safeAgents.has(name)) {
      fail(entry, name, 'agent is not a safe manifest agent');
    }
  }
}

function validateAgentEntry(entry, indexes) {
  if (entry.recommended_agents.length === 0) {
    fail(entry, '<recommended_agents>', 'invoke_kind agent requires at least one safe agent');
  }
  validateAgentTargets(entry, indexes);
}

function validateWarnEntry(entry, indexes) {
  const warning = String(entry.warning || '');
  if (!warning && (entry.recommended_skills.length > 0 || entry.recommended_agents.length > 0)) {
    fail(entry, '<warning>', 'warn route needs a warning string when dispatch target lists are non-empty');
  }
  if (/Dispatch agent/i.test(warning)) {
    fail(entry, '<warning>', 'warn route must not imply Dispatch agent wording');
  }
  for (const target of entry.recommended_agents) {
    const name = stripLeadingSlash(target);
    if (indexes.blockedAgents.has(name)) {
      fail(entry, name, 'warn route must not carry missing-MCP agents as dispatch targets');
    }
  }
}

function validateModeMapTargets(manifest, modeMap) {
  const indexes = buildTargetIndexes(manifest);
  const routeIds = new Set((modeMap.entries || []).map((entry) => stripLeadingSlash(entry.id)).filter(Boolean));

  for (const entry of modeMap.entries || []) {
    validateEntryShape(entry);

    if (entry.invoke_kind === 'slash') {
      validateSlashEntry(entry, indexes, routeIds);
      validateSkillEntry(entry, indexes);
      validateAgentTargets(entry, indexes);
    } else if (entry.invoke_kind === 'skill') {
      validateSkillEntry(entry, indexes);
      validateAgentTargets(entry, indexes);
    } else if (entry.invoke_kind === 'agent') {
      validateSkillEntry(entry, indexes);
      validateAgentEntry(entry, indexes);
    } else if (entry.invoke_kind === 'warn') {
      validateWarnEntry(entry, indexes);
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
