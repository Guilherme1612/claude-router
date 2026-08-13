// Phase 67/72: bounded readiness and execution-loop projections around the
// existing gates. Adapters remain the only capability invocation surface.

export const AUTONOMY_POLICY_VERSION = 'bounded-autonomy-v1';

const EXECUTING_AUTHORITY = new Set(['one_turn_action', 'persistent_goal_action']);
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:@/+ -]{0,255}$/;
const FINGERPRINT = /^[a-f0-9]{64}$/;

function token(value, fallback = 'unknown') {
  return typeof value === 'string' && SAFE_TOKEN.test(value) ? value : fallback;
}

function gate(id, pass, reason_code) {
  return { id, pass: pass === true, reason_code };
}

function leaseGate(input) {
  const lease = input?.lease;
  if (input?.intent?.authority_class !== 'persistent_goal_action' && lease?.required !== true) {
    return gate('lease', true, 'lease_not_required');
  }
  if (!lease || lease.required !== true) return gate('lease', false, 'lease_required');
  if (lease.status !== 'active') return gate('lease', false, lease.status === 'expired' ? 'lease_expired'
    : lease.status === 'revoked' ? 'lease_revoked' : lease.status === 'absent' ? 'lease_absent' : 'lease_invalid');
  if (lease.expired === true) return gate('lease', false, 'lease_expired');
  if (lease.fingerprint_match !== true) return gate('lease', false, 'lease_fingerprint_mismatch');
  return gate('lease', true, 'lease_active');
}

function strategyGate(strategy) {
  if (!strategy || strategy.status !== 'planned' || strategy.dispatch_eligible !== true) {
    return gate('strategy', false, 'strategy_not_dispatch_eligible');
  }
  const count = Number.isSafeInteger(strategy.replan_count) ? strategy.replan_count : 0;
  const max = Number.isSafeInteger(strategy.max_replans) ? strategy.max_replans : 1;
  if (count < 0 || max < 0 || count > max) return gate('strategy', false, 'replan_bound_exceeded');
  return gate('strategy', true, count ? 'bounded_replan_available' : 'strategy_ready');
}

function targetGate(target, expectedRuntime) {
  if (!target || target.available !== true) return gate('target', false, 'target_unavailable');
  if (target.eligible !== true) return gate('target', false, 'target_ineligible');
  if (target.verified !== true) return gate('target', false, 'target_unverified');
  if (expectedRuntime && target.runtime !== expectedRuntime) return gate('target', false, 'runtime_mismatch');
  if (Array.isArray(target.quarantine) && target.quarantine.length > 0) return gate('target', false, 'target_quarantined');
  return gate('target', true, 'target_verified');
}

/**
 * Evaluate all execution-readiness gates without invoking any capability.
 * Missing or malformed required evidence fails closed and all blockers remain
 * visible for inspection.
 */
export function prepareAutonomousExecution(input = {}) {
  const intent = input.intent;
  const explicit = intent?.explicit_execute === true
    && (intent?.disposition === 'execute' || EXECUTING_AUTHORITY.has(intent?.authority_class));
  const gates = [
    gate('execute_intent', explicit, 'execute_intent_required'),
    targetGate(input.target, input.runtime),
    gate('authority', input.authority?.authGranted === true && input.authority?.current !== false,
      input.authority?.current === false ? 'authority_not_current' : 'authority_not_granted'),
    gate('risk', input.risk?.safe === true && input.risk?.current === true
      && input.risk?.unsafe_effects !== true && input.risk?.reversible !== false
      && (input.approval?.required !== true || input.approval?.granted === true),
      input.approval?.required === true && input.approval?.granted !== true ? 'approval_required'
        : input.risk?.safe !== true || input.risk?.unsafe_effects === true || input.risk?.reversible === false ? 'risk_not_approved' : 'risk_not_current'),
    leaseGate(input),
    strategyGate(input.strategy),
    gate('receipts', input.receipt?.ready === true || input.receipt?.contract_ready === true, 'receipt_contract_missing'),
    gate('verification', input.verification?.ready === true || input.verification?.required === false, 'verification_required'),
  ];
  const blockers = gates.filter(item => !item.pass).map(item => item.reason_code);
  const target = input.target || {};
  return {
    schema_version: 1,
    policy_version: AUTONOMY_POLICY_VERSION,
    status: blockers.length ? 'blocked' : 'ready',
    dispatch_eligible: blockers.length === 0,
    reason_code: blockers[0] || 'autonomy_ready',
    blockers,
    gates,
    mode: token(input.mode, 'adaptive'),
    selected: {
      capability_id: token(target.capability_id),
      runtime: token(target.runtime),
    },
  };
}

function attemptEvidence({ selected, result, verification, failure_reason }) {
  const receipt = result?.receipt && typeof result.receipt === 'object' ? result.receipt : null;
  const completion = result?.completion || receipt?.completion_evidence || { state: result?.status || 'unknown' };
  const actual = result?.actual_capability_id || result?.actual || receipt?.invocation_identity?.capability_id || selected;
  const verified = verification?.pass === true || verification === true;
  return {
    selected: token(selected),
    actual: token(actual),
    receipt_id: token(result?.receipt_id || receipt?.receipt_id),
    completion: { state: token(completion.state, 'unknown') },
    verification: { pass: verified, reason_code: token(verification?.reason_code || (verified ? 'verified' : 'verification_missing')) },
    ...(failure_reason ? { failure: { reason_code: token(failure_reason) } } : {}),
  };
}

