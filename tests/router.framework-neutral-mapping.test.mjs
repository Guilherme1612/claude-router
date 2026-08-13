import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapLocalRegistry } from '../src/registry/local-map.mjs';

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
