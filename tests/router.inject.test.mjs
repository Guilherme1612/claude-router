// Task 2 (RED→GREEN): formatInjection per invoke_kind × tier for router.mjs
// (INJ-01..06 / D-10 / D-11). One assertion per (invoke_kind × tier) cell:
// slash/High, slash/Medium, skill/High, skill/Medium, agent/High, agent/Medium,
// warn/any, Low/any. D-01 discipline: the injected text is a MODEL instruction
// (`Run /gsd-<mode>`, `Use the Skill tool to invoke`, `Dispatch agent`) — the
// model executes; the harness never auto-runs slashes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const { formatInjection, tokenCount, SENTINEL, applyGuards } = await import(HOOK);

const SIG = 'abc12345';

// --- CR-01: ralph-loop injection must NOT emit the literal "the task" placeholder ---
// main() builds the route without a `task` field and applyGuards() GRD-03 sets
// `completion_promise` but NOT `task`. The live path (no stubbed fixture) must
// still derive a real task from the prompt so slashLine() does not fall back to
// the literal "the task". This test exercises applyGuards → formatInjection
// (the real pipeline pieces), NOT a stubbed route with `task` preset.
test('CR-01: ralph-loop live path emits a real task, not the "the task" placeholder', () => {
  const prompt = 'keep running tests until they all pass, max 20 tries';
  // Route as main() constructs it — NO `task` field (the bug shape).
  const route = {
    mode: 'ralph-loop',
    invoke_kind: 'slash',
    tier: 'high',
    recommended_skills: [],
    recommended_agents: [],
    args_hint: '"<task>" --completion-promise "<criteria>"',
  };
  const guarded = applyGuards(route, prompt, null, null, {});
  assert.ok(guarded.route, 'GRD-03 must keep the route (verifiable promise present)');
  assert.equal(guarded.route.completion_promise, 'they all pass');
  const out = formatInjection(guarded.route, prompt, SIG);
  assert.match(out, /Run \/ralph-loop "/, 'ralph-loop slash line present');
  assert.ok(
    !out.includes('"the task"'),
    `CR-01: literal "the task" placeholder leaked into injection — out="${out}"`
  );
  // The real task must be derived from the prompt (tests/running) — not the promise.
  assert.ok(
    /Run \/ralph-loop ".*tests?/i.test(out) || /Run \/ralph-loop ".*running/i.test(out),
    `CR-01: injected task should reference the prompt content — out="${out}"`
  );
});

// --- slash × High ----------------------------------------------------------

test('slash × High: sentinel + reasoning + slash at column 0 + imperatives', () => {
  const route = { mode: 'gsd-debug', invoke_kind: 'slash', tier: 'high',
    recommended_skills: ['systematic-debugging'], recommended_agents: [],
    args_hint: '<bug description>' };
  const out = formatInjection(route, 'a normal prompt', SIG);
  assert.ok(out.startsWith('\n\n'), 'block must be prepended with \\n\\n');
  assert.ok(out.includes('<!-- router-inject mode=gsd-debug tier=high'), 'open sentinel with mode/tier');
  assert.ok(out.includes('<!-- /router-inject -->'), 'close sentinel');
  assert.ok(out.includes('Reasoning:'), 'reasoning line always visible at High (D-10/D-11)');
  // slash line at column 0, no backticks, no leading whitespace
  assert.match(out, /(^|\n)Run \/gsd-debug /);
  assert.ok(!out.includes('`Run /gsd-debug'), 'no backticks around the slash (Pitfall 2)');
  assert.ok(!/\n\s+Run \//.test(out), 'no leading whitespace before the slash line (Pitfall 2)');
  assert.ok(out.includes('Use the Skill tool to invoke systematic-debugging now'),
    'skill imperative present at High (Pitfall 17)');
});

test('slash × High: ralph-loop includes verbatim --completion-promise', () => {
  const route = { mode: 'ralph-loop', invoke_kind: 'slash', tier: 'high',
    recommended_skills: [], recommended_agents: [],
    args_hint: '"<task>" --completion-promise "<criteria>"',
    task: 'run the suite', completion_promise: 'all tests pass' };
  const out = formatInjection(route, 'until all tests pass', SIG);
  assert.match(out, /Run \/ralph-loop "run the suite" --completion-promise "all tests pass"/);
  assert.ok(!out.includes('`/ralph-loop'), 'no backticks around the slash');
});

// --- slash × Medium --------------------------------------------------------

test('slash × Medium: text-only suggestion, NO `Run /` slash instruction (Pitfall 2)', () => {
  const route = { mode: 'gsd-debug', invoke_kind: 'slash', tier: 'medium',
    recommended_skills: ['systematic-debugging'], recommended_agents: [],
    args_hint: '<bug description>' };
  const out = formatInjection(route, 'a normal prompt', SIG);
  assert.ok(out.includes('Reasoning:'), 'reasoning line visible at Medium (D-10/D-11)');
  assert.match(out, /Recommended: \/gsd-debug\./);
  // CRITICAL (Pitfall 2): NO `Run /` instruction line at Medium — a slash at
  // Medium would auto-fire when the model reads it.
  assert.ok(!/\nRun \//.test(out), 'Medium must NOT emit a `Run /` slash instruction line');
  assert.ok(!/Run \/gsd-debug /.test(out), 'no slash instruction at Medium');
  assert.ok(out.includes('Skills: systematic-debugging'), 'skills listed as text');
});

// --- skill × High ----------------------------------------------------------

test('skill × High: imperative `Use the Skill tool to invoke <name> now, because`', () => {
  const route = { mode: null, invoke_kind: 'skill', tier: 'high',
    recommended_skills: ['find-skills'], recommended_agents: [], args_hint: null };
  const out = formatInjection(route, 'find me a skill that does X', SIG);
  assert.ok(out.includes('Reasoning:'));
  assert.match(out, /Use the Skill tool to invoke find-skills now, because/);
  assert.ok(!out.includes('`Use the Skill'), 'no backticks around the imperative (Pitfall 17)');
  assert.ok(!out.includes('Run /'), 'skill kind does not emit a slash instruction');
});

// --- skill × Medium --------------------------------------------------------

test('skill × Medium: `Recommended skill: <name>. Run if fit.`', () => {
  const route = { mode: null, invoke_kind: 'skill', tier: 'medium',
    recommended_skills: ['find-skills'], recommended_agents: [], args_hint: null };
  const out = formatInjection(route, 'find me a skill that does X', SIG);
  assert.ok(out.includes('Reasoning:'));
  assert.match(out, /Recommended skill: find-skills\. Run if fit\./);
  assert.ok(!out.includes('Use the Skill tool to invoke'), 'Medium must NOT emit the imperative');
});

// --- agent × High ----------------------------------------------------------

test('agent × High: imperative `Dispatch agent <name> for <subtask>, because`', () => {
  const route = { mode: null, invoke_kind: 'agent', tier: 'high',
    recommended_skills: [], recommended_agents: ['scaffolder'], args_hint: null };
  const out = formatInjection(route, 'scaffold a new plugin', SIG);
  assert.ok(out.includes('Reasoning:'));
  assert.match(out, /Dispatch agent scaffolder for this subtask, because/);
  assert.ok(!out.includes('`Dispatch agent'), 'no backticks around the imperative');
});

// --- agent × Medium --------------------------------------------------------

test('agent × Medium: `Recommended agent: <name> for <subtask>. Dispatch if fit.`', () => {
  const route = { mode: null, invoke_kind: 'agent', tier: 'medium',
    recommended_skills: [], recommended_agents: ['scaffolder'], args_hint: null };
  const out = formatInjection(route, 'scaffold a new plugin', SIG);
  assert.ok(out.includes('Reasoning:'));
  assert.match(out, /Recommended agent: scaffolder for this subtask\. Dispatch if fit\./);
  assert.ok(!out.includes('Dispatch agent scaffolder for'), 'Medium must NOT emit the imperative');
});

// --- warn × any ------------------------------------------------------------

test('warn × any: MCP-missing warning, no dispatch, reasoning visible', () => {
  const route = { mode: null, invoke_kind: 'warn', tier: 'high',
    recommended_skills: [], recommended_agents: [], args_hint: null,
    warning: 'Agent gsd-phase-researcher needs MCP context7 which is not in manifest — wire it first' };
  const out = formatInjection(route, 'research the phase', SIG);
  assert.ok(out.includes('Reasoning:'));
  assert.match(out, /Agent gsd-phase-researcher needs MCP context7 which is not in manifest — wire it first/);
  assert.ok(!out.includes('Dispatch agent'), 'warn kind must NOT dispatch');
  assert.ok(!out.includes('Run /'), 'warn kind must NOT emit a slash instruction');
});

// --- Low × any -------------------------------------------------------------

test('Low × any: inject nothing (true pass-through, no sentinel)', () => {
  const route = { mode: 'gsd-debug', invoke_kind: 'slash', tier: 'low',
    recommended_skills: [], recommended_agents: [], args_hint: '' };
  const out = formatInjection(route, 'a normal prompt', SIG);
  assert.equal(out, '', 'Low tier must inject nothing — true pass-through, no sentinel');
});

test('no route → empty string', () => {
  assert.equal(formatInjection(null, 'prompt', SIG), '');
  assert.equal(formatInjection({ mode: null, invoke_kind: null, tier: 'high' }, 'p', SIG), '');
});

// --- re-entry dedupe (INJ-05) ----------------------------------------------

test('formatInjection: re-entry — prompt already carrying sentinel → empty', () => {
  const route = { mode: 'gsd-debug', invoke_kind: 'slash', tier: 'high',
    recommended_skills: [], recommended_agents: [], args_hint: '' };
  const promptWithSentinel = `some prompt ${SENTINEL} more text`;
  assert.equal(formatInjection(route, promptWithSentinel, SIG), '',
    're-entry skip when the sentinel is already in the prompt (INJ-05)');
});

// --- block layout invariants ------------------------------------------------

test('block: always starts with \\n\\n (never glues onto user text)', () => {
  const route = { mode: 'gsd-debug', invoke_kind: 'slash', tier: 'high',
    recommended_skills: [], recommended_agents: [], args_hint: '' };
  const out = formatInjection(route, 'a normal prompt', SIG);
  assert.ok(out.startsWith('\n\n'), 'block must be prepended with \\n\\n (Pitfall 2)');
});

test('block: open sentinel carries mode + tier + sig metadata', () => {
  const route = { mode: 'gsd-debug', invoke_kind: 'slash', tier: 'high',
    recommended_skills: [], recommended_agents: [], args_hint: '' };
  const out = formatInjection(route, 'a normal prompt', SIG);
  assert.match(out, /<!-- router-inject mode=gsd-debug tier=high sig=abc12345 -->/);
  assert.ok(out.includes('<!-- /router-inject -->'), 'close sentinel present');
});

// --- D-01 discipline -------------------------------------------------------

test('D-01: instruction text is a model instruction, not harness-auto-run', () => {
  const route = { mode: 'gsd-debug', invoke_kind: 'slash', tier: 'high',
    recommended_skills: [], recommended_agents: [], args_hint: '' };
  const out = formatInjection(route, 'a normal prompt', SIG);
  // phrasing must address the model as the executor
  assert.match(out, /Run \/gsd-debug/);
  assert.ok(!out.includes('harness auto'), 'never phrase as "harness auto-runs" (D-01)');
});

// --- tokenCount helper -----------------------------------------------------

test('tokenCount: ~4 chars per token approximation', () => {
  assert.equal(tokenCount(''), 0);
  assert.equal(tokenCount('abcd'), 1);
  assert.equal(tokenCount('abcdefgh'), 2);
  assert.ok(tokenCount('a'.repeat(4000)) > 500);
});