/**
 * Delegate a ready action to one adapter callback with idempotency, cancellation,
 * lease checks, recovery, rollback, and one evidence-bound replan by default.
 */
export async function runBoundedAutonomy({ input = {}, execute, verify, recover, rollback, replan, cancelled, idempotency } = {}) {
  const decision = prepareAutonomousExecution(input);
  if (decision.status !== 'ready') return { status: 'blocked', decision, attempts: [], reason_code: decision.reason_code };
  const key = token(input.idempotency_key, '');
  if (!key) return { status: 'blocked', decision, attempts: [], reason_code: 'idempotency_key_required' };
  if (typeof execute !== 'function') return { status: 'blocked', decision, attempts: [], reason_code: 'executor_missing' };
  const seen = idempotency instanceof Set ? idempotency : null;
  if (seen?.has(key)) return { status: 'idempotent_replay', decision, attempts: [], idempotency_key: key };
  seen?.add(key);
  const attempts = [];
  let target = input.target;
  let strategy = input.strategy;
  const maxReplans = Number.isSafeInteger(strategy?.max_replans) ? strategy.max_replans : 1;
  let replans = Number.isSafeInteger(strategy?.replan_count) ? strategy.replan_count : 0;
  for (let attempt = 0; attempt <= maxReplans; attempt += 1) {
    if (await cancelled?.()) return { status: 'cancelled', decision, attempts, reason_code: 'execution_cancelled' };
    if (input.lease?.status === 'revoked' || input.lease?.expired === true) {
      return { status: 'blocked', decision, attempts, reason_code: 'lease_revoked' };
    }
    let result;
    try {
      result = await execute({ target, strategy, idempotency_key: key, attempt });
    } catch (error) {
      result = { status: 'failed', reason_code: error?.code || 'executor_failed' };
    }
    const verification = typeof verify === 'function' ? await verify({ result, target, strategy, attempt }) : result?.verification;
    const evidence = attemptEvidence({
      selected: target?.capability_id,
      result,
      verification,
      failure_reason: result?.failure_reason || result?.reason_code,
    });
    attempts.push(evidence);
    const completed = evidence.completion.state === 'completed' || result?.status === 'completed';
    if (completed && evidence.verification.pass) return { status: 'completed', decision, attempts, idempotency_key: key };
    if (replans < maxReplans && typeof replan === 'function') {
      const next = await replan({ evidence, target, strategy, attempt });
      if (next?.evidence_bound === true && next.target && next.strategy) {
        target = next.target;
        strategy = next.strategy;
        replans += 1;
        continue;
      }
    }
    if (typeof recover === 'function') await recover({ evidence, target, strategy });
    if (typeof rollback === 'function') await rollback({ evidence, target, strategy });
    return { status: 'failed', decision, attempts, idempotency_key: key, reason_code: evidence.failure?.reason_code || 'verification_failed' };
  }
  return { status: 'failed', decision, attempts, idempotency_key: key, reason_code: 'replan_bound_exceeded' };
}

function mappingProjection(target) {
  const mapping = target?.mapping || {};
  const provenance = mapping.provenance || {};
  return {
    runtime: token(mapping.runtime || target?.runtime),
    scope: token(mapping.scope),
    availability: token(mapping.availability),
    eligible: mapping.eligible === true || target?.eligible === true,
    provenance: { source_fingerprint: FINGERPRINT.test(provenance.source_fingerprint) ? provenance.source_fingerprint : null },
    quarantine: Array.isArray(target?.quarantine) ? target.quarantine.filter(value => SAFE_TOKEN.test(value)).slice(0, 16) : [],
  };
}

function budgetProjection(strategy) {
  const source = strategy?.budget || strategy?.resource_bounds || strategy?.strategy?.resource_limits || {};
  return Object.fromEntries(['max_wall_ms', 'max_time_ms', 'max_tokens', 'max_calls', 'max_invocations', 'max_retries']
    .filter(key => Number.isSafeInteger(source[key]) && source[key] >= 0)
    .map(key => [key, source[key]]));
}

/** Return concise beginner output and bounded expert inspection output. */
export function explainAutonomy({ decision, input = {} } = {}) {
  const result = decision && typeof decision === 'object' ? decision : prepareAutonomousExecution(input);
  const target = input.target || {};
  const capabilityId = token(result.selected?.capability_id || target.capability_id);
  const ready = result.status === 'ready' && result.dispatch_eligible === true;
  const firstBlocker = token(result.blockers?.[0], 'autonomy_blocked');
  return {
    schema_version: 1,
    policy_version: AUTONOMY_POLICY_VERSION,
    beginner: {
      selected_capability: capabilityId,
      next_action: ready ? 'execute' : 'inspect_and_resolve',
      message: ready ? `Ready to execute ${capabilityId}.` : `Execution paused: ${firstBlocker}.`,
    },
    expert: {
      mode: token(result.mode || input.mode, 'adaptive'),
      status: token(result.status),
      trace: Array.isArray(result.gates) ? result.gates.map(item => ({
        id: token(item.id), pass: item.pass === true, reason_code: token(item.reason_code),
      })) : [],
      mapping: mappingProjection(target),
      budgets: budgetProjection(input.strategy),
      omissions: (result.blockers || []).map(reason => token(reason)).slice(0, 16),
      override: {
        available: true,
        command: 'router-control context resolve',
        reason_code: 'explicit_override_available',
      },
    },
  };
}
