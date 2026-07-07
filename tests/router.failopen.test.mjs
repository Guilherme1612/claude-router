// Task 1 (RED): Fail-open contract for router.mjs hook skeleton.
// Asserts: empty/malformed/trivial/forced-throw inputs all exit 0 with no
// additionalContext; never exit 2; never emit decision:block.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const NODE = '/Users/guilherme/.hermes/node/bin/node';

function runHook(stdinStr, env = {}) {
  const r = spawnSync(NODE, [HOOK], {
    input: stdinStr,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function parseOut(stdout) {
  if (!stdout || stdout.trim() === '') return null;
  try { return JSON.parse(stdout); } catch { return null; }
}

test('empty stdin -> exit 0, empty stdout', () => {
  const r = runHook('');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('malformed JSON stdin -> exit 0, empty stdout', () => {
  const r = runHook('not json');
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('prompt absent -> exit 0, empty stdout', () => {
  const r = runHook(JSON.stringify({}));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('prompt non-string -> exit 0, empty stdout', () => {
  const r = runHook(JSON.stringify({ prompt: 42 }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('trivial prompt "thanks" -> exit 0, empty stdout', () => {
  const r = runHook(JSON.stringify({ prompt: '   thanks   ' }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('trivial prompt "ok" -> exit 0, empty stdout', () => {
  const r = runHook(JSON.stringify({ prompt: 'ok' }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('whitespace-only prompt -> exit 0, empty stdout', () => {
  const r = runHook(JSON.stringify({ prompt: '   \n\t  ' }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('forced throw inside pipeline -> exit 0, empty stdout (fail-open)', () => {
  const r = runHook(JSON.stringify({ prompt: 'real prompt here' }), {
    ROUTER_TEST_THROW: '1',
  });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('never emits exit code 2', () => {
  const src = readFileSync(HOOK, 'utf8');
  // No process.exit(2) anywhere.
  assert.equal(/process\.exit\(\s*2\s*\)/.test(src), false, 'router.mjs must not call process.exit(2)');
});

test('never emits decision:"block"', () => {
  const src = readFileSync(HOOK, 'utf8');
  assert.equal(/decision["']?\s*:\s*["']block["']/.test(src), false, 'router.mjs must not emit decision:block');
});

test('trivialPromptDetect helper: trivial phrases', async () => {
  const m = await import(HOOK);
  for (const p of ['thanks', 'ok', 'great', 'cool', 'nice', 'yes', 'no', 'done', 'sgtm', '', '   ', '\n\t']) {
    assert.equal(m.trivialPromptDetect(p), true, `expected trivial for ${JSON.stringify(p)}`);
  }
});

test('trivialPromptDetect helper: non-trivial prompts return false', async () => {
  const m = await import(HOOK);
  for (const p of ['fix the flaky test', 'how does the router work', 'redesign the dashboard']) {
    assert.equal(m.trivialPromptDetect(p), false, `expected non-trivial for ${JSON.stringify(p)}`);
  }
});

test('SENTINEL constant is the exact router-inject marker', async () => {
  const m = await import(HOOK);
  assert.equal(m.SENTINEL, '<!-- router-inject -->');
});