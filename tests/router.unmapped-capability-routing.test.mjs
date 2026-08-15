import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectDecision } from '../src/runtime/router.mjs';

const modeMap = {
  schema_version: 4,
  thresholds: { T_high: 0.6, T_low: 0.3, M: 0.2 },
  entries: [{
    id: 'ui-review',
    mode: 'ui-review',
    invoke_kind: 'slash',
    signal_patterns: ['review responsive layout', 'inspect interaction states'],
    recommended_skills: ['frontend-design'],
    recommended_agents: [],
    resolve: [{ name: 'ui-review', weight: 1 }, { name: 'frontend-design', weight: 0.8 }],
  }],
};

const inspect = (prompt, manifest, options = {}) => inspectDecision(prompt, {
  manifest,
  modeMap: options.modeMap || modeMap,
  cwd: options.cwd,
  mutateCache: false,
  logTelemetry: false,
  emitInjection: false,
});

test('unmapped local capabilities remain truthful recommendations and do not inherit a mismatched parent route', () => {
  const result = inspect('build a website landing page with a premium visual design', {
    skills: [{ name: 'frontend-design', description: 'premium visual design for websites and landing pages' }],
    commands: [],
    agents: [],
    plugin_skills: [],
    agents_store_skills: [],
  });

  assert.equal(result.selected_route.invoke_kind, 'skill');
  assert.deepEqual(result.selected_route.recommended_skills, ['frontend-design']);
  assert.equal(result.selected_route.recommendation_only, true);
  assert.equal(result.selected_route.route_reason, 'unmapped_capability');
  assert.equal(result.selected_route.mode, null);
  assert.match(result.final_injected_context, /Recommended skill: frontend-design/);
  assert.doesNotMatch(result.final_injected_context, /Run \/ui-review/);
  assert.ok(result.decision_trace.includes('route:unmapped:recommendation_only'));
});

test('unmapped commands and safe agents use their native recommendation shape', () => {
  const command = inspect('run the logistics pipeline', {
    skills: [],
    commands: [{ name: 'logistics-pipeline', description: 'run the logistics pipeline' }],
    agents: [],
    plugin_skills: [],
    agents_store_skills: [],
  });
  assert.equal(command.selected_route.invoke_kind, 'slash');
  assert.equal(command.selected_route.mode, 'logistics-pipeline');
  assert.equal(command.selected_route.recommendation_only, true);
  assert.match(command.final_injected_context, /Recommended: \/logistics-pipeline/);

  const agent = inspect('delegate logistics optimization to a specialist', {
    skills: [],
    commands: [],
    agents: [{ name: 'logistics-specialist', description: 'specialist for logistics optimization' }],
    plugin_skills: [],
    agents_store_skills: [],
  });
  assert.equal(agent.selected_route.invoke_kind, 'agent');
  assert.deepEqual(agent.selected_route.recommended_agents, ['logistics-specialist']);
  assert.match(agent.final_injected_context, /Recommended agent: logistics-specialist/);
});

test('generic app wording does not outrank a mobile design capability', () => {
  const result = inspect('create a mobile app prototype', {
    skills: [{ name: 'ui-ux-pro-max', description: 'UI/UX design intelligence for web and mobile products' }],
    commands: [{ name: 'control-in-app-browser', description: 'control an interactive browser page' }],
    agents: [],
    plugin_skills: [],
    agents_store_skills: [],
  });

  assert.equal(result.candidates[0].name, 'ui-ux-pro-max');
  assert.equal(result.selected_route.invoke_kind, 'skill');
  assert.deepEqual(result.selected_route.recommended_skills, ['ui-ux-pro-max']);
  assert.equal(result.selected_route.recommendation_only, true);
});

test('template-only capabilities yield to direct tools unless a template is requested', () => {
  const manifest = {
    skills: [],
    commands: [{
      name: 'control-in-app-browser',
      description: 'open and inspect interactive browser pages and websites',
    }],
    agents: [],
    plugin_skills: [{
      name: 'artifact-template-design-report',
      description: 'create a Design Report template; use when the user selects or names Design Report',
    }],
    agents_store_skills: [],
  };

  const direct = inspect('verify the website in a real browser and report findings', manifest);
  assert.equal(direct.candidates[0].name, 'control-in-app-browser');
  assert.equal(direct.selected_route.recommended_skills?.[0] || direct.selected_route.mode, 'control-in-app-browser');

  const explicit = inspect('create the Design Report template from the reference', manifest);
  assert.ok(explicit.candidates.some(candidate => candidate.name === 'artifact-template-design-report'));
});

test('README wording provides direct evidence for local documentation capabilities', () => {
  const result = inspect('update the README from the current code', {
    skills: [{ name: 'gsd-doc-writer', description: 'write and update project documentation' }],
    commands: [{ name: 'gsd-docs-update', description: 'generate or update project documentation' }],
    agents: [],
    plugin_skills: [],
    agents_store_skills: [],
  });

  assert.ok(result.selected_route);
  assert.equal(result.selected_route.recommendation_only, true);
  assert.ok(['gsd-doc-writer', 'gsd-docs-update'].includes(
    result.selected_route.recommended_agents?.[0] || result.selected_route.mode,
  ));
});

