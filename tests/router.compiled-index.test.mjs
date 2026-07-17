import { createHash } from 'node:crypto';
import { closeSync, fstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stableStringify } from '../src/registry/schema.mjs';
import { saveCapsule } from '../src/context/capsule.mjs';
import { routeContextPrompt } from '../src/context/prompt-route.mjs';
import { loadCompiledIndex } from '../src/prompt/compile-index.mjs';
import { publishCompiledIndex } from '../src/prompt/publish-index.mjs';

const NOW = 1_800_000_000_000;
const VERSION = 'v1-0123456789abcdef';
const CONTRACT = Object.freeze({
  router_contract: 'prompt-route-v1',
  policy_version: 'workflow-transitions-v1',
  capsule_schema_version: 1,
});

const sha256 = value => createHash('sha256').update(value).digest('hex');

function projection(versionId = VERSION) {
  return {
    schema_version: 1,
    version_id: versionId,
    policy_version: CONTRACT.policy_version,
    capsule_contract_version: CONTRACT.capsule_schema_version,
    routes: {
      'gsd-execute-phase': {
        workflow_id: 'gsd-execute-phase',
        transition_id: 'gsd.execute',
        dispatch_eligible: true,
        reason_code: 'unique_valid_transition',
      },
    },
  };
}

function writeVersion(root, {
  versionId = VERSION, state = 'verified', createdAt = NOW - 1_000,
  expiresAt = NOW + 60_000, compatibility = CONTRACT, index = projection(versionId),
} = {}) {
  const dir = join(root, 'compiled-index', 'versions', versionId);
  mkdirSync(dir, { recursive: true });
  const bytes = stableStringify(index) + '\n';
  const metadata = {
    schema_version: 1, state, version_id: versionId, created_at: createdAt,
    expires_at: expiresAt, compatibility, payload_sha256: sha256(bytes),
  };
  writeFileSync(join(dir, 'index.json'), bytes);
  writeFileSync(join(dir, 'metadata.json'), stableStringify(metadata) + '\n');
  return { metadata, bytes };
}

function writePointer(root, versionId = VERSION, payloadSha256) {
  mkdirSync(join(root, 'compiled-index'), { recursive: true });
  writeFileSync(join(root, 'compiled-index', 'active.json'), stableStringify({
    schema_version: 1, version_id: versionId, payload_sha256: payloadSha256,
  }) + '\n');
}

function writeKnownGood(root, versions) {
  mkdirSync(join(root, 'compiled-index'), { recursive: true });
  writeFileSync(join(root, 'compiled-index', 'known-good.json'), stableStringify({
    schema_version: 1, versions,
  }) + '\n');
}

function fixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'router-compiled-index-'));
  const version = writeVersion(root, options);
  writePointer(root, options.versionId || VERSION, version.metadata.payload_sha256);
  return { root, ...version };
}

