import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CAPSULE_LIMITS, CAPSULE_SCHEMA_VERSION, canonicalizeCapsule, capsulePaths,
  deriveWorkflowIdentity, loadCapsule, saveCapsule, stableCapsuleStringify, validateCapsule,
} from '../src/context/capsule.mjs';

const canary = 'CANARY-secret-prompt-transcript-tool-output';

function capsule(overrides = {}) {
  return {
    schema_version: CAPSULE_SCHEMA_VERSION,
    scope: { workspace_id: 'router-build', project_id: 'router' },
    goal: { id: 'goal-phase-15', summary: 'Resume context capsule work' },
    position: { workflow: 'gsd-execute-phase', phase: '15', plan: '01', task: '1' },
    status: 'active',
    artifacts: [
      { ref: '.planning/STATE.md', type: 'state', status: 'next', witness: { kind: 'sha256', value: 'a'.repeat(64) }, priority: 2 },
      { ref: 'src/context/capsule.mjs', type: 'source', status: 'current', witness: { kind: 'mtime', value: 123 }, priority: 1 },
    ],
    blockers: [{ id: 'b-old', summary: 'older issue', status: 'resolved', updated_at: 1 }, { id: 'b-new', summary: 'new issue', status: 'open', updated_at: 2 }],
    freshness: { captured_at: 100, generation: 'phase-15' },
    provenance: { source: 'workflow-state', version: '1' },
    ...overrides,
  };
}

test('capsule canonicalization is deterministic, bounded, and identity is label-independent', () => {
  const input = capsule();
  const reversed = Object.fromEntries(Object.entries(input).reverse());
  reversed.artifacts = [...input.artifacts].reverse();
  reversed.blockers = [...input.blockers].reverse();
  assert.equal(stableCapsuleStringify(input), stableCapsuleStringify(reversed));
  assert.equal(validateCapsule(input).valid, true);
  assert.match(deriveWorkflowIdentity(input), /^[a-f0-9]{64}$/);
  assert.equal(deriveWorkflowIdentity(input), deriveWorkflowIdentity({ ...input, goal: { ...input.goal, summary: 'different label' } }));

  const many = capsule({ artifacts: Array.from({ length: CAPSULE_LIMITS.artifacts + 3 }, (_, i) => ({
    ref: `out/${i}.json`, type: 'report', status: i === CAPSULE_LIMITS.artifacts + 2 ? 'next' : 'current', priority: i,
    witness: { kind: 'version', value: `v${i}` },
  })) });
  const bounded = canonicalizeCapsule(many);
  assert.equal(bounded.artifacts.length, CAPSULE_LIMITS.artifacts);
  assert.equal(bounded.bounds.artifacts.truncated, true);
  assert.equal(bounded.bounds.artifacts.omitted_count, 3);
  assert.ok(bounded.artifacts.some(entry => entry.status === 'next'));
});

test('unsafe references, malformed schema, transitions and witnesses fail with private stable diagnostics', () => {
  const cases = [
    [capsule({ schema_version: 99 }), 'unsupported_schema_version'],
    [capsule({ artifacts: [{ ref: '/etc/passwd', type: 'source', status: 'next', witness: { kind: 'mtime', value: 1 } }] }), 'unsafe_artifact_ref'],
    [capsule({ artifacts: [{ ref: '../escape', type: 'source', status: 'next', witness: { kind: 'mtime', value: 1 } }] }), 'unsafe_artifact_ref'],
    [capsule({ artifacts: [{ ref: 'safe', type: 'source', status: 'next', witness: { kind: 'sha256', value: 'bad' } }] }), 'invalid_freshness_witness'],
    [capsule({ status: 'completed', supersession: { workflow_identity: 'a'.repeat(64), reason: 'changed' }, position: { workflow: 'x', phase: '1', plan: '1', task: '1' } }), 'invalid_transition'],
  ];
  for (const [value, reason] of cases) {
    const result = validateCapsule(value);
    assert.equal(result.valid, false);
    assert.equal(result.reason_code, reason);
    assert.ok(result.path.startsWith('$'));
    assert.doesNotMatch(JSON.stringify(result), /etc\/passwd|\.\.\/escape|bad/);
  }
});

test('strict allowlist excludes prompt history, documents, credentials, and tool output', () => {
  const input = capsule({ prompt: canary, transcript: canary, credentials: canary, tool_output: canary, document_body: canary });
  const bytes = stableCapsuleStringify(input);
  assert.doesNotMatch(bytes, new RegExp(canary));
  assert.doesNotMatch(bytes, /prompt|transcript|credentials|tool_output|document_body/);
  assert.throws(() => stableCapsuleStringify(capsule({ goal: { id: canary.repeat(10), summary: 'ok' } })), error => !JSON.stringify(error).includes(canary));
});

test('active and one LKG capsule persist privately and recover only corrupt active bytes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-capsule-'));
  try {
    const first = capsule();
    assert.equal(saveCapsule({ ownedRoot: root, capsule: first }).status, 'saved');
    const paths = capsulePaths(root);
    assert.equal(lstatSync(paths.active).mode & 0o777, 0o600);
    assert.equal(loadCapsule({ ownedRoot: root }).status, 'active');
    const second = capsule({ freshness: { captured_at: 200, generation: 'phase-15-b' } });
    assert.equal(saveCapsule({ ownedRoot: root, capsule: second }).status, 'saved');
    assert.equal(JSON.parse(readFileSync(paths.lkg, 'utf8')).freshness.captured_at, 100);
    writeFileSync(paths.active, `{${canary}`);
    const recovered = loadCapsule({ ownedRoot: root });
    assert.equal(recovered.status, 'recovered_lkg');
    assert.equal(recovered.capsule.freshness.captured_at, 100);
    assert.doesNotMatch(JSON.stringify(recovered), new RegExp(canary));
    writeFileSync(paths.active, 'x'.repeat(CAPSULE_LIMITS.bytes + 1));
    assert.equal(loadCapsule({ ownedRoot: root }).status, 'recovered_lkg');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('missing, symlinked, corrupt and unsafe storage fails closed without path disclosure', async () => {
  const root = mkdtempSync(join(tmpdir(), 'router-capsule-'));
  const outside = mkdtempSync(join(tmpdir(), 'router-capsule-outside-'));
  try {
    assert.deepEqual(loadCapsule({ ownedRoot: root }), { status: 'missing', reason_code: 'capsule_missing' });
    const paths = capsulePaths(root);
    writeFileSync(join(outside, 'target'), '{}');
    symlinkSync(join(outside, 'target'), paths.active);
    const unsafe = loadCapsule({ ownedRoot: root });
    assert.equal(unsafe.status, 'blocked');
    assert.equal(unsafe.reason_code, 'unsafe_capsule_path');
    assert.doesNotMatch(JSON.stringify(unsafe), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.throws(() => capsulePaths('relative/root'), /owned_root_invalid/);
    chmodSync(root, 0o700);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('owned root itself may not be a symlink and persistence leaves no temporary history', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'router-capsule-parent-'));
  const target = mkdtempSync(join(tmpdir(), 'router-capsule-target-'));
  const linked = join(parent, 'linked-root');
  try {
    symlinkSync(target, linked, 'dir');
    assert.equal(saveCapsule({ ownedRoot: linked, capsule: capsule() }).reason_code, 'unsafe_owned_root');
    assert.equal(loadCapsule({ ownedRoot: linked }).reason_code, 'unsafe_owned_root');
    assert.equal(existsSync(join(target, 'context-capsule.json')), false);
  } finally { await rm(parent, { recursive: true, force: true }); await rm(target, { recursive: true, force: true }); }
});
