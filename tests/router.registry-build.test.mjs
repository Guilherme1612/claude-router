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
import { mapCandidateRegistry } from '../src/registry/map.mjs';
import { contentFingerprint, stableCapabilityId } from '../src/registry/identity.mjs';

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

function modeMapFile(root, entries) {
  const path = join(root, 'mode-map.json');
  writeFileSync(path, JSON.stringify({ schema_version: 2, entries }));
  return path;
}

test('mode-map stamping seeds record mapping.explicit_subjects so the mapper publishes dispatch routes', () => {
  const root = mkdtempSync(join(tmpdir(), 'registry-modemap-'));
  try {
    mkdirSync(join(root, 'claude'), { recursive: true });
    mkdirSync(join(root, 'codex'), { recursive: true });
    // Skill named to match the slash entry id; agent named to match recommended_agents[0].
    artifact(root, 'claude', 'global', 'skills', 'gsd-debug', { invocation: { command: 'gsd-debug', args: [] }, dependencies: [] });
    artifact(root, 'claude', 'global', 'agents', 'gsd-debugger', { invocation: { command: 'gsd-debugger', args: [] }, dependencies: [] });
    // A skill that carries its own artifact-provided mapping — must be preserved (union, not overwrite).
    artifact(root, 'claude', 'global', 'skills', 'custom', {
      invocation: { command: 'custom', args: [] },
      dependencies: [],
      mapping: { explicit_subjects: ['route:custom-artifact'] },
    });
    const modeMapPath = modeMapFile(root, [
      { id: 'gsd-debug', mode: 'gsd-debug', invoke_kind: 'slash', recommended_skills: [], recommended_agents: [] },
      { id: 'agent-gsd-debugger', mode: 'agent-gsd-debugger', invoke_kind: 'agent', recommended_skills: [], recommended_agents: ['gsd-debugger'] },
      { id: 'custom', mode: 'custom', invoke_kind: 'slash', recommended_skills: [], recommended_agents: [] },
      { id: 'warn-unwired', mode: 'warn-unwired', invoke_kind: 'warn', recommended_skills: [], recommended_agents: [] },
    ]);
    const baseOptions = { claudeRoot: join(root, 'claude'), codexRoot: join(root, 'codex'), modeMapPath };
    const base = buildFullRegistry(baseOptions);
    const overlays = base.registry.records.map((record, index) => ({
      schema_version: 1,
      kind: 'contract-overlay-v1',
      overlay_id: `mode-map-safe:${index}`,
      provenance: 'correction',
      binding: {
        stable_id: stableCapabilityId(record),
        source_fingerprint: contentFingerprint(record),
        scope: record.scope,
        runtime: record.invocation.runtime,
      },
      fields: {
        authority: { value: 'one-turn' },
        reversibility: { value: 'reversible' },
        risk: { value: 'low' },
        side_effects: { value: ['none'] },
      },
    }));
    const options = { ...baseOptions, overlays };
    const built = buildFullRegistry(options);

    // Slash entry id matches the skill name → stamped.
    const debug = built.registry.records.find(r => r.name === 'gsd-debug');
    assert.deepEqual(debug.mapping.explicit_subjects, ['gsd-debug']);
    // Agent entry resolves via recommended_agents[0] → the agent record is stamped with the entry id.
    const debuggerAgent = built.registry.records.find(r => r.name === 'gsd-debugger');
    assert.deepEqual(debuggerAgent.mapping.explicit_subjects, ['agent-gsd-debugger']);
    // Artifact-provided mapping is preserved and unioned with the stamped subject.
    const custom = built.registry.records.find(r => r.name === 'custom');
    assert.deepEqual(custom.mapping.explicit_subjects, ['custom', 'route:custom-artifact']);
    assert.equal(debug.eligibility.eligible, true);
    // Warn entries never produce routes (no record stamped with 'warn-unwired').
    assert.equal(built.registry.records.some(r => r.mapping?.explicit_subjects?.includes('warn-unwired')), false);

    // End-to-end: the real mapper accepts the normalized, contract-eligible records.
    const reconciliation = { disposition: 'eligible', verdicts: [] };
    const mapping = mapCandidateRegistry({ candidate: built.registry, reconciliation, existingMappings: [], policy: undefined });
    assert.ok(mapping.summary.mapped >= 2, `expected >=2 mapped subjects, got ${mapping.summary.mapped}`);
    assert.ok(mapping.subjects.filter(subject => subject.disposition === 'mapped').length >= 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('mode-map stamping is a no-op when modeMapPath is absent or the file is missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'registry-modemap-none-'));
  try {
    mkdirSync(join(root, 'claude'), { recursive: true });
    mkdirSync(join(root, 'codex'), { recursive: true });
    artifact(root, 'claude', 'global', 'skills', 'gsd-debug', { invocation: { command: 'gsd-debug', args: [] } });
    const options = { claudeRoot: join(root, 'claude'), codexRoot: join(root, 'codex') };
    const without = buildFullRegistry(options);
    const withMissing = buildFullRegistry({ ...options, modeMapPath: join(root, 'does-not-exist.json') });
    // No mode-map → no stamping; missing file (ENOENT) → no stamping. Byte-identical.
    assert.equal(stableStringify(without), stableStringify(withMissing));
    assert.equal(without.registry.records.find(r => r.name === 'gsd-debug').mapping, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('workflow-declarations stamping adds routes for orchestrator-declared workflows missing from mode-map', () => {
  const root = mkdtempSync(join(tmpdir(), 'registry-wfdecl-'));
  try {
    mkdirSync(join(root, 'claude'), { recursive: true });
    mkdirSync(join(root, 'codex'), { recursive: true });
    // gsd-execute-phase is a declared workflow_id but NOT in mode-map.json.
    // Without workflow-declarations stamping, the compiled index would lack
    // a gsd-execute-phase route → the calibration quality gate fails.
    artifact(root, 'claude', 'global', 'skills', 'gsd-execute-phase', { invocation: { command: 'gsd-execute-phase', args: [] } });
    artifact(root, 'claude', 'global', 'skills', 'gsd-debug', { invocation: { command: 'gsd-debug', args: [] } });
    const declarationsPath = join(root, 'workflow-declarations.json');
    writeFileSync(declarationsPath, JSON.stringify({
      declarations: [{ workflow_id: 'gsd-execute-phase' }, { workflow_id: 'gsd-debug' }],
    }));
    const modeMapPath = modeMapFile(root, [
      { id: 'gsd-debug', mode: 'gsd-debug', invoke_kind: 'slash', recommended_skills: [], recommended_agents: [] },
    ]);
    const options = {
      claudeRoot: join(root, 'claude'), codexRoot: join(root, 'codex'),
      modeMapPath, workflowDeclarationsPath: declarationsPath,
    };
    const built = buildFullRegistry(options);
    // gsd-debug is in mode-map → stamped from mode-map.
    const debug = built.registry.records.find(r => r.name === 'gsd-debug');
    assert.deepEqual(debug.mapping.explicit_subjects, ['gsd-debug']);
    // gsd-execute-phase is NOT in mode-map but IS declared → stamped from declarations.
    const execute = built.registry.records.find(r => r.name === 'gsd-execute-phase');
    assert.deepEqual(execute.mapping.explicit_subjects, ['gsd-execute-phase']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
