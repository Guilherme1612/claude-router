import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

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
