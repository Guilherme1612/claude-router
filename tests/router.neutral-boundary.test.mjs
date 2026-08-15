import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { installNeutralRouter, uninstallNeutralRouter } from '../src/lifecycle/neutral-lifecycle.mjs';

const INSTALLER = join(dirname(dirname(fileURLToPath(import.meta.url))), 'install-router.mjs');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'router-neutral-'));
  const claudeRoot = join(root, 'claude-runtime');
  const codexRoot = join(root, 'codex-runtime');
  const stateRoot = join(root, 'neutral-state');
  const settingsPath = join(claudeRoot, 'settings.json');
  const codexHooksPath = join(codexRoot, 'hooks.json');
  mkdirSync(claudeRoot, { recursive: true });
  mkdirSync(codexRoot, { recursive: true });
  mkdirSync(join(claudeRoot, 'skills'), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify({ hooks: { UserPromptSubmit: [{ managed_by: 'unrelated' }] } }, null, 2));
  writeFileSync(codexHooksPath, JSON.stringify({ hooks: { UserPromptSubmit: [{ managed_by: 'unrelated' }] } }, null, 2));
  writeFileSync(join(claudeRoot, 'skills', 'arbitrary.md'), 'unrelated capability data');
  return { root, claudeRoot, codexRoot, stateRoot, settingsPath, codexHooksPath };
}

function runHook(path, runtime, stateRoot, payload) {
  return spawnSync(process.execPath, [path], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ROUTER_RUNTIME: runtime, ROUTER_STATE_ROOT: stateRoot },
  });
}

test('neutral installation requires explicit roots and never creates runtime-local router state', async () => {
  const f = fixture();
  try {
    await assert.rejects(
      installNeutralRouter({ stateRoot: f.stateRoot }),
      /at least one explicit runtime root/,
    );
    await assert.rejects(
      installNeutralRouter({ claudeRoot: f.claudeRoot }),
      /explicit neutral state root/,
    );
    await assert.rejects(
      installNeutralRouter({ claudeRoot: f.claudeRoot, stateRoot: join(f.claudeRoot, 'state') }),
      /outside the repository and runtime roots/,
    );
    await assert.rejects(
      installNeutralRouter({ claudeRoot: f.claudeRoot, stateRoot: join(f.root, '.router') }),
      /cannot be \.router|outside the repository and runtime roots/,
    );

    const result = await installNeutralRouter({
      claudeRoot: f.claudeRoot,
      codexRoot: f.codexRoot,
      stateRoot: f.stateRoot,
      nodeBinary: process.execPath,
    });
    assert.equal(result.status, 'installed');
    assert.equal(existsSync(join(f.claudeRoot, 'router')), false);
    assert.equal(existsSync(join(f.codexRoot, 'router')), false);
    assert.equal(existsSync(join(f.root, '.router')), false);
    assert.equal(existsSync(join(f.stateRoot, 'install-manifest.json')), true);
    assert.equal(readFileSync(result.claudeHookPath, 'utf8'), readFileSync(result.codexHookPath, 'utf8'));

    const settings = JSON.parse(readFileSync(f.settingsPath, 'utf8'));
    assert.equal(settings.hooks.UserPromptSubmit.some(group => group.managed_by === 'unrelated'), true);
    assert.equal(settings.hooks.SessionStart.length, 1);
    assert.match(settings.hooks.SessionStart[0].hooks[0].command, /ROUTER_STATE_ROOT/);
    assert.doesNotMatch(readFileSync(result.claudeHookPath, 'utf8'), /GSD|Superpowers|graphify|\.claude|\.codex/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('public installer has no personal-home fallback', () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ![
    'CLAUDE_CONFIG_ROOT', 'CODEX_CONFIG_ROOT', 'ROUTER_STATE_ROOT',
  ].includes(key)));
  const result = spawnSync(process.execPath, [INSTALLER, '--dry-run'], { encoding: 'utf8', env });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /explicit neutral state root|explicit runtime root/);
});