test('publisher commits one verified registry and compiled release tuple', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-release-tuple-'));
  const registry = { schema_version: 1, records: [{
    id: 'capability-1', name: 'execute', lifecycle: 'ready', dispatchable: true,
    scope: { kind: 'global' }, invocation: { runtime: 'claude', command: 'execute', args: [] },
    dependencies: { state: 'ready', items: [] },
  }] };
  const mapping = { schema_version: 1, policy_fingerprint: 'a'.repeat(64), subjects: [{
    subject_id: 'gsd-execute-phase', disposition: 'mapped', target_id: 'capability-1', reason_code: 'explicit_subject',
  }] };
  try {
    const result = publishCompiledIndex({ ownedRoot: root, registry, registryVersionId: 'v1-aaaaaaaaaaaaaaaa', mapping, policyFingerprint: 'b'.repeat(64), now: NOW });
    assert.equal(result.publication_status, 'published');
    const loaded = loadCompiledIndex({ ownedRoot: root, now: NOW });
    assert.equal(loaded.status, 'ready');
    assert.equal(loaded.tuple_version_id, result.tuple_version_id);
    assert.equal(loaded.registry_version_id, 'v1-aaaaaaaaaaaaaaaa');
    assert.equal(loaded.index.routes['gsd-execute-phase'].target_id, 'capability-1');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('tuple reader rejects a mixed or corrupt registry component', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-release-tuple-corrupt-'));
  const registry = { schema_version: 1, records: [{ id: 'capability-1', name: 'execute', lifecycle: 'ready', dispatchable: true, scope: { kind: 'global' }, invocation: { runtime: 'claude', command: 'execute', args: [] }, dependencies: { state: 'ready', items: [] } }] };
  const mapping = { schema_version: 1, policy_fingerprint: 'a'.repeat(64), subjects: [{ subject_id: 'gsd-execute-phase', disposition: 'mapped', target_id: 'capability-1', reason_code: 'explicit_subject' }] };
  try {
    const result = publishCompiledIndex({ ownedRoot: root, registry, registryVersionId: 'v1-aaaaaaaaaaaaaaaa', mapping, policyFingerprint: 'b'.repeat(64), now: NOW });
    writeFileSync(join(root, 'release-tuples', 'versions', result.tuple_version_id, 'registry.json'), '{}\n');
    assert.equal(loadCompiledIndex({ ownedRoot: root, now: NOW }).dispatch_eligible, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function capsule(overrides = {}) {
  return {
    schema_version: 1, scope: { workspace_id: 'router-build', project_id: 'router' },
    goal: { id: 'phase-17', summary: 'Compiled prompt routing' },
    position: { workflow: 'gsd-execute-phase', phase: '17', plan: '01', task: '2' },
    status: 'active', artifacts: [], blockers: [],
    freshness: { captured_at: NOW - 1_000, generation: 'phase-17' },
    provenance: { source: 'workflow-state', version: '1' }, ...overrides,
  };
}

test('bounded loader accepts a verified compatible active projection', () => {
  const { root } = fixture();
  try {
    const result = loadCompiledIndex({ ownedRoot: root, now: NOW });
    assert.equal(result.status, 'ready');
    assert.equal(result.dispatch_eligible, true);
    assert.equal(result.reason_code, 'compiled_index_active');
    assert.equal(result.version_id, VERSION);
    assert.deepEqual(result.index, projection());
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('F-01 every malformed route projection fails closed', () => {
  const malformed = [
    {}, [], null, { workflow_id: 'gsd-execute-phase' },
    { workflow_id: 'other', transition_id: 'gsd.execute', dispatch_eligible: true, reason_code: 'ok' },
    { workflow_id: 'gsd-execute-phase', transition_id: 'gsd.execute', dispatch_eligible: true, reason_code: 'ok', unknown: true },
    { workflow_id: 'gsd-execute-phase', transition_id: 'x'.repeat(129), dispatch_eligible: true, reason_code: 'ok' },
  ];
  for (const route of malformed) {
    const { root } = fixture({ index: { ...projection(), routes: { 'gsd-execute-phase': route } } });
    try { assert.equal(loadCompiledIndex({ ownedRoot: root, now: NOW }).dispatch_eligible, false); }
    finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('invalid active state selects only an explicit verified compatible known-good version', () => {
  const { root } = fixture({ state: 'candidate' });
  const lkgId = 'v1-fedcba9876543210';
  try {
    const lkg = writeVersion(root, { versionId: lkgId, createdAt: NOW - 2_000 });
    writeKnownGood(root, [{ version_id: lkgId, payload_sha256: lkg.metadata.payload_sha256 }]);
    const result = loadCompiledIndex({ ownedRoot: root, now: NOW });
    assert.equal(result.status, 'ready');
    assert.equal(result.reason_code, 'compiled_index_known_good');
    assert.equal(result.version_id, lkgId);
    assert.equal(result.index.version_id, lkgId);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('missing, stale, corrupt, incomplete, and incompatible active state fail closed', () => {
  const mutations = [
    root => rmSync(join(root, 'compiled-index', 'active.json')),
    root => {
      const metaPath = join(root, 'compiled-index', 'versions', VERSION, 'metadata.json');
      const meta = JSON.parse(readFileSync(metaPath)); meta.expires_at = NOW - 1;
      writeFileSync(metaPath, stableStringify(meta) + '\n');
    },
    root => writeFileSync(join(root, 'compiled-index', 'versions', VERSION, 'index.json'), '{bad'),
    root => {
      const metaPath = join(root, 'compiled-index', 'versions', VERSION, 'metadata.json');
      const meta = JSON.parse(readFileSync(metaPath)); meta.state = 'incomplete';
      writeFileSync(metaPath, stableStringify(meta) + '\n');
    },
    root => {
      const metaPath = join(root, 'compiled-index', 'versions', VERSION, 'metadata.json');
      const meta = JSON.parse(readFileSync(metaPath)); meta.compatibility.router_contract = 'prompt-route-v0';
      writeFileSync(metaPath, stableStringify(meta) + '\n');
    },
  ];
  for (const mutate of mutations) {
    const { root } = fixture();
    try {
      mutate(root);
      const result = loadCompiledIndex({ ownedRoot: root, now: NOW });
      assert.deepEqual(result, {
        status: 'blocked', dispatch_eligible: false,
        reason_code: 'no_compatible_compiled_index',
        diagnostic: 'Rebuild and activate a verified compatible compiled routing index.',
      });
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('candidate and quarantined known-good entries are never fallback eligible', () => {
  for (const state of ['candidate', 'quarantined']) {
    const { root } = fixture({ state: 'candidate' });
    const fallbackId = state === 'candidate' ? 'v1-1111111111111111' : 'v1-2222222222222222';
    try {
      const fallback = writeVersion(root, { versionId: fallbackId, state });
      writeKnownGood(root, [{ version_id: fallbackId, payload_sha256: fallback.metadata.payload_sha256 }]);
      assert.equal(loadCompiledIndex({ ownedRoot: root, now: NOW }).dispatch_eligible, false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('live contextual routing consumes the verified projection and selected fresh capsule', () => {
  const { root } = fixture();
  try {
    assert.equal(saveCapsule({ ownedRoot: root, capsule: capsule() }).status, 'saved');
    const result = routeContextPrompt({ prompt: 'continue', ownedRoot: root, projectRoot: root, now: NOW });
    assert.equal(result.handled, true);
    assert.equal(result.resolution.reason_code, 'unique_continue_workflow');
    assert.equal(result.resolution.dispatch_eligible, true);
    assert.deepEqual(result.compiled, {
      version_id: VERSION, source: 'active', workflow_id: 'gsd-execute-phase',
      transition_id: 'gsd.execute', reason_code: 'unique_valid_transition',
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('explicit override and stale capsule semantics remain stable behind compiled validation', () => {
  const { root } = fixture();
  try {
    assert.equal(saveCapsule({ ownedRoot: root, capsule: capsule() }).status, 'saved');
    const explicit = routeContextPrompt({ prompt: 'execute phase 17', ownedRoot: root, projectRoot: root, now: NOW });
    assert.equal(explicit.resolution.reason_code, 'explicit_instruction_override');
    assert.equal(explicit.resolution.dispatch_eligible, true);
    assert.equal(JSON.parse(readFileSync(join(root, 'context-capsule.json'))).freshness.captured_at, NOW);

    const stale = routeContextPrompt({
      prompt: 'continue', ownedRoot: root, projectRoot: root, now: NOW, forceStale: true,
      authoritative: { status: 'unresolved', reason_code: 'identity_missing' },
    });
    assert.equal(stale.resolution.reason_code, 'authoritative_identity_unresolved');
    assert.equal(stale.resolution.dispatch_eligible, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('no compatible compiled version is handled as bounded non-dispatchable output', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-compiled-missing-'));
  try {
    assert.equal(saveCapsule({ ownedRoot: root, capsule: capsule() }).status, 'saved');
    const result = routeContextPrompt({ prompt: 'continue', ownedRoot: root, projectRoot: root, now: NOW });
    assert.equal(result.handled, true);
    assert.deepEqual(result.resolution, {
      outcome: 'blocked', dispatch_eligible: false,
      reason_code: 'no_compatible_compiled_index',
      diagnostic: 'Rebuild and activate a verified compatible compiled routing index.',
    });
    assert.match(result.additional_context, /no_compatible_compiled_index/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('hot path observes only explicitly addressed pointer metadata payload and capsule paths', () => {
  const { root } = fixture();
  const observed = [];
  try {
    assert.equal(saveCapsule({ ownedRoot: root, capsule: capsule() }).status, 'saved');
    const compiledFs = {
      openSync(path, flags) { observed.push(['open', path]); return openSync(path, flags); },
      fstatSync(fd) { observed.push(['fstat']); return fstatSync(fd); },
      readSync(fd, buffer, offset, length, position) { observed.push(['read']); return readSync(fd, buffer, offset, length, position); },
      closeSync(fd) { observed.push(['close']); return closeSync(fd); },
      readdirSync() { throw new Error('directory enumeration forbidden'); },
    };
    const result = routeContextPrompt({ prompt: 'continue', ownedRoot: root, projectRoot: root, now: NOW, compiledFs });
    assert.equal(result.resolution.dispatch_eligible, true);
    assert.deepEqual(observed.filter(entry => entry[0] === 'open').map(entry => entry[1]), [
      join(root, 'release-tuples', 'active.json'),
      join(root, 'compiled-index', 'active.json'),
      join(root, 'compiled-index', 'versions', VERSION, 'metadata.json'),
      join(root, 'compiled-index', 'versions', VERSION, 'index.json'),
    ]);
    assert.equal(observed.filter(entry => entry[0] === 'fstat').length, 3);
    assert.equal(observed.filter(entry => entry[0] === 'read').length, 3);
    assert.equal(observed.filter(entry => entry[0] === 'close').length, 3);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('compiled seam has no registry-build external-model or history-replay dependency', () => {
  const loaderSource = readFileSync(new URL('../src/prompt/compile-index.mjs', import.meta.url), 'utf8');
  const routeSource = readFileSync(new URL('../src/context/prompt-route.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(loaderSource, /readdir|registry\/build|child_process|fetch\s*\(|https?:|history|telemetry/i);
  assert.doesNotMatch(routeSource, /registry\/build|child_process|fetch\s*\(|https?:|history|telemetry/i);
});
