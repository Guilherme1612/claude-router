export const WORKFLOW_PLAN_POLICY_VERSION = 'workflow-plan-v1';

export const WORKFLOW_PLAN_LIMITS = Object.freeze({
  max_stages: 9,
  max_audit_tasks: 3,
  max_context_bytes: 2048,
  max_tool_calls: 4,
  max_concurrency: 3,
  max_retries: 1,
  max_total_context_bytes: 18432,
  max_total_tool_calls: 36,
});

const FAMILIES = new Set([
  'quality-audit',
  'feature-build',
  'bug-diagnosis-fix',
  'refactor-optimization',
  'design-review',
  'browser-interaction-verification',
]);

const FAMILY_ORDER = [...FAMILIES];
const READ_ONLY = 'read-only';
const ISOLATED_WRITE = 'isolated-write';

function textList(value) {
  return [...new Set(
    typeof value === 'string'
      ? [value]
      : Array.isArray(value) ? value.filter(item => typeof item === 'string') : [],
  )].sort();
}

function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function boundedNumber(value, fallback, maximum) {
  return Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : fallback;
}

function blocked(reason_code, facts = {}) {
  return {
    schema_version: 1,
    policy_version: WORKFLOW_PLAN_POLICY_VERSION,
    status: 'blocked',
    dispatch_eligible: false,
    reason_code,
    ...facts,
  };
}

function normalizedCapabilities(values) {
  return (Array.isArray(values) ? values : [])
    .map(value => {
      const capability_id = value?.capability_id || value?.stable_id || value?.canonical_id;
      if (!validId(capability_id) || value?.validated !== true || value?.available !== true || value?.eligible !== true) return null;
      const safetyModes = new Set([
        ...textList(value.safety_modes),
        ...(typeof value.safety_mode === 'string' ? [value.safety_mode] : []),
      ]);
      return {
        capability_id,
        roles: textList(value.roles),
        safety_modes: safetyModes,
        context_bytes: boundedNumber(value.cost?.context_bytes, 0, WORKFLOW_PLAN_LIMITS.max_context_bytes),
        tool_calls: boundedNumber(value.cost?.tool_calls, 0, WORKFLOW_PLAN_LIMITS.max_tool_calls),
      };
    })
    .filter(value => value && value.roles.length > 0)
    .sort((left, right) => left.context_bytes - right.context_bytes
      || left.tool_calls - right.tool_calls
      || left.capability_id.localeCompare(right.capability_id));
}

function selectRole(capabilities, roleOptions, safetyMode) {
  const options = textList(roleOptions);
  const candidates = capabilities.flatMap(capability => options
    .filter(role => capability.roles.includes(role))
    .map(role => ({ capability, role })))
    .filter(({ capability }) => capability.safety_modes.has(safetyMode))
    .sort((left, right) => left.capability.context_bytes - right.capability.context_bytes
      || left.capability.tool_calls - right.capability.tool_calls
      || options.indexOf(left.role) - options.indexOf(right.role)
      || left.capability.capability_id.localeCompare(right.capability.capability_id));
  const selected = candidates[0];
  return selected ? {
    capability_id: selected.capability.capability_id,
    role: selected.role,
    validation: 'validated',
    safety_mode: safetyMode,
  } : null;
}

function familySet(intent) {
  const values = [
    ...textList(intent?.task_family_candidates),
    ...(typeof intent?.task_family === 'string' && intent.task_family !== 'coordinator-workflow'
      ? [intent.task_family] : []),
  ];
  return FAMILY_ORDER.filter(family => values.includes(family));
}

function stageBounds(safetyMode, overrides = {}) {
  return {
    max_context_bytes: WORKFLOW_PLAN_LIMITS.max_context_bytes,
    max_tool_calls: WORKFLOW_PLAN_LIMITS.max_tool_calls,
    max_concurrency: safetyMode === ISOLATED_WRITE ? 1 : WORKFLOW_PLAN_LIMITS.max_concurrency,
    max_retries: safetyMode === ISOLATED_WRITE ? 0 : WORKFLOW_PLAN_LIMITS.max_retries,
    ...overrides,
  };
}

function addStage(stages, omitted, capabilities, spec) {
  const role = selectRole(capabilities, spec.role_options, spec.safety_mode);
  if (!role) {
    if (spec.optional) {
      omitted.push({ id: spec.id, reason_code: spec.omission_reason || 'optional_role_unavailable' });
      return null;
    }
    return blocked('required_stage_role_unavailable', {
      missing_stage: spec.id,
      missing_roles: textList(spec.role_options),
    });
  }
  const stage = {
    id: spec.id,
    kind: spec.kind,
    depends_on: [...new Set(spec.depends_on)].sort(),
    role,
    context: { sources: [...spec.context_sources] },
    bounds: stageBounds(spec.safety_mode, spec.bounds),
    safety_mode: spec.safety_mode,
    evidence: { required: textList(spec.evidence) },
  };
  if (spec.tasks) stage.tasks = spec.tasks.map(task => ({ ...task, role: role.role }));
  stages.push(stage);
  return stage;
}

