import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildFullRegistry } from '../src/registry/build.mjs';
import { stableStringify } from '../src/registry/schema.mjs';

function artifact(root, runtime, scope, category, name, data) {
  const base = scope === 'global' ? join(root, runtime) : join(root, 'project', `.${runtime}`);
  mkdirSync(join(base, category), { recursive: true });
  writeFileSync(join(base, category, `${name}.json`), JSON.stringify({ schema_version: 1, name, ...data }));
}

test('full registry is deterministic, evidence-gated, scoped, diagnostic, and read-only', () => {
  const root = mkdtempSync(join(tmpdir(), 'registry-build-'));
  try {
    mkdirSync(join(root, 'claude'), { recursive: true }); mkdirSync(join(root, 'codex'), { recursive: true });
    artifact(root, 'claude', 'global', 'skills', 'shared', { canonical_identity: 'shared/tool', invocation: { command: 'claude-shared', args: [] } });
    artifact(root, 'codex', 'global', 'skills', 'shared', { canonical_identity: 'shared/tool', invocation: { command: 'codex-shared', args: [] } });
    artifact(root, 'claude', 'global', 'skills', 'same-name', { invocation: { command: 'a', args: [] } });
    artifact(root, 'codex', 'global', 'skills', 'same-name', { invocation: { command: 'b', args: [] } });
    artifact(root, 'claude', 'project', 'skills', 'preferred', { invocation: { command: 'p', args: [] } });
    artifact(root, 'claude', 'project', 'skills', 'broken', { invocation: { command: 'bad', args: [] }, dependencies: [{ id: 'missing', available: false }] });
    artifact(root, 'claude', 'global', 'skills', 'broken', { invocation: { command: 'fallback', args: [] } });
    writeFileSync(join(root, 'codex', 'skills', 'malformed.json'), '{');
    const before = readFileSync(join(root, 'claude', 'skills', 'shared.json'));
    const options = { claudeRoot: join(root, 'claude'), codexRoot: join(root, 'codex'), projectRoot: join(root, 'project'), scopeId: 'fixture' };
    const first = buildFullRegistry(options); const second = buildFullRegistry(options);
    assert.equal(stableStringify(first), stableStringify(second));
    assert.deepEqual(readFileSync(join(root, 'claude', 'skills', 'shared.json')), before);
    assert.ok(first.registry.records.some(r => r.id === 'shared/tool' && r.runtime_variants.length === 2));
    assert.equal(first.registry.records.filter(r => r.name === 'same-name').length, 2);
    assert.equal(first.registry.records.find(r => r.name === 'preferred').precedence_status, 'preferred');
    const broken = first.registry.records.filter(r => r.name === 'broken');
    assert.ok(broken.some(r => r.scope.kind === 'project' && !r.dispatchable && r.precedence_status === 'preferred-unusable'));
    assert.ok(broken.some(r => r.scope.kind === 'global' && r.precedence_status === 'available-fallback'));
    assert.ok(first.diagnostics.some(d => d.code === 'malformed_artifact'));
    assert.equal(first.summary.activated, false);
    assert.doesNotMatch(stableStringify(first), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
