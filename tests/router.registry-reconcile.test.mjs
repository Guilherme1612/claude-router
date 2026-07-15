import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { reconcileCandidate } from '../src/registry/reconcile.mjs';
import { stableStringify } from '../src/registry/schema.mjs';

export function capability(overrides = {}) {
  const runtime = overrides.runtime || 'claude';
  const name = overrides.name || 'planner';
  return {
    schema_version: 1,
    type: overrides.type || 'skill',
    name,
    canonical_identity: overrides.canonical_identity || `router/${name}`,
    lifecycle: 'ready',
    scope: { kind: 'global' },
    dispatchable: true,
    invocation: { runtime, command: name, args: [] },
    dependencies: { state: 'unknown', items: [] },
    provenance: [{ runtime, scope: 'global', logical_root: `${runtime}_global`, relative_path: `skills/${name}/SKILL.md`, source_fingerprint: `sha:${name}`, adapter: `${runtime}/1` }],
    runtime_variants: [{ runtime, native_identity: `skill:${name}` }],
    conflicts: [],
    ...overrides,
  };
}

export function candidate(records = [capability()]) {
  return { schema_version: 1, records };
}

export function alias(id, targetId = 'router/planner') {
  return { id, target_id: targetId };
}

export function activeSnapshot(value = candidate([capability({ name: 'active' })])) {
  const bytes = `${stableStringify(value)}\n`;
  return { registry: value, bytes, fingerprint: createHash('sha256').update(bytes).digest('hex') };
}

export function permutations(values) { return [values, [...values].reverse()]; }
export function injectedFailure(aliasId) { return ({ alias }) => { if (alias.id === aliasId) throw new Error('injected alias evaluation failure'); }; }

