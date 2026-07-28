import assert from 'node:assert/strict';
import { constants, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ingestTelemetryEvidence } from '../src/health/observe.mjs';
import { dispose, recover, reset } from '../src/health/admin.mjs';
import { runRouterControl } from '../src/cli/router-control.mjs';
import { routeContextPrompt } from '../src/context/prompt-route.mjs';
import { refreshSuggestionPointer } from '../src/steward/refresh.mjs';
import { compileStartupPointer, loadStartupPointer } from '../src/steward/startup-pointer.mjs';

const NOW = 1_800_000_000_000;
const FINGERPRINT = 'a'.repeat(64);
const NOTICE = 'Router suggestion available — inspect with /router suggestion';
const AVAILABLE = {
  schema_version: 1,
  policy_version: 'steward-policy-v1',
  fingerprint: FINGERPRINT,
  available: true,
  cooldown_until_ms: null,
};
const OBSERVATION = {
  observation_kind: 'missing_dependency',
  reason_code: 'missing_dependency',
  remedy: 'review_contract',
  freshness: 'fresh',
  evidence_window_ms: 1,
  sample_size: 3,
  confidence_basis_points: 9000,
  affected_capability_ids: ['skill:a', 'skill:b'],
};

function root(prefix = 'router-steward-startup-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function telemetryFixture() {
  const ownedRoot = root('router-steward-observe-');
  const telemetryPath = join(ownedRoot, 'telemetry.jsonl');
  const workflowStatePath = join(ownedRoot, 'workflow-state.json');
  const cursorPath = join(ownedRoot, 'cursor.json');
  writeFileSync(telemetryPath, `${JSON.stringify({
    ts: NOW,
    prompt_signature: 'b'.repeat(64),
    suggested_skills: [{ canonical_identity: 'skill:debug', scope: { kind: 'global' } }],
    suggested_agents: [],
    confidence_tier: 'high',
    guards_fired: [],
    route_id: 'route-1',
  })}\n`);
  writeFileSync(workflowStatePath, '{}\n');
  return { ownedRoot, telemetryPath, workflowStatePath, cursorPath };
}

test('successful evidence append refreshes exactly once; no-write paths do not refresh', () => {
  const fixture = telemetryFixture();
  let refreshes = 0;
  let stored = 0;
  const store = {
    append() {
      stored += 1;
      return stored === 1 ? { status: 'stored' } : { status: 'denied' };
    },
  };
  try {
    const args = {
      ...fixture,
      store,
      now: NOW,
      refreshSuggestionPointerFn: () => { refreshes += 1; },
    };
    assert.equal(ingestTelemetryEvidence(args).ingested, 1);
    assert.equal(refreshes, 1);
    writeFileSync(fixture.cursorPath, JSON.stringify({
      size: statSync(fixture.telemetryPath).size,
      mtimeMs: statSync(fixture.telemetryPath).mtimeMs,
      workflowStateMtimeMs: statSync(fixture.workflowStatePath).mtimeMs,
      recordCount: 1,
    }));
    assert.equal(ingestTelemetryEvidence(args).skipped, 'unchanged');
    assert.equal(refreshes, 1);
    rmSync(fixture.cursorPath);
    assert.equal(ingestTelemetryEvidence(args).ingested, 0);
    assert.equal(refreshes, 1);
  } finally {
    rmSync(fixture.ownedRoot, { recursive: true, force: true });
  }
});

test('successful health mutations refresh exactly once and failed dispose does not', () => {
  const ownedRoot = root('router-steward-admin-');
  const healthRoot = join(ownedRoot, 'health');
  let refreshes = 0;
  const args = {
    ownedRoot,
    healthRoot,
    refreshSuggestionPointerFn: () => { refreshes += 1; },
  };
  try {
    assert.equal(dispose(args).ok, false);
    assert.equal(refreshes, 0);
    assert.equal(reset(args).ok, true);
    assert.equal(refreshes, 1);
    assert.equal(dispose(args).ok, true);
    assert.equal(refreshes, 2);
    assert.equal(recover(args).ok, true);
    assert.equal(refreshes, 3);
  } finally {
    rmSync(ownedRoot, { recursive: true, force: true });
  }
});

test('successful suggestion interaction refreshes once; stale and blocked writes do not', () => {
  const ownedRoot = root('router-steward-cli-refresh-');
  let refreshes = 0;
  const state = { schema_version: 1, dismissed: {}, snoozed_until: {}, cooldown_at: {} };
  const dependencies = {
    now: () => NOW,
    stewardObservations: [OBSERVATION],
    refreshSuggestionPointer: () => { refreshes += 1; },
    createStewardStore: () => ({
      stewardRoot: join(ownedRoot, 'steward'),
      readState: () => state,
      dismiss: fingerprint => {
        state.dismissed[fingerprint] = NOW;
        return { status: 'stored', fingerprint };
      },
    }),
  };
  try {
    const inspect = runRouterControl({
      argv: ['suggestion', '--owned-root', ownedRoot],
      dependencies,
    });
    const fingerprint = inspect.result.data.suggestion.fingerprint;
    assert.equal(refreshes, 1);
    const stale = runRouterControl({
      argv: ['suggestion', 'dismiss', '--confirm', 'f'.repeat(64), '--owned-root', ownedRoot],
      dependencies,
    });
    assert.equal(stale.exitCode, 4);
    assert.equal(refreshes, 1);
    const dismissed = runRouterControl({
      argv: ['suggestion', 'dismiss', '--confirm', fingerprint, '--owned-root', ownedRoot],
      dependencies,
    });
    assert.equal(dismissed.exitCode, 0);
    assert.equal(refreshes, 2);
  } finally {
    rmSync(ownedRoot, { recursive: true, force: true });
  }
});

