// Plan 32-03 Task 3 — ROUTE-05 resolve-list tie-lint + stale-target quarantine.
// Turns the remaining 32-01 cross-runtime Group C tie-lint RED surface GREEN via the
// deterministic resolve-tie-lint gate (scripts/resolve-tie-lint.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { lintModeMap, commandInventory, routeTargetInventory, TIE_GAP } from '../scripts/resolve-tie-lint.mjs';

function mkManifest(commandNames, runtimeCommands, skills = []) {
  return {
    commands: commandNames.map((name) => ({ name })),
    skills: skills.map((name) => ({ name })),
    ...(runtimeCommands ? { runtime_commands: runtimeCommands } : {}),
  };
}

const COMMANDS = ['a', 'b', 'gsd-debug', 'systematic-debugging'];

test('commandInventory: flat commands[] form the present inventory', () => {
  const inv = commandInventory(mkManifest(['gsd-debug', 'plan']), { runtime: 'claude' });
  assert.ok(inv.has('gsd-debug'));
  assert.ok(inv.has('plan'));
  assert.ok(!inv.has('ghost'));
});

test('commandInventory: runtime_commands slice is runtime-conditional', () => {
  const manifest = mkManifest(['gsd-debug'], { claude: ['gsd-debug'], codex: ['systematic-debugging'] });
  assert.ok(commandInventory(manifest, { runtime: 'claude' }).has('gsd-debug'));
  assert.ok(!commandInventory(manifest, { runtime: 'claude' }).has('systematic-debugging'));
  assert.ok(commandInventory(manifest, { runtime: 'codex' }).has('systematic-debugging'));
  assert.ok(!commandInventory(manifest, { runtime: 'codex' }).has('gsd-debug'),
    'flat commands must not leak when an active runtime slice exists');
});

test('routeTargetInventory: slash routes may resolve routeable skills', () => {
  const manifest = mkManifest([], null, ['gsd-debug']);
  assert.ok(routeTargetInventory(manifest).has('gsd-debug'));
  const { violations } = lintModeMap({ entries: [{
    id: 'debug', mode: 'gsd-debug', invoke_kind: 'slash',
    resolve: [{ name: 'gsd-debug', weight: 1 }],
  }] }, manifest);
  assert.deepEqual(violations, []);
});

test('tie-lint: a single-member resolve list is never a near-tie', () => {
  const modeMap = {
    entries: [{
      id: 'x', mode: 'x', invoke_kind: 'slash',
      resolve: [{ name: 'gsd-debug', weight: 1 }],
    }],
  };
  const { violations, downgradedTiers } = lintModeMap(modeMap, mkManifest(COMMANDS));
  assert.equal(violations.length, 0);
  assert.ok(!(downgradedTiers.x));
});

test('tie-lint: a near-tie (weights within gap) downgrades the route to med (Group C GREEN)', () => {
  const modeMap = {
    entries: [{
      id: 'capability', mode: 'a', invoke_kind: 'slash',
      resolve: [
        { name: 'a', weight: 1.0 },
        { name: 'b', weight: 0.98 }, // within TIE_GAP of the top -> near-tie
      ],
    }],
  };
  const { violations, downgradedTiers } = lintModeMap(modeMap, mkManifest(COMMANDS));
  const nearTie = violations.find((v) => v.type === 'near_tie');
  assert.ok(nearTie, 'expected a near_tie violation');
  assert.equal(downgradedTiers.capability, 'med',
    'near-tie route must never ship at a confident tier — downgraded to med');
});

test('tie-lint: weights exactly at the gap boundary are NOT a near-tie', () => {
  const modeMap = {
    entries: [{
      id: 'edge', mode: 'a', invoke_kind: 'slash',
      resolve: [
        { name: 'a', weight: 1.0 },
        { name: 'b', weight: 1.0 - TIE_GAP },
      ],
    }],
  };
  const { violations } = lintModeMap(modeMap, mkManifest(COMMANDS));
  assert.ok(!violations.some((v) => v.type === 'near_tie'),
    'members exactly TIE_GAP apart are not a near-tie');
});

test('tie-lint: weights omitted implies an unresolvable rank near-tie', () => {
  const modeMap = {
    entries: [{
      id: 'ranked', mode: 'a', invoke_kind: 'slash',
      resolve: [{ name: 'a' }, { name: 'b' }],
    }],
  };
  const { violations, downgradedTiers } = lintModeMap(modeMap, mkManifest(COMMANDS));
  assert.ok(violations.some((v) => v.type === 'near_tie'));
  assert.equal(downgradedTiers.ranked, 'med');
});

test('tie-lint: an absent resolve member is quarantined, never slipped through (Group C GREEN)', () => {
  const modeMap = {
    entries: [{
      id: 'debug', mode: 'gsd-debug', invoke_kind: 'slash',
      resolve: [
        { name: 'gsd-debug', weight: 1.0 },
        { name: 'ghost-capability', weight: 0.9 }, // absent from the active manifest
      ],
    }],
  };
  const { violations, quarantined } = lintModeMap(modeMap, mkManifest(COMMANDS));
  const stale = violations.filter((v) => v.type === 'stale_target' && v.target === 'ghost-capability');
  assert.equal(stale.length, 1, 'the absent resolve member must be flagged stale_target');
  assert.ok(Array.isArray(quarantined.debug) && quarantined.debug.includes('ghost-capability'),
    'the absent member must be quarantined');
  assert.ok(!violations.some((v) => v.target === 'gsd-debug'),
    'a present resolve member must NOT be quarantined');
});

test('tie-lint: framework-neutral — never invents a capability for a non-command', () => {
  const modeMap = {
    entries: [{
      id: 'frameworkish', mode: 'missing-tool', invoke_kind: 'slash',
      resolve: [{ name: 'missing-tool', weight: 1.0 }],
    }],
  };
  const { violations, quarantined } = lintModeMap(modeMap, mkManifest(COMMANDS));
  const stale = violations.find((v) => v.type === 'stale_target');
  assert.ok(stale && stale.target === 'missing-tool', 'absent member must be flagged stale_target');
  assert.ok(quarantined.frameworkish && quarantined.frameworkish.includes('missing-tool'),
    'an absent member must never be treated as a present capability');
});