test('reconciliation is deterministic, portable, pure, and preserves active state on quarantine', () => {
  const records = [capability({ name: 'alpha' }), capability({ name: 'beta' })];
  const aliases = [alias('b', 'router/beta'), alias('a', 'router/alpha')];
  const active = activeSnapshot();
  const before = structuredClone({ records, aliases, active });
  const results = permutations(records).flatMap(permutedRecords => permutations(aliases).map(permutedAliases => reconcileCandidate({
    candidate: candidate(permutedRecords), active, aliases: permutedAliases, lifecycle: { events: [], diagnostics: [] }, hookInventory: [],
  })));
  assert.equal(new Set(results.map(stableStringify)).size, 1);
  assert.equal(results[0].disposition, 'eligible');
  assert.match(results[0].candidate_fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(results[0].active_fingerprint, active.fingerprint);
  assert.deepEqual({ records, aliases, active }, before);

  const bad = capability({ name: 'bad', canonical_identity: 'router/bad', lifecycle: 'invalid', dispatchable: false });
  const quarantined = reconcileCandidate({ candidate: candidate([bad]), active, aliases: [alias('bad-alias', 'router/bad')] });
  assert.equal(quarantined.disposition, 'quarantined');
  assert.equal(quarantined.active_bytes, active.bytes);
  assert.equal(quarantined.active_fingerprint, active.fingerprint);
  assert.ok(quarantined.verdicts.every(verdict => verdict.dispatchable === false && verdict.corrective_action));
  assert.doesNotMatch(stableStringify(quarantined), /\/Users\/|[A-Za-z]:\\\\/);
});

test('malformed candidates and injected failures fail closed without changing active bytes', () => {
  const active = activeSnapshot();
  const malformed = capability({ invocation: { runtime: 'claude', command: '', args: [] } });
  for (const options of [
    { candidate: candidate([malformed]), active, aliases: [alias('planner')] },
    { candidate: candidate(), active, aliases: [alias('planner')], evaluateAlias: injectedFailure('planner') },
  ]) {
    const result = reconcileCandidate(options);
    assert.equal(result.disposition, 'quarantined');
    assert.equal(result.active_bytes, active.bytes);
    assert.equal(result.active_fingerprint, active.fingerprint);
  }
});

test('deletion and every invalid target kind invalidate the complete reverse alias set', () => {
  const active = activeSnapshot();
  for (const type of ['command', 'skill', 'agent', 'hook', 'binding']) {
    const targetId = `router/${type}`;
    const result = reconcileCandidate({
      candidate: candidate([]), active,
      aliases: [alias(`${type}-one`, targetId), alias(`${type}-two`, targetId)],
      lifecycle: { events: [{ canonical_id: targetId, primary: 'removed', facets: [], old_provenance: capability({ type, canonical_identity: targetId }).provenance, new_provenance: null }], diagnostics: [] },
    });
    assert.equal(result.disposition, 'quarantined');
    assert.deepEqual(result.verdicts.filter(value => value.subject.kind === 'alias').map(value => value.subject.id), [`${type}-one`, `${type}-two`]);
    assert.ok(result.verdicts.every(value => value.dispatchable === false));
  }
});

test('strong stable continuity transfers aliases but weak rename evidence quarantines', () => {
  const moved = capability({ canonical_identity: 'router/stable', name: 'new-name', provenance: [{ runtime: 'claude', scope: 'global', logical_root: 'claude_global', relative_path: 'skills/new-name/SKILL.md', source_fingerprint: 'sha:new', adapter: 'claude/1' }] });
  const strong = reconcileCandidate({
    candidate: candidate([moved]), aliases: [alias('old-name', 'router/stable')],
    lifecycle: { events: [{ canonical_id: 'router/stable', primary: 'renamed', facets: [], old_provenance: capability({ canonical_identity: 'router/stable', name: 'old-name' }).provenance, new_provenance: moved.provenance }], diagnostics: [] },
  });
  assert.equal(strong.disposition, 'eligible');

  const weak = reconcileCandidate({
    candidate: candidate([capability({ canonical_identity: 'router/new', name: 'similar' })]),
    aliases: [alias('old-name', 'router/old')],
    lifecycle: { events: [], diagnostics: [{ code: 'possible_match', authoritative: false }] },
  });
  assert.equal(weak.disposition, 'quarantined');
  assert.ok(weak.verdicts.some(value => value.code === 'alias_continuity_uncertain'));
});

test('aliases never chain, cycle, duplicate, or fall back across same-name runtime and scope records', () => {
  const projectBroken = capability({
    canonical_identity: 'router/project-tool', name: 'tool', lifecycle: 'partial', dispatchable: false,
    scope: { kind: 'project', repository: 'repo:router', worktree: 'main' },
  });
  const globalHealthy = capability({ canonical_identity: 'router/global-tool', name: 'tool', runtime: 'codex', invocation: { runtime: 'codex', command: 'tool', args: [] }, runtime_variants: [{ runtime: 'codex', native_identity: 'skill:tool' }] });
  const result = reconcileCandidate({
    candidate: candidate([projectBroken, globalHealthy]),
    aliases: [alias('tool', 'router/project-tool'), alias('chain', 'tool'), alias('cycle-a', 'cycle-b'), alias('cycle-b', 'cycle-a'), alias('duplicate', 'router/global-tool'), alias('duplicate', 'router/project-tool')],
  });
  assert.equal(result.disposition, 'quarantined');
  assert.ok(result.verdicts.some(value => value.code === 'alias_claim_ambiguous'));
  assert.ok(result.verdicts.some(value => value.subject.id === 'tool' && value.subject.target_id === 'router/project-tool'));
  assert.equal(result.verdicts.some(value => value.subject.id === 'tool' && value.subject.target_id === 'router/global-tool'), false);
});

test('alias-set evaluation is atomic under permutation and injected commit failure', () => {
  const active = activeSnapshot();
  const aliases = [alias('one'), alias('two'), alias('three')];
  const results = permutations(aliases).map(values => reconcileCandidate({
    candidate: candidate(), active, aliases: values, commitAliasSet: () => { throw new Error('injected commit failure'); },
  }));
  assert.equal(new Set(results.map(stableStringify)).size, 1);
  for (const result of results) {
    assert.equal(result.disposition, 'quarantined');
    assert.equal(result.active_bytes, active.bytes);
    assert.equal(result.active_fingerprint, active.fingerprint);
  }
});
