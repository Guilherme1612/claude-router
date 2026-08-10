import {
  preDispatchGate,
} from '../adapters/dispatch/contract.mjs';
import {
  append,
  buildPendingReceipt,
  claimDurableWork,
  publishAtomic,
  transitionReceipt,
} from '../adapters/dispatch/receipt.mjs';

export const WORKFLOW_EXECUTION_POLICY_VERSION = 'workflow-execution-v1';

const FORBIDDEN_EFFECTS = new Set([
  'install', 'auto-install', 'commit', 'publish', 'destructive',
  'external', 'privileged', 'credentialed', 'costly',
]);
const SAFE_EVIDENCE_KEYS = new Set([
  'action_id', 'actual_capability_id', 'actual_interaction', 'artifact_ref',
  'exit_code', 'latency_ms', 'negative_control', 'negative_control_pass',
  'observation_ref', 'quality', 'reason_code', 'reference', 'runtime',
  'runtime_observed', 'stage_id', 'task_id', 'verdict', 'verification_ref',
  'wall_ms',
]);

function textList(value) {
  return [...new Set(
    typeof value === 'string'
      ? [value]
      : Array.isArray(value) ? value.filter(item => typeof item === 'string') : [],
  )].sort();
}

function blocked(reason_code, facts = {}) {
  return {
    schema_version: 1,
    policy_version: WORKFLOW_EXECUTION_POLICY_VERSION,
    status: 'blocked',
    dispatch_eligible: false,
    reason_code,
    stage_results: [],
    receipts: [],
    ...facts,
  };
}

function safeEvidence(value, depth = 0) {
  if (depth > 2 || value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 16).map(item => safeEvidence(item, depth + 1));
  if (typeof value !== 'object') return null;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => SAFE_EVIDENCE_KEYS.has(key))
    .slice(0, 32)
    .map(([key, item]) => [key, safeEvidence(item, depth + 1)]));
}

function actualIdentity(value, fallback) {
  const actual = value && typeof value === 'object' ? value : {};
  return {
    capability_id: typeof actual.capability_id === 'string' ? actual.capability_id : fallback,
    role: typeof actual.role === 'string' ? actual.role : null,
    runtime: typeof actual.runtime === 'string' ? actual.runtime : null,
  };
}

function stageAction(stage, capability) {
  const action = capability?.action;
  if (!action || typeof action !== 'object') return { ok: false, reason_code: 'action_contract_missing' };
  const effects = textList(action.side_effects || action.effects || []);
  if (effects.some(effect => FORBIDDEN_EFFECTS.has(effect.toLowerCase()))
      || FORBIDDEN_EFFECTS.has(String(action.operation || '').toLowerCase())) {
    return { ok: false, reason_code: 'forbidden_effect' };
  }
  if (action.shell === true || action.shellWrapper) return { ok: false, reason_code: 'wrapper_injection' };
  if (stage.safety_mode === 'read-only'
      && effects.some(effect => effect !== 'read-only' && effect !== 'none')) {
    return { ok: false, reason_code: 'read_only_effect_mismatch' };
  }
  if (stage.safety_mode === 'isolated-write'
      && (action.safety_mode !== 'isolated-write' || !effects.includes('isolated-write'))) {
    return { ok: false, reason_code: 'isolated_write_contract_missing' };
  }
  return { ok: true, action };
}

function dispatchGate(capability, action, authorization) {
  const dispatch = typeof capability?.canDispatch === 'function'
    ? capability.canDispatch(action)
    : typeof capability?.adapter?.canDispatch === 'function'
      ? capability.adapter.canDispatch(action)
      : { ok: true };
  if (!dispatch || dispatch.ok !== true) return { ok: false, reason_code: dispatch?.reason || 'adapter_dispatch_blocked' };
  const adapter = capability.adapter || { runtime: capability.runtime };
  const preflight = preDispatchGate(action, adapter, {
    dependencies: authorization.dependencies,
    permission_effect: authorization.permission_effect,
  });
  return preflight.ok === true ? { ok: true } : { ok: false, reason_code: preflight.reason || 'pre_dispatch_blocked' };
}

function browserVerification(stage, outcome, verification) {
  const requiresActual = stage.kind === 'browser-uat'
    || stage.kind === 'interaction-inventory'
    || stage.role?.role === 'browser-verification';
  if (!requiresActual) return { verified: outcome?.verdict === 'passed', reason_code: null };
  const observation = { ...(outcome?.observation || {}), ...(verification?.observation || {}) };
  if (observation.actual_interaction !== true || observation.runtime_observed !== true) {
    return { verified: false, reason_code: 'actual_interaction_required' };
  }
  return { verified: outcome?.verdict === 'passed', reason_code: outcome?.verdict === 'passed' ? null : 'verification_failed' };
}

function persist(receipt, { receiptRoot, receiptLogPath } = {}) {
  if (receiptRoot) publishAtomic(receipt, receiptRoot);
  if (receiptLogPath) append(receipt, receiptLogPath);
}

