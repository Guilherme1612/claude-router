import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  SOURCE_LIMITS,
  readStateSource,
  readRoadmapSource,
  readArtifactSource,
  readDesignSource,
  readExecutionSource,
  readGitSource,
  collectAuthoritativeSnapshot,
  compareWitnesses,
  assembleRefreshEvidence,
} from '../src/context/sources.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'router-context-source-'));
  mkdirSync(join(root, '.planning', 'phases', '15-demo'), { recursive: true });
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, '.planning', 'STATE.md'), `---\ncurrent_phase: 15\nstatus: executing\n---\n## Current Position\nPhase: 15 — Demo\nPlan: 02\nStatus: Executing\n## Blockers/Concerns\n- waiting on review\n## Private\nSECRET_CANARY\n`);
  writeFileSync(join(root, '.planning', 'ROADMAP.md'), `# Roadmap\n### Phase 15: Demo\n**Goal**: bounded recovery\n**Requirements**: CTX-01, CTX-02\n**Plans**: 2/3 plans complete\n### Phase 16: Unrelated\nSECRET_CANARY\n`);
  writeFileSync(join(root, '.planning', 'phases', '15-demo', '15-02-PLAN.md'), `---\nphase: 15-demo\nplan: 02\nstatus: active\n---\n<objective>Build bounded readers</objective>\n<tasks>SECRET_CANARY</tasks>\n`);
  writeFileSync(join(root, '.planning', 'phases', '15-demo', 'checkpoint.json'), JSON.stringify({ schema_version: 1, phase: '15', plan: '02', task: '1', status: 'running', next_action: 'implement', secret: 'SECRET_CANARY' }));
  writeFileSync(join(root, 'docs', 'design.md'), `# Design\n## Summary\nUse bounded exact reads.\n## Implementation\nSECRET_CANARY\n`);
  return root;
}