function auditTasks(families) {
  return families
    .filter(family => ['quality-audit', 'design-review', 'refactor-optimization'].includes(family))
    .slice(0, WORKFLOW_PLAN_LIMITS.max_audit_tasks)
    .map(family => ({ task_id: 'audit-' + family, family, operation: 'read-only-audit' }));
}

/**
 * Build a durable workflow plan from structured intent and prevalidated local
 * role facts. This function performs no discovery, I/O, invocation, or prompt
 * handling; Phase 63 owns execution.
 */
export function planWorkflow({ intent, capabilities = [] } = {}) {
  if (!intent || typeof intent !== 'object') return blocked('structured_intent_invalid');
  if (intent.clarification?.needed === true) return blocked('clarification_required', {
    clarification_reasons: textList(intent.clarification.reason_codes),
  });
  const families = familySet(intent);
  if (families.length === 0) return blocked('task_family_unrecognized');
  if (intent.scope === 'unknown' || typeof intent.scope !== 'string') return blocked('factual_scope_missing');

  const broad = intent.task_family === 'coordinator-workflow' || families.length > 1;
  const evidence = textList(intent.evidence_needs);
  const browserNeeded = families.includes('browser-interaction-verification') || evidence.includes('browser');
  const auditsNeeded = broad || families.some(family => ['quality-audit', 'design-review', 'refactor-optimization'].includes(family));
  const fixesNeeded = families.some(family => ['feature-build', 'bug-diagnosis-fix', 'refactor-optimization'].includes(family));
  const inspectionOnly = intent.requested_autonomy === 'inspect';
  const validationNeeded = fixesNeeded || evidence.some(value => ['tests', 'verify', 'validation'].includes(value));
  const regressionNeeded = broad || families.includes('quality-audit') || evidence.includes('regression');
  const capabilitiesByRole = normalizedCapabilities(capabilities);
  const stages = [];
  const omitted = [];

  const add = spec => addStage(stages, omitted, capabilitiesByRole, spec);
  const baseline = add({
    id: 'baseline', kind: 'baseline', depends_on: [], role_options: ['inspection', 'audit'],
    context_sources: ['structured-intent', 'validated-capability-summary'],
    safety_mode: READ_ONLY, evidence: ['baseline'],
  });
  if (!baseline || baseline.status === 'blocked') return baseline;

  let interaction = null;
  if (browserNeeded) {
    interaction = add({
      id: 'interaction-inventory', kind: 'interaction-inventory', depends_on: [baseline.id],
      role_options: ['browser-verification'], context_sources: ['baseline'], safety_mode: READ_ONLY,
      evidence: ['interaction-inventory'], optional: true,
    });
  }

  let audits = null;
  if (auditsNeeded) {
    audits = add({
      id: 'parallel-read-only-audits', kind: 'parallel-read-only-audits',
      depends_on: [baseline.id, ...(interaction ? [interaction.id] : [])],
      role_options: ['audit', 'inspection'], context_sources: ['baseline', 'interaction-inventory'],
      safety_mode: READ_ONLY, evidence: ['audit-findings'], bounds: { max_tool_calls: 3 },
      tasks: auditTasks(families),
    });
    if (!audits || audits.status === 'blocked') return audits;
  }

  let synthesis = null;
  if (auditsNeeded || broad) {
    synthesis = add({
      id: 'synthesis', kind: 'synthesis', depends_on: [audits?.id || baseline.id],
      role_options: ['synthesis', 'review', 'audit'], context_sources: ['audit-findings'],
      safety_mode: READ_ONLY, evidence: ['synthesis'],
    });
    if (!synthesis || synthesis.status === 'blocked') return synthesis;
  }

  let fixes = null;
  if (fixesNeeded && !inspectionOnly) {
    fixes = add({
      id: 'isolated-fixes', kind: 'isolated-fixes', depends_on: [synthesis?.id || audits?.id || baseline.id],
      role_options: ['implementation', 'diagnosis', 'refactor'], context_sources: ['synthesis', 'audit-findings'],
      safety_mode: ISOLATED_WRITE, evidence: ['isolated-change-receipt'],
    });
    if (!fixes || fixes.status === 'blocked') return fixes;
  } else if (fixesNeeded) {
    omitted.push({ id: 'isolated-fixes', reason_code: 'inspection_only' });
  }

  let validation = null;
  if (validationNeeded) {
    validation = add({
      id: 'targeted-validation', kind: 'targeted-validation',
      depends_on: [fixes?.id || synthesis?.id || audits?.id || baseline.id],
      role_options: ['testing', 'verification', 'inspection'], context_sources: ['synthesis', 'isolated-fixes'],
      safety_mode: READ_ONLY, evidence: ['targeted-validation'],
    });
    if (!validation || validation.status === 'blocked') return validation;
  }

  let browser = null;
  if (browserNeeded) {
    browser = add({
      id: 'browser-uat', kind: 'browser-uat',
      depends_on: [
        interaction?.id || baseline.id,
        ...(validation ? [validation.id] : []),
      ],
      role_options: ['browser-verification'], context_sources: ['interaction-inventory', 'targeted-validation'],
      safety_mode: READ_ONLY, evidence: ['browser-observation'], optional: true,
    });
  }

  let regression = null;
  if (regressionNeeded) {
    regression = add({
      id: 'regression-checks', kind: 'regression-checks',
      depends_on: [
        validation?.id || synthesis?.id || audits?.id || baseline.id,
        ...(browser ? [browser.id] : []),
      ],
      role_options: ['testing', 'verification', 'audit'], context_sources: ['targeted-validation', 'browser-observation'],
      safety_mode: READ_ONLY, evidence: ['regression'],
    });
    if (!regression || regression.status === 'blocked') return regression;
  }

  const report = add({
    id: 'final-report', kind: 'final-report',
    depends_on: [regression?.id || browser?.id || validation?.id || synthesis?.id || audits?.id || baseline.id],
    role_options: ['reporting', 'review', 'audit'], context_sources: ['all-stage-evidence'],
    safety_mode: READ_ONLY, evidence: ['final-report'],
  });
  if (!report || report.status === 'blocked') return report;

  if (stages.length > WORKFLOW_PLAN_LIMITS.max_stages) return blocked('plan_stage_cap_exceeded');
  const totalContextBytes = stages.length * WORKFLOW_PLAN_LIMITS.max_context_bytes;
  const totalToolCalls = stages.reduce((sum, stage) => sum + stage.bounds.max_tool_calls, 0);
  if (totalContextBytes > WORKFLOW_PLAN_LIMITS.max_total_context_bytes) return blocked('plan_context_cap_exceeded');
  if (totalToolCalls > WORKFLOW_PLAN_LIMITS.max_total_tool_calls) return blocked('plan_tool_call_cap_exceeded');

  return {
    schema_version: 1,
    policy_version: WORKFLOW_PLAN_POLICY_VERSION,
    status: 'planned',
    dispatch_eligible: false,
    reason_code: 'bounded_workflow_planned',
    plan_id: 'workflow-plan:' + families.join('+') + ':' + intent.scope,
    workflow_id: 'coordinator-workflow',
    task_family: intent.task_family || 'coordinator-workflow',
    task_family_candidates: families,
    outcome: typeof intent.outcome === 'string' ? intent.outcome : 'unknown',
    scope: intent.scope,
    requested_autonomy: typeof intent.requested_autonomy === 'string' ? intent.requested_autonomy : 'none',
    evidence_needs: evidence,
    stages,
    omitted_stages: omitted,
    plan_bounds: {
      max_stages: WORKFLOW_PLAN_LIMITS.max_stages,
      max_context_bytes: WORKFLOW_PLAN_LIMITS.max_total_context_bytes,
      max_tool_calls: WORKFLOW_PLAN_LIMITS.max_total_tool_calls,
      max_concurrency: WORKFLOW_PLAN_LIMITS.max_concurrency,
      max_retries: WORKFLOW_PLAN_LIMITS.max_retries,
      single_workflow_composition_cap_applied: false,
      stage_count: stages.length,
      total_context_bytes: totalContextBytes,
      total_tool_calls: totalToolCalls,
    },
  };
}

export function summarizeWorkflowPlan(plan) {
  if (!plan || typeof plan !== 'object') return blocked('workflow_plan_invalid');
  if (plan.status !== 'planned') return blocked(plan.reason_code || 'workflow_plan_blocked');
  const nextStage = plan.stages?.[0]?.id || 'none';
  const stageCount = Array.isArray(plan.stages) ? plan.stages.length : 0;
  const omittedCount = Array.isArray(plan.omitted_stages) ? plan.omitted_stages.length : 0;
  return {
    schema_version: 1,
    policy_version: WORKFLOW_PLAN_POLICY_VERSION,
    status: 'planned',
    dispatch_eligible: false,
    reason_code: 'workflow_plan_ready',
    workflow_id: plan.workflow_id || 'coordinator-workflow',
    stage_count: stageCount,
    next_stage: nextStage,
    omitted_stage_count: omittedCount,
    message: ['Workflow plan ready: ', stageCount, ' stages; next ', nextStage, '.'].join(''),
  };
}