function receiptFor(stage, capability, plan, task, authorization) {
  const taskId = task?.task_id || 'stage';
  return buildPendingReceipt({
    adapter: capability.adapter_name || 'workflow-coordinator',
    runtime: capability.runtime || 'local',
    identity: {
      route_id: plan.plan_id || 'workflow-plan',
      action_id: stage.id + ':' + taskId,
      capability_fingerprint: capability.capability_id,
      authority: authorization.authority || 'approved',
      risk: stage.safety_mode === 'isolated-write' ? 'elevated' : 'low',
      idempotency_key: plan.plan_id + ':' + stage.id + ':' + taskId,
    },
    intent: stage.id,
    selected: { capability_id: capability.capability_id, role: stage.role?.role || null },
    bounded_evidence: { stage_id: stage.id, task_id: taskId, safety_mode: stage.safety_mode },
  });
}

function terminalReceipt(pending, state, stage, capability, task, outcome, verification) {
  const actual = actualIdentity(outcome?.actual, capability.capability_id);
  const evidence = safeEvidence({
    ...(outcome?.observation || {}),
    ...(outcome?.evidence || {}),
    ...(verification?.observation || {}),
    stage_id: stage.id,
    task_id: task?.task_id || 'stage',
    verdict: outcome?.verdict || 'failed',
    actual_capability_id: actual.capability_id,
  });
  return transitionReceipt(pending, state, {
    selected: { capability_id: capability.capability_id, role: stage.role?.role || null },
    actual,
    invocation_evidence: {
      receipt_id: pending.receipt_id,
      action_id: stage.id,
      actual_capability_id: actual.capability_id,
      state: state === 'completed' ? 'completed' : state,
    },
    postcondition_evidence: {
      receipt_id: pending.receipt_id,
      verified: verification?.verified === true,
      verdict: outcome?.verdict || 'failed',
      ...evidence,
    },
    bounded_evidence: evidence,
  });
}

async function executeTask(stage, task, capability, plan, authorization, options) {
  const pending = receiptFor(stage, capability, plan, task, authorization);
  let receipt = transitionReceipt(pending, 'invoked', {
    invocation_identity: {
      adapter: capability.adapter_name || 'workflow-coordinator',
      runtime: capability.runtime || 'local',
      native_identity: capability.native_identity || null,
    },
  });
  persist(receipt, options);
  let outcome;
  try {
    outcome = await capability.invoke({ stage, task, action: capability.action });
  } catch {
    outcome = { verdict: 'failed', evidence: { reason_code: 'invocation_failed' } };
  }
  let verification = outcome?.verification || null;
  if (typeof capability.verify === 'function') {
    try { verification = await capability.verify({ stage, task, invocation: outcome }); }
    catch { verification = { verified: false, reason_code: 'verification_failed' }; }
  }
  const verificationResult = browserVerification(stage, outcome, verification);
  const passed = outcome?.verdict === 'passed' && verificationResult.verified;
  const state = passed ? 'completed' : verificationResult.reason_code === 'actual_interaction_required' ? 'partial' : 'failed';
  receipt = terminalReceipt(pending, state, stage, capability, task, outcome, {
    ...verificationResult,
    observation: verification?.observation,
  });
  persist(receipt, options);
  return {
    status: passed ? 'completed' : state === 'partial' ? 'partial' : 'failed',
    task_id: task?.task_id || null,
    receipt_id: receipt.receipt_id,
    selected: { capability_id: capability.capability_id, role: stage.role?.role || null },
    actual: actualIdentity(outcome?.actual, capability.capability_id),
    verdict: outcome?.verdict || 'failed',
    verified: verificationResult.verified,
    reason_code: verificationResult.reason_code || (passed ? 'stage_verified' : 'stage_failed'),
    evidence: safeEvidence({ ...(outcome?.observation || {}), ...(outcome?.evidence || {}), ...(verification?.observation || {}) }),
    receipt,
  };
}

async function boundedTasks(tasks, concurrency, run) {
  const results = [];
  for (let index = 0; index < tasks.length; index += Math.max(1, concurrency)) {
    const batch = tasks.slice(index, index + Math.max(1, concurrency));
    results.push(...await Promise.all(batch.map(run)));
  }
  return results;
}

/**
 * Execute an already-authorized durable plan outside the prompt hot path.
 * Capability adapters remain the only invocation surface.
 */
