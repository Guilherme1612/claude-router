// Task 1 (RED→GREEN): Guard layer for router.mjs (GRD-01..05 / D-14..17).
// Guards prevent dead/dangerous routes: MCP-missing agents hard-filtered +
// warn-demoted; project-scoped skills excluded; ralph two-gate (verbatim
// promise or don't route); named-name explicit override; deny-rule filtered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const {
  buildCorpus,
  bm25Score,
  normalize,
  applyGuards,
  extractVerifiablePromise,
  denyPathDetect,
  explicitOverrideDetect,
  buildKnownNames,
} = await import(HOOK);

// --- Fixtures --------------------------------------------------------------

// A manifest fixture with one MCP-flagged agent (gsd-phase-researcher shape)
// whose description strongly matches "phase research" queries, plus one clean
// agent and one project-scoped skill (impeccable).
const FLAGGED_AGENT = {
  name: 'gsd-phase-researcher',
  description: 'Researches a phase. Reads phase docs, gathers domain context, uses context7 mcp.',
  summary: 'Phase researcher agent. Gathers domain context for a phase plan using context7.',
  requires_mcp_not_in_manifest: ['context7'],
};
const CLEAN_AGENT = {
  name: 'gsd-debugger',
  description: 'Debugs a failing test. Finds the root cause of a bug or regression.',
  summary: 'Debugger agent. Runs systematic debugging to find root causes.',
};
const PROJECT_SKILL = {
  name: 'impeccable',
  description: 'Project-scoped skill. Should never appear in a global route.',
  summary: 'Project-scoped skill.',
  scope: 'project',
};
const GLOBAL_SKILL = {
  name: 'systematic-debugging',
  description: 'Systematic debugging skill. Find root cause of a bug or failing test.',
  summary: 'Systematic debugging approach for finding root causes.',
  scope: 'global',
};

function fixtureManifest() {
  return {
    skills: [GLOBAL_SKILL, PROJECT_SKILL],
    plugin_skills: [],
    agents_store_skills: [],
    agents: [FLAGGED_AGENT, CLEAN_AGENT],
    commands: [],
  };
}

function realManifest() {
  // Loaded from disk so we can assert against the actual scope/MCP state.
  return JSON.parse(readFileSync(join(homedir(), '.claude', 'router', 'claude-inventory-manifest.json'), 'utf8'));
}

function fixtureModeMap() {
  return {
    thresholds: { T_high: 0.6, T_low: 0.3, M: 0.2 },
    ralph_loop: { signal_patterns: ['keep running', 'iterate until'], require_verifiable_done_criteria: true },
    entries: [
      { id: 'debug', mode: 'gsd-debug', invoke_kind: 'slash',
        signal_patterns: ['bug', 'failing test'],
        recommended_skills: ['systematic-debugging'], recommended_agents: [],
        args_hint: '<bug description>' },
      { id: 'ralph-verifiable', mode: 'ralph-loop', invoke_kind: 'slash',
        signal_patterns: ['keep running', 'iterate until'],
        recommended_skills: [], recommended_agents: [],
        args_hint: '"<task>" --completion-promise "<criteria>"' },
    ],
  };
}

// --- GRD-01: MCP-missing agents hard-filtered + warn-demoted ---------------

test('GRD-01: context7-flagged agent never in auto-dispatch pool (buildCorpus)', () => {
  const corpus = buildCorpus(fixtureManifest());
  const names = corpus.map((c) => c.name);
  assert.ok(!names.includes('gsd-phase-researcher'),
    'flagged agent must be excluded from auto-dispatch pool BEFORE scoring');
  assert.ok(names.includes('gsd-debugger'), 'clean agent must remain in pool');
});

test('GRD-01: flagged agent absent from any High route', () => {
  const corpus = buildCorpus(fixtureManifest());
  const q = ['phase', 'research', 'context', 'domain'];
  const scored = normalize(bm25Score(q, corpus));
  for (const s of scored) {
    assert.notEqual(s.name, 'gsd-phase-researcher',
      'flagged agent must never appear in a High route (auto-pool excludes it)');
  }
});

test('GRD-01: flagged agent that would have scored High → demote to warn', () => {
  const manifest = fixtureManifest();
  const q = ['phase', 'research', 'context', 'domain', 'gather'];
  // route from auto-pool (flagged excluded) — debugger scores low for this query
  const route = { mode: 'gsd-debug', invoke_kind: 'slash', tier: 'low',
    recommended_skills: [], recommended_agents: [], args_hint: '' };
  const { route: r2, guards_fired } = applyGuards(route, 'research the phase', manifest, fixtureModeMap(),
    { queryTokens: q, thresholds: fixtureModeMap().thresholds });
  // the flagged agent would have scored High in its own pool → demote
  assert.equal(r2.invoke_kind, 'warn');
  assert.ok(r2.warning && r2.warning.includes('gsd-phase-researcher'),
    'warn message must name the flagged agent');
  assert.ok(r2.warning.includes('context7'), 'warn message must name the missing MCP');
  assert.ok(guards_fired.some((g) => g.startsWith('mcp_demote:gsd-phase-researcher:context7')),
    'guards_fired must record mcp_demote:<name>:<mcp>');
});

