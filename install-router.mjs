#!/usr/bin/env node
// install-router.mjs — additive UserPromptSubmit binding installer for ~/.claude/settings.json
//
// Idempotent, atomic (temp+rename), additive-only: appends exactly ONE top-level
// hooks.UserPromptSubmit entry pointing at the router hook via the absolute node binary
// every existing hook already uses. Never touches any other hook event, statusLine,
// enabledPlugins, permissions, extraKnownMarketplaces, effortLevel, or theme.
//
// After writing, runs a before/after diff audit proving the ONLY delta is the new
// UserPromptSubmit key. Prints the summary + rollback instructions.
//
// Pure stdlib, zero deps. ESM.
//
// Usage:
//   node install-router.mjs                                  # live install (defaults)
//   node install-router.mjs --settings <path> --backup <path> # test against temp files
//
// Flags (all optional, defaults are the live ~/.claude paths):
//   --settings <path>      settings.json to mutate (default ~/.claude/settings.json)
//   --backup <path>        backup path (default <settings>.pre-router)
//   --router <path>        router hook path (default ~/.claude/hooks/router.mjs)
//   --node-binary <path>   node binary (default /Users/guilherme/.hermes/node/bin/node)

import { readFileSync, writeFileSync, renameSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOME = os.homedir();
const DEFAULT_SETTINGS = path.join(HOME, '.claude', 'settings.json');
const DEFAULT_ROUTER = path.join(HOME, '.claude', 'hooks', 'router.mjs');
const DEFAULT_NODE = '/Users/guilherme/.hermes/node/bin/node';

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i > -1 && process.argv[i + 1] !== undefined) return process.argv[i + 1];
  return fallback;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function countHookEntries(hooks) {
  const counts = {};
  for (const k of Object.keys(hooks)) {
    counts[k] = Array.isArray(hooks[k]) ? hooks[k].length : 0;
  }
  return counts;
}

function fail(msg) {
  console.error('INSTALL FAILED: ' + msg);
  console.error('Rollback: cp "' + backupPath + '" "' + settingsPath + '"');
  process.exit(1);
}

const settingsPath = arg('settings', DEFAULT_SETTINGS);
const backupPath = arg('backup', settingsPath + '.pre-router');
const routerPath = arg('router', DEFAULT_ROUTER);
const nodeBinary = arg('node-binary', DEFAULT_NODE);

// --- Step 1: read + parse current settings ---
if (!existsSync(settingsPath)) {
  fail('settings.json not found at ' + settingsPath);
}
let preText, pre;
try {
  preText = readFileSync(settingsPath, 'utf8');
  pre = JSON.parse(preText);
} catch (e) {
  fail('could not read/parse ' + settingsPath + ': ' + e.message);
}
if (!pre || typeof pre !== 'object') fail('settings.json is not a JSON object');
if (!pre.hooks || typeof pre.hooks !== 'object') fail('settings.json has no hooks object');

// --- Step 2: backup (idempotent — skip if backup already exists) ---
let backupCreated;
if (existsSync(backupPath)) {
  backupCreated = false;
  console.log('backup already exists, skipped: ' + backupPath);
} else {
  copyFileSync(settingsPath, backupPath);
  backupCreated = true;
  console.log('backup created: ' + backupPath);
}

// --- Step 3: idempotency check — if a router.mjs UserPromptSubmit entry exists, no-op ---
const existing = pre.hooks.UserPromptSubmit;
if (Array.isArray(existing) && existing.some(
  (g) => Array.isArray(g?.hooks) && g.hooks.some(
    (h) => typeof h?.command === 'string' && h.command.includes('router.mjs')
  )
)) {
  console.log('already installed: hooks.UserPromptSubmit contains a router.mjs entry — no-op');
  // No delta to audit — verify the existing entry is well-formed, then exit 0.
  verifyExistingShape(pre);
  console.log('\nIdempotent no-op. Router is installed.');
  process.exit(0);
}

// --- Step 4: append the ONE additive UserPromptSubmit entry (NO matcher) ---
const command = `"${nodeBinary}" "${routerPath}"`;
const newEntry = {
  hooks: [
    { type: 'command', command, timeout: 5 },
  ],
};
const post = JSON.parse(preText); // preserve key order of the original
post.hooks.UserPromptSubmit = [newEntry];

// --- Step 5: atomic write (temp + rename) ---
const tmp = settingsPath + '.tmp.' + process.pid;
try {
  writeFileSync(tmp, JSON.stringify(post, null, 2) + '\n');
  renameSync(tmp, settingsPath);
} catch (e) {
  fail('atomic write failed: ' + e.message);
}

// --- Step 6: diff audit — prove ONLY the new UserPromptSubmit key was added ---
let postRead;
try {
  postRead = JSON.parse(readFileSync(settingsPath, 'utf8'));
} catch (e) {
  fail('post-install settings.json is unparseable: ' + e.message);
}
audit(pre, postRead);

console.log('\nINSTALL OK. Router is live on every prompt via hooks.UserPromptSubmit.');
console.log('Rollback command: cp "' + backupPath + '" "' + settingsPath + '"');
process.exit(0);