test('neutral hook is privacy-safe and leaves prompt submission untouched', async () => {
  const f = fixture();
  try {
    const result = await installNeutralRouter({
      claudeRoot: f.claudeRoot,
      stateRoot: f.stateRoot,
      nodeBinary: process.execPath,
    });
    const prompt = 'private prompt that must not be persisted';
    const cwd = '/private/developer/path';
    const promptRun = runHook(result.claudeHookPath, 'claude', f.stateRoot, {
      hook_event_name: 'UserPromptSubmit', prompt, cwd, session_id: 'session-1',
    });
    assert.equal(promptRun.status, 0);
    assert.equal(promptRun.stdout, '');

    const startRun = runHook(result.claudeHookPath, 'claude', f.stateRoot, {
      hook_event_name: 'SessionStart', cwd, session_id: 'session-1',
    });
    assert.equal(startRun.status, 0);
    const output = JSON.parse(startRun.stdout);
    assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(output.hookSpecificOutput.additionalContext, /Done: neutral runtime active/);
    assert.doesNotMatch(output.hookSpecificOutput.additionalContext, /private|developer|output/);

    const events = readFileSync(join(f.stateRoot, 'events.jsonl'), 'utf8');
    assert.doesNotMatch(events, /private prompt|developer\/path/);
    assert.match(events, /"event":"UserPromptSubmit"/);
    assert.match(events, /"prompt_hash":"[a-f0-9]{64}"/);
    assert.equal(existsSync(join(f.claudeRoot, 'router')), false);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('explicit neutral capability data enables deterministic owner-controlled selection', async () => {
  const f = fixture();
  try {
    const result = await installNeutralRouter({
      claudeRoot: f.claudeRoot,
      stateRoot: f.stateRoot,
      nodeBinary: process.execPath,
    });
    writeFileSync(join(f.stateRoot, 'capabilities.json'), JSON.stringify({ capabilities: [
      { id: 'data-inspector', keywords: ['data', 'relationship'], runtimes: ['claude'], enabled: true, state: 'dispatchable', dispatchable: true, invocation: { method: 'native', target: 'data-inspector' }, authority: { kind: 'owner-controlled' } },
      { id: 'other', keywords: ['data'], runtimes: ['codex'], enabled: true, state: 'dispatchable', dispatchable: true, invocation: { method: 'native', target: 'other' }, authority: { kind: 'owner-controlled' } },
    ] }));
    const run = runHook(result.claudeHookPath, 'claude', f.stateRoot, {
      hook_event_name: 'UserPromptSubmit',
      prompt: 'inspect this data relationship',
      session_id: 'session-2',
    });
    assert.equal(run.status, 0);
    assert.match(run.stdout, /route=data-inspector/);
    assert.doesNotMatch(run.stdout, /inspect this data relationship/);
    assert.match(readFileSync(join(f.stateRoot, 'events.jsonl'), 'utf8'), /"route":"data-inspector"/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('neutral runtime accepts the normalized manifest records shape without changing trust gates', async () => {
  const f = fixture();
  try {
    const result = await installNeutralRouter({ claudeRoot: f.claudeRoot, stateRoot: f.stateRoot, nodeBinary: process.execPath });
    writeFileSync(join(f.stateRoot, 'capabilities.json'), JSON.stringify({
      schema_version: 1,
      records: [{
        stable_id: 'manifest:data-inspector', name: 'data inspector', type: 'skill',
        roles: ['relationship'], runtime: 'claude', state: 'dispatchable', dispatchable: true,
        invocation: { method: 'skill', target: 'data-inspector' },
        authority: { ceiling: 'inspect', evidence: 'installed' },
        privacy: { raw_content: false },
      }],
    }));
    const run = runHook(result.claudeHookPath, 'claude', f.stateRoot, {
      hook_event_name: 'UserPromptSubmit', prompt: 'inspect this relationship', session_id: 'manifest-record',
    });
    assert.equal(run.status, 0);
    assert.match(run.stdout, /route=manifest:data-inspector/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('neutral runtime quarantines metadata-only and malformed descriptors and preserves pass-through', async () => {
  const f = fixture();
  try {
    const result = await installNeutralRouter({ claudeRoot: f.claudeRoot, stateRoot: f.stateRoot, nodeBinary: process.execPath });
    writeFileSync(join(f.stateRoot, 'capabilities.json'), JSON.stringify({ capabilities: [
      { id: 'metadata-only', keywords: ['data'], enabled: true },
      { id: 'unsafe', keywords: ['data'], state: 'dispatchable', dispatchable: true, invocation: { method: 'native' } },
    ] }));
    const run = runHook(result.claudeHookPath, 'claude', f.stateRoot, { hook_event_name: 'UserPromptSubmit', prompt: 'inspect this data', session_id: 'session-quarantine' });
    assert.equal(run.status, 0);
    assert.equal(run.stdout, '');
    assert.match(readFileSync(join(f.stateRoot, 'events.jsonl'), 'utf8'), /"route":"pass_through"/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('neutral runtime never dispatches a descriptor with unknown authority evidence', async () => {
  const f = fixture();
  try {
    const result = await installNeutralRouter({ claudeRoot: f.claudeRoot, stateRoot: f.stateRoot, nodeBinary: process.execPath });
    writeFileSync(join(f.stateRoot, 'capabilities.json'), JSON.stringify({ capabilities: [{
      id: 'unknown-authority', keywords: ['data'], state: 'dispatchable', dispatchable: true,
      invocation: { method: 'command', target: 'unknown-authority' },
      authority: { ceiling: 'inspect', evidence: 'unknown' },
    }] }));
    const run = runHook(result.claudeHookPath, 'claude', f.stateRoot, {
      hook_event_name: 'UserPromptSubmit', prompt: 'inspect this data', session_id: 'session-unknown-authority',
    });
    assert.equal(run.status, 0);
    assert.equal(run.stdout, '');
    assert.match(readFileSync(join(f.stateRoot, 'events.jsonl'), 'utf8'), /"route":"pass_through"/);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('neutral runtime stays pass-through when the active runtime identity is unknown', async () => {
  const f = fixture();
  try {
    const result = await installNeutralRouter({ claudeRoot: f.claudeRoot, stateRoot: f.stateRoot, nodeBinary: process.execPath });
    writeFileSync(join(f.stateRoot, 'capabilities.json'), JSON.stringify({ capabilities: [{
      id: 'unknown-runtime', keywords: ['data'], state: 'dispatchable', dispatchable: true,
      invocation: { method: 'command', target: 'unknown-runtime' }, authority: { kind: 'inspect' },
    }] }));
    const run = runHook(result.claudeHookPath, 'future-runtime', f.stateRoot, {
      hook_event_name: 'UserPromptSubmit', prompt: 'inspect this data', session_id: 'session-unknown-runtime',
    });
    assert.equal(run.status, 0);
    assert.equal(run.stdout, '');
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('neutral runtime recognizes universal command, agent, and skill identity aliases', async () => {
  const f = fixture();
  try {
    const result = await installNeutralRouter({ claudeRoot: f.claudeRoot, stateRoot: f.stateRoot, nodeBinary: process.execPath });
    writeFileSync(join(f.stateRoot, 'capabilities.json'), JSON.stringify({ capabilities: [
      {
        id: 'custom:release-command', name: 'Release Command', type: 'command',
        aliases: ['ship it'], runtime: 'claude', state: 'dispatchable', dispatchable: true,
        invocation: { method: 'command', target: 'release' },
        authority: { ceiling: 'owner-controlled', evidence: 'installed' },
      },
      {
        id: 'custom:review-agent', name: 'Review Agent', type: 'agent', role: 'review',
        relationships: { aliases: ['audit changes'] }, runtime: 'claude', state: 'dispatchable', dispatchable: true,
        invocation: { method: 'agent', target: 'review-agent' },
        authority: { ceiling: 'owner-controlled', evidence: 'installed' },
      },
      {
        id: 'custom:test-skill', name: 'Test Skill', type: 'skill', roles: ['verification'],
        keywords: ['test suite'], runtime: 'claude', state: 'dispatchable', dispatchable: true,
        invocation: { method: 'skill', target: 'test-skill' },
        authority: { ceiling: 'owner-controlled', evidence: 'installed' },
      },
    ] }));

    const prompts = [
      ['ship it', 'custom:release-command'],
      ['audit changes', 'custom:review-agent'],
      ['run the test suite', 'custom:test-skill'],
    ];
    for (const [prompt, id] of prompts) {
      const run = runHook(result.claudeHookPath, 'claude', f.stateRoot, {
        hook_event_name: 'UserPromptSubmit', prompt, session_id: `session-${id}`,
      });
      assert.equal(run.status, 0);
      assert.match(run.stdout, new RegExp(`route=${id}`));
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('neutral command recognition is runtime-parity safe for Claude and Codex roots', async () => {
  const f = fixture();
  try {
    const result = await installNeutralRouter({ claudeRoot: f.claudeRoot, codexRoot: f.codexRoot, stateRoot: f.stateRoot, nodeBinary: process.execPath });
    writeFileSync(join(f.stateRoot, 'capabilities.json'), JSON.stringify({ capabilities: [{
      id: 'custom:shared-review', type: 'future-agent', aliases: ['review this'],
      runtimes: ['claude', 'codex'], state: 'dispatchable', dispatchable: true,
      invocation: { method: 'command', target: 'shared-review' },
      authority: { ceiling: 'inspect', evidence: 'installed' },
    }] }));
    for (const [runtime, hook] of [['claude', result.claudeHookPath], ['codex', result.codexHookPath]]) {
      const run = runHook(hook, runtime, f.stateRoot, {
        hook_event_name: 'UserPromptSubmit', prompt: 'please review this', session_id: `session-${runtime}`,
      });
      assert.equal(run.status, 0);
      assert.match(run.stdout, /route=custom:shared-review/);
    }
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('neutral uninstall preserves unrelated hooks and user event history', async () => {
  const f = fixture();
  try {
    const result = await installNeutralRouter({
      claudeRoot: f.claudeRoot,
      codexRoot: f.codexRoot,
      stateRoot: f.stateRoot,
      nodeBinary: process.execPath,
    });
    runHook(result.claudeHookPath, 'claude', f.stateRoot, { hook_event_name: 'Stop', session_id: 'session-1' });
    const uninstalled = await uninstallNeutralRouter({
      claudeRoot: f.claudeRoot,
      codexRoot: f.codexRoot,
      stateRoot: f.stateRoot,
    });
    assert.equal(uninstalled.status, 'uninstalled');
    assert.equal(existsSync(result.claudeHookPath), false);
    assert.equal(existsSync(join(f.stateRoot, 'events.jsonl')), true);
    assert.equal(existsSync(join(f.stateRoot, 'install-manifest.json')), false);
    const settings = JSON.parse(readFileSync(f.settingsPath, 'utf8'));
    assert.equal(settings.hooks.UserPromptSubmit.some(group => group.managed_by === 'unrelated'), true);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('neutral uninstall rejects a manifest binding outside the installed runtime before mutation', async () => {
  const f = fixture();
  try {
    await installNeutralRouter({ claudeRoot: f.claudeRoot, stateRoot: f.stateRoot, nodeBinary: process.execPath });
    const foreignSettings = join(f.root, 'foreign-settings.json');
    const foreignBytes = JSON.stringify({ hooks: { SessionStart: [{ managed_by: 'sentinel' }] } }, null, 2) + '\n';
    writeFileSync(foreignSettings, foreignBytes);
    const manifestPath = join(f.stateRoot, 'install-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.bindings.push({ settings_path: foreignSettings, event: 'SessionStart', router_path: join(f.root, 'foreign-hook.mjs') });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    const settingsBefore = readFileSync(f.settingsPath, 'utf8');
    await assert.rejects(
      uninstallNeutralRouter({ claudeRoot: f.claudeRoot, stateRoot: f.stateRoot }),
      /neutral ownership manifest path is invalid/,
    );
    assert.equal(readFileSync(f.settingsPath, 'utf8'), settingsBefore);
    assert.equal(readFileSync(foreignSettings, 'utf8'), foreignBytes);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('neutral uninstall rejects a manifest file outside the installed state before mutation', async () => {
  const f = fixture();
  try {
    await installNeutralRouter({ claudeRoot: f.claudeRoot, stateRoot: f.stateRoot, nodeBinary: process.execPath });
    const foreignFile = join(f.root, 'foreign-router.mjs');
    const foreignBytes = 'preserve this file\n';
    writeFileSync(foreignFile, foreignBytes);
    const manifestPath = join(f.stateRoot, 'install-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    manifest.files.push({ path: foreignFile, fingerprint: '0'.repeat(64) });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    const settingsBefore = readFileSync(f.settingsPath, 'utf8');
    await assert.rejects(
      uninstallNeutralRouter({ claudeRoot: f.claudeRoot, stateRoot: f.stateRoot }),
      /neutral ownership manifest path is invalid/,
    );
    assert.equal(readFileSync(f.settingsPath, 'utf8'), settingsBefore);
    assert.equal(readFileSync(foreignFile, 'utf8'), foreignBytes);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
