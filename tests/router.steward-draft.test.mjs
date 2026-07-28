import assert from 'node:assert/strict';
import {
  existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildCapabilityContract } from '../src/registry/contract.mjs';
import { stableCapabilityId } from '../src/registry/identity.mjs';
import { buildClaudeHeavyProfile } from './helpers/inventory-fixture.mjs';

const NOW = 1_800_000_000_000;

function fixture() {
  const owned = mkdtempSync(join(tmpdir(), 'router-steward-draft-'));
  return { owned, root: join(owned, 'steward') };
}

function suggestion(overrides = {}) {
  return {
    fingerprint: 'a'.repeat(64),
    observation_kind: 'missing_dependency',
    reason_code: 'missing_dependency',
    affected_capability_ids: ['skill:z', 'skill:a'],
    ...overrides,
  };
}

function draft(overrides = {}) {
  return {
    semantic_changes: ['add_dependency_contract'],
    dependencies: ['skill:a'],
    conflicts: [],
    representative_routes: [{
      before: 'route_unavailable',
      after: 'route_candidate_available',
    }],
    verification: ['verify_contract'],
    reversibility: 'delete_draft_file',
    rollback_implications: 'none_until_install',
    ...overrides,
  };
}

test('preview is deterministic, bounded, contained, and read-only', async () => {
  const { previewDraft, verifyDraftPreview } = await import('../src/steward/draft.mjs');
  const f = fixture();
  try {
    const first = previewDraft({ root: f.root, suggestion: suggestion(), draft: draft() });
    const second = previewDraft({
      root: f.root,
      suggestion: suggestion({ affected_capability_ids: ['skill:a', 'skill:z'] }),
      draft: draft(),
    });
    assert.deepEqual(first, second);
    assert.equal(first.preview_status, 'ready');
    assert.equal(first.reason_code, 'draft_approval_required');
    assert.equal(first.effect, 'draft_file_only');
    assert.equal(first.warning, 'Approve draft creation only; this will not install or publish anything.');
    assert.equal(first.target_paths.length, 1);
    assert.ok(first.target_paths[0].startsWith(`${f.root}/drafts/`));
    assert.deepEqual(first.semantic_effects, ['add_dependency_contract']);
    assert.equal(Object.hasOwn(first, 'dependencies'), false);
    assert.equal(Object.hasOwn(first, 'representative_routes'), false);
    assert.equal(verifyDraftPreview(first, {
      root: f.root, suggestion: suggestion(), draft: draft(),
    }).valid, true);
    assert.equal(existsSync(f.root), false);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('preview rejects escapes, malformed records, and unbounded collections', async () => {
  const { previewDraft, verifyDraftPreview } = await import('../src/steward/draft.mjs');
  const f = fixture();
  try {
    assert.throws(() => previewDraft({ root: '../escape', suggestion: suggestion(), draft: draft() }), TypeError);
    assert.throws(() => previewDraft({
      root: f.root,
      suggestion: suggestion(),
      draft: draft({ dependencies: Array.from({ length: 33 }, (_, i) => `skill:${i}`) }),
    }), TypeError);
    assert.throws(() => previewDraft({
      root: f.root,
      suggestion: suggestion(),
      draft: draft({ semantic_changes: ['free form text'] }),
    }), TypeError);
    assert.throws(() => previewDraft({
      root: f.root,
      suggestion: suggestion(),
      draft: draft({ arbitrary_text: 'secret' }),
    }), TypeError);
    const valid = previewDraft({ root: f.root, suggestion: suggestion(), draft: draft() });
    assert.equal(verifyDraftPreview({ ...valid, target_paths: ['/tmp/escape.json'] }, {
      root: f.root, suggestion: suggestion(), draft: draft(),
    }).valid, false);
    assert.equal(existsSync(f.root), false);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('preview returns stable ineligible result for non-missing suggestions', async () => {
  const { previewDraft } = await import('../src/steward/draft.mjs');
  const f = fixture();
  try {
    assert.deepEqual(
      previewDraft({
        root: f.root,
        suggestion: suggestion({ observation_kind: 'ineffective', reason_code: 'ineffective' }),
        draft: draft(),
      }),
      {
        preview_status: 'ineligible',
        reason_code: 'draft_ineligible_suggestion',
      },
    );
    assert.deepEqual(readdirSync(f.owned), []);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('missing, mismatched, and stale approval write nothing and expose no complete preview', async () => {
  const { approveDraftCreation, previewDraft } = await import('../src/steward/draft.mjs');
  for (const mode of ['missing', 'mismatch', 'stale']) {
    const f = fixture();
    try {
      const initial = suggestion();
      const preview = previewDraft({ root: f.root, suggestion: initial, draft: draft() });
      const current = mode === 'stale' ? suggestion({ fingerprint: 'b'.repeat(64) }) : initial;
      const presented = mode === 'missing'
        ? undefined
        : { token: mode === 'mismatch' ? '0'.repeat(64) : preview.approval_binding.token };
      const result = approveDraftCreation({
        root: f.root, suggestion: current, draft: draft(), preview, presented, now: NOW,
      });
      assert.equal(result.status, 'blocked');
      assert.ok(['approval_required', 'approval_mismatch', 'stale_draft_preview'].includes(result.reason_code));
      assert.equal(Object.hasOwn(result, 'draft_preview'), false);
      assert.equal(existsSync(f.root), false);
    } finally { rmSync(f.owned, { recursive: true, force: true }); }
  }
});

test('fresh exact approval creates one immutable private bundle then returns complete preview', async () => {
  const { approveDraftCreation, previewDraft } = await import('../src/steward/draft.mjs');
  const f = fixture();
  try {
    const protectedPath = join(f.owned, 'active.json');
    writeFileSync(protectedPath, '{"version":"unchanged"}');
    const before = readFileSync(protectedPath);
    const request = { root: f.root, suggestion: suggestion(), draft: draft() };
    const preview = previewDraft(request);
    const approved = approveDraftCreation({
      ...request,
      preview,
      presented: { token: preview.approval_binding.token },
      now: NOW,
    });
    assert.equal(approved.status, 'stored');
    assert.equal(approved.reason_code, 'draft_preview_ready');
    assert.equal(approved.authority, 'draft_file_only');
    assert.equal(statSync(approved.path).mode & 0o777, 0o600);
    assert.deepEqual(readFileSync(protectedPath), before);
    assert.deepEqual(Object.keys(approved.draft_preview).sort(), [
      'conflicts',
      'dependencies',
      'exact_paths',
      'representative_routes',
      'reversibility',
      'rollback_implications',
      'semantic_changes',
      'verification',
      'warning',
    ]);
    assert.equal(approved.draft_preview.warning, 'Preview only — no capability or routing files were changed.');
    assert.deepEqual(approved.draft_preview.exact_paths, preview.target_paths);

    const repeated = approveDraftCreation({
      ...request,
      preview,
      presented: { token: preview.approval_binding.token },
      now: NOW + 1,
    });
    assert.equal(repeated.status, 'unchanged');
    assert.equal(repeated.path, approved.path);
    assert.deepEqual(readdirSync(join(f.root, 'drafts')), [approved.draft_id]);
  } finally { rmSync(f.owned, { recursive: true, force: true }); }
});

test('draft module has no install, activation, publication, or routing mutation imports', () => {
  const source = readFileSync(new URL('../src/steward/draft.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from\s+['"][^'"]*(?:activate|publish|installer|lifecycle|adapter|settings)[^'"]*['"]/);
  assert.match(source, /\['EEXIST', 'ENOTEMPTY'\]/);
});

test('production draft binds exact affected contracts and differs with observation evidence', async () => {
  const { deriveStewardDraft } = await import('../src/steward/draft.mjs');
  const evidence = value => [{
    value, provenance: 'adapter', confidence_basis_points: 10000,
    freshness: 'fresh', rule: 'draft-test-v1',
  }];
  const base = buildClaudeHeavyProfile()[0];
  const alpha = { ...base, name: 'alpha', canonical_identity: 'skill:alpha' };
  const beta = { ...base, name: 'beta', canonical_identity: 'skill:beta' };
  const alphaId = stableCapabilityId(alpha);
  const betaId = stableCapabilityId(beta);
  const registry = [
    { ...alpha, contract: buildCapabilityContract(alpha, { dependencies: evidence(['skill:ghost-a']) }) },
    { ...beta, contract: buildCapabilityContract(beta, { dependencies: evidence(['skill:ghost-b']) }) },
  ];
  const first = deriveStewardDraft({
    suggestion: suggestion({ affected_capability_ids: [alphaId, 'skill:ghost-a'] }),
    registry,
    relationships: { edges: [] },
  });
  const second = deriveStewardDraft({
    suggestion: suggestion({ affected_capability_ids: [betaId, 'skill:ghost-b'] }),
    registry,
    relationships: { edges: [] },
  });
  assert.deepEqual(first.dependencies, ['skill:ghost-a']);
  assert.deepEqual(first.semantic_changes, [`review_dependency:${alphaId}:skill:ghost-a`]);
  assert.deepEqual(first.representative_routes, [{
    before: `contract:${alphaId}:dependency_missing`,
    after: `contract:${alphaId}:dependency_declared`,
  }]);
  assert.notDeepEqual(first, second);
  const category = deriveStewardDraft({
    suggestion: suggestion({
      observation_kind: 'missing_category',
      reason_code: 'missing_category',
      affected_capability_ids: ['semantic_type:agent'],
    }),
    registry: [{
      ...alpha,
      contract: buildCapabilityContract(alpha, { invocation_kind: evidence('agent') }),
    }],
    relationships: { edges: [] },
  });
  assert.deepEqual(category.semantic_changes, [`add_category:agent:${alphaId}`]);
  assert.throws(() => deriveStewardDraft({
    suggestion: suggestion({ affected_capability_ids: [alphaId, 'skill:not-declared'] }),
    registry,
    relationships: { edges: [] },
  }), /exact affected contract evidence/);
});
