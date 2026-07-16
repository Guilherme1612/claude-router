import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stableStringify } from '../src/registry/schema.mjs';
import { loadCompiledIndex } from '../src/prompt/compile-index.mjs';

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
