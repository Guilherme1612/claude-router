// Task 2 (RED→GREEN): Graphify stub heuristic for router.mjs (GRF-01/§12).
// Phase 1 stub: fires on codebase prompts (symbols/paths/"how does"/refactor/
// architecture); when it fires but no graphify-out/ exists, status is
// graph_missing and routing proceeds on the manifest alone — NO real query.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { homedir } from 'node:os';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const { graphifyHeuristic } = await import(HOOK);

function withTempDir(fn) {
  const dir = join(tmpdir(), `router-graph-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  try { return fn(dir); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
}

test('graphify: "how does the router decide" → fires (queried=true)', () => {
  withTempDir((dir) => {
    const r = graphifyHeuristic('how does the router hook decide which mode to run?', dir);
    assert.equal(r.queried, true);
  });
});

test('graphify: "thanks" → does NOT fire (not_triggered)', () => {
  withTempDir((dir) => {
    const r = graphifyHeuristic('thanks', dir);
    assert.equal(r.queried, false);
    assert.equal(r.status, 'not_triggered');
  });
});

test('graphify: "refactor the auth module" → fires', () => {
  withTempDir((dir) => {
    const r = graphifyHeuristic('refactor the auth module for clarity', dir);
    assert.equal(r.queried, true);
  });
});

test('graphify: "architecture question about data flow" → fires', () => {
  withTempDir((dir) => {
    const r = graphifyHeuristic('architecture question about the data flow', dir);
    assert.equal(r.queried, true);
  });
});

test('graphify: file path mention → fires', () => {
  withTempDir((dir) => {
    const r = graphifyHeuristic('look at src/router/index.mjs and tell me', dir);
    assert.equal(r.queried, true);
  });
});

test('graphify: CamelCase symbol mention → fires', () => {
  withTempDir((dir) => {
    const r = graphifyHeuristic('check the RouterPipeline entry point', dir);
    assert.equal(r.queried, true);
  });
});

test('graphify: "where is the config loaded" → fires', () => {
  withTempDir((dir) => {
    const r = graphifyHeuristic('where is the config loaded from?', dir);
    assert.equal(r.queried, true);
  });
});

test('graphify: status is graph_missing when no graphify-out/ in cwd', () => {
  withTempDir((dir) => {
    // dir has no graphify-out/ subdirectory
    const r = graphifyHeuristic('how does the router decide which mode?', dir);
    assert.equal(r.queried, true);
    assert.equal(r.status, 'graph_missing');
  });
});

test('graphify: Phase 1 NEVER emits "queried" status (no real graph query)', () => {
  withTempDir((dir) => {
    const r = graphifyHeuristic('refactor the router architecture', dir);
    assert.notEqual(r.status, 'queried', 'Phase 1 stub never issues a real graph query');
    assert.ok(['not_triggered', 'graph_missing'].includes(r.status));
  });
});

test('graphify: empty/null prompt → not_triggered', () => {
  withTempDir((dir) => {
    assert.equal(graphifyHeuristic('', dir).status, 'not_triggered');
    assert.equal(graphifyHeuristic(null, dir).status, 'not_triggered');
    assert.equal(graphifyHeuristic(undefined, dir).status, 'not_triggered');
  });
});

test('graphify: trivial non-codebase prompt → not_triggered', () => {
  withTempDir((dir) => {
    const r = graphifyHeuristic('commit my staged changes and open a PR', dir);
    assert.equal(r.queried, false);
    assert.equal(r.status, 'not_triggered');
  });
});