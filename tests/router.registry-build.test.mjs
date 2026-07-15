import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, renameSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  acquireRegistry,
  assembleRegistry,
  buildFullRegistry,
  buildIncrementalRegistry,
  refreshIncrementalAcquisition,
} from '../src/registry/build.mjs';
import { discoverRoots as discoverClaude } from '../src/adapters/claude.mjs';
import { discoverRoots as discoverCodex } from '../src/adapters/codex.mjs';
import { diffFingerprintTrees } from '../src/registry/diff.mjs';
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

test('linked variants synthesize complete typed deterministic conflicts', () => {
  const root = mkdtempSync(join(tmpdir(), 'registry-conflicts-'));
  try {
    const common = { canonical_identity: 'shared/conflicted', description: 'shared description' };
    artifact(root, 'claude', 'global', 'skills', 'claude-name', {
      ...common, invocation: { command: 'claude-command', args: ['--one'] },
      dependencies: [{ id: 'claude-only', available: true }],
    });
    artifact(root, 'codex', 'global', 'agents', 'codex-name', {
      ...common, description: 'different description', invocation: { command: 'codex-command', args: ['--two'] },
      dependencies: [{ id: 'codex-only', available: false }],
    });
    const options = { claudeRoot: join(root, 'claude'), codexRoot: join(root, 'codex') };
    const first = buildFullRegistry(options);
    const record = first.registry.records.find(entry => entry.id === 'shared/conflicted');
    assert.ok(record);
    assert.equal(record.runtime_variants.length, 2);
    assert.equal(record.provenance.length, 2);
    for (const field of ['name', 'type', 'description', 'lifecycle', 'dispatchable', 'invocation', 'dependencies']) {
      const conflict = record.conflicts.find(entry => entry.field === field);
      assert.ok(conflict, `conflict emitted for ${field}`);
      assert.equal(conflict.type, 'linked-variant-disagreement');
      assert.ok(['informational', 'dispatch-blocking', 'build-blocking'].includes(conflict.severity));
      assert.equal(conflict.sources.length, 2);
      assert.equal(conflict.values.length, 2);
    }
    assert.equal(new Set(record.conflicts.map(stableStringify)).size, record.conflicts.length);

    assert.equal(stableStringify(first), stableStringify(buildFullRegistry(options)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function acquire(options, overrides = {}) {
  const claude = (overrides.discoverClaude || discoverClaude)(options);
  const codex = (overrides.discoverCodex || discoverCodex)(options);
  return { claude, codex };
}

test('full and incremental entry points expose one acquisition and assembly composition', () => {
  const options = {
    discoverClaude: () => ({ observations: [], diagnostics: [] }),
    discoverCodex: () => ({ observations: [], diagnostics: [] }),
  };
  const acquisition = acquireRegistry(options);
  assert.deepEqual(buildFullRegistry(options), assembleRegistry(acquisition));
  const diff = { events: [], diagnostics: [] };
  const refreshed = refreshIncrementalAcquisition(acquisition, diff, options);
  assert.deepEqual(refreshed, acquisition);
  assert.deepEqual(buildIncrementalRegistry(acquisition, diff, options), assembleRegistry(refreshed));
});

function snapshot(acquisition) {
  return {
    schema_version: 1,
    roots: ['claude_global', 'codex_home', 'project:fixture:claude', 'project:fixture:codex'],
    entries: [...acquisition.claude.observations, ...acquisition.codex.observations],
    diagnostics: [...acquisition.claude.diagnostics, ...acquisition.codex.diagnostics],
  };
}

test('REG-03 incremental return remains byte-identical after every supported mutation', () => {
  const root = mkdtempSync(join(tmpdir(), 'registry-incremental-'));
  try {
    const options = { claudeRoot: join(root, 'claude'), codexRoot: join(root, 'codex'), projectRoot: join(root, 'project'), scopeId: 'fixture' };
    mkdirSync(options.claudeRoot, { recursive: true });
    mkdirSync(options.codexRoot, { recursive: true });
    let previous = acquire(options);

    const check = (label, mutate, overrides = {}) => {
      mutate();
      const current = acquire(options, overrides);
      const diff = diffFingerprintTrees(snapshot(previous), snapshot(current));
      const incremental = buildIncrementalRegistry(previous, diff, { ...options, ...overrides });
      const full = buildFullRegistry({ ...options, ...overrides });
      assert.equal(stableStringify(incremental), stableStringify(full), label);
      assert.doesNotMatch(stableStringify(incremental), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${label}: portable bytes`);
      previous = current;
    };

    check('add', () => artifact(root, 'claude', 'global', 'skills', 'alpha', {
      canonical_identity: 'fixture/alpha', invocation: { command: 'alpha', args: [] },
    }));
    check('edit', () => artifact(root, 'claude', 'global', 'skills', 'alpha', {
      canonical_identity: 'fixture/alpha', description: 'edited', invocation: { command: 'alpha', args: [] },
    }));
    check('strong rename', () => renameSync(join(root, 'claude/skills/alpha.json'), join(root, 'claude/skills/renamed.json')));
    check('compound rename/edit', () => {
      const path = join(root, 'claude/skills/renamed.json');
      const value = JSON.parse(readFileSync(path, 'utf8'));
      value.description = 'renamed and edited';
      writeFileSync(path, JSON.stringify(value));
      renameSync(path, join(root, 'claude/skills/compound.json'));
    });
    check('disable and dependency', () => artifact(root, 'claude', 'global', 'skills', 'compound', {
      canonical_identity: 'fixture/alpha', invocation: { command: 'alpha', args: [] },
      dependencies: [{ id: 'binary:missing', available: false }],
    }));
    check('declared permission metadata', () => {}, {
      discoverClaude: () => {
        const result = discoverClaude(options);
        return { ...result, observations: result.observations.map(record => record.canonical_identity === 'fixture/alpha'
          ? { ...record, permissions: { mode: 'read-only', grants: ['read'] } } : record) };
      },
    });
    check('project precedence', () => artifact(root, 'claude', 'project', 'skills', 'compound', {
      invocation: { command: 'project-alpha', args: [] },
    }));
    check('weak rename remains remove plus add', () => {
      artifact(root, 'codex', 'global', 'skills', 'weak', { invocation: { command: 'weak', args: [] } });
    });
    check('weak rename follow-up', () => renameSync(join(root, 'codex/skills/weak.json'), join(root, 'codex/skills/weak-renamed.json')));
    check('delete', () => unlinkSync(join(root, 'claude/skills/compound.json')));
    check('malformed', () => writeFileSync(join(root, 'codex/skills/malformed.json'), '{'));
    check('malformed to valid', () => artifact(root, 'codex', 'global', 'skills', 'malformed', { invocation: { command: 'valid', args: [] } }));
    check('valid to malformed', () => writeFileSync(join(root, 'codex/skills/malformed.json'), '{broken'));

    const denied = () => {
      const result = discoverClaude(options);
      return { ...result, diagnostics: [...result.diagnostics, {
        code: 'access_denied', runtime: 'claude', logical_root: 'claude_global', relative_path: 'skills/denied.json',
        reason: 'injected denial', severity: 'build-blocking',
      }] };
    };
    check('access-denial diagnostic', () => {}, { discoverClaude: denied });

    const forward = buildIncrementalRegistry(previous, { events: [], diagnostics: [] }, options);
    const reversed = buildIncrementalRegistry({
      claude: { ...previous.claude, observations: [...previous.claude.observations].reverse(), diagnostics: [...previous.claude.diagnostics].reverse() },
      codex: { ...previous.codex, observations: [...previous.codex.observations].reverse(), diagnostics: [...previous.codex.diagnostics].reverse() },
    }, { events: [], diagnostics: [] }, options);
    assert.equal(stableStringify(forward), stableStringify(reversed));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
