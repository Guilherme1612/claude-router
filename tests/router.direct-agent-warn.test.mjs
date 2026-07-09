// Direct agent/warn route coverage through scoring -> guards -> injection.
// These tests intentionally build routes from mode-map-shaped data instead of
// hand-built formatter fixtures, so direct invoke_kind entries stay first-class.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const {
  applyGuards,
  bm25Score,
  buildCorpus,
  confidenceTier,
  formatInjection,
  normalize,
  tokenize,
} = await import(HOOK);

const SIG = 'direct01';

function fixtureManifest() {
  return {
    skills: [],
    plugin_skills: [],
    agents_store_skills: [],
    commands: [],
    agents: [
      {
        name: 'gsd-codebase-mapper',
        description: 'Maps codebase architecture, module relationships, and implementation paths.',
        summary: 'Codebase mapper agent for architecture and implementation lookup.',
        requires_mcp_not_in_manifest: [],
      },
      {
        name: 'gsd-planner',
        description: 'Plans implementation phases using context7 research and MCP-backed references.',
        summary: 'Planner agent that depends on context7 MCP metadata.',
        requires_mcp_not_in_manifest: ['context7'],
      },
    ],
  };
}

function fixtureModeMap() {
  return {
    thresholds: { T_high: 0.6, T_low: 0.3, M: 0.2 },
    entries: [
      {
        id: 'agent-gsd-codebase-mapper',
        mode: null,
        invoke_kind: 'agent',
        signal_patterns: [
          'spawn codebase mapper',
          'dispatch codebase mapper',
          'run codebase mapper agent',
          'analyze architecture with an agent',
        ],
        recommended_skills: [],
        recommended_agents: ['gsd-codebase-mapper'],
        args_hint: null,
      },
      {
        id: 'warn-gsd-planner-context7',
        mode: null,
        invoke_kind: 'warn',
        signal_patterns: [
          'dispatch gsd planner',
          'spawn gsd planner agent',
          'run planner agent directly',
          'use gsd planner subagent',
        ],
        recommended_skills: [],
        recommended_agents: [],
        warning: 'Agent gsd-planner needs MCP context7 which is not in manifest - wire MCP first.',
        args_hint: null,
      },
    ],
  };
}

function scorePromptToRoute(prompt, manifest = fixtureManifest(), modeMap = fixtureModeMap()) {
  const corpus = buildCorpus(manifest, modeMap);
  const queryTokens = tokenize(prompt);
  const scored = bm25Score(queryTokens, corpus);
  const normed = normalize(scored);
  assert.ok(normed.length > 0, `expected at least one scoring result for "${prompt}"`);

  const top = normed[0];
  const runnerUp = normed[1];
  const tier = confidenceTier(top.norm, runnerUp ? runnerUp.norm : 0, modeMap.thresholds);
  const topName = String(top.name || '').toLowerCase();
  const mmEntry = (modeMap.entries || []).find((e) => {
    if (e.id && String(e.id).toLowerCase() === topName) return true;
    const recs = [...(e.recommended_skills || []), ...(e.recommended_agents || [])];
    return recs.some((r) => String(r).toLowerCase() === topName);
  }) || null;

  const route = {
    id: mmEntry ? mmEntry.id : null,
    mode: mmEntry ? mmEntry.mode : null,
    invoke_kind: mmEntry ? mmEntry.invoke_kind : null,
    recommended_skills: mmEntry ? mmEntry.recommended_skills : [],
    recommended_agents: mmEntry ? mmEntry.recommended_agents : [],
    tier,
    args_hint: mmEntry ? mmEntry.args_hint : null,
    warning: mmEntry ? mmEntry.warning || null : null,
    scores: normed.slice(0, 3).map((s) => ({ name: s.name, norm: s.norm })),
  };

  const guarded = applyGuards(route, prompt, manifest, modeMap, {
    queryTokens,
    thresholds: modeMap.thresholds,
    autoTopScore: top.score,
  });

  return {
    route: guarded.route,
    guards_fired: guarded.guards_fired,
    top,
    scores: normed,
  };
}

test('direct agent entry scores to agent route and emits dispatch injection', () => {
  const prompt = 'dispatch codebase mapper to analyze architecture with an agent';
  const { route, guards_fired, top } = scorePromptToRoute(prompt);

  assert.equal(top.name, 'gsd-codebase-mapper');
  assert.equal(route.invoke_kind, 'agent', `expected agent route, got ${route.invoke_kind}`);
  assert.equal(route.mode, null);
  assert.deepEqual(route.recommended_agents, ['gsd-codebase-mapper']);
  assert.deepEqual(guards_fired, []);

  const out = formatInjection(route, prompt, SIG);
  assert.match(out, /Dispatch agent gsd-codebase-mapper for this subtask, because/);
  assert.ok(!out.includes('Agent gsd-planner'), 'safe direct agent route must not warn for missing MCP agent');
});

test('direct warn entry preserves custom warning text and never dispatches', () => {
  const prompt = 'dispatch gsd planner using the planner agent directly';
  const { route, top } = scorePromptToRoute(prompt);

  assert.equal(top.name, 'warn-gsd-planner-context7');
  assert.equal(route.invoke_kind, 'warn', `expected warn route, got ${route.invoke_kind}`);
  assert.equal(route.mode, null);
  assert.deepEqual(route.recommended_agents, []);
  assert.equal(route.warning, 'Agent gsd-planner needs MCP context7 which is not in manifest - wire MCP first.');

  const out = formatInjection(route, prompt, SIG);
  assert.match(out, /Agent gsd-planner needs MCP context7 which is not in manifest - wire MCP first\./);
  assert.ok(!out.includes('Dispatch agent'), 'warn route must not dispatch an agent');
  assert.ok(!out.includes('Run /'), 'warn route must not emit a slash instruction');
});
