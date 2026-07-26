import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  loadFingerprintState,
  saveFingerprintState,
  scanFingerprintTree,
} from '../src/registry/fingerprint.mjs';
import { diffFingerprintTrees } from '../src/registry/diff.mjs';
import { stableStringify } from '../src/registry/schema.mjs';

function put(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value)}\n`);
}

function provenance(logicalRoot = 'claude_global', relativePath = 'skills/planner/SKILL.md') {
  return [{
    runtime: logicalRoot.startsWith('codex') ? 'codex' : 'claude',
    scope: 'global',
    logical_root: logicalRoot,
    relative_path: relativePath,
    source_fingerprint: `source:${relativePath}`,
    adapter: 'fixture@1',
  }];
}

function observation(overrides = {}) {
  const logicalRoot = overrides.logical_root || 'claude_global';
  const relativePath = overrides.relative_path || 'skills/planner/SKILL.md';
  const runtime = overrides.runtime || (logicalRoot.startsWith('codex') ? 'codex' : 'claude');
  return {
    schema_version: 1,
    type: 'skill',
    name: 'planner',
    lifecycle: 'ready',
    scope: { kind: 'global' },
    dispatchable: true,
    invocation: { runtime, command: runtime === 'codex' ? '$planner' : '/planner', args: [] },
    dependencies: { state: 'unknown', items: [] },
    permissions: { mode: 'workspace-write', grants: ['read'] },
    provenance: provenance(logicalRoot, relativePath),
    runtime_variants: [{ runtime, native_identity: 'planner', native: {} }],
    conflicts: [],
    content: { body: 'plan carefully' },
    ...overrides,
  };
}

function tree(entries = [], diagnostics = []) {
  return { schema_version: 1, roots: ['claude_global', 'codex_global'], entries, diagnostics };
}

function eventTypes(result) {
  return result.events.map((entry) => entry.primary);
}

test('classifies the complete add, edit, disable, dependency, permission, scope, and delete matrix', () => {
  const base = observation({ canonical_identity: 'router/planner' });
  assert.deepEqual(eventTypes(diffFingerprintTrees(tree(), tree([base]))), ['added']);
  assert.deepEqual(eventTypes(diffFingerprintTrees(tree([base]), tree())), ['removed']);

  const cases = [
    ['content_changed', { content: { body: 'changed' } }],
    ['disabled', { lifecycle: 'partial', dispatchable: false }],
    ['dependency_changed', { dependencies: { state: 'declared', items: [{ id: 'binary:rg', available: true }] } }],
    ['permission_changed', { permissions: { mode: 'read-only', grants: ['read'] } }],
    ['scope_changed', { scope: { kind: 'project', repository: 'repo:router', worktree: 'main' } }],
  ];
  for (const [primary, change] of cases) {
    const result = diffFingerprintTrees(tree([base]), tree([{ ...base, ...change }]));
    assert.equal(result.events.length, 1, primary);
    assert.equal(result.events[0].primary, primary);
    assert.equal(result.events[0].canonical_id, primary === 'scope_changed'
      ? 'router/planner'
      : 'router/planner');
  }
});

test('D-01 and D-02 preserve strong identity across rename and move with old/new provenance', () => {
  const before = observation({
    canonical_identity: 'router/planner',
    relative_path: 'skills/planner/SKILL.md',
  });
  const renamed = observation({
    canonical_identity: 'router/planner',
    name: 'architect',
    relative_path: 'skills/architect/SKILL.md',
    provenance: provenance('claude_global', 'skills/architect/SKILL.md'),
  });
  const rename = diffFingerprintTrees(tree([before]), tree([renamed]));
  assert.equal(rename.events.length, 1);
  assert.equal(rename.events[0].primary, 'renamed');
  assert.equal(rename.events[0].canonical_id, 'router/planner');
  assert.deepEqual(rename.events[0].old_provenance, before.provenance);
  assert.deepEqual(rename.events[0].new_provenance, renamed.provenance);

  const movedAndEdited = {
    ...renamed,
    content: { body: 'edited while moving' },
    provenance: provenance('codex_global', 'skills/architect/SKILL.md'),
    invocation: { runtime: 'codex', command: '$architect', args: [] },
    runtime_variants: [{ runtime: 'codex', native_identity: 'architect', native: {} }],
  };
  const move = diffFingerprintTrees(tree([renamed]), tree([movedAndEdited]));
  assert.equal(move.events.length, 1);
  assert.equal(move.events[0].primary, 'moved');
  assert.ok(move.events[0].facets.includes('content_changed'));
  assert.deepEqual(move.events[0].old_provenance, renamed.provenance);
  assert.deepEqual(move.events[0].new_provenance, movedAndEdited.provenance);
});

test('D-03 exact fingerprints preserve continuity while merely similar evidence remains advisory', () => {
  const before = observation({ name: 'planner', content: { body: 'same' } });
  const after = observation({
    name: 'planner-renamed',
    relative_path: 'skills/planner-renamed/SKILL.md',
    provenance: provenance('claude_global', 'skills/planner-renamed/SKILL.md'),
    runtime_variants: [{ runtime: 'claude', native_identity: 'planner-renamed', native: {} }],
    content: { body: 'same' },
  });
  const result = diffFingerprintTrees(tree([before]), tree([after]));
  assert.deepEqual(eventTypes(result), ['renamed']);
  assert.equal(result.events[0].continuity.authority, 'exact_fingerprint');
  assert.equal(result.diagnostics.length, 0);
  assert.deepEqual(result.diagnostics, [...result.diagnostics].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))));

  const weakScope = diffFingerprintTrees(
    tree([observation()]),
    tree([observation({ scope: { kind: 'project', repository: 'repo:router', worktree: 'main' } })]),
  );
  assert.deepEqual(eventTypes(weakScope), ['scope_changed']);
  assert.equal(weakScope.events[0].continuity.authority, 'exact_fingerprint');
});

test('D-04 emits one event with fixed precedence and ordered facets for compound changes', () => {
  const before = observation({ canonical_identity: 'router/planner' });
  const after = {
    ...before,
    lifecycle: 'partial',
    dispatchable: false,
    scope: { kind: 'project', repository: 'repo:router', worktree: 'main' },
    dependencies: { state: 'declared', items: [{ id: 'binary:rg', available: false }] },
    permissions: { mode: 'read-only', grants: [] },
    content: { body: 'changed' },
  };
  const result = diffFingerprintTrees(tree([before]), tree([after]));
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].primary, 'disabled');
  assert.deepEqual(result.events[0].facets, [
    'scope_changed', 'dependency_changed', 'permission_changed', 'content_changed',
  ]);
  assert.equal(new Set([result.events[0].primary, ...result.events[0].facets]).size, 5);
});

test('diff results and hashes are byte-identical under reversed snapshot enumeration', () => {
  const before = [
    observation({ canonical_identity: 'router/a', name: 'a' }),
    observation({ canonical_identity: 'router/b', name: 'b', relative_path: 'skills/b/SKILL.md', provenance: provenance('claude_global', 'skills/b/SKILL.md') }),
  ];
  const after = [
    { ...before[0], content: { body: 'edited' } },
    { ...before[1], dispatchable: false, lifecycle: 'partial' },
  ];
  const forward = diffFingerprintTrees(tree(before), tree(after));
  const reverse = diffFingerprintTrees(tree([...before].reverse()), tree([...after].reverse()));
  assert.equal(stableStringify(forward), stableStringify(reverse));
  assert.equal(forward.hash, reverse.hash);
});

test('portable fingerprint scan excludes absolute roots and filesystem metadata', async () => {
  const root = mkdtempSync(join(tmpdir(), 'registry-fingerprint-'));
  try {
    put(join(root, 'skills/a.json'), { schema_version: 1, name: 'a' });
    put(join(root, 'skills/b.json'), { schema_version: 1, name: 'b' });
    const first = await scanFingerprintTree([{ logicalRoot: 'fixture', path: root }]);
    const second = await scanFingerprintTree([{ path: root, logicalRoot: 'fixture' }]);
    assert.equal(first.hash, second.hash);
    const bytes = stableStringify(first);
    assert.equal(bytes.includes(root), false);
    for (const forbidden of ['mtime', 'mode', 'uid', 'gid', 'ino', 'inode', 'device', 'dev', 'acl']) {
      assert.equal(bytes.toLowerCase().includes(`\"${forbidden}`), false, forbidden);
    }
    assert.deepEqual(first.entries.map((entry) => entry.relative_path), ['skills/a.json', 'skills/b.json']);
    assert.deepEqual(first.subtree_hashes.map((entry) => entry.relative_path), ['.', 'skills']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('fingerprint scanner rejects root escapes and reports access denial without deletion semantics', async () => {
  const root = mkdtempSync(join(tmpdir(), 'registry-fingerprint-denial-'));
  try {
    put(join(root, 'safe.json'), { ok: true });
    await assert.rejects(
      scanFingerprintTree([{ logicalRoot: 'fixture', path: join(root, '..') }], { containmentRoot: root }),
      /outside configured containment root/,
    );
    const denied = await scanFingerprintTree([{ logicalRoot: 'fixture', path: root }], {
      readFile: async path => {
        if (path.endsWith('safe.json')) throw Object.assign(new Error('denied'), { code: 'EACCES' });
        return readFileSync(path);
      },
    });
    assert.deepEqual(denied.entries, []);
    assert.equal(denied.diagnostics[0].code, 'access_denied');
    const deniedObservation = observation({
      logical_root: 'fixture',
      relative_path: 'safe.json',
      provenance: provenance('fixture', 'safe.json'),
    });
    const result = diffFingerprintTrees(tree([deniedObservation]), denied);
    assert.equal(result.events.some((event) => event.primary === 'removed'), false);
    assert.equal(result.events.some((event) => event.primary === 'permission_changed'), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('missing configured roots produce portable stable empty fingerprint evidence', async () => {
  const root = mkdtempSync(join(tmpdir(), 'registry-missing-roots-'));
  try {
    const specs = [
      { logicalRoot: 'project:fixture:claude', path: join(root, '.claude') },
      { logicalRoot: 'project:fixture:codex', path: join(root, '.codex') },
    ];
    const empty = await scanFingerprintTree(specs, { containmentRoot: root });
    assert.equal(empty.root_hashes.length, 2);
    assert.deepEqual(empty.diagnostics.map(item => item.code), ['root_missing', 'root_missing']);
    const nested = await scanFingerprintTree([
      { logicalRoot: 'project:fixture:nested', path: join(root, 'absent', 'inventory', '.claude') },
    ], { containmentRoot: root });
    assert.deepEqual(nested.diagnostics, [{
      code: 'root_missing', logical_root: 'project:fixture:nested', relative_path: '.', reason: 'ENOENT',
    }]);
    mkdirSync(join(root, '.claude', 'skills'), { recursive: true });
    put(join(root, '.claude', 'skills', 'live.json'), { schema_version: 1, name: 'live' });
    const first = await scanFingerprintTree(specs, { containmentRoot: root });
    const second = await scanFingerprintTree(specs, { containmentRoot: root });
    assert.equal(first.hash, second.hash);
    assert.equal(first.entries.length, 1);
    assert.deepEqual(first.diagnostics, [{
      code: 'root_missing', logical_root: 'project:fixture:codex', relative_path: '.', reason: 'ENOENT',
    }]);
    assert.equal(stableStringify(first).includes(root), false);
    await assert.rejects(
      scanFingerprintTree([{ logicalRoot: 'escape', path: join(root, '..', 'missing', 'nested') }], { containmentRoot: root }),
      /outside configured containment root/,
    );
    await assert.rejects(
      scanFingerprintTree([{ logicalRoot: 'denied', path: join(root, 'denied') }], {
        containmentRoot: root,
        realpath: async path => {
          if (path === join(root, 'denied')) throw Object.assign(new Error('denied'), { code: 'EACCES' });
          return path;
        },
      }),
      /denied/,
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('state cache round-trips atomically and invalid states request a clean scan', async () => {
  const root = mkdtempSync(join(tmpdir(), 'registry-fingerprint-state-'));
  const statePath = join(root, 'cache/state.json');
  try {
    put(join(root, 'inventory/a.json'), { a: 1 });
    const snapshot = await scanFingerprintTree([{ logicalRoot: 'fixture', path: join(root, 'inventory') }]);
    await saveFingerprintState(statePath, snapshot);
    assert.deepEqual(await loadFingerprintState(statePath, ['fixture']), { clean_scan_required: false, state: snapshot, diagnostics: [] });

    const invalidCases = [
      '{broken',
      JSON.stringify({ ...snapshot, schema_version: 99 }),
      JSON.stringify({ ...snapshot, roots: ['other'] }),
      JSON.stringify({ ...snapshot, entries: [{ ...snapshot.entries[0], relative_path: '../escape' }] }),
      JSON.stringify({ ...snapshot, entries: [{ ...snapshot.entries[0], relative_path: '/absolute' }] }),
      JSON.stringify({ ...snapshot, root_hashes: [{ logical_root: 'fixture', hash: 'tampered' }] }),
    ];
    for (const value of invalidCases) {
      writeFileSync(statePath, value);
      const loaded = await loadFingerprintState(statePath, ['fixture']);
      assert.equal(loaded.clean_scan_required, true);
      assert.equal(loaded.state, null);
      assert.ok(loaded.diagnostics.length > 0);
    }
    assert.equal(readFileSync(statePath, 'utf8').includes(root), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('[phase21-red:mutation] path fallback separates live duplicates and unique exact bytes preserve move continuity', () => {
  const before = observation({
    name: 'portable',
    canonical_identity: undefined,
    runtime_variants: [{ runtime: 'claude', native_identity: 'shared' }],
    content: { body: 'exact bytes' },
  });
  const duplicate = {
    ...before,
    provenance: provenance('claude_global', 'skills/portable-copy/SKILL.md'),
  };
  const simultaneous = diffFingerprintTrees(tree(), tree([before, duplicate]));
  assert.equal(new Set(simultaneous.events.map(event => event.canonical_id)).size, 2);

  const moved = {
    ...before,
    name: 'portable-moved',
    provenance: provenance('codex_global', 'skills/portable-moved/SKILL.md'),
    invocation: { runtime: 'codex', command: '$portable', args: [] },
    runtime_variants: [{ runtime: 'codex', native_identity: 'different-native-id' }],
  };
  const continuity = diffFingerprintTrees(tree([before]), tree([moved]));
  assert.equal(continuity.events.length, 1);
  assert.equal(continuity.events[0].primary, 'moved');
  assert.equal(continuity.events[0].continuity.authority, 'exact_fingerprint');
});

test('[phase21-red:mutation] ambiguous exact N-to-M fingerprints never transfer identity', () => {
  const base = observation({
    canonical_identity: undefined,
    runtime_variants: [{ runtime: 'claude', native_identity: 'shared' }],
    content: { body: 'duplicate bytes' },
  });
  const oldEntries = ['a', 'b'].map(name => ({
    ...base,
    name,
    provenance: provenance('claude_global', `skills/${name}/SKILL.md`),
  }));
  const newEntries = ['c', 'd'].map(name => ({
    ...base,
    name,
    provenance: provenance('codex_global', `skills/${name}/SKILL.md`),
  }));
  const result = diffFingerprintTrees(tree(oldEntries), tree(newEntries));
  assert.deepEqual(eventTypes(result), ['removed', 'removed', 'added', 'added']);
  assert.equal(result.events.some(event => event.continuity?.authoritative), false);
});

test('[phase21-red:mutation] partial scan suppresses removals only inside the unreadable subtree', () => {
  const denied = observation({
    canonical_identity: 'router/denied',
    provenance: provenance('claude_global', 'skills/denied/SKILL.md'),
  });
  const healthy = observation({
    canonical_identity: 'router/healthy',
    provenance: provenance('claude_global', 'skills/healthy/SKILL.md'),
  });
  const result = diffFingerprintTrees(
    tree([denied, healthy]),
    tree([], [{ code: 'read_error', logical_root: 'claude_global', relative_path: 'skills/denied' }]),
  );
  assert.deepEqual(result.events.map(event => event.canonical_id), ['router/healthy']);
});
