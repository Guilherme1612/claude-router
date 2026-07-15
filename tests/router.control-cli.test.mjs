import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { PRODUCTION_GATE_RUNNERS, REQUIRED_ACTIVATION_GATES } from '../src/registry/validate.mjs';
import { activateCandidate, writeImmutableVersion } from '../src/registry/activate.mjs';
import { runRouterControl } from '../src/cli/router-control.mjs';
import { stableStringify } from '../src/registry/schema.mjs';

const CLI = new URL('../src/cli/router-control.mjs', import.meta.url);
const hash = value => createHash('sha256').update(stableStringify(value)).digest('hex');

function productionVerification(exact, now) {
  const gates = REQUIRED_ACTIVATION_GATES.map(id => {
    const runner = PRODUCTION_GATE_RUNNERS[id];
    const gate = { id, runner_id: runner.id, runner_version: runner.version, passed: true, reason_code: 'passed', threshold: runner.threshold, measured: {} };
    return { ...gate, evidence_fingerprint: hash(gate) };
  });
  const canonical = {
    schema_version: 1, verification_policy_version: 'activation-verification-v1', trusted: true, complete: true,
    generated_at: now, expires_at: now + 300_000, required_gate_ids: [...REQUIRED_ACTIVATION_GATES],
    candidate_fingerprint: hash(exact.candidate), reconciliation_fingerprint: hash(exact.reconciliation),
    mapping_fingerprint: hash(exact.mapping), policy_fingerprint: hash(exact.policy),
    gates, disposition: 'passing', test_only: false,
  };
  return { ...canonical, verification_fingerprint: hash(canonical) };
}

function resealVerification(verification) {
  const { verification_fingerprint: _ignored, ...canonical } = verification;
  return { ...canonical, verification_fingerprint: hash(canonical) };
}

function snapshot(root) {
  const walk = directory => readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [[path.slice(root.length + 1), readFileSync(path).toString('base64'), statSync(path).mode]];
  });
  return walk(root);
}

async function fixture({ count = 1 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'router-control-'));
  const baseNow = Date.now();
  const make = async (generation, subject, target) => {
    const records = Array.from({ length: count }, (_, index) => ({ id: count === 1 ? target : `${target}-${String(index).padStart(3, '0')}`, lifecycle: 'ready', dispatchable: true, invocation: { command: 'safe' } }));
    const subjects = Array.from({ length: count }, (_, index) => {
      const subjectId = count === 1 ? subject : `${subject}-${String(index).padStart(3, '0')}`;
      const targetId = records[index].id;
      return { subject_id: subjectId, target_id: targetId, disposition: 'mapped', reason_code: 'explicit_metadata', winning_rule: 'explicit_metadata', confidence: { score: 1, band: 'authoritative' }, alternatives: [], evidence: [{ tier: 1, rule: 'explicit_metadata', accepted: true, target_id: targetId, reason_code: 'accepted' }] };
    });
    const candidate = { schema_version: 1, generation, records };
    const mapping = { schema_version: 1, policy_version: 'mapping-v1', policy_fingerprint: `policy-${generation}`, report_fingerprint: `mapping-${generation}`, subjects };
    const reconciliation = { disposition: 'eligible', verdicts: [] };
    const policy = { policy_version: 'mapping-v1' };
    const exact = { candidate, mapping, reconciliation, policy };
    const now = baseNow + generation;
    const verification = productionVerification(exact, now);
    return activateCandidate({ ownedRoot: root, ...exact, verification, now, reason: 'fixture' });
  };
  const first = await make(1, 'alpha', 'target-a');
  const second = await make(2, 'alpha', 'target-b');
  return { root, first, second };
}

function run(root, ...args) {
  return spawnSync(process.execPath, [CLI.pathname, ...args, '--owned-root', root], { encoding: 'utf8' });
}