// --- verifyExistingShape: idempotent no-op path — confirm the present entry is well-formed ---
function verifyExistingShape(obj) {
  const ups = obj.hooks.UserPromptSubmit;
  if (!Array.isArray(ups) || ups.length !== 1) {
    fail('existing UserPromptSubmit must have exactly 1 entry, got ' + (Array.isArray(ups) ? ups.length : 'non-array'));
  }
  const group = ups[0];
  if (group.matcher !== undefined && group.matcher !== null) {
    fail('existing UserPromptSubmit must NOT have a matcher, got: ' + JSON.stringify(group.matcher));
  }
  if (!Array.isArray(group.hooks) || group.hooks.length !== 1) {
    fail('existing UserPromptSubmit group must have exactly 1 hook');
  }
  const h = group.hooks[0];
  if (h.type !== 'command') fail('existing UserPromptSubmit hook type must be "command"');
  if (typeof h.command !== 'string' || !h.command.includes(nodeBinary) || !h.command.includes(routerPath)) {
    fail('existing UserPromptSubmit command must contain node binary + router path');
  }
  if (h.timeout !== 5) fail('existing UserPromptSubmit timeout must be 5');
  console.log('existing hooks.UserPromptSubmit verified: 1 group, 1 hook, command=' + JSON.stringify(h.command) + ', timeout=5, no matcher');
}

// --- audit: compare pre and post, assert additive-only delta ---
function audit(preObj, postObj) {
  const preTop = Object.keys(preObj).sort();
  const postTop = Object.keys(postObj).sort();
  if (!deepEqual(preTop, postTop)) {
    fail('top-level keys changed: pre=[' + preTop + '] post=[' + postTop + ']');
  }
  // Every top-level key except hooks must be byte-identical.
  for (const k of preTop) {
    if (k === 'hooks') continue;
    if (!deepEqual(preObj[k], postObj[k])) {
      fail('top-level key "' + k + '" was modified');
    }
  }
  // hooks: only the UserPromptSubmit key may be new; every other event deep-equal.
  const preHookKeys = Object.keys(preObj.hooks).sort();
  const postHookKeys = Object.keys(postObj.hooks).sort();
  const added = postHookKeys.filter((k) => !preHookKeys.includes(k));
  const removed = preHookKeys.filter((k) => !postHookKeys.includes(k));
  if (removed.length) fail('hooks events removed: ' + removed.join(', '));
  if (added.length !== 1 || added[0] !== 'UserPromptSubmit') {
    fail('expected exactly one new hooks key (UserPromptSubmit), got: [' + added.join(', ') + ']');
  }
  for (const k of preHookKeys) {
    if (!deepEqual(preObj.hooks[k], postObj.hooks[k])) {
      fail('hooks event "' + k + '" was modified');
    }
  }
  // Entry counts per event unchanged (belt-and-braces on top of deep-equal).
  const preCounts = countHookEntries(preObj.hooks);
  const postCounts = countHookEntries(postObj.hooks);
  for (const k of preHookKeys) {
    if (preCounts[k] !== postCounts[k]) {
      fail('entry count for hooks.' + k + ' changed: ' + preCounts[k] + ' -> ' + postCounts[k]);
    }
  }
  // UserPromptSubmit shape: exactly 1 group, 1 hook, correct command + timeout, NO matcher.
  const ups = postObj.hooks.UserPromptSubmit;
  if (!Array.isArray(ups) || ups.length !== 1) {
    fail('UserPromptSubmit must have exactly 1 entry, got ' + (Array.isArray(ups) ? ups.length : 'non-array'));
  }
  const group = ups[0];
  if (Array.isArray(group.matcher)) fail('UserPromptSubmit group must NOT have a matcher (array)');
  if (group.matcher !== undefined && group.matcher !== null) {
    fail('UserPromptSubmit group must NOT have a matcher, got: ' + JSON.stringify(group.matcher));
  }
  if (!Array.isArray(group.hooks) || group.hooks.length !== 1) {
    fail('UserPromptSubmit group must have exactly 1 hook, got ' + (Array.isArray(group.hooks) ? group.hooks.length : 'non-array'));
  }
  const h = group.hooks[0];
  if (h.type !== 'command') fail('UserPromptSubmit hook type must be "command", got ' + JSON.stringify(h.type));
  if (typeof h.command !== 'string' || !h.command.includes(nodeBinary)) {
    fail('UserPromptSubmit command must contain the absolute node binary ' + nodeBinary + ', got: ' + JSON.stringify(h.command));
  }
  if (typeof h.command !== 'string' || !h.command.includes(routerPath)) {
    fail('UserPromptSubmit command must contain the router path ' + routerPath + ', got: ' + JSON.stringify(h.command));
  }
  if (h.timeout !== 5) fail('UserPromptSubmit timeout must be 5, got ' + JSON.stringify(h.timeout));

  // Print the summary.
  const preEntryTotal = preHookKeys.reduce((a, k) => a + (Array.isArray(preObj.hooks[k]) ? preObj.hooks[k].length : 0), 0);
  const postEntryTotal = postHookKeys.reduce((a, k) => a + (Array.isArray(postObj.hooks[k]) ? postObj.hooks[k].length : 0), 0);
  console.log('');
  console.log('--- diff audit ---');
  console.log('top-level keys unchanged: ' + (deepEqual(preTop, postTop) ? 'OK' : 'FAIL'));
  console.log('top-level keys: ' + postTop.join(', '));
  console.log('hooks events: pre=' + preHookKeys.length + ' post=' + postHookKeys.length + ' (added: ' + added.join(', ') + ')');
  console.log('hook entry count: pre=' + preEntryTotal + ' post=' + postEntryTotal + ' (+1 UserPromptSubmit)');
  console.log('all non-hooks top-level keys: unchanged');
  console.log('all pre-existing hooks events: unchanged');
  console.log('new hooks.UserPromptSubmit: 1 group, 1 hook, command=' + JSON.stringify(h.command) + ', timeout=5, no matcher');
  const enabled = postObj.enabledPlugins;
  console.log('enabledPlugins intact: ' + (enabled ? Object.keys(enabled).length + ' (' + Object.keys(enabled).join(', ') + ')' : 'MISSING'));
  console.log('statusLine intact: ' + (postObj.statusLine ? 'yes' : 'MISSING'));
  console.log('--- diff audit PASSED ---');
}