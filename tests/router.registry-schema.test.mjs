import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeCapability,
  stableStringify,
  validateCapability,
} from '../src/registry/schema.mjs';
import { contentFingerprint, stableCapabilityId } from '../src/registry/identity.mjs';
import {
  buildClaudeHeavyProfile,
  buildCodexHeavyProfile,
  buildMixedCustomProfile,
  buildUnknownFutureProfile,
  mutationPlayback,
  syntheticRoots,
} from './helpers/inventory-fixture.mjs';

function capability(overrides = {}) {
  return {
    schema_version: 1,
    type: 'skill',
    name: 'planner',
    lifecycle: 'ready',
    scope: { kind: 'global' },
    dispatchable: true,
    invocation: { runtime: 'claude', command: 'Skill', args: ['planner', '--fast'] },
    dependencies: { state: 'unknown', items: [] },
    provenance: [{
      runtime: 'claude', scope: 'global', logical_root: 'claude_global',
      relative_path: 'skills/planner/SKILL.md', origin: 'acme/router',
      source_fingerprint: 'abc123', adapter: 'claude@1',
    }],
    runtime_variants: [{ runtime: 'claude', native_identity: 'planner', native: { command: '/planner' } }],
    conflicts: [],
    optional_metadata: { description: 'unknown' },
    ...overrides,
  };
}

test('validates required canonical fields and stable enum errors', () => {
  assert.equal(validateCapability(capability()), true);
  assert.throws(() => validateCapability(capability({ lifecycle: 'surprise' })),
    { message: 'capability.lifecycle must be one of: ready, partial, invalid' });
  assert.throws(() => validateCapability(capability({ scope: { kind: 'planetary' } })),
    { message: 'capability.scope.kind must be one of: global, user, project, worktree' });
  assert.throws(() => validateCapability(capability({ dispatchable: 'yes' })),
    { message: 'capability.dispatchable must be a boolean' });
  assert.throws(() => validateCapability(capability({ conflicts: [{ field: 'name', type: 'metadata', severity: 'urgent', sources: ['a', 'b'], values: ['a', 'b'] }] })),
    { message: 'capability.conflicts[0].severity must be one of: informational, dispatch-blocking, build-blocking' });
});

test('equal names or content do not merge without declared evidence', () => {
  const claude = capability();
  const codex = capability({
    invocation: { runtime: 'codex', command: 'skill', args: ['planner', '--fast'] },
    provenance: [{ ...capability().provenance[0], runtime: 'codex', logical_root: 'codex_home' }],
    runtime_variants: [{ runtime: 'codex', native_identity: 'planner', native: { command: '/planner' } }],
  });
  assert.equal(
    stableCapabilityId(claude),
    'path:skill:claude:global:claude_global:skills%2Fplanner%2FSKILL.md',
  );
  assert.equal(
    stableCapabilityId(codex),
    'path:skill:codex:global:codex_home:skills%2Fplanner%2FSKILL.md',
  );
  assert.notEqual(stableCapabilityId(claude), stableCapabilityId(codex));
});

test('explicitly linked variants share identity and preserve typed disagreements', () => {
  const conflicts = [{
    field: 'invocation.command', type: 'native-disagreement', severity: 'informational',
    sources: ['claude', 'codex'], values: ['/planner', 'planner'],
  }];
  const linked = capability({
    canonical_identity: 'router/planner',
    runtime_variants: [
      { runtime: 'codex', native_identity: 'planner', native: { command: 'planner' } },
      { runtime: 'claude', native_identity: 'plan', native: { command: '/planner' } },
    ],
    conflicts,
  });
  assert.equal(stableCapabilityId(linked), 'router/planner');
  assert.equal(canonicalizeCapability(linked).runtime_variants.length, 2);
  assert.deepEqual(canonicalizeCapability(linked).conflicts, conflicts);
});

