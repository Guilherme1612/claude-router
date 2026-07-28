import { loadCapsule, saveCapsule } from './capsule.mjs';
import { normalizeContextInstruction, resolveContextAction } from './resolve.mjs';
import { assembleRefreshEvidence, collectAuthoritativeSnapshot } from './sources.mjs';
import { loadCompiledIndex } from '../prompt/compile-index.mjs';
import { loadStartupPointer } from '../steward/startup-pointer.mjs';

const MAX_CONTEXT_BYTES = 2048;
const SUGGESTION_NOTICE = 'Router suggestion available — inspect with /router suggestion';

function parseInstruction(prompt) {
  const referential = normalizeContextInstruction(prompt);
  if (referential.kind === 'referential') return referential;
  const normalized = String(prompt || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const match = normalized.match(/^(plan|execute|verify|review|finish|use)\s+(?:phase\s+)?([a-z0-9._-]+)(?:\s+(.+))?$/);
  if (!match) return { kind: 'none' };
  const [, action, phase, detail] = match;
  return {
    kind: 'explicit', complete: Boolean(action && phase), goal_id: `phase-${phase}`,
    workflow: action === 'plan' ? 'gsd-plan-phase' : action === 'execute' ? 'gsd-execute-phase' : 'explicit-workflow',
    phase, action, ...(detail ? { task: detail.slice(0, 128) } : {}),
  };
}

function refreshedCapsule(capsule, refresh, now) {
  return {
    ...capsule, position: { ...capsule.position, ...refresh.position }, status: refresh.status || capsule.status,
    freshness: { captured_at: now, generation: `refresh-${refresh.position?.phase || capsule.position.phase}` },
    provenance: { source: 'authoritative-refresh', version: '1' },
  };
}

function overrideCapsule(capsule, resolution, now) {
  const action = resolution.action;
  return {
    schema_version: capsule.schema_version, scope: capsule.scope,
    goal: { id: action.goal_id, summary: action.goal_id },
    position: { workflow: action.workflow || 'explicit', phase: action.phase || 'none', plan: action.plan || 'none', task: action.task || action.action || 'next' },
    status: 'active', artifacts: action.artifact_ref ? [{ ref: action.artifact_ref, type: 'artifact', status: 'next', witness: { kind: 'version', value: 'explicit' }, priority: 1 }] : [],
    blockers: [], freshness: { captured_at: now, generation: `override-${action.phase || 'explicit'}` },
    provenance: { source: 'explicit-instruction', version: '1' },
    ...(resolution.supersession ? { supersession: { workflow_identity: resolution.supersession.workflow_identity, reason: resolution.supersession.reason } } : {}),
  };
}

function injection(resolution) {
  const fields = [
    '<!-- router-inject -->',
    `<context-recovery outcome="${resolution.outcome}" reason="${resolution.reason_code}" dispatch="${resolution.dispatch_eligible}">`,
  ];
  if (resolution.dispatch_eligible) {
    fields.push(`Next workflow action: ${typeof resolution.action === 'string' ? resolution.action : JSON.stringify(resolution.action)}`);
    if (resolution.artifact_ref) fields.push(`Referenced artifact: ${resolution.artifact_ref}`);
  } else if (resolution.question) fields.push(resolution.question);
  else if (resolution.diagnostic) fields.push(resolution.diagnostic);
  fields.push('</context-recovery>');
  const value = fields.join('\n');
  return Buffer.byteLength(value) <= MAX_CONTEXT_BYTES ? value : '<!-- router-inject -->\n<context-recovery outcome="clarify" reason="bounded_output">Which workflow should I continue?</context-recovery>';
}

function authoritativeEvidence(capsule, projectRoot) {
  const artifact = (capsule.artifacts || []).find(entry => ['plan', 'artifact', 'source'].includes(entry.type));
  const execution = (capsule.artifacts || []).find(entry => entry.type === 'execution');
  const design = (capsule.artifacts || []).find(entry => entry.type === 'design');
  if (!artifact?.ref || !execution?.ref) return { status: 'unresolved', reason_code: 'identity_missing' };
  const snapshot = collectAuthoritativeSnapshot({
    workspaceRoot: projectRoot, phase: capsule.position.phase, artifactRef: artifact.ref,
    executionRef: execution.ref, designRef: design?.ref || 'docs/design.md',
  });
  const s = snapshot.sources || {};
  const authoritative = {
    workflow: s.execution?.value?.workflow,
    phase: s.execution?.value?.phase ?? s.artifact?.value?.phase ?? s.state?.value?.position?.phase,
    plan: s.execution?.value?.plan ?? s.artifact?.value?.plan ?? s.state?.value?.position?.plan,
    task: s.execution?.value?.task,
    status: s.execution?.value?.status ?? s.state?.value?.status,
    action: s.execution?.value?.next_action,
    artifact_ref: s.execution?.value?.artifact_ref ?? artifact.ref,
  };
  const diagnostics = Object.entries(s).filter(([name, value]) => name !== 'design' && value?.status !== 'resolved').map(([, value]) => value);
  return assembleRefreshEvidence({
    capsule: { workflow: capsule.position.workflow, phase: capsule.position.phase, plan: capsule.position.plan, task: capsule.position.task, status: capsule.status },
    authoritative, diagnostics,
  });
}

export function appendStartupNotice(result, pointer) {
  if (!pointer?.available) return result;
  const additional_context = result.additional_context
    ? `${result.additional_context}\n${SUGGESTION_NOTICE}`
    : SUGGESTION_NOTICE;
  return Buffer.byteLength(additional_context) <= MAX_CONTEXT_BYTES
    ? {
      ...result,
      additional_context,
      startup_notice_emitted: true,
      startup_notice_pointer: pointer,
    }
    : { ...result, startup_notice_emitted: false };
}

export function routeContextPrompt({
  prompt, ownedRoot, projectRoot, forceStale = false, authoritative,
  now = Date.now(), compiledFs, loadStartupPointerFn = loadStartupPointer,
} = {}) {
  let startupPointer = null;
  if (typeof ownedRoot === 'string') {
    try {
      const loaded = loadStartupPointerFn({ ownedRoot, now });
      if (loaded.available) startupPointer = loaded;
    } catch {
      // The optional startup notice is fail-silent and cannot block routing.
    }
  }
  const projected = result => appendStartupNotice(result, startupPointer);
  const instruction = parseInstruction(prompt);
  if (instruction.kind === 'none') return projected({ handled: false, reason_code: 'instruction_not_contextual' });
  if (typeof ownedRoot !== 'string' || typeof projectRoot !== 'string') return projected({ handled: false, reason_code: 'context_roots_missing' });
  const loaded = loadCapsule({ ownedRoot });
  const capsule = loaded.capsule;
  if (!capsule && instruction.kind === 'explicit') return projected({ handled: false, reason_code: loaded.reason_code });
  const compiledIndex = loadCompiledIndex({ ownedRoot, now, ...(compiledFs ? { fs: compiledFs } : {}) });
  if (!compiledIndex.dispatch_eligible) {
    const resolution = {
      outcome: 'blocked', dispatch_eligible: false,
      reason_code: compiledIndex.reason_code, diagnostic: compiledIndex.diagnostic,
    };
    return projected({ handled: true, resolution, additional_context: injection(resolution) });
  }
  const resolution = resolveContextAction({
    instruction, capsule,
    ...(forceStale && capsule ? { freshness: 'stale', authoritative: authoritative || authoritativeEvidence(capsule, projectRoot) } : {}),
  });
  const workflowId = resolution.outcome === 'override' ? resolution.action?.workflow : capsule?.position?.workflow;
  const projection = compiledIndex.index.routes?.[workflowId];
  if (resolution.dispatch_eligible && !projection) {
    const blockedResolution = {
      outcome: 'blocked', dispatch_eligible: false, reason_code: 'compiled_workflow_missing',
      diagnostic: 'Activate a compiled routing index containing the selected workflow.',
    };
    return projected({ handled: true, resolution: blockedResolution, additional_context: injection(blockedResolution) });
  }
  // Phase 19 D-03 (TOK-02 hot-path closure): observe the baked dispatch_eligible flag from the
  // budget sibling. Required-overflow baked at publish -> bakedBudget.dispatch_eligible === false
  // -> synthesize the existing blocked resolution here, before any capsule mutation. Lazy read:
  // only paid when a dispatch-eligible projection exists (Pitfall #5, REL-01 p95 <25ms preserved).
  const bakedBudget = compiledIndex.budget?.by_workflow?.[workflowId];
  if (resolution.dispatch_eligible && projection && bakedBudget && bakedBudget.dispatch_eligible === false) {
    const blockedResolution = {
      outcome: 'blocked', dispatch_eligible: false,
      reason_code: bakedBudget.reason_code || 'required_context_overflow',
      diagnostic: 'Baked budget declared this workflow non-dispatchable at publish time.',
    };
    return projected({ handled: true, resolution: blockedResolution, additional_context: injection(blockedResolution) });
  }
  let save = null;
  if (capsule && resolution.dispatch_eligible && resolution.outcome === 'refresh') save = saveCapsule({ ownedRoot, capsule: refreshedCapsule(capsule, resolution.refresh, now) });
  if (capsule && resolution.dispatch_eligible && resolution.outcome === 'override' && resolution.action.goal_id) save = saveCapsule({ ownedRoot, capsule: overrideCapsule(capsule, resolution, now) });
  if (save?.status === 'blocked') return projected({ handled: false, reason_code: save.reason_code });
  return projected({
    handled: true,
    resolution,
    additional_context: injection(resolution),
    ...(projection ? { compiled: {
      version_id: compiledIndex.version_id, source: compiledIndex.source,
      ...(compiledIndex.tuple_version_id ? { tuple_version_id: compiledIndex.tuple_version_id, registry_version_id: compiledIndex.registry_version_id } : {}),
      workflow_id: projection.workflow_id, transition_id: projection.transition_id,
      reason_code: projection.reason_code,
      // Phase 19 D-01/D-02: read-only projection of baked siblings. The three keys ride on
      // the additive loadCompiledIndex return (Plan 02). ?? null defends a legacy tuple whose
      // by_workflow map is missing this workflow_id. Gated by `projection ?` so blocked routes
      // do NOT read siblings (Pitfall #5, REL-01 p95 <25ms preserved).
      closure: compiledIndex.closure?.by_workflow?.[workflowId] ?? null,
      budget: compiledIndex.budget?.by_workflow?.[workflowId] ?? null,
      summaryIndex: compiledIndex.summaryIndex?.by_workflow?.[workflowId] ?? null,
    } } : {}),
    ...(save ? { save: { status: save.status, reason_code: save.reason_code } } : {}),
  });
}
