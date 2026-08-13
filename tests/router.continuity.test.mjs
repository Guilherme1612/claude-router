import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildContinuityBriefing } from '../src/context/continuity.mjs';
import { routeContextPrompt } from '../src/context/prompt-route.mjs';

const evidence = {
  status: 'fresh',
  value: {
    workflow: 'gsd-execute-phase', phase: '71', plan: '01', task: '2', status: 'active',
    blockers: [{ status: 'open' }], action: 'continue_workflow',
  },
};

test('continuity briefing reports bounded trusted fields without raw content', () => {
  const output = buildContinuityBriefing({
    event: 'SessionStart', evidence, route: 'adaptive',
    budget: { context_bytes: 512, injected_bytes: 128, tool_calls: 2 },
    explicitOverride: 'available',
  });
  assert.match(output, /Done:/);
  assert.match(output, /Current: gsd-execute-phase \/ 71 \/ 01 \/ 2/);
  assert.match(output, /Blocked: 1 open blocker/);
  assert.match(output, /Next: continue_workflow/);
  assert.match(output, /Route: adaptive/);
  assert.match(output, /Budget: context=512, injected=128, tools=2/);
  assert.match(output, /Owner action: resolve_blockers/);
  assert.match(output, /override="available"/);
  assert.ok(Buffer.byteLength(output) <= 2048);
  assert.doesNotMatch(output, /prompt|output|Users|private/);
});

test('unresolved evidence stays unknown and direct override is honored', () => {
  const output = buildContinuityBriefing({ evidence: { status: 'unresolved' }, route: 'direct', explicitOverride: 'honored' });
  assert.match(output, /source="unresolved"/);
  assert.match(output, /unknown \(fresh evidence unavailable\)/);
  assert.match(output, /override="honored"/);
  assert.match(output, /owner_confirmation_required/);
});

test('SessionStart and Stop paths emit bounded continuity without dispatching semantic routing', () => {
  const root = mkdtempSync(join(tmpdir(), 'router-continuity-'));
  try {
    for (const hookEventName of ['SessionStart', 'Stop']) {
      const routed = routeContextPrompt({
        prompt: '', ownedRoot: root, projectRoot: root, hookEventName, routingMode: 'pass_through',
      });
      assert.equal(routed.handled, false);
      assert.match(routed.additional_context, /router-continuity/);
      assert.match(routed.additional_context, /event="(SessionStart|Stop)"/);
      assert.match(routed.additional_context, /override="honored"/);
      assert.doesNotMatch(routed.additional_context, /dispatch="true"|semantic routing/);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
