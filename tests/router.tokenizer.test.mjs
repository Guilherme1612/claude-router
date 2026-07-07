// Task 2 (RED→GREEN): Tokenizer for router.mjs (RTE-02/§3).
// Lowercase → split /[^a-z0-9]+/ → drop stop words + 1-char tokens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const mod = await import(HOOK);
const { tokenize } = mod;

test('tokenize: lowercases and splits on non-alphanumerics', () => {
  const t = tokenize('Fix The BUG, now!');
  assert.deepEqual(t, ['fix', 'bug', 'now']);
});

test('tokenize: drops stop words from the §3 STOP set', () => {
  const t = tokenize('use the router to fix a bug via the pipeline');
  // STOP drops: use, the, to, a, via; keeps: router, fix, bug, pipeline
  assert.deepEqual(t, ['router', 'fix', 'bug', 'pipeline']);
});

test('tokenize: drops 1-char tokens (length > 1 filter)', () => {
  const t = tokenize('a 1 b 2x c d e f g');
  // 'x' from '2x' is length 1 after split? No — split on non-alnum keeps '2x'.
  // '2x' length 2 → kept. 'a','b','c','d','e','f','g' length 1 → dropped.
  assert.deepEqual(t, ['2x']);
});

test('tokenize: empty/null/undefined input returns []', () => {
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
  assert.deepEqual(tokenize(undefined), []);
  assert.deepEqual(tokenize('   '), []);
});

test('tokenize: split on /[^a-z0-9]+/ (punctuation, whitespace, hyphens)', () => {
  const t = tokenize('plan-phase, execute_plan!  debug--crash');
  assert.deepEqual(t, ['plan', 'phase', 'execute', 'plan', 'debug', 'crash']);
});

test('tokenize: property — two prompts differing in one verb tokenize distinctly', () => {
  const a = tokenize('please debug the failing test');
  const b = tokenize('please ship the failing test');
  assert.notDeepEqual(a, b);
  assert.ok(a.includes('debug'));
  assert.ok(b.includes('ship'));
});

test('tokenize: numbers preserved, mixed alnum kept together (1-char drops)', () => {
  const t = tokenize('phase 01 plan 2 test3');
  // '2' has length 1 → dropped; '01' and 'test3' kept
  assert.deepEqual(t, ['phase', '01', 'plan', 'test3']);
});