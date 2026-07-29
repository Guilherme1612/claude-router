// Phase 27 / Plan 01 (TDD): Mutation-safety hot-path guards in router.mjs.
// SAF-01: cacheKey folds weightsMtime (7th positional component).
// SAF-02: routeTargetsExist guards cache hits against stale targets.
// SAF-04: capRouteRender hard count cap (1 mode / 3 skills / 2 agents) before formatInjection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const mod = await import(HOOK);
const { cacheKey, routeTargetsExist, capRouteRender, formatInjection } = mod;

function withTempDir(fn) {
  const dir = join(tmpdir(), `router-mutation-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  try { return fn(dir); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
}

// Minimal fake manifest that buildTargetIndexes + knownSkillTargets can consume.
// Shape mirrors the real manifest: arrays of { name } entries for each category.
function fakeManifest({ commands = [], skills = [], pluginSkills = [], agentsStoreSkills = [], agents = [] } = {}) {
  return {
    commands: commands.map((name) => ({ name })),
    skills: skills.map((name) => ({ name })),
    plugin_skills: pluginSkills.map((name) => ({ name })),
    agents_store_skills: agentsStoreSkills.map((name) => ({ name, scope: 'global' })),
    // Safe agent = no requires_mcp_not_in_manifest; blocked = non-empty array.
    agents: agents.map((name) => ({ name })),
  };
}

// --- SAF-01: cacheKey folds weightsMtime as 7th positional component ---

test('SAF-01: cacheKey changing weightsMtime produces a different key (weights-mtime invalidation)', () => {
  const a = cacheKey('fix bug', ['fix'], 1000, 2000, 0, 0, 5000);
  const b = cacheKey('fix bug', ['fix'], 1000, 2000, 0, 0, 5001);
  assert.notEqual(a, b);
});

test('SAF-01 Pitfall 2: non-zero weightsMtime produces a different key from the default-0 key', () => {
  const defaultKey = cacheKey('fix bug', ['fix'], 1000, 2000, 0, 0);
  const realKey = cacheKey('fix bug', ['fix'], 1000, 2000, 0, 0, 5000);
  assert.notEqual(defaultKey, realKey);
});

// --- SAF-02: routeTargetsExist guards cache hits against stale targets ---

test('SAF-02: routeTargetsExist returns false when a recommended_skill is absent from the manifest', () => {
  const manifest = fakeManifest({ skills: ['impeccable'], agents: ['code-reviewer'] });
  const route = {
    invoke_kind: 'slash', id: 'gsd-debug', mode: 'gsd-debug',
    recommended_skills: ['impeccable', 'ghost-skill'],
    recommended_agents: ['code-reviewer'],
  };
  assert.equal(routeTargetsExist(route, manifest), false);
});

test('SAF-02: routeTargetsExist returns false when a recommended_agent is absent from the manifest', () => {
  const manifest = fakeManifest({ skills: ['impeccable'], agents: ['code-reviewer'] });
  const route = {
    invoke_kind: 'slash', id: 'gsd-debug', mode: 'gsd-debug',
    recommended_skills: ['impeccable'],
    recommended_agents: ['code-reviewer', 'ghost-agent'],
  };
  assert.equal(routeTargetsExist(route, manifest), false);
});

test('SAF-02 fail-open: routeTargetsExist returns true for null, warn, and pass-through routes', () => {
  const manifest = fakeManifest();
  const warnRoute = { invoke_kind: 'warn', warning: 'Agent needs MCP X.' };
  const passThrough = { invoke_kind: null, tier: 'low' };
  assert.equal(routeTargetsExist(null, manifest), true);
  assert.equal(routeTargetsExist(warnRoute, manifest), true);
  assert.equal(routeTargetsExist(passThrough, manifest), true);
});

test('SAF-02 fail-open: routeTargetsExist returns true on internal error (malformed manifest) — never blocks', () => {
  const boom = new Proxy({}, { get() { throw new Error('boom'); } });
  const route = {
    invoke_kind: 'slash', id: 'gsd-debug', mode: 'gsd-debug',
    recommended_skills: [], recommended_agents: [],
  };
  assert.equal(routeTargetsExist(route, boom), true);
});

// --- SAF-04: capRouteRender hard count cap before formatInjection ---

test('SAF-04: capRouteRender truncates 5 skills to 3 and 4 agents to 2, preserving array order', () => {
  const route = {
    recommended_skills: ['s1', 's2', 's3', 's4', 's5'],
    recommended_agents: ['a1', 'a2', 'a3', 'a4'],
  };
  const capped = capRouteRender(route);
  assert.equal(capped.recommended_skills.length, 3);
  assert.equal(capped.recommended_agents.length, 2);
  assert.deepEqual(capped.recommended_skills, ['s1', 's2', 's3']);
  assert.deepEqual(capped.recommended_agents, ['a1', 'a2']);
});

test('SAF-04: capRouteRender sets _render_cap_truncated when input exceeds 3 skills or 2 agents', () => {
  const overSkills = { recommended_skills: ['s1', 's2', 's3', 's4'], recommended_agents: ['a1'] };
  assert.equal(capRouteRender(overSkills)._render_cap_truncated, true);
  const overAgents = { recommended_skills: ['s1'], recommended_agents: ['a1', 'a2', 'a3'] };
  assert.equal(capRouteRender(overAgents)._render_cap_truncated, true);
});

test('SAF-04: capRouteRender does NOT set _render_cap_truncated when input is within bounds', () => {
  const within = { recommended_skills: ['s1', 's2', 's3'], recommended_agents: ['a1', 'a2'] };
  const capped = capRouteRender(within);
  assert.equal(capped._render_cap_truncated, undefined);
});

test('SAF-04 integration: formatInjection(capRouteRender(overloaded)) never emits more than 3 skill lines or 2 agent lines', () => {
  const overloaded = {
    invoke_kind: 'slash', tier: 'high', mode: 'gsd-debug', id: 'gsd-debug',
    recommended_skills: ['s1', 's2', 's3', 's4', 's5'],
    recommended_agents: ['a1', 'a2', 'a3', 'a4'],
    args_hint: '', reasoning: 'matches',
  };
  const out = formatInjection(capRouteRender(overloaded), 'fix bug', 'abcd1234');
  const skillLines = (out.match(/Use the Skill tool to invoke/g) || []).length;
  const agentLines = (out.match(/Dispatch agent/g) || []).length;
  assert.ok(skillLines <= 3, `expected <= 3 skill lines, got ${skillLines}`);
  assert.ok(agentLines <= 2, `expected <= 2 agent lines, got ${agentLines}`);
});