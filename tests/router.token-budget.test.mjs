// Task 2 (RED→GREEN): ≤500-token injected context cap (INJ-06 / D-06).
// Asserts a maxed-out route (slash + 3 skills + 2 agents + long reasoning)
// stays ≤ 500 tokens via tokenCount(), with the priority drop order applied.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const { formatInjection, tokenCount } = await import(HOOK);

const SIG = 'deadbeef';

test('token-budget: maxed-out slash/High route (slash + 3 skills + 2 agents) ≤ 500 tokens', () => {
  const route = {
    mode: 'gsd-debug',
    invoke_kind: 'slash',
    tier: 'high',
    recommended_skills: ['systematic-debugging', 'verification-before-completion', 'requesting-code-review'],
    recommended_agents: ['gsd-debugger', 'gsd-debug-session-manager'],
    args_hint: 'the flaky payment test keeps failing intermittently with a connection timeout in the checkout flow',
  };
  const out = formatInjection(route, 'a normal prompt about a flaky test', SIG);
  const tc = tokenCount(out);
  assert.ok(tc <= 500, `maxed-out route must stay ≤ 500 tokens; got ${tc}\n--- block ---\n${out}`);
});

test('token-budget: maxed-out slash/High with verbose args still ≤ 500', () => {
  const longArgs = 'a'.repeat(400); // ~100 tokens just for args
  const route = {
    mode: 'gsd-debug',
    invoke_kind: 'slash',
    tier: 'high',
    recommended_skills: ['systematic-debugging', 'verification-before-completion', 'requesting-code-review', 'receiving-code-review', 'test-driven-development'],
    recommended_agents: ['gsd-debugger', 'gsd-debug-session-manager', 'gsd-forensics-agent'],
    args_hint: longArgs,
  };
  const out = formatInjection(route, 'a normal prompt', SIG);
  const tc = tokenCount(out);
  assert.ok(tc <= 500, `must drop overflow and stay ≤ 500 tokens; got ${tc}`);
});

test('token-budget: drop order keeps sentinel + slash + primary skill under cap', () => {
  // When over cap, agents drop first, then secondary skills, then reasoning trims.
  // The minimal survivor keeps the slash line + primary skill (Pitfall 2 + Pitfall 17).
  const longArgs = 'b'.repeat(800); // forces trimming
  const route = {
    mode: 'gsd-debug',
    invoke_kind: 'slash',
    tier: 'high',
    recommended_skills: ['systematic-debugging', 'verification-before-completion'],
    recommended_agents: ['gsd-debugger'],
    args_hint: longArgs,
  };
  const out = formatInjection(route, 'a normal prompt', SIG);
  assert.ok(tokenCount(out) <= 500, `must stay ≤ 500 tokens; got ${tokenCount(out)}`);
  // the slash line must survive (Pitfall 2 — the load-bearing instruction)
  assert.match(out, /Run \/gsd-debug/, 'slash line must survive the drop order');
  // the open + close sentinels must survive
  assert.ok(out.includes('<!-- router-inject'), 'open sentinel survives');
  assert.ok(out.includes('<!-- /router-inject -->'), 'close sentinel survives');
});

test('token-budget: skill/High maxed-out route ≤ 500', () => {
  const route = {
    mode: null,
    invoke_kind: 'skill',
    tier: 'high',
    recommended_skills: ['find-skills', 'systematic-debugging', 'verification-before-completion', 'test-driven-development', 'requesting-code-review'],
    recommended_agents: ['gsd-debugger', 'gsd-debug-session-manager'],
    args_hint: null,
  };
  const out = formatInjection(route, 'find me a skill', SIG);
  assert.ok(tokenCount(out) <= 500, `skill/High maxed-out must stay ≤ 500; got ${tokenCount(out)}`);
});

test('token-budget: agent/High maxed-out route ≤ 500', () => {
  const route = {
    mode: null,
    invoke_kind: 'agent',
    tier: 'high',
    recommended_skills: ['systematic-debugging', 'verification-before-completion', 'test-driven-development'],
    recommended_agents: ['scaffolder', 'gsd-debugger', 'gsd-forensics-agent'],
    args_hint: null,
  };
  const out = formatInjection(route, 'scaffold and debug', SIG);
  assert.ok(tokenCount(out) <= 500, `agent/High maxed-out must stay ≤ 500; got ${tokenCount(out)}`);
});

test('token-budget: warn kind with long warning ≤ 500', () => {
  const route = {
    mode: null,
    invoke_kind: 'warn',
    tier: 'high',
    recommended_skills: [],
    recommended_agents: [],
    args_hint: null,
    warning: 'Agent gsd-phase-researcher needs MCP context7 which is not in manifest — wire it first. ' + 'x'.repeat(2000),
  };
  const out = formatInjection(route, 'research the phase', SIG);
  assert.ok(tokenCount(out) <= 500, `warn with long warning must trim to ≤ 500; got ${tokenCount(out)}`);
  assert.match(out, /Agent gsd-phase-researcher needs MCP context7/, 'warn message survives trimming');
});

test('token-budget: ralph-loop with long task + promise ≤ 500', () => {
  const route = {
    mode: 'ralph-loop',
    invoke_kind: 'slash',
    tier: 'high',
    recommended_skills: [],
    recommended_agents: [],
    args_hint: '"<task>" --completion-promise "<criteria>"',
    task: 'k'.repeat(600),
    completion_promise: 'all tests pass',
  };
  const out = formatInjection(route, 'until all tests pass', SIG);
  assert.ok(tokenCount(out) <= 500, `ralph-loop with long task must stay ≤ 500; got ${tokenCount(out)}`);
  assert.match(out, /Run \/ralph-loop/, 'ralph-loop slash line survives');
  assert.match(out, /--completion-promise "all tests pass"/, 'verbatim promise survives');
});