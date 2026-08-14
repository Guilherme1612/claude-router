import assert from 'node:assert/strict';
import fs, { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const { handle } = await import('../src/runtime/neutral-router.mjs');

test('neutral prompt handling reads one immutable capability snapshot per event', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-hotpath-'));
  const originalReadFileSync = fs.readFileSync;
  const reads = [];
  const previousRuntime = process.env.ROUTER_RUNTIME;
  const previousStateRoot = process.env.ROUTER_STATE_ROOT;
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'capabilities.json'), JSON.stringify({ capabilities: [{
      id: 'custom:hotpath', keywords: ['hotpath'], state: 'dispatchable', dispatchable: true,
      invocation: { method: 'command', target: 'hotpath' }, authority: { kind: 'inspect' },
    }] }));
    fs.readFileSync = (...args) => {
      reads.push(String(args[0]));
      return originalReadFileSync(...args);
    };
    syncBuiltinESMExports();
    process.env.ROUTER_RUNTIME = 'claude';
    process.env.ROUTER_STATE_ROOT = root;
    const result = handle({ hook_event_name: 'UserPromptSubmit', prompt: 'hotpath', session_id: 'hotpath-session' });
    assert.match(result.hookSpecificOutput.additionalContext, /route=custom:hotpath/);
    assert.equal(reads.filter(path => path.endsWith('/capabilities.json')).length, 1);
  } finally {
    fs.readFileSync = originalReadFileSync;
    syncBuiltinESMExports();
    if (previousRuntime === undefined) delete process.env.ROUTER_RUNTIME;
    else process.env.ROUTER_RUNTIME = previousRuntime;
    if (previousStateRoot === undefined) delete process.env.ROUTER_STATE_ROOT;
    else process.env.ROUTER_STATE_ROOT = previousStateRoot;
    rmSync(root, { recursive: true, force: true });
  }
});