test('GRD-01: warn message phrasing matches spec', () => {
  const manifest = fixtureManifest();
  const q = ['phase', 'research', 'context', 'domain'];
  const route = { mode: 'gsd-debug', invoke_kind: 'slash', tier: 'low',
    recommended_skills: [], recommended_agents: [], args_hint: '' };
  const { route: r2 } = applyGuards(route, 'research the phase', manifest, fixtureModeMap(),
    { queryTokens: q });
  assert.match(r2.warning,
    /Agent gsd-phase-researcher needs MCP context7 which is not in manifest — wire it first/);
});

test('GRD-01: no demote when flagged agent would NOT have scored High', () => {
  const manifest = fixtureManifest();
  // a query that matches nothing in the flagged pool meaningfully
  const q = ['zzz', 'qqq', 'nothing'];
  const route = { mode: 'gsd-debug', invoke_kind: 'slash', tier: 'low',
    recommended_skills: [], recommended_agents: [], args_hint: '' };
  const { route: r2, guards_fired } = applyGuards(route, 'zzz qqq', manifest, fixtureModeMap(),
    { queryTokens: q });
  assert.equal(r2.invoke_kind, 'slash'); // unchanged — no demote
  assert.ok(!guards_fired.some((g) => g.startsWith('mcp_demote')),
    'no mcp_demote guard should fire when flagged agent would not score High');
});

// --- GRD-02: project-scoped skills filtered globally ----------------------

test('GRD-02: impeccable (scope:project) never in a global route (fixture)', () => {
  const corpus = buildCorpus(fixtureManifest());
  const names = corpus.map((c) => c.name);
  assert.ok(!names.includes('impeccable'),
    'project-scoped skill must not appear in the global corpus');
  assert.ok(names.includes('systematic-debugging'), 'global skill must remain');
});

test('GRD-02: against real manifest, impeccable not in corpus', () => {
  const m = realManifest();
  const corpus = buildCorpus(m);
  const names = corpus.map((c) => c.name);
  assert.ok(!names.includes('impeccable'),
    'impeccable (project-scoped / agents-store-not-symlinked) must never be in the global auto-dispatch pool');
});

// --- GRD-03: ralph two-gate (positive, negative, quote-don't-synthesize) ---

test('GRD-03 positive: verifiable done-criteria → ralph route with verbatim promise', () => {
  const prompt = 'keep running the suite until all tests pass, max 20 tries';
  const route = { mode: 'ralph-loop', invoke_kind: 'slash', tier: 'high',
    recommended_skills: [], recommended_agents: [],
    args_hint: '"<task>" --completion-promise "<criteria>"' };
  const { route: r2, guards_fired } = applyGuards(route, prompt, fixtureManifest(), fixtureModeMap(), {});
  assert.equal(r2.mode, 'ralph-loop'); // routes
  assert.ok(r2.completion_promise, 'must carry a completion_promise');
  // the promise MUST be a literal substring of the prompt (D-15 verbatim rule)
  assert.ok(prompt.includes(r2.completion_promise),
    `promise "${r2.completion_promise}" must be quoted verbatim from the prompt`);
  assert.equal(guards_fired.length, 0); // no guard fired — routed normally
});

test('GRD-03 negative: no verifiable done-criteria → does NOT route to ralph-loop', () => {
  const prompt = 'how does the router hook decide which mode? architecture question';
  const route = { mode: 'ralph-loop', invoke_kind: 'slash', tier: 'high',
    recommended_skills: [], recommended_agents: [], args_hint: '' };
  const { route: r2, guards_fired } = applyGuards(route, prompt, fixtureManifest(), fixtureModeMap(), {});
  assert.notEqual(r2.mode, 'ralph-loop', 'must NOT route to ralph-loop without verifiable criteria');
  assert.equal(r2.mode, null);
  assert.equal(r2.fallback, 'inline');
  assert.ok(guards_fired.includes('no_verifiable_done_criteria'),
    'guards_fired must record no_verifiable_done_criteria');
});

test('GRD-03 quote-don\'t-synthesize: promise is a literal substring, never paraphrased', () => {
  const prompt = 'iterate until coverage >= 90%';
  const route = { mode: 'ralph-loop', invoke_kind: 'slash', tier: 'high',
    recommended_skills: [], recommended_agents: [], args_hint: '' };
  const { route: r2 } = applyGuards(route, prompt, fixtureManifest(), fixtureModeMap(), {});
  assert.ok(r2.completion_promise && prompt.includes(r2.completion_promise),
    'promise must be a verbatim quote from the prompt, never synthesized');
});

test('extractVerifiablePromise: returns null for non-verifiable prompts', () => {
  assert.equal(extractVerifiablePromise('how does the router decide'), null);
  assert.equal(extractVerifiablePromise('thanks'), null);
  assert.equal(extractVerifiablePromise('what is the architecture'), null);
});

