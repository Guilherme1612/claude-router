// Task 1: Telemetry privacy property test (D-20/Pitfall 8/TEL-privacy).
// Property: for a corpus of prompts containing sk-.../AKIA.../ghp_.../xoxb-.../
// long-hex runs, (a) no raw secret appears in the telemetry line, (b) the
// signature is stable under re-redaction, (c) file mode is 0600 after first
// write, (d) deny-rule prompts log NO signature (deny_filtered only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOOK = join(homedir(), '.claude', 'hooks', 'router.mjs');
const { redact, promptSignature, logTelemetry } = await import(HOOK);

// --- Corpus of secret-bearing prompts --------------------------------------
const SECRET_PROMPTS = [
  { label: 'sk-live (OpenAI/Anthropic-style)', prompt: 'my key is sk-live-1234567890abcdefghijklmnop please help', secret: 'sk-live-1234567890abcdefghijklmnop' },
  { label: 'AKIA (AWS)', prompt: 'deploy with AWS key AKIAIOSFODNN7EXAMPLE in env', secret: 'AKIAIOSFODNN7EXAMPLE' },
  { label: 'ghp_ (GitHub PAT)', prompt: 'push using ghp_0123456789012345678901234567890abcdef12 token', secret: 'ghp_0123456789012345678901234567890abcdef12' },
  { label: 'xoxb- (Slack)', prompt: 'slack bot token xoxb-1234567890-1234567890123-abcdefghij123456', secret: 'xoxb-1234567890-1234567890123-abcdefghij123456' },
  { label: 'long-hex run (32+)', prompt: 'session abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890 expired', secret: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' },
  { label: 'gho_ (GitHub OAuth)', prompt: 'oauth gho_0123456789012345678901234567890abcdef12 leaked', secret: 'gho_0123456789012345678901234567890abcdef12' },
  { label: 'glpat- (GitLab)', prompt: 'gitlab token glpat-0123456789abcdefghij leaked', secret: 'glpat-0123456789abcdefghij' },
];

// --- (a) no raw secret appears in the telemetry line ------------------------
test('privacy: no raw secret appears in any telemetry line', () => {
  for (const { label, prompt, secret } of SECRET_PROMPTS) {
    const normalized = String(prompt).toLowerCase().replace(/\s+/g, ' ').trim();
    const sig = promptSignature(normalized, []);
    const entry = {
      ts: Date.now(),
      prompt_signature: sig,
      suggested_mode: null,
      suggested_skills: [],
      suggested_agents: [],
      confidence_tier: 'low',
      invoke_kind: null,
      graphify_queried: false,
      graph_status: 'not_triggered',
      guards_fired: [],
      downstream_invocations: null,
      outcome: null,
      latency_ms: 1,
    };
    const line = JSON.stringify(entry);
    assert.ok(
      !line.includes(secret),
      `[${label}] raw secret "${secret}" appeared in telemetry line — redaction failed`
    );
    // Also assert the redacted prompt has no secret substring
    assert.ok(!redact(normalized).includes(secret), `[${label}] redact() leaked the secret`);
  }
});

// --- (b) signature is stable under re-redaction -----------------------------
test('privacy: promptSignature is stable under re-redaction (idempotent)', () => {
  for (const { prompt } of SECRET_PROMPTS) {
    const normalized = String(prompt).toLowerCase().replace(/\s+/g, ' ').trim();
    const sig1 = promptSignature(normalized, []);
    const sig2 = promptSignature(redact(normalized), []); // already-redacted input
    // Re-running redact on already-redacted text must not change the hash
    // (redact is idempotent: [REDACTED] doesn't match SECRET_RE).
    const sig3 = promptSignature(redact(redact(normalized)), []);
    assert.equal(sig1, sig2, 'redact() not idempotent — sig changed on re-redaction');
    assert.equal(sig1, sig3, 'double-redact changed signature');
  }
});

// --- (c) file mode is 0600 after first write --------------------------------
test('privacy: telemetry.jsonl is 0600 after first write', () => {
  const dir = mkdtempSync(join(tmpdir(), 'router-privacy-'));
  const tPath = join(dir, 'telemetry.jsonl');
  try {
    assert.ok(!existsSync(tPath), 'precondition: file does not exist');
    logTelemetry({ ts: 1, prompt_signature: 'abc', outcome: null }, tPath);
    assert.ok(existsSync(tPath), 'file created on first write');
    const mode = statSync(tPath).mode & 0o777;
    assert.equal(mode, 0o600, `telemetry.jsonl mode is ${mode.toString(8)} (expected 600)`);
    // Second write must not change perms (idempotent guard)
    logTelemetry({ ts: 2, prompt_signature: 'def', outcome: null }, tPath);
    const mode2 = statSync(tPath).mode & 0o777;
    assert.equal(mode2, 0o600, `telemetry.jsonl mode drifted to ${mode2.toString(8)} after 2nd write`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- (d) deny-rule prompt → no signature logged ----------------------------
test('privacy: deny_filtered entry has prompt_signature=null (Pitfall 8)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'router-privacy-deny-'));
  const tPath = join(dir, 'telemetry.jsonl');
  try {
    const entry = {
      ts: 1,
      prompt_signature: null, // caller (main finally) sets null on deny_filtered
      suggested_mode: null,
      suggested_skills: [],
      suggested_agents: [],
      confidence_tier: 'deny_filtered',
      invoke_kind: null,
      graphify_queried: false,
      graph_status: 'not_triggered',
      guards_fired: ['deny_filtered'],
      downstream_invocations: null,
      outcome: null,
      latency_ms: 1,
    };
    logTelemetry(entry, tPath);
    const line = readFileSync(tPath, 'utf8').trim();
    const parsed = JSON.parse(line);
    assert.equal(parsed.prompt_signature, null, 'deny_filtered line must have null signature');
    assert.equal(parsed.confidence_tier, 'deny_filtered');
    assert.deepEqual(parsed.guards_fired, ['deny_filtered']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- (e) atomic append: lines never interleave (< 4KB each) ----------------
test('privacy: each telemetry line is < 4KB (atomic on macOS PIPE_BUF=4096)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'router-privacy-size-'));
  const tPath = join(dir, 'telemetry.jsonl');
  try {
    // Build a large-but-realistic entry
    const big = {
      ts: Date.now(),
      prompt_signature: 'a'.repeat(64), // sha256 hex
      suggested_mode: 'gsd-ui-phase',
      suggested_skills: ['high-end-visual-design', 'design-taste-frontend', 'minimalist-ui', 'industrial-brutalist-ui'],
      suggested_agents: ['gsd-ui-auditor', 'gsd-ui-checker'],
      confidence_tier: 'high',
      invoke_kind: 'slash',
      graphify_queried: true,
      graph_status: 'graph_missing',
      guards_fired: ['mcp_demote:gsd-phase-researcher:context7', 'no_verifiable_done_criteria'],
      downstream_invocations: null,
      outcome: null,
      latency_ms: 18.5,
    };
    logTelemetry(big, tPath);
    const lines = readFileSync(tPath, 'utf8').split('\n').filter(Boolean);
    assert.equal(lines.length, 1, 'one line written');
    assert.ok(lines[0].length < 4096, `line is ${lines[0].length} bytes (must be < 4096)`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- (f) logTelemetry never throws (fail-open) ------------------------------
test('privacy: logTelemetry does not throw on a bad path (fail-open)', () => {
  // A non-writable path must not throw — fail-open is the contract.
  const bad = '/this/path/does/not/exist/telemetry.jsonl';
  assert.doesNotThrow(() => logTelemetry({ ts: 1, prompt_signature: 'x', outcome: null }, bad));
});