test('refresh producer derives one pointer from fixed authoritative inputs', () => {
  const ownedRoot = root('router-steward-producer-');
  const calls = [];
  try {
    const result = refreshSuggestionPointer({
      ownedRoot,
      now: NOW,
      dependencies: {
        loadInputs: () => ({
          registry: [], relationships: {}, contracts: new Map(), outcomes: [],
          state: { schema_version: 1, dismissed: {}, snoozed_until: {}, cooldown_at: {} },
        }),
        deriveObservations: () => ({ observations: [OBSERVATION] }),
        selectSuggestion: () => ({
          reason_code: 'suggestion_selected',
          suggestion: { fingerprint: FINGERPRINT },
        }),
        startupPointer: () => AVAILABLE,
        compileStartupPointer: value => { calls.push(value); return { status: 'stored' }; },
      },
    });
    assert.equal(result.status, 'stored');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].pointer, AVAILABLE);
    assert.equal(calls[0].ownedRoot, ownedRoot);
  } finally {
    rmSync(ownedRoot, { recursive: true, force: true });
  }
});

test('compile atomically replaces stale availability with a 0600 bounded record', () => {
  const ownedRoot = root('router-steward-compile-');
  try {
    assert.equal(compileStartupPointer({ ownedRoot, pointer: AVAILABLE }).status, 'stored');
    const path = join(ownedRoot, 'steward', 'startup-pointer.json');
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), AVAILABLE);
    const unavailable = { ...AVAILABLE, fingerprint: null, available: false };
    assert.equal(compileStartupPointer({ ownedRoot, pointer: unavailable }).status, 'stored');
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), unavailable);
  } finally {
    rmSync(ownedRoot, { recursive: true, force: true });
  }
});

test('load performs one fixed bounded read and fails silent on missing corrupt oversized or expired input', () => {
  const ownedRoot = root('router-steward-load-');
  const pointerPath = join(ownedRoot, 'steward', 'startup-pointer.json');
  mkdirSync(join(ownedRoot, 'steward'), { recursive: true });
  try {
    assert.equal(loadStartupPointer({ ownedRoot, now: NOW }).available, false);
    writeFileSync(pointerPath, '{bad');
    assert.equal(loadStartupPointer({ ownedRoot, now: NOW }).available, false);
    writeFileSync(pointerPath, 'x'.repeat(5000));
    assert.equal(loadStartupPointer({ ownedRoot, now: NOW }).available, false);
    compileStartupPointer({
      ownedRoot,
      pointer: { ...AVAILABLE, cooldown_until_ms: NOW - 1 },
    });
    assert.equal(loadStartupPointer({ ownedRoot, now: NOW }).available, false);

    compileStartupPointer({ ownedRoot, pointer: AVAILABLE });
    const opened = [];
    const fs = {
      openSync(path, flags) {
        opened.push(path);
        assert.equal(flags & constants.O_RDONLY, constants.O_RDONLY);
        return 11;
      },
      fstatSync: () => ({ isFile: () => true, size: Buffer.byteLength(`${JSON.stringify(AVAILABLE)}\n`) }),
      readSync(_fd, buffer) {
        return buffer.write(`${JSON.stringify(AVAILABLE)}\n`);
      },
      closeSync: () => {},
      readdirSync: () => { throw new Error('directory discovery forbidden'); },
    };
    assert.equal(loadStartupPointer({ ownedRoot, now: NOW, fs }).available, true);
    assert.deepEqual(opened, [pointerPath]);
  } finally {
    rmSync(ownedRoot, { recursive: true, force: true });
  }
});

test('startup adds only the approved line from the pointer loader', () => {
  const ownedRoot = root('router-steward-route-');
  try {
    const silent = routeContextPrompt({
      prompt: 'ordinary prompt',
      ownedRoot,
      projectRoot: ownedRoot,
      loadStartupPointerFn: () => ({ available: false }),
    });
    assert.deepEqual(silent, { handled: false, reason_code: 'instruction_not_contextual' });
    const available = routeContextPrompt({
      prompt: 'ordinary prompt',
      ownedRoot,
      projectRoot: ownedRoot,
      loadStartupPointerFn: () => AVAILABLE,
    });
    assert.deepEqual(available, {
      handled: false,
      reason_code: 'instruction_not_contextual',
      additional_context: NOTICE,
    });
    assert.doesNotMatch(JSON.stringify(available), new RegExp(FINGERPRINT));
  } finally {
    rmSync(ownedRoot, { recursive: true, force: true });
  }
});

test('UserPromptSubmit consumer has no producer, health, discovery, history, network, or model reference', () => {
  const source = readFileSync(new URL('../src/context/prompt-route.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /refreshSuggestionPointer|src\/health|health\/|deriveObservations|selectSuggestion|readdir|history|telemetry|fetch\s*\(|node:https?|model/i);
});
