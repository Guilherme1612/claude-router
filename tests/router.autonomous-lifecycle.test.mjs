import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { installRouter, uninstallRouter } from '../src/lifecycle/router-lifecycle.mjs';
import { buildFullRegistry } from '../src/registry/build.mjs';
import { loadCompiledIndex } from '../src/prompt/compile-index.mjs';
import { publishCompiledIndex } from '../src/prompt/publish-index.mjs';
import { saveCapsule } from '../src/context/capsule.mjs';
import { routeContextPrompt } from '../src/context/prompt-route.mjs';
import { createHash } from 'node:crypto';

const OPERATIONS = ['add', 'edit', 'rename', 'move', 'disable', 'dependency-change', 'delete'];
const observedCells = [];

function artifact(name, command = name, dependencies) {
  return `${JSON.stringify({ schema_version: 1, name, command, mapping: { explicit_subjects: [name] }, ...(dependencies ? { dependencies } : {}) })}\n`;
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
    let previousCandidate = readFileSync(installed.candidatePath, 'utf8');
    const verify = async (operation, expectedChange = true) => {
      const candidateBytes = await waitUntil(() => {
        const value = readFileSync(installed.candidatePath, 'utf8');
        return value !== previousCandidate ? value : null;
      });
      const full = buildFullRegistry({ claudeRoot, codexRoot });
      const candidate = JSON.parse(candidateBytes);
      if (operation === 'disable') {
        assert.equal(candidate.disposition, 'quarantined');
        assert.equal(loadCompiledIndex({ ownedRoot }).tuple_version_id, tupleId(ownedRoot));
        observedCells.push(`${runtime}:${operation}`);
        previousCandidate = candidateBytes;
        return;
      }
      assert.deepEqual({ schema_version: candidate.schema_version, records: candidate.records }, full.registry);
      const mapping = { schema_version: 1, policy_fingerprint: 'a'.repeat(64), subjects: full.registry.records.filter(record => record.dispatchable).map(record => ({ subject_id: record.name, disposition: 'mapped', target_id: record.id, reason_code: 'explicit_subject' })) };
      const registryHash = createHash('sha256').update(JSON.stringify(full.registry)).digest('hex');
      const publication = publishCompiledIndex({ ownedRoot, registry: full.registry, registryVersionId: `v1-${registryHash.slice(0, 16)}`, mapping, policyFingerprint: 'b'.repeat(64) });
      const compiled = loadCompiledIndex({ ownedRoot });
      assert.equal(compiled.dispatch_eligible, true);
      assert.equal(compiled.tuple_version_id, publication.tuple_version_id);
      saveCapsule({ ownedRoot, capsule: { schema_version: 1, scope: { workspace_id: runtime, project_id: 'matrix' }, goal: { id: 'matrix', summary: 'matrix' }, position: { workflow: 'alpha', phase: '18', plan: '01', task: operation }, status: 'active', artifacts: [], blockers: [], freshness: { captured_at: Date.now(), generation: operation }, provenance: { source: 'test', version: '1' } } });
      const routed = routeContextPrompt({ prompt: 'continue', ownedRoot, projectRoot: root });
      assert.equal(routed.compiled?.tuple_version_id, publication.tuple_version_id);
      observedCells.push(`${runtime}:${operation}`);
      previousCandidate = candidateBytes;
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