test('extractVerifiablePromise: returns literal phrase for verifiable prompts', () => {
  const p = extractVerifiablePromise('until all tests pass');
  assert.equal(p, 'all tests pass');
  const p2 = extractVerifiablePromise('max 50 tries then stop');
  assert.equal(p2, 'max 50 tries');
});

// --- GRD-04: named-name explicit override ---------------------------------

test('GRD-04: /-prefix → user_explicit pass-through (existing half)', () => {
  const r = explicitOverrideDetect('/gsd-debug fix the flaky test');
  assert.equal(r.override, true);
  assert.equal(r.reason, 'user_explicit');
});

test('GRD-04: known mode-map mode name as whole-word → user_explicit', () => {
  const known = buildKnownNames(fixtureModeMap());
  assert.ok(known.has('gsd-debug'));
  const r = explicitOverrideDetect('use gsd-debug to fix this', known);
  assert.equal(r.override, true);
  assert.equal(r.reason, 'user_explicit');
  assert.equal(r.matched, 'gsd-debug');
});

test('GRD-04: known skill name as whole-word → user_explicit', () => {
  const known = buildKnownNames(fixtureModeMap());
  assert.ok(known.has('systematic-debugging'));
  const r = explicitOverrideDetect('run systematic-debugging for this bug', known);
  assert.equal(r.override, true);
  assert.equal(r.reason, 'user_explicit');
});

test('GRD-04: substring inside another word does NOT match (whole-word only)', () => {
  const known = buildKnownNames(fixtureModeMap());
  // "gsd-debugging" is not the same token as "gsd-debug" — must not fire on the prefix
  const r = explicitOverrideDetect('this gsd-debugging-thing is unrelated', known);
  assert.equal(r.override, false);
});

test('GRD-04: prompt without any known name → no override', () => {
  const known = buildKnownNames(fixtureModeMap());
  const r = explicitOverrideDetect('the flaky payment test keeps failing intermittently', known);
  assert.equal(r.override, false);
});

test('buildKnownNames: collects slash form + multi-token mode/id/skills/agents; drops bare single-word ids', () => {
  const known = buildKnownNames(fixtureModeMap());
  assert.ok(known.has('gsd-debug'));      // multi-token mode (has '-')
  assert.ok(known.has('/gsd-debug'));    // slash form always added
  assert.ok(known.has('ralph-loop'));    // multi-token id
  assert.ok(known.has('/ralph-loop'));
  assert.ok(known.has('systematic-debugging')); // multi-token recommended_skill
  // Bare single-word ids/modes are deliberately dropped (Gap 3) so a common
  // verb like "commit" in a routing prompt does not falsely trip user_explicit.
  assert.equal(known.has('debug'), false, 'bare single-word id dropped');
});

// --- GRD-05: deny-rule paths filtered -------------------------------------

test('GRD-05: prompt referencing .env → deny_filtered, no route', () => {
  const route = { mode: 'gsd-debug', invoke_kind: 'slash', tier: 'high',
    recommended_skills: [], recommended_agents: [], args_hint: '' };
  const { route: r2, guards_fired } = applyGuards(route, 'read the .env file for the secret key',
    fixtureManifest(), fixtureModeMap(), {});
  assert.equal(r2, null, 'deny-rule prompt must produce no route');
  assert.ok(guards_fired.includes('deny_filtered'),
    'guards_fired must record deny_filtered');
});

test('GRD-05: prompt referencing .secrets → deny_filtered', () => {
  assert.equal(denyPathDetect('cat .secrets'), true);
  assert.equal(denyPathDetect('show me .env'), true);
  assert.equal(denyPathDetect('a normal prompt about debugging'), false);
});

test('GRD-05: denyPathDetect does not match .environment or .envoy', () => {
  assert.equal(denyPathDetect('set the ENVIRONMENT variable'), false);
  assert.equal(denyPathDetect('the envoy arrived'), false);
});

test('GRD-05: deny path from settings.permissions.deny matched', () => {
  const settings = { permissions: { deny: ['**/.aws/credentials'] } };
  assert.equal(denyPathDetect('read ~/.aws/credentials', settings), true);
  assert.equal(denyPathDetect('read ~/.config/file', settings), false);
});

test('GRD-05: GRD-05 takes precedence over GRD-01 demote (deny wins)', () => {
  const manifest = fixtureManifest();
  const route = { mode: 'gsd-debug', invoke_kind: 'slash', tier: 'high',
    recommended_skills: [], recommended_agents: [], args_hint: '' };
  const { route: r2, guards_fired } = applyGuards(route, 'research the phase .env',
    manifest, fixtureModeMap(), { queryTokens: ['phase', 'research'] });
  assert.equal(r2, null);
  assert.ok(guards_fired.includes('deny_filtered'));
  // deny_filtered must be the ONLY guard — no signature, no mcp_demote
  assert.equal(guards_fired.length, 1);
});