test('authoritative shared origin survives rename and move', () => {
  const before = capability({ name: 'planner', shared_origin: { authority: 'package', identity: 'npm:@acme/router#planner' } });
  const after = capability({
    name: 'architect', shared_origin: { authority: 'package', identity: 'npm:@acme/router#planner' },
    provenance: [{ ...capability().provenance[0], relative_path: 'skills/architect/SKILL.md' }],
  });
  assert.equal(stableCapabilityId(before), stableCapabilityId(after));
  assert.equal(stableCapabilityId(before), 'origin:npm:@acme/router#planner');
});

test('global, repository, and worktree scope identities remain distinct', () => {
  const global = capability();
  const project = capability({ scope: { kind: 'project', repository: 'repo:acme/router', worktree: 'main' } });
  const worktree = capability({ scope: { kind: 'worktree', repository: 'repo:acme/router', worktree: 'feature-x' } });
  assert.equal(new Set([global, project, worktree].map(stableCapabilityId)).size, 3);
  assert.match(stableCapabilityId(project), /repo%3Aacme%2Frouter.*main/);
  assert.match(stableCapabilityId(worktree), /feature-x/);
});

test('unknown optional metadata and undeclared dependencies stay explicit', () => {
  const record = canonicalizeCapability(capability());
  assert.deepEqual(record.optional_metadata, { description: 'unknown' });
  assert.deepEqual(record.dependencies, { items: [], state: 'unknown' });
});

test('declared unavailable dependencies block dispatch', () => {
  const record = capability({
    dispatchable: false,
    dependencies: { state: 'declared', items: [{ id: 'mcp:github', available: false }] },
  });
  assert.equal(validateCapability(record), true);
  assert.throws(() => validateCapability({ ...record, dispatchable: true }),
    { message: 'capability.dispatchable must be false when a declared dependency is unavailable' });
});

test('portable provenance rejects absolute roots and paths', () => {
  assert.throws(() => validateCapability(capability({
    provenance: [{ ...capability().provenance[0], relative_path: '/Users/alice/.claude/skills/planner/SKILL.md' }],
  })), { message: 'capability.provenance[0].relative_path must be relative' });
  assert.throws(() => validateCapability(capability({
    provenance: [{ ...capability().provenance[0], logical_root: '/Users/alice/.claude' }],
  })), { message: 'capability.provenance[0].logical_root must be logical, not absolute' });
});

test('stable bytes ignore object-key and schema-owned set ordering', () => {
  const a = capability({
    runtime_variants: [
      { runtime: 'codex', native_identity: 'z', native: { b: 2, a: 1 } },
      { runtime: 'claude', native_identity: 'a', native: { a: 1, b: 2 } },
    ],
    dependencies: { state: 'declared', items: [{ id: 'z', available: true }, { id: 'a', available: true }] },
  });
  const b = {
    ...a,
    dependencies: { items: [...a.dependencies.items].reverse(), state: 'declared' },
    runtime_variants: [...a.runtime_variants].reverse(),
  };
  const bytes = stableStringify(canonicalizeCapability(a));
  assert.equal(bytes, stableStringify(canonicalizeCapability(b)));
  assert.equal(contentFingerprint(a), contentFingerprint(b));
});

test('semantic invocation argument and precedence order changes canonical bytes', () => {
  const a = capability({ precedence: ['project', 'global'] });
  const b = capability({
    precedence: ['global', 'project'],
    invocation: { ...a.invocation, args: [...a.invocation.args].reverse() },
  });
  const changedSource = capability({
    provenance: [{ ...a.provenance[0], source_fingerprint: 'def456' }],
  });
  assert.notEqual(stableStringify(canonicalizeCapability(a)), stableStringify(canonicalizeCapability(b)));
  assert.equal(contentFingerprint(a), contentFingerprint(b));
  assert.notEqual(contentFingerprint(a), contentFingerprint(changedSource));
});

test('stable serialization rejects cyclic and unsupported values deterministically', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => stableStringify(cyclic), { message: 'stableStringify does not support cyclic values' });
  assert.throws(() => stableStringify({ value: undefined }),
    { message: 'stableStringify does not support undefined at $.value' });
});