test('non-authorizing prompts pass through before adaptive capability selection', () => {
  const result = inspect('do not modify files, explain how routing works', {
    skills: [{ name: 'routing-explainer', description: 'explain how local routing works' }],
    commands: [], agents: [], plugin_skills: [], agents_store_skills: [],
  });

  assert.equal(result.selected_route, null);
  assert.equal(result.pass_through_reason, 'intent_negated');
  assert.ok(result.decision_trace.includes('pass_through:intent:negated'));
});

test('browser inspection wording with what-is-broken remains actionable', () => {
  const result = inspect('open the current app in a browser and report what is broken', {
    skills: [],
    commands: [{ name: 'control-in-app-browser', description: 'open and inspect interactive browser pages' }],
    agents: [],
    plugin_skills: [],
    agents_store_skills: [],
  });

  assert.equal(result.pass_through_reason, null);
  assert.equal(result.selected_route.invoke_kind, 'slash');
  assert.equal(result.selected_route.mode, 'control-in-app-browser');
});

test('standalone what-is questions remain non-authorizing', () => {
  const result = inspect('what is the routing decision for this prompt', {
    skills: [{ name: 'routing-explainer', description: 'explain how local routing works' }],
    commands: [], agents: [], plugin_skills: [], agents_store_skills: [],
  });

  assert.equal(result.selected_route, null);
  assert.equal(result.pass_through_reason, 'intent_explain');
});

test('primary deliverables outrank secondary verification and continuity wording', () => {
  const website = inspect('build a polished website and verify it in a real browser', {
    skills: [
      { name: 'sites-building', description: 'use Sites to build websites, landing pages, and dashboards' },
      { name: 'control-in-app-browser', description: 'control the browser for inspecting visible page state and local web testing' },
    ], commands: [], agents: [], plugin_skills: [], agents_store_skills: [],
  });
  assert.equal(website.candidates[0].name, 'sites-building');

  const redesign = inspect('redesign this app for a clearer user experience', {
    skills: [
      { name: 'gsd-profile-user', description: 'generate a developer behavioral profile and create artifacts' },
      { name: 'impeccable', description: 'design and improve frontend interfaces, apps, UX, and visual hierarchy' },
    ], commands: [], agents: [], plugin_skills: [], agents_store_skills: [],
  });
  assert.equal(redesign.candidates[0].name, 'impeccable');

  const dashboard = inspect('build a spreadsheet dashboard from the current data', {
    skills: [
      { name: 'spreadsheets', description: 'create, edit, analyze, and verify spreadsheet files and dashboards' },
      { name: 'gsd-graphify', description: 'build, query, and inspect the project knowledge graph' },
    ], commands: [], agents: [], plugin_skills: [], agents_store_skills: [],
  });
  assert.equal(dashboard.candidates[0].name, 'spreadsheets');

  const autonomous = inspect('continue autonomously until the project is complete', {
    skills: [
      { name: 'gsd-resume-work', description: 'resume work from a previous session with full context restoration' },
      { name: 'gsd-autonomous', description: 'run all remaining phases autonomously through completion' },
    ], commands: [], agents: [], plugin_skills: [], agents_store_skills: [],
  });
  assert.equal(autonomous.candidates[0].name, 'gsd-autonomous');
});

test('a verified architecture query prefers graph analysis before a diagram artifact', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'router-graph-first-'));
  mkdirSync(join(cwd, 'graphify-out'));
  writeFileSync(join(cwd, 'graphify-out', 'graph.json'), JSON.stringify({
    nodes: [{ id: 'architecture_root', label: 'repository architecture' }],
  }));
  const architectureMap = {
    schema_version: 4,
    thresholds: { T_high: 0.6, T_low: 0.3, M: 0.2 },
    entries: [
      {
        id: 'gsd-graphify', mode: 'gsd-graphify', invoke_kind: 'slash',
        signal_patterns: ['build a code relationship graph', 'trace file dependencies'],
        recommended_skills: ['graphify'], recommended_agents: [],
        resolve: [{ name: 'gsd-graphify', weight: 1 }, { name: 'graphify', weight: 0.8 }],
      },
      {
        id: 'excalidraw-diagram', mode: null, invoke_kind: 'skill',
        signal_patterns: ['draw an editable system architecture diagram'],
        recommended_skills: ['excalidraw-diagram'], recommended_agents: [],
      },
    ],
  };
  const result = inspect('trace the architecture of this repository and update the diagram', {
    skills: [
      { name: 'graphify', description: 'build a code relationship graph and trace file dependencies' },
      { name: 'excalidraw-diagram', description: 'draw an editable system architecture diagram' },
    ],
    commands: [], agents: [], plugin_skills: [], agents_store_skills: [],
  }, { modeMap: architectureMap, cwd });

  assert.equal(result.graphify.status, 'ok');
  assert.equal(result.selected_route.id, 'gsd-graphify');
  assert.equal(result.selected_route.resolved_slash, 'graphify');
  assert.deepEqual(result.selected_route.recommended_skills, ['graphify']);
});
