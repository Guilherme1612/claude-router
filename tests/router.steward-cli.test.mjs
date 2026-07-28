import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { renderSuggestionText, runRouterControl } from '../src/cli/router-control.mjs';

const NOW = 1_800_000_000_000;
const OBSERVATION = {
  observation_kind: 'missing_dependency',
  reason_code: 'missing_dependency',
  remedy: 'review_contract',
  freshness: 'fresh',
  evidence_window_ms: 86_400_000,
  sample_size: 7,
  confidence_basis_points: 9200,
  affected_capability_ids: ['skill:z', 'skill:a'],
};

function fixture(observations = [OBSERVATION]) {
  const root = mkdtempSync(join(tmpdir(), 'router-steward-cli-'));
  const protectedPath = join(root, 'active.json');
  writeFileSync(protectedPath, '{"protected":true}\n');
  const dependencies = {
    stewardObservations: observations,
    stewardDraft: {
      semantic_changes: ['add_dependency_contract'],
      dependencies: ['skill:a'],
      conflicts: [],
      representative_routes: [{ before: 'route_unavailable', after: 'route_candidate_available' }],
      verification: ['verify_contract'],
      reversibility: 'delete_draft_file',
      rollback_implications: 'none_until_install',
    },
    now: () => NOW,
  };
  return {
    root,
    protectedPath,
    dependencies,
    run(...argv) {
      return runRouterControl({ argv: [...argv, '--owned-root', root], dependencies });
    },
  };
}

function selected(f) {
  const outcome = f.run('suggestion');
  assert.equal(outcome.exitCode, 0);
  return outcome.result.data.suggestion;
}

