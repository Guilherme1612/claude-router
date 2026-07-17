import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { installRouter, uninstallRouter } from '../src/lifecycle/router-lifecycle.mjs';
import { buildFullRegistry } from '../src/registry/build.mjs';
import { loadCompiledIndex } from '../src/prompt/compile-index.mjs';

const OPERATIONS = ['add', 'edit', 'rename', 'move', 'disable', 'dependency-change', 'delete'];
const observedCells = [];

function artifact(name, command = name, dependencies) {
  return `${JSON.stringify({ schema_version: 1, name, command, ...(dependencies ? { dependencies } : {}) })}\n`;
}

async function waitUntil(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  do { const value = predicate(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 25)); }
  while (Date.now() <= deadline);
  assert.fail(`controller did not publish within ${timeoutMs}ms`);
}

function tupleId(root) {
  try { return JSON.parse(readFileSync(join(root, 'release-tuples', 'active.json'), 'utf8')).tuple_version_id; }
  catch { return null; }
}

for (const runtime of ['claude', 'codex']) test(`${runtime} installed controller observes the seven-event lifecycle matrix`, async () => {
  const root = mkdtempSync(join(tmpdir(), `router-autonomous-${runtime}-`));
  const claudeRoot = join(root, '.claude');
  const codexRoot = join(root, '.codex');
  const runtimeRoot = runtime === 'claude' ? claudeRoot : codexRoot;
  const sourceRouter = join(root, 'router.mjs');
  const settingsPath = join(claudeRoot, 'settings.json');
  const ownedRoot = join(claudeRoot, 'router');
  const options = { claudeRoot, codexRoot, sourceRouter, settingsPath, nodeBinary: process.execPath, debounceMs: 10, repairMs: 200 };
  mkdirSync(join(runtimeRoot, 'skills'), { recursive: true });
  mkdirSync(claudeRoot, { recursive: true });
  writeFileSync(settingsPath, '{"hooks":{}}\n');
  writeFileSync(sourceRouter, 'export const router = true;\n');
  const alpha = join(runtimeRoot, 'skills', 'alpha.json');
  writeFileSync(alpha, artifact('alpha'));
  try {
    const installed = await installRouter(options);
    let previous = await waitUntil(() => tupleId(ownedRoot));
    const verify = async (operation, expectedChange = true) => {
      const next = await waitUntil(() => {
        const value = tupleId(ownedRoot);
        return expectedChange ? (value && value !== previous ? value : null) : value;
      });
      const full = buildFullRegistry({ claudeRoot, codexRoot });
      const candidate = JSON.parse(readFileSync(installed.candidatePath, 'utf8'));
      assert.deepEqual({ schema_version: candidate.schema_version, records: candidate.records }, full.registry);
      const compiled = loadCompiledIndex({ ownedRoot });
      assert.equal(compiled.dispatch_eligible, true);
      assert.equal(compiled.tuple_version_id, next);
      observedCells.push(`${runtime}:${operation}`);
      previous = next;
    };
    const beta = join(runtimeRoot, 'skills', 'beta.json');
    writeFileSync(beta, artifact('beta')); await verify('add');
    writeFileSync(beta, artifact('beta', 'beta-v2')); await verify('edit');
    const renamed = join(runtimeRoot, 'skills', 'renamed.json'); renameSync(beta, renamed); await verify('rename');
    const moved = join(runtimeRoot, 'agents', 'renamed.json'); mkdirSync(dirname(moved), { recursive: true }); renameSync(renamed, moved); await verify('move');
    writeFileSync(moved, artifact('beta', 'beta-v2', [{ id: 'missing', available: false }])); await verify('disable');
    writeFileSync(moved, artifact('beta', 'beta-v2', [{ id: 'present', available: true }])); await verify('dependency-change');
    rmSync(moved); await verify('delete');
  } finally {
    try { await uninstallRouter(options); } catch {}
    rmSync(root, { recursive: true, force: true });
  }
});

test('all fourteen runtime-operation cells are exercised', () => {
  assert.deepEqual([...observedCells].sort(), ['claude', 'codex'].flatMap(runtime => OPERATIONS.map(operation => `${runtime}:${operation}`)).sort());
});
