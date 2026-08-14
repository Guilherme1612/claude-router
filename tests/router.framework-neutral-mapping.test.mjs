import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapCapabilityManifest, mapLocalRegistry } from '../src/registry/local-map.mjs';
import { createCapabilityManifest } from '../src/registry/manifest.mjs';

test('MAP-01/02: arbitrary kinds retain runtime-local identity and bounded provenance', () => {
  const report = mapLocalRegistry({
    runtime: 'future-runtime', scope: { kind: 'project', repository: 'repo', worktree: 'main' },
    root: 'registry', scan: { root_exists: true, complete: true, freshness: 'fresh' },
    entries: [
      { id: 'tool-a', name: 'tool-a', kind: 'tool', available: true, eligible: true, dispatchable: true, relative_path: 'tools/a.json' },
      { id: 'mcp-a', name: 'mcp-a', kind: 'mcp', available: false, eligible: false, dispatchable: false, relative_path: 'mcp/a.json' },
      { id: 'new-a', name: 'new-a', kind: 'future-kind', available: true, eligible: true, dispatchable: false, relative_path: 'future/a' },
    ],
  });
  assert.equal(report.counts.dispatchable, 0, 'unknown runtime cannot gain dispatch authority');
  assert.equal(report.safe_empty, true);
  assert.equal(report.records.find(row => row.id === 'tool-a').runtime, 'future-runtime');
  assert.equal(JSON.stringify(report).includes('/Users/'), false);
});

test('MAP-03/04: paths, roots, aliases, cycles, and incomplete scans are quarantined deterministically', () => {
  const input = {
    runtime: 'claude', scope: { kind: 'user', identity: 'u' }, root: 'registry',
    scan: { root_exists: false, complete: false },
    aliases: { loopA: 'loopB', loopB: 'loopA', missing: 'absent' },
    relationships: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'a', to: 'absent' }],
    entries: [
      { id: 'a', name: 'a', kind: 'skill', available: true, eligible: true, dispatchable: true, relative_path: '../escape' },
      { id: 'loopA', name: 'loopA', kind: 'unknown', available: false, dispatchable: false, relative_path: 'a' },
    ],
  };
  const first = mapLocalRegistry(input);
  const second = mapLocalRegistry({ ...input, entries: [...input.entries].reverse() });
  assert.equal(first.fingerprint, second.fingerprint);
  assert.ok(first.records.every(row => row.state === 'quarantined' || row.state === 'unknown'));
  assert.ok(first.records.some(row => row.quarantine.includes('path_escape')));
  assert.ok(first.records.some(row => row.quarantine.includes('missing_root')));
  assert.ok(first.records.some(row => row.quarantine.includes('incomplete_scan')));
  assert.equal(first.safe_empty, true);
});

test('ONB-01..05: arbitrary framework profiles project into honest runtime-local mapping states', () => {
  const descriptor = (id, framework, overrides = {}) => ({
    id, name: id, kind: `${framework}-capability`, runtime: 'claude',
    scope: { kind: 'global' }, owner: 'owner:fixture',
    provenance: { source: 'manifest', logical_root: framework, relative_path: `${id}.json` },
    invocation: { method: 'command', target: id, input_shape: ['text'], output_shape: ['report'] },
    authority: { ceiling: 'inspect', evidence: 'explicit' },
    freshness: 'fresh', evidence: { class: 'synthetic', verified: false },
    availability: { available: true }, eligibility: { eligible: true }, dispatchable: true,
    ...overrides,
  });
  const manifest = createCapabilityManifest({
    runtime: 'claude', scope: { kind: 'global' }, framework: 'mixed-fixture', epoch: 'epoch:1',
    records: [
      descriptor('gsd:plan', 'gsd-like'),
      descriptor('gstack:review', 'gstack-like', { authority: undefined }),
      descriptor('custom:future', 'custom', { kind: 'future-kind', symlink: true, symlink_target: 'real/custom.json' }),
      descriptor('mixed:stale', 'mixed', { freshness: 'stale' }),
      descriptor('mixed:foreign', 'mixed', { runtime: 'codex' }),
    ],
  });
  const report = mapCapabilityManifest({ manifest, runtime: 'claude', scope: { kind: 'global' } });
  const byId = new Map(report.records.map(record => [record.stable_id, record]));
  assert.equal(byId.get('gsd:plan').state, 'dispatchable');
  assert.equal(byId.get('gstack:review').state, 'recommendation-only');
  assert.equal(byId.get('custom:future').state, 'dispatchable');
  assert.equal(byId.get('mixed:stale').state, 'quarantined');
  assert.ok(byId.get('mixed:stale').quarantine.includes('stale_manifest'));
  assert.equal(byId.get('mixed:foreign').state, 'quarantined');
  assert.ok(byId.get('mixed:foreign').quarantine.includes('runtime_mismatch'));
  assert.equal(report.safe_empty, false);
  assert.equal(report.counts.dispatchable, 2);
  assert.equal(JSON.stringify(report).includes('/Users/'), false);
});

test('ONB-04: an empty neutral manifest maps to safe-empty without inventing a route', () => {
  const manifest = createCapabilityManifest({ runtime: 'codex', scope: { kind: 'project', repository: 'r', worktree: 'w' } });
  const report = mapCapabilityManifest({ manifest, runtime: 'codex', scope: manifest.scope });
  assert.deepEqual(report.records, []);
  assert.equal(report.safe_empty, true);
  assert.equal(report.status, 'safe_empty');
});

test('MAP-04: malformed registry containers fail open as safe-empty reports', () => {
  const options = { runtime: 'claude', entries: null, scan: null, relationships: null };
  assert.doesNotThrow(() => mapLocalRegistry(options));
  const report = mapLocalRegistry(options);
  assert.equal(report.records.length, 0);
  assert.equal(report.safe_empty, true);
});

test('MAP-04: null onboarding inputs fail open without inventing capability authority', () => {
  assert.doesNotThrow(() => mapLocalRegistry(null));
  assert.doesNotThrow(() => createCapabilityManifest(null));
  assert.equal(mapLocalRegistry(null).safe_empty, true);
  assert.equal(createCapabilityManifest(null).safe_empty, true);
});