export async function executeWorkflowPlan({
  plan,
  capabilities = [],
  authorization = {},
  runtime,
  receiptRoot,
  receiptLogPath,
} = {}) {
  if (!plan || plan.status !== 'planned') return blocked('workflow_plan_not_planned');
  if (authorization.approved !== true) return blocked('authority_not_approved');
  if (authorization.runtime_gates !== true) return blocked('runtime_gates_not_passed');
  const byId = new Map((Array.isArray(capabilities) ? capabilities : []).map(value => [value?.capability_id, value]));
  const results = [];
  const receipts = [];
  let failed = false;
  for (const stage of Array.isArray(plan.stages) ? plan.stages : []) {
    if (failed) {
      results.push({ stage_id: stage.id, status: 'blocked', reason_code: 'upstream_stage_failed' });
      continue;
    }
    const capability = byId.get(stage.role?.capability_id);
    if (!capability || capability.validated !== true || capability.available !== true || capability.eligible !== true) {
      results.push({ stage_id: stage.id, status: 'partial', reason_code: 'capability_unavailable', fallback: 'safe_noop', task_count: 0 });
      failed = true;
      continue;
    }
    if (runtime && capability.runtime && capability.runtime !== runtime) {
      results.push({ stage_id: stage.id, status: 'blocked', reason_code: 'runtime_scope_mismatch', fallback: 'safe_noop' });
      failed = true;
      continue;
    }
    if (stage.safety_mode === 'read-only' && authorization.read_only !== true) {
      results.push({ stage_id: stage.id, status: 'blocked', reason_code: 'read_only_authorization_required' });
      failed = true;
      continue;
    }
    if (stage.safety_mode === 'isolated-write') {
      if (authorization.write !== true) {
        results.push({ stage_id: stage.id, status: 'blocked', reason_code: 'write_authorization_required' });
        failed = true;
        continue;
      }
      if (stage.bounds?.max_concurrency !== 1) {
        results.push({ stage_id: stage.id, status: 'blocked', reason_code: 'write_concurrency_invalid' });
        failed = true;
        continue;
      }
      const claim = receiptRoot ? claimDurableWork({
        runtime: capability.runtime || 'local',
        stage: stage.id,
        identity: { route_id: plan.plan_id, action_id: stage.id, capability_fingerprint: capability.capability_id },
        dir: receiptRoot,
      }) : { claimed: true };
      if (claim.claimed !== true) {
        results.push({ stage_id: stage.id, status: 'blocked', reason_code: 'write_conflict', fallback: 'safe_noop' });
        failed = true;
        continue;
      }
    }
    const actionCheck = stageAction(stage, capability);
    if (!actionCheck.ok) {
      results.push({ stage_id: stage.id, status: 'blocked', reason_code: actionCheck.reason_code });
      failed = true;
      continue;
    }
    const dispatch = dispatchGate(capability, actionCheck.action, authorization);
    if (!dispatch.ok) {
      results.push({ stage_id: stage.id, status: 'blocked', reason_code: dispatch.reason_code });
      failed = true;
      continue;
    }
    if (typeof capability.invoke !== 'function') {
      results.push({ stage_id: stage.id, status: 'blocked', reason_code: 'capability_invocation_unavailable' });
      failed = true;
      continue;
    }
    const tasks = Array.isArray(stage.tasks) && stage.tasks.length ? stage.tasks : [null];
    const concurrency = stage.safety_mode === 'isolated-write' ? 1 : Math.min(
      Math.max(1, stage.bounds?.max_concurrency || 1),
      tasks.length,
    );
    const taskResults = await boundedTasks(tasks, concurrency, task => executeTask(
      stage, task, capability, plan, authorization, { receiptRoot, receiptLogPath },
    ));
    receipts.push(...taskResults.map(value => value.receipt));
    const stagePassed = taskResults.every(value => value.status === 'completed');
    const stagePartial = taskResults.some(value => value.status === 'partial');
    results.push({
      stage_id: stage.id,
      status: stagePassed ? 'completed' : stagePartial ? 'partial' : 'failed',
      task_count: taskResults.length,
      receipt_ids: taskResults.map(value => value.receipt_id),
      selected: taskResults[0]?.selected || null,
      actual: taskResults[0]?.actual || null,
      verdict: taskResults.every(value => value.verdict === 'passed') ? 'passed' : 'failed',
      verified: taskResults.every(value => value.verified === true),
      reason_code: stagePassed ? 'stage_verified' : taskResults.find(value => value.reason_code)?.reason_code || 'stage_failed',
      evidence: taskResults.map(value => value.evidence).filter(Boolean),
    });
    if (!stagePassed) failed = true;
  }
  const completed = results.length > 0 && results.every(value => value.status === 'completed');
  const firstIncomplete = results.find(value => value.status !== 'completed');
  const partial = results.some(value => value.status === 'partial' || value.status === 'failed');
  return {
    schema_version: 1,
    policy_version: WORKFLOW_EXECUTION_POLICY_VERSION,
    status: completed ? 'completed' : partial ? 'partial' : 'blocked',
    dispatch_eligible: false,
    reason_code: completed ? 'workflow_verified' : firstIncomplete?.reason_code || (failed ? 'workflow_execution_incomplete' : 'workflow_not_executed'),
    workflow_id: plan.workflow_id || 'coordinator-workflow',
    stage_results: results,
    receipts,
  };
}
