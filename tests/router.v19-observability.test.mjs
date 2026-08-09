import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts', 'v19-observability-report.mjs');

function writeJsonl(path, values) {
  writeFileSync(path, `${values.map((value) => typeof value === 'string' ? value : JSON.stringify(value)).join('\n')}\n`, { mode: 0o600 });
}

function runtimeFixture(root, runtime) {
  const router = join(root, 'router');
  mkdirSync(join(router, 'receipts'), { recursive: true });
  mkdirSync(join(router, 'health'), { recursive: true });
  return {
    router,
    telemetry: join(router, 'telemetry.jsonl'),
    shadow: join(router, 'shadow-log.jsonl'),
    receipts: join(router, 'receipts', 'receipts.jsonl'),
    audit: join(router, 'audit.jsonl'),
    outcomes: join(router, 'health', 'outcomes.jsonl'),
    runtime,
  };
}

test('v1.9 observability report correlates bounded runtime evidence and classifies graph gaps', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-v19-observability-'));
  const claudeRoot = join(root, 'claude');
  const codexRoot = join(root, 'codex');
  const output = join(root, 'evidence.json');
  const claude = runtimeFixture(claudeRoot, 'claude');
  runtimeFixture(codexRoot, 'codex');
  const suggestionId = 'a'.repeat(64);
  const receiptId = 'b'.repeat(64);

  try {
    writeJsonl(claude.telemetry, [
      {
        ts: 1, runtime: 'claude', suggestion_id: suggestionId, route_id: 'route-selected',
        suggested_mode: 'skill:build', suggested_skills: [], suggested_agents: [],
        graph_status: 'graph_missing', prompt_signature: 'c'.repeat(64),
        outcome: null, downstream_invocations: null, prompt: 'SENTINEL_RAW_PROMPT',
        cwd: 'SENTINEL_CWD', command: 'SENTINEL_COMMAND', stdout: 'SENTINEL_STDOUT',
      },
      {
        ts: 2, runtime: 'claude', suggestion_id: 'd'.repeat(64), route_id: 'route-rejected',
        suggested_mode: 'skill:blocked', suggested_skills: [], suggested_agents: [],
        graph_status: 'ok', prompt_signature: 'e'.repeat(64), outcome: null, downstream_invocations: null,
      },
      {
        ts: 3, runtime: 'claude', suggestion_id: 'f'.repeat(64), route_id: null,
        suggested_mode: null, suggested_skills: [], suggested_agents: [],
        graph_status: 'not_triggered', prompt_signature: null, outcome: null, downstream_invocations: null,
      },
      '{ malformed raw SENTINEL_RAW_LINE }',
    ]);
    writeJsonl(claude.shadow, [
      { runtime: 'claude', suggestion_id: 'd'.repeat(64), outcome: 'rejected', prompt_signature: 'e'.repeat(64) },
    ]);
    writeJsonl(claude.receipts, [{
      receipt_id: receiptId,
      invocation_identity: {
        runtime: 'claude', adapter: 'claude-dispatch/1', pid: 123,
        identity: { route_id: 'route-selected' },
        native_identity: { runtime: 'claude', source: 'native' },
        command: 'SENTINEL_COMMAND', args: ['SENTINEL_ARG'],
      },
      route_state: 'completed',
      completion_evidence: { state: 'completed', exit_code: 0, stdout_sha256: '1'.repeat(64) },
      bounded_evidence: { suggestion_id: suggestionId, body: 'SENTINEL_BODY' },
      postcondition_evidence: { receipt_id: receiptId, verified: true },
      prompt: 'SENTINEL_RAW_PROMPT', cwd: 'SENTINEL_CWD', stdout: 'SENTINEL_STDOUT',
    }]);
    writeJsonl(claude.outcomes, [{ runtime: 'claude', outcome_kind: 'completed', route_id: 'route-selected' }]);
    writeJsonl(claude.audit, [{ runtime: 'claude', outcome: 'completed', reason: 'verified' }]);

    const result = spawnSync(process.execPath, [SCRIPT, '--claude-root', claudeRoot, '--codex-root', codexRoot, '--output', output], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(output, 'utf8'));
    const live = report.runtimes.claude;
    assert.equal(live.telemetry.records, 3);
    assert.equal(live.telemetry.malformed_lines, 1);
    assert.equal(live.telemetry.route_anchor_records, 2);
    assert.equal(live.telemetry.outcome_null_records, 3);
    assert.equal(live.correlation.receipt_linked_records, 1);
    assert.equal(live.correlation.shadow_linked_records, 1);
    assert.equal(live.correlation.outcome_counts.completed, 1);
    assert.equal(live.correlation.outcome_counts.rejected, 1);
    assert.equal(live.correlation.outcome_counts.ignored, 1);
    assert.equal(live.receipts.verified_completion_records, 1);
    assert.equal(live.receipts.native_identity_records, 1);
    assert.equal(live.correlation.health_linked_records, 1);
    assert.equal(live.graph.graph_missing.count, 1);
    assert.equal(live.graph.graph_missing.state, 'open');
    assert.equal(live.graph.graph_missing.remediation, 'provide_local_graph_or_mark_not_applicable');
    assert.equal(live.health.outcome_kind_counts.completed, 1);
    assert.equal(live.audit.records, 1);
    assert.equal(report.privacy.raw_jsonl_lines, false);
    assert.equal(report.privacy.raw_prompt, false);
    assert.equal(report.privacy.raw_commands, false);
    const serialized = JSON.stringify(report);
    for (const sentinel of ['SENTINEL_RAW_PROMPT', 'SENTINEL_CWD', 'SENTINEL_COMMAND', 'SENTINEL_STDOUT', 'SENTINEL_BODY', 'SENTINEL_RAW_LINE']) {
      assert.equal(serialized.includes(sentinel), false, `privacy leak: ${sentinel}`);
    }
    assert.deepEqual(report.runtimes.codex.graph.graph_missing, {
      count: 0,
      state: 'resolved',
      reason_code: 'local_graph_available_or_not_required',
      remediation: 'none',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