test('read-only controls share stable canonical JSON and never mutate owned bytes', async () => {
  const f = await fixture();
  try {
    for (const args of [['status'], ['registry', 'verify'], ['diff'], ['explain', 'alpha']]) {
      const before = snapshot(f.root);
      const first = run(f.root, ...args, '--format', 'json');
      const second = run(f.root, ...args, '--format', 'json');
      assert.equal(first.status, 0, first.stderr);
      assert.equal(first.stdout, second.stdout);
      const result = JSON.parse(first.stdout);
      assert.deepEqual(Object.keys(result), ['command', 'data', 'ok', 'reason_code', 'schema_version', 'warnings']);
      assert.deepEqual(snapshot(f.root), before);
    }
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('diff supports active-to-latest and two explicit immutable versions', async () => {
  const f = await fixture();
  try {
    const implicit = JSON.parse(run(f.root, 'diff', '--format', 'json').stdout);
    const explicit = JSON.parse(run(f.root, 'diff', f.first.version_id, f.second.version_id, '--format', 'json').stdout);
    assert.equal(implicit.data.source.version_id, f.second.version_id);
    assert.equal(explicit.data.source.version_id, f.first.version_id);
    assert.equal(explicit.data.destination.version_id, f.second.version_id);
    assert.deepEqual(explicit.data.mapping_changes, [{ subject_id: 'alpha', from: 'target-a', to: 'target-b' }]);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('large diff and rollback preview expose deterministic bounded totals in JSON and text', async () => {
  const f = await fixture({ count: 300 });
  try {
    const args = ['diff', f.first.version_id, f.second.version_id];
    const firstJson = run(f.root, ...args, '--format', 'json');
    const secondJson = run(f.root, ...args, '--format', 'json');
    assert.equal(firstJson.status, 0, firstJson.stderr);
    assert.equal(firstJson.stdout, secondJson.stdout);
    const data = JSON.parse(firstJson.stdout).data;
    assert.deepEqual(data.record_changes_meta, { total: 600, returned: 256, truncated: true, limit: 256, next_offset: 256 });
    assert.deepEqual(data.mapping_changes_meta, { total: 300, returned: 256, truncated: true, limit: 256, next_offset: 256 });
    assert.equal(data.record_changes.length, 256);
    assert.equal(data.mapping_changes.length, 256);

    const text = run(f.root, ...args, '--format', 'text');
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, new RegExp(`RECORD_CHANGES_META ${stableStringify(data.record_changes_meta)}`));
    assert.match(text.stdout, new RegExp(`MAPPING_CHANGES_META ${stableStringify(data.mapping_changes_meta)}`));

    const preview = JSON.parse(run(f.root, 'rollback', f.first.version_id, '--format', 'json').stdout).data;
    assert.deepEqual(preview.record_changes_meta, data.record_changes_meta);
    assert.deepEqual(preview.mapping_changes_meta, data.mapping_changes_meta);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('explain exposes complete deterministic mapping evidence and filters', async () => {
  const f = await fixture();
  try {
    const result = JSON.parse(run(f.root, 'explain', 'alpha', '--format', 'json').stdout);
    assert.equal(result.data.subject.disposition, 'mapped');
    assert.equal(result.data.subject.winning_rule, 'explicit_metadata');
    assert.ok(Array.isArray(result.data.subject.evidence));
    assert.ok(Array.isArray(result.data.subject.alternatives));
    assert.ok(result.data.filters);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('rollback is detailed preview-first and exact confirmation is mandatory', async () => {
  const f = await fixture();
  try {
    const before = snapshot(f.root);
    const preview = JSON.parse(run(f.root, 'rollback', f.first.version_id, '--format', 'json').stdout);
    assert.equal(preview.data.preview.destination.version_id, f.first.version_id);
    assert.equal(preview.data.mutation.type, 'active_pointer_replacement_only');
    assert.ok(preview.data.preview.preview_fingerprint);
    assert.deepEqual(snapshot(f.root), before);
    assert.equal(run(f.root, 'rollback', f.first.version_id, '--execute', '--confirm', 'yes').status, 2);
    const executed = run(f.root, 'rollback', f.first.version_id, '--execute', '--confirm', f.first.version_id, '--format', 'json');
    assert.equal(executed.status, 0, executed.stderr);
    assert.equal(JSON.parse(executed.stdout).data.rollback.rollback_status, 'rolled_back');
    assert.equal(JSON.parse(readFileSync(join(f.root, 'active.json'), 'utf8')).version_id, f.first.version_id);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('interactive execution reads exact destination and errors use stable exit taxonomy', async () => {
  const f = await fixture();
  try {
    const mismatch = spawnSync(process.execPath, [CLI.pathname, 'rollback', f.first.version_id, '--execute', '--owned-root', f.root], { encoding: 'utf8', input: 'yes\n' });
    assert.equal(mismatch.status, 2);
    const invalid = run(f.root, 'registry', 'verify', 'not-a-version', '--format', 'json');
    assert.equal(invalid.status, 3);
    assert.equal(JSON.parse(invalid.stdout).reason_code, 'invalid_version_id');
    const missing = run(f.root, 'rollback', 'v1-0000000000000000', '--format', 'json');
    assert.equal(missing.status, 4);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('operator output is portable and bounded', async () => {
  const f = await fixture();
  try {
    const output = run(f.root, 'status', '--format', 'json').stdout;
    assert.doesNotMatch(output, new RegExp(f.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(output, /prompt|secret|api[_-]?key/i);
    assert.doesNotMatch(output, /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('verification-to-pointer destination replacement fails closed', async () => {
  const f = await fixture();
  try {
    const activeBefore = readFileSync(join(f.root, 'active.json'), 'utf8');
    const outcome = runRouterControl({
      argv: ['rollback', f.first.version_id, '--execute', '--confirm', f.first.version_id, '--owned-root', f.root, '--format', 'json'],
      dependencies: {
        rollbackIo: {
          beforeRename() {
            writeFileSync(join(f.root, 'versions', f.first.version_id, 'registry.json'), '{"substituted":true}\n');
          },
        },
      },
    });
    assert.equal(outcome.exitCode, 4);
    assert.equal(outcome.result.reason_code, 'verification_to_pointer_toctou');
    assert.equal(readFileSync(join(f.root, 'active.json'), 'utf8'), activeBefore);
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test('corrupt active history returns stable recovery guidance before projection', async () => {
  for (const corrupt of ['manifest', 'registry']) {
    const f = await fixture();
    try {
      const path = join(f.root, 'versions', f.second.version_id, corrupt === 'manifest' ? 'manifest.json' : 'registry.json');
      writeFileSync(path, '{corrupt');
      for (const args of [['status'], ['diff'], ['explain', 'alpha'], ['rollback', f.first.version_id]]) {
        const json = run(f.root, ...args, '--format', 'json');
        assert.notEqual(json.status, 0, `${corrupt}:${args.join(' ')}`);
        const result = JSON.parse(json.stdout);
        assert.equal(result.reason_code, 'invalid_active_version');
        assert.equal(result.data.source_verdict.reason_code, corrupt === 'manifest' ? 'malformed_version' : 'file_mismatch');
        assert.equal(result.data.next_action, 'run_registry_recovery');
        const text = run(f.root, ...args, '--format', 'text');
        assert.notEqual(text.status, 0);
        assert.match(text.stdout, /REASON invalid_active_version/);
        assert.match(text.stdout, /NEXT_ACTION run_registry_recovery/);
        assert.doesNotMatch(text.stdout, /internal_error|stack/i);
      }
    } finally { await rm(f.root, { recursive: true, force: true }); }
  }

  const f = await fixture();
  try {
    const now = Date.now();
    const candidate = { schema_version: 1, records: [], generation: 99 };
    const mapping = { schema_version: 1, subjects: [], summary: { disposition: 'complete', ambiguous: 0 } };
    const reconciliation = { disposition: 'eligible', verdicts: [] };
    const policy = { policy_version: 'mapping-v1' };
    const exact = { candidate, mapping, reconciliation, policy };
    const verification = resealVerification({ ...productionVerification(exact, now), test_only: true });
    const unsafe = writeImmutableVersion({ ownedRoot: f.root, ...exact, verification, now });
    writeFileSync(join(f.root, 'active.json'), `${JSON.stringify({ schema_version: 1, version_id: unsafe.version_id, bundle_fingerprint: unsafe.bundle_fingerprint, previous_version_id: f.second.version_id, reason: 'fixture', sequence: 3 })}\n`);
    const result = run(f.root, 'diff', '--format', 'json');
    assert.notEqual(result.status, 0);
    const body = JSON.parse(result.stdout);
    assert.equal(body.reason_code, 'invalid_active_version');
    assert.equal(body.data.source_verdict.reason_code, 'verification_not_trusted');
  } finally { await rm(f.root, { recursive: true, force: true }); }
});