test('suggestion empty and detail expose one bounded private canonical projection', () => {
  for (const observations of [[], [OBSERVATION, {
    ...OBSERVATION,
    reason_code: 'lower_ranked',
    confidence_basis_points: 8800,
    affected_capability_ids: ['private:rejected'],
  }]]) {
    const f = fixture(observations);
    try {
      const before = readFileSync(f.protectedPath);
      const outcome = f.run('suggestion');
      assert.equal(outcome.exitCode, 0);
      assert.equal(outcome.result.command, 'suggestion');
      assert.deepEqual(Object.keys(outcome.result), [
        'schema_version', 'command', 'ok', 'reason_code', 'data', 'warnings',
      ]);
      if (observations.length === 0) {
        assert.equal(outcome.result.reason_code, 'suggestion_none');
        assert.deepEqual(outcome.result.data, {
          heading: 'No actionable suggestion',
          body: 'Router found no novel, high-confidence action that passes the current policy.',
          overview: { actionable_count: 0 },
          suggestion: null,
        });
      } else {
        assert.equal(outcome.result.reason_code, 'suggestion_selected');
        assert.equal(outcome.result.data.heading, 'Top suggestion');
        assert.deepEqual(Object.keys(outcome.result.data.suggestion).sort(), [
          'affected_capability_ids', 'confidence_basis_points', 'evidence',
          'expected_benefit', 'fingerprint', 'observation_kind', 'reason_code',
          'risk', 'safe_next_action',
        ]);
        assert.doesNotMatch(JSON.stringify(outcome.result), /private:rejected/);
      }
      assert.deepEqual(readFileSync(f.protectedPath), before);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test('production suggestion and draft derive authoritative local inputs without injected steward data', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-steward-live-cli-'));
  try {
    mkdirSync(join(root, 'registry'), { recursive: true });
    writeFileSync(join(root, 'registry', 'registry.json'), JSON.stringify({
      records: [{
        canonical_identity: 'skill:debug',
        semantic_type: 'skill',
        contract: { dependencies: ['skill:ghost'] },
      }],
      relationships: {
        edges: [{ id: 'route:debug', source_id: 'skill:debug', target_id: 'skill:ghost' }],
      },
    }));
    const inspect = runRouterControl({
      argv: ['suggestion', '--owned-root', root],
      dependencies: { now: () => NOW },
    });
    assert.equal(inspect.result.reason_code, 'suggestion_selected');
    const proposal = runRouterControl({
      argv: ['suggestion', 'draft', '--confirm', inspect.result.data.suggestion.fingerprint, '--owned-root', root],
      dependencies: { now: () => NOW },
    });
    assert.equal(proposal.result.reason_code, 'draft_approval_required');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('human suggestion renderer groups fields, bounds lines, and gives recovery copy once', () => {
  const f = fixture();
  try {
    const detail = renderSuggestionText(f.run('suggestion').result);
    assert.match(detail, /^Top suggestion\n\nOVERVIEW /);
    assert.match(detail, /\n\nEVIDENCE\n/);
    assert.match(detail, /\n\nACTION\n/);
    assert.ok(Math.max(...detail.trimEnd().split('\n').map(line => line.length)) < 160);
    const proposal = f.run('suggestion', 'draft', '--confirm', selected(f).fingerprint);
    assert.equal((renderSuggestionText(proposal.result).match(/Approve draft creation only/g) || []).length, 1);
    assert.equal(renderSuggestionText({
      command: 'suggestion', ok: false, reason_code: 'unsafe_suggestion_input', data: {}, warnings: [],
    }), 'unsafe_suggestion_input; inspect local health state and retry.\n');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('human renderer groups interaction and approved preview states with bounded lines', () => {
  const f = fixture();
  try {
    const empty = fixture([]);
    try {
      const text = renderSuggestionText(empty.run('suggestion').result);
      assert.match(text, /^No actionable suggestion\n/);
      assert.doesNotMatch(text, /\u001b\[/);
    } finally { rmSync(empty.root, { recursive: true, force: true }); }
    const fingerprint = selected(f).fingerprint;
    for (const outcome of [
      f.run('suggestion', 'dismiss', '--confirm', fingerprint),
      (() => {
        const other = fixture();
        try {
          const id = selected(other).fingerprint;
          return other.run('suggestion', 'snooze', '--confirm', id, '--until', String(NOW + 1000));
        } finally { rmSync(other.root, { recursive: true, force: true }); }
      })(),
      (() => {
        const other = fixture();
        try {
          const id = selected(other).fingerprint;
          return other.run(
            'suggestion', 'correct', '--confirm', id,
            '--proposal-json', '{"reason_code":"dependency_restored"}',
          );
        } finally { rmSync(other.root, { recursive: true, force: true }); }
      })(),
    ]) {
      const text = renderSuggestionText(outcome.result);
      assert.match(text, /^ACTION\n/);
      assert.ok(Math.max(...text.trimEnd().split('\n').map(line => line.length)) < 160);
    }
    const approved = fixture();
    try {
      const id = selected(approved).fingerprint;
      const proposal = approved.run('suggestion', 'draft', '--confirm', id);
      const result = approved.run(
        'suggestion', 'draft', '--confirm', id, '--execute',
        '--approval', proposal.result.data.approval_token,
      );
      const text = renderSuggestionText(result.result);
      for (const heading of ['DRAFT PREVIEW', 'PATHS', 'CHANGES', 'ROUTE EFFECTS', 'VERIFICATION', 'ROLLBACK']) {
        assert.match(text, new RegExp(`(?:^|\\n)${heading}\\n`));
      }
      assert.ok(Math.max(...text.trimEnd().split('\n').map(line => line.length)) < 160);
    } finally { rmSync(approved.root, { recursive: true, force: true }); }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('dismiss, snooze, and correct require the current exact fingerprint', () => {
  const f = fixture();
  try {
    const fingerprint = selected(f).fingerprint;
    const before = readFileSync(f.protectedPath);
    for (const argv of [
      ['suggestion', 'dismiss', '--confirm', 'a'.repeat(64)],
      ['suggestion', 'snooze', '--confirm', 'a'.repeat(64), '--until', String(NOW + 1000)],
      ['suggestion', 'correct', '--confirm', 'a'.repeat(64), '--proposal-json', '{"reason_code":"wrong"}'],
    ]) {
      const outcome = f.run(...argv);
      assert.equal(outcome.exitCode, 4);
      assert.equal(outcome.result.reason_code, 'suggestion_fingerprint_stale');
    }

    const dismissed = f.run('suggestion', 'dismiss', '--confirm', fingerprint);
    assert.equal(dismissed.result.data.message, 'Suggestion dismissed');

    const snoozeFixture = fixture();
    try {
      const snoozeFingerprint = selected(snoozeFixture).fingerprint;
      const until = NOW + 1000;
      const snoozed = snoozeFixture.run(
        'suggestion', 'snooze', '--confirm', snoozeFingerprint, '--until', String(until),
      );
      assert.equal(snoozed.result.data.message, `Suggestion snoozed until ${until}`);
    } finally {
      rmSync(snoozeFixture.root, { recursive: true, force: true });
    }

    const correctionFixture = fixture();
    try {
      const correctionFingerprint = selected(correctionFixture).fingerprint;
      const corrected = correctionFixture.run(
        'suggestion', 'correct', '--confirm', correctionFingerprint,
        '--proposal-json', '{"reason_code":"dependency_restored"}',
      );
      assert.equal(corrected.result.data.message, 'Correction proposal saved; routing unchanged');
      assert.equal(corrected.result.data.routing_unchanged, true);
    } finally {
      rmSync(correctionFixture.root, { recursive: true, force: true });
    }
    assert.deepEqual(readFileSync(f.protectedPath), before);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('suggestion grammar rejects malformed, unsafe, oversized, and forbidden actions', () => {
  const f = fixture();
  try {
    for (const argv of [
      ['suggestion', 'list'],
      ['suggestion', 'dashboard'],
      ['suggestion', 'dismiss', '--confirm', 'bad'],
      ['suggestion', 'snooze', '--confirm', 'a'.repeat(64), '--until', '1.5'],
      ['suggestion', 'correct', '--confirm', 'a'.repeat(64), '--proposal-json', `{"reason_code":"${'x'.repeat(4096)}"}`],
      ['suggestion', '--unknown'],
    ]) {
      assert.equal(f.run(...argv).exitCode, 2);
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('suggestion draft is proposal-first and exposes no complete preview before approval', () => {
  const f = fixture();
  try {
    const fingerprint = selected(f).fingerprint;
    const before = readFileSync(f.protectedPath);
    const proposed = f.run('suggestion', 'draft', '--confirm', fingerprint);
    assert.equal(proposed.exitCode, 0);
    assert.equal(proposed.result.reason_code, 'draft_approval_required');
    assert.equal(proposed.result.data.effect, 'draft_file_only');
    assert.equal(
      proposed.result.data.warning,
      'Approve draft creation only; this will not install or publish anything.',
    );
    assert.match(proposed.result.data.approval_token, /^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(proposed.result.data, 'draft_preview'), false);
    assert.equal(Object.hasOwn(proposed.result.data, 'dependencies'), false);
    assert.deepEqual(readFileSync(f.protectedPath), before);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('suggestion draft requires exact fresh approval then returns complete preview only', () => {
  for (const mode of ['missing', 'mismatch', 'approved']) {
    const f = fixture();
    try {
      const fingerprint = selected(f).fingerprint;
      const proposal = f.run('suggestion', 'draft', '--confirm', fingerprint);
      const token = proposal.result.data.approval_token;
      const argv = ['suggestion', 'draft', '--confirm', fingerprint, '--execute'];
      if (mode !== 'missing') argv.push('--approval', mode === 'approved' ? token : '0'.repeat(64));
      const outcome = f.run(...argv);
      if (mode !== 'approved') {
        assert.ok([2, 4].includes(outcome.exitCode));
        assert.equal(Object.hasOwn(outcome.result.data, 'draft_preview'), false);
        continue;
      }
      assert.equal(outcome.exitCode, 0);
      assert.equal(outcome.result.reason_code, 'draft_preview_ready');
      assert.equal(outcome.result.data.authority, 'draft_file_only');
      assert.deepEqual(Object.keys(outcome.result.data.draft_preview).sort(), [
        'conflicts', 'dependencies', 'exact_paths', 'representative_routes',
        'reversibility', 'rollback_implications', 'semantic_changes', 'verification', 'warning',
      ]);
      assert.equal(
        outcome.result.data.draft_preview.warning,
        'Preview only — no capability or routing files were changed.',
      );
      assert.deepEqual(readFileSync(f.protectedPath), Buffer.from('{"protected":true}\n'));
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});

test('suggestion family exposes no list install publish or maintenance action', () => {
  const f = fixture();
  try {
    for (const action of ['list', 'install', 'publish', 'reset', 'dispose', 'recover']) {
      const outcome = f.run('suggestion', action);
      assert.equal(outcome.exitCode, 2);
      assert.equal(outcome.result.reason_code, 'invalid_arguments');
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
