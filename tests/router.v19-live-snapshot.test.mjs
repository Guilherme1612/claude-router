import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(REPO_ROOT, 'scripts', 'v19-live-snapshot.mjs');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function writeJson(path, value) {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(path, bytes);
  return bytes;
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'router-v19-snapshot-'));
  const claudeRoot = join(root, '.claude');
  const codexRoot = join(root, '.codex');
  const ownedRoot = join(claudeRoot, 'router');
  const codexOwnedRoot = join(codexRoot, 'router');
  mkdirSync(join(claudeRoot, 'hooks'), { recursive: true });
  mkdirSync(join(codexRoot, 'hooks'), { recursive: true });
  mkdirSync(join(ownedRoot, 'controller'), { recursive: true });
  mkdirSync(join(ownedRoot, 'release-tuples'), { recursive: true });
  mkdirSync(codexOwnedRoot, { recursive: true });
  const sourceRouter = join(root, 'router.mjs');
  const sourceEvolve = join(root, 'router.evolve.mjs');
  const ownedFile = join(ownedRoot, 'owned.json');
  writeFileSync(sourceRouter, 'export const router = true;\n');
  writeFileSync(sourceEvolve, 'export const evolve = true;\n');
  writeFileSync(ownedFile, '{"owned":true}\n');
  writeFileSync(join(claudeRoot, 'user-notes.md'), 'private prompt-like sentinel: do not serialize\n');
  writeFileSync(join(claudeRoot, 'telemetry.jsonl'), '{"raw":"raw telemetry body"}\n');
  writeFileSync(join(root, 'outside.txt'), 'outside sentinel must not be read\n');
  writeJson(join(claudeRoot, 'settings.json'), {
    theme: 'dark',
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: 'user-hook' }] }],
      UserPromptSubmit: [{ managed_by: 'claude-router', router_path: join(claudeRoot, 'hooks', 'router.mjs') }],
    },
  });
  writeJson(join(codexRoot, 'hooks.json'), {
    hooks: { UserPromptSubmit: [{ managed_by: 'claude-router', router_path: join(codexRoot, 'hooks', 'router.mjs') }] },
  });
  writeJson(join(claudeRoot, 'hooks', 'router.mjs'), { not: 'the real hook; only hash it' });
  writeJson(join(codexRoot, 'hooks', 'router.mjs'), { not: 'the real hook; only hash it' });
  writeJson(join(ownedRoot, 'controller', 'config.json'), { schema_version: 1, state_path: 'controller/scan-state.json' });
  writeJson(join(ownedRoot, 'controller', 'status.json'), {
    state: 'ready', heartbeat: 100, pid: 1, instance_id: 'instance-1', configuration_fingerprint: 'config-hash',
    reconciliation: {
      activation_reason: 'verification_non_passing', activation_status: 'preserved', disposition: 'eligible',
      verification: { disposition: 'non_passing', complete: true, gate_count: 8, failed_gate_ids: ['latency'], verification_fingerprint: 'verify-hash', raw: 'omit me' },
    },
  });
  writeJson(join(ownedRoot, 'controller', 'request.json'), { schema_version: 1, action: 'none' });
  writeJson(join(ownedRoot, 'controller', 'scan-state.json'), { schema_version: 1, state: 'idle', generation: 2 });
  writeJson(join(ownedRoot, 'release-tuples', 'active.json'), { schema_version: 2, tuple_version_id: 'tuple-1' });
  writeJson(join(ownedRoot, 'active.json'), { version_id: 'version-1' });
  mkdirSync(join(ownedRoot, 'candidate'), { recursive: true });
  writeJson(join(ownedRoot, 'candidate', 'registry.json'), { records: [], raw: 'raw candidate body' });
  writeJson(join(ownedRoot, 'candidate', 'report.json'), { status: 'verified', raw: 'raw report body' });
  const manifest = {
    schema_version: 1,
    state: 'complete',
    roots: { claude: claudeRoot, codex: codexRoot },
    files: [{ path: ownedFile, fingerprint: sha256(readFileSync(ownedFile)) }],
    bindings: [],
  };
  writeJson(join(ownedRoot, 'install-manifest.json'), manifest);
  writeJson(join(codexOwnedRoot, 'installed.json'), { schema_version: 1, managed_by: 'claude-router' });
  return { root, claudeRoot, codexRoot, ownedRoot, codexOwnedRoot, sourceRouter, sourceEvolve };
}

function run(f, output, extra = []) {
  return spawnSync(process.execPath, [SCRIPT,
    '--claude-root', f.claudeRoot,
    '--codex-root', f.codexRoot,
    '--source-router', f.sourceRouter,
    '--source-evolve', f.sourceEvolve,
    '--output', output,
    ...extra,
  ], { encoding: 'utf8' });
}

test('live snapshot is explicit-root, allowlisted, and stable apart from capture time', () => {
  const f = fixture();
  try {
    const firstPath = join(f.root, 'first.json');
    const secondPath = join(f.root, 'second.json');
    const first = run(f, firstPath);
    assert.equal(first.status, 0, first.stderr);
    const second = run(f, secondPath);
    assert.equal(second.status, 0, second.stderr);
    const a = JSON.parse(readFileSync(firstPath));
    const b = JSON.parse(readFileSync(secondPath));
    delete a.captured_at;
    delete b.captured_at;
    assert.deepEqual(a, b);
    assert.equal(a.source.router.sha256, sha256(readFileSync(f.sourceRouter)));
    assert.equal(a.runtimes.claude.controller.status.fields.state, 'ready');
    assert.deepEqual(a.runtimes.claude.controller.status.fields.reconciliation.verification, {
      disposition: 'non_passing', complete: true, gate_count: 8, failed_gate_ids: ['latency'], verification_fingerprint: 'verify-hash',
    });
    assert.equal(a.runtimes.claude.active_tuple.fields.tuple_version_id, 'tuple-1');
    assert.equal(a.runtimes.codex.ownership_marker.exists, true);
    const serialized = JSON.stringify(a);
    assert.doesNotMatch(serialized, /private prompt-like sentinel|raw telemetry body|raw candidate body|outside sentinel/);
    assert.doesNotMatch(serialized, /"(?:prompt|session|telemetry|audit|history|body)"\s*:/i);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('invalid ownership paths fail before creating snapshot output', () => {
  const f = fixture();
  try {
    const manifestPath = join(f.ownedRoot, 'install-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath));
    manifest.files[0].path = join(f.root, 'outside.txt');
    writeJson(manifestPath, manifest);
    const output = join(f.root, 'invalid.json');
    const result = run(f, output);
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(output), false);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