test('exact authoritative readers expose approved compact facts and canonical witnesses', async () => {
  const root = fixture();
  try {
    const state = readStateSource({ workspaceRoot: root });
    const roadmap = readRoadmapSource({ workspaceRoot: root, phase: '15' });
    const artifact = readArtifactSource({ workspaceRoot: root, ref: '.planning/phases/15-demo/15-02-PLAN.md' });
    const execution = readExecutionSource({ workspaceRoot: root, ref: '.planning/phases/15-demo/checkpoint.json' });
    const design = readDesignSource({ workspaceRoot: root, ref: 'docs/design.md' });
    for (const result of [state, roadmap, artifact, execution, design]) {
      assert.equal(result.status, 'resolved');
      assert.match(result.witness.value, /^[a-f0-9]{64}$/);
      assert.doesNotMatch(JSON.stringify(result), /SECRET_CANARY/);
    }
    assert.deepEqual(state.value.position, { phase: '15', plan: '02', status: 'executing' });
    assert.equal(roadmap.value.phase, '15');
    assert.equal(execution.value.next_action, 'implement');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('unsafe, missing, malformed, and oversized sources fail closed with stable reasons', async () => {
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), 'router-context-outside-'));
  try {
    writeFileSync(join(outside, 'secret'), 'SECRET_CANARY');
    symlinkSync(join(outside, 'secret'), join(root, 'docs', 'linked.md'));
    writeFileSync(join(root, 'docs', 'huge.md'), 'x'.repeat(SOURCE_LIMITS.design_bytes + 1));
    writeFileSync(join(root, '.planning', 'phases', '15-demo', 'bad.json'), '{');
    assert.equal(readDesignSource({ workspaceRoot: root, ref: 'docs/linked.md' }).reason_code, 'source_symlink');
    assert.equal(readDesignSource({ workspaceRoot: root, ref: '../secret' }).reason_code, 'unsafe_reference');
    assert.equal(readDesignSource({ workspaceRoot: root, ref: 'docs/missing.md' }).reason_code, 'optional_source_missing');
    assert.equal(readDesignSource({ workspaceRoot: root, ref: 'docs/huge.md' }).reason_code, 'source_oversized');
    assert.equal(readExecutionSource({ workspaceRoot: root, ref: '.planning/phases/15-demo/bad.json' }).reason_code, 'source_malformed');
    assert.equal(readStateSource({ workspaceRoot: outside }).status, 'unresolved');
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('aggregate recovery reads only exact paths and never enumerates planning or unrelated design', async () => {
  const root = fixture();
  const calls = [];
  try {
    const fs = {
      lstatSync(path) { calls.push(['lstat', path]); return (awaitImportFs()).lstatSync(path); },
      readFileSync(path, options) { calls.push(['read', path, options]); return (awaitImportFs()).readFileSync(path, options); },
    };
    const snapshot = collectAuthoritativeSnapshot({
      workspaceRoot: root, phase: '15', artifactRef: '.planning/phases/15-demo/15-02-PLAN.md',
      executionRef: '.planning/phases/15-demo/checkpoint.json', designRef: 'docs/design.md', fs,
      runCommand: ({ args }) => args[0] === 'symbolic-ref'
        ? { status: 'ok', stdout: 'feature/context\n' }
        : { status: 'ok', stdout: ' M src/context/sources.mjs\n?? tests/new.test.mjs\n' },
    });
    assert.equal(snapshot.status, 'resolved');
    assert.equal(calls.some(([op]) => op === 'readdir'), false);
    assert.equal(calls.filter(([op]) => op === 'read').length, 5);
    assert.equal(snapshot.sources.git.value.dirty.count, 2);
    assert.doesNotMatch(JSON.stringify(snapshot), /sources\.mjs|new\.test|SECRET_CANARY/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('git adapter is command-bounded, private, and reason-codes failures', () => {
  const calls = [];
  const ok = readGitSource({ workspaceRoot: '/workspace', runCommand(input) { calls.push(input); return input.args[0] === 'symbolic-ref' ? { status: 'ok', stdout: 'main\n' } : { status: 'ok', stdout: ' M secret-name\nA  another-name\n' }; } });
  assert.deepEqual(calls.map(c => c.args), [['symbolic-ref', '--short', '-q', 'HEAD'], ['status', '--porcelain=v1', '-uno']]);
  assert.ok(calls.every(c => c.timeout_ms === SOURCE_LIMITS.git_timeout_ms && c.max_output_bytes === SOURCE_LIMITS.git_output_bytes));
  assert.equal(ok.value.branch, 'main');
  assert.deepEqual(ok.value.dirty, { count: 2, categories: { added: 1, modified: 1, deleted: 0, renamed: 0, untracked: 0, other: 0 }, truncated: false });
  assert.doesNotMatch(JSON.stringify(ok), /secret-name|another-name/);
  assert.equal(readGitSource({ workspaceRoot: '/workspace', runCommand: () => ({ status: 'detached', stdout: '' }) }).reason_code, 'git_detached_head');
  assert.equal(readGitSource({ workspaceRoot: '/workspace', runCommand: () => ({ status: 'timeout' }) }).reason_code, 'git_timeout');
  assert.equal(readGitSource({ workspaceRoot: '/workspace', runCommand: () => ({ status: 'oversized' }) }).reason_code, 'git_output_oversized');
  assert.equal(readGitSource({ workspaceRoot: '/workspace', runCommand: () => ({ status: 'not_repository' }) }).reason_code, 'git_not_repository');
});

test('witness freshness is distinct from corruption and mismatches are stale', () => {
  const witness = { kind: 'sha256', value: 'a'.repeat(64) };
  assert.deepEqual(compareWitnesses(witness, witness), { status: 'fresh', reason_code: 'witness_match' });
  assert.deepEqual(compareWitnesses(witness, { kind: 'sha256', value: 'b'.repeat(64) }), { status: 'stale', reason_code: 'witness_changed' });
  assert.deepEqual(compareWitnesses({ nope: true }, witness), { status: 'corrupt', reason_code: 'witness_invalid' });
});

test('minimal refresh evidence applies deterministic precedence and blocks critical conflicts', () => {
  const capsule = { workflow: 'old', phase: '14', plan: '01', task: '1', status: 'paused', artifact_ref: 'old.md', blockers: ['old'] };
  const authoritative = { workflow: 'gsd-execute-phase', phase: '15', plan: '02', task: '1', status: 'executing', artifact_ref: '15-02-PLAN.md', blockers: ['review'] };
  const live = { task: '2', status: 'running' };
  const explicit = { action: 'continue' };
  const result = assembleRefreshEvidence({ capsule, authoritative, live, explicit, diagnostics: [{ status: 'degraded', reason_code: 'optional_source_missing' }] });
  assert.equal(result.status, 'dispatchable');
  assert.deepEqual(result.value, { action: 'continue', workflow: 'gsd-execute-phase', phase: '15', plan: '02', task: '2', status: 'running', artifact_ref: '15-02-PLAN.md', blockers: ['review'] });
  assert.equal(result.diagnostics.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /old\.md/);
  assert.equal(assembleRefreshEvidence({ authoritative: { phase: '15' }, live: { phase: '16' } }).status, 'unresolved');
  assert.equal(assembleRefreshEvidence({ authoritative: { phase: '15' }, live: { phase: '16' } }).reason_code, 'identity_conflict');
});

function awaitImportFs() {
  // CommonJS-free synchronous indirection keeps instrumentation injectable.
  return { lstatSync: globalThis.__sourceFsLstat, readFileSync: globalThis.__sourceFsRead };
}

import { lstatSync as nativeLstatSync, readFileSync as nativeReadFileSync } from 'node:fs';
globalThis.__sourceFsLstat = nativeLstatSync;
globalThis.__sourceFsRead = nativeReadFileSync;