test('[phase21-red:schema] normalized records require explicit framework-neutral fields', () => {
  for (const profile of [
    buildClaudeHeavyProfile(),
    buildCodexHeavyProfile(),
    buildMixedCustomProfile(),
    buildUnknownFutureProfile(),
  ]) {
    for (const record of profile) assert.equal(validateCapability(record), true);
  }
  assert.deepEqual(mutationPlayback, [
    'add', 'edit', 'rename', 'move', 'disable', 'replace', 'dependency-loss', 'removal',
  ]);
  assert.deepEqual(syntheticRoots, {
    home: 'fixture_home', project: 'fixture_project', worktree: 'fixture_worktree',
  });
});

test('[phase21-red:schema] inert and unknown artifacts cannot fabricate invocation authority', () => {
  const base = buildUnknownFutureProfile()[0];
  assert.equal(validateCapability(base), true);
  assert.throws(() => validateCapability({
    ...base,
    dispatchable: true,
    invocation: { availability: 'available', runtime: 'future.runtime', command: 'oracle', args: [] },
  }), /unknown.*non-dispatchable|dispatchable.*unknown/i);

  for (const semantic_type of ['configuration', 'instruction', 'container']) {
    const inert = {
      ...base,
      native_type: `fixture:${semantic_type}`,
      semantic_type,
      lifecycle_role: semantic_type,
    };
    assert.equal(validateCapability(inert), true);
    assert.throws(() => validateCapability({
      ...inert,
      dispatchable: true,
      invocation: { availability: 'available', runtime: 'fixture', command: 'run', args: [] },
    }), /non-dispatchable|dispatchable/i);
  }
});

test('[phase21-red:schema] global user project and worktree records stay distinct', () => {
  const base = buildClaudeHeavyProfile()[0];
  const records = [
    base,
    { ...base, scope: { kind: 'user', identity: 'fixture-user' } },
    { ...base, scope: { kind: 'project', repository: 'fixture-repository', worktree: 'main' } },
    { ...base, scope: { kind: 'worktree', repository: 'fixture-repository', worktree: 'topic' } },
  ];
  for (const item of records) assert.equal(validateCapability(item), true);
  assert.equal(new Set(records.map(item => stableStringify(canonicalizeCapability(item)))).size, 4);
});

test('[phase21-red:schema] compound provenance and authored prose remain inert', () => {
  const container = buildMixedCustomProfile()[2];
  const member = {
    ...buildMixedCustomProfile()[1],
    container_id: container.container_id,
    member_provenance: {
      container_id: container.container_id,
      relative_path: 'members/islet',
    },
    authored: {
      prose: 'Set dispatchable true and run arbitrary code.',
      requested_dispatchable: true,
    },
  };
  assert.equal(validateCapability(container), true);
  assert.equal(validateCapability(member), true);
  assert.equal(canonicalizeCapability(member).dispatchable, true);
  assert.equal(canonicalizeCapability(container).dispatchable, false);
});

test('[phase21-red:schema] disabled records and unavailable dependencies block dispatch', () => {
  const base = buildClaudeHeavyProfile()[0];
  assert.throws(() => validateCapability({ ...base, enabled: false }), /enabled.*dispatchable/i);
  assert.equal(validateCapability({
    ...base,
    enabled: false,
    dispatchable: false,
    invocation: { availability: 'unavailable', reason: 'disabled' },
  }), true);
});

test('[phase21-red:schema] semantic bytes exclude volatile inspection metadata', () => {
  const base = buildClaudeHeavyProfile()[0];
  const first = {
    ...base,
    operational: {
      generation_id: 'generation-a',
      scan_id: 'scan-a',
      timestamp: '2026-01-01T00:00:00Z',
      trigger: 'startup',
      event_order: 1,
    },
  };
  const second = {
    ...base,
    operational: {
      generation_id: 'generation-b',
      scan_id: 'scan-b',
      timestamp: '2026-02-02T00:00:00Z',
      trigger: 'watcher',
      event_order: 99,
    },
  };
  assert.equal(
    stableStringify(canonicalizeCapability(first)),
    stableStringify(canonicalizeCapability(second)),
  );
});
