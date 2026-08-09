import { stableStringify } from '../registry/schema.mjs';

export const STRATEGY_CONTRACT_VERSION = 'strategy-contract-v1';
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const COST_FIELDS = ['expected_time_ms', 'expected_tokens', 'calls', 'retries', 'failures', 'coordination_cost'];
const HARD_FIELDS = ['safe', 'correct', 'quality', 'fit', 'available', 'in_scope'];
const TASK_FIELDS = new Set(['id', 'task_id', 'depends_on', 'size', 'verification_need', 'specialist_value', 'quality_required', 'coordination_cost', 'risk', 'available', 'in_scope', 'safe', 'correct', 'fit', 'resources']);
const CANDIDATE_FIELDS = new Set(['id', 'kind', 'task_ids', 'work', 'dependencies', 'hard_constraints', 'cost', 'child_agents', 'specialist_required']);

const validId = value => typeof value === 'string' && ID.test(value);
const finiteBounded = (value, max) => Number.isFinite(value) && value >= 0 && value <= max;
const blocked = (reason_code, facts = {}) => ({ status: 'blocked', dispatch_eligible: false, reason_code, ...facts });

function token(workflow) {
  const selection = workflow?.selection;
  const fields = ['transition_id', 'workflow_id', 'family', 'from', 'to'];
  if (workflow?.status !== 'selected' || workflow.dispatch_eligible !== true || !selection
    || !fields.every(field => validId(selection[field]))) return null;
  return Object.fromEntries(fields.map(field => [field, selection[field]]));
}

function safeClosure(closure, selected) {
  return closure?.status === 'resolved' && closure.dispatch_eligible === true
    && closure.workflow_id === selected.workflow_id && closure.transition_id === selected.transition_id;
}

function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function unknown(value, allowed) { return Object.keys(value).some(key => !allowed.has(key)); }

function boundsFor(input) {
  const defaults = { max_time_ms: 120000, max_tokens: 100000, max_calls: 100, max_retries: 10, max_failures: 10, max_coordination_cost: 100000 };
  if (input === undefined) return defaults;
  if (!object(input) || unknown(input, new Set(Object.keys(defaults)))) return null;
  const result = {};
  for (const key of Object.keys(defaults)) {
    if (!finiteBounded(input[key], 10 ** 9)) return null;
    result[key] = input[key];
  }
  return result;
}

function taskFacts(tasks, bounds) {
  if (!Array.isArray(tasks) || tasks.length === 0) return { reason_code: 'tasks_invalid' };
  const ids = new Set();
  const normalized = [];
  for (const task of tasks) {
    if (!object(task) || unknown(task, TASK_FIELDS)) return { reason_code: 'task_fields_unknown' };
    const id = task.id ?? task.task_id;
    if (!validId(id) || ids.has(id)) return { reason_code: 'task_identity_invalid' };
    ids.add(id);
    if (!Array.isArray(task.depends_on) || task.depends_on.some(value => !validId(value))) return { reason_code: 'task_dependencies_invalid' };
    for (const field of ['size', 'verification_need', 'specialist_value', 'quality_required', 'coordination_cost', 'risk']) {
      if (!finiteBounded(task[field], field === 'risk' ? 1 : 1000000)) return { reason_code: 'task_measure_invalid' };
    }
    for (const field of ['safe', 'correct', 'fit', 'available', 'in_scope']) if (typeof task[field] !== 'boolean') return { reason_code: 'task_hard_constraint_missing' };
    if (!object(task.resources) || unknown(task.resources, new Set(COST_FIELDS))) return { reason_code: 'task_resources_invalid' };
    for (const field of COST_FIELDS) if (!finiteBounded(task.resources[field], bounds[`max_${field}`] ?? 1000000000)) return { reason_code: 'task_resource_invalid' };
    normalized.push({
      id, depends_on: [...task.depends_on], size: task.size, verification_need: task.verification_need,
      specialist_value: task.specialist_value, quality_required: task.quality_required,
      coordination_cost: task.coordination_cost, risk: task.risk,
      available: task.available, in_scope: task.in_scope, safe: task.safe, correct: task.correct, fit: task.fit,
      resources: Object.fromEntries(COST_FIELDS.map(field => [field, task.resources[field]])),
    });
  }
  for (const task of normalized) if (task.depends_on.some(id => !ids.has(id))) return { reason_code: 'task_dependency_unknown' };
  const remaining = new Map(normalized.map(task => [task.id, new Set(task.depends_on)]));
  const ordered = [];
  while (remaining.size) {
    const ready = [...remaining.entries()].filter(([, dependencies]) => dependencies.size === 0).map(([id]) => id).sort();
    if (!ready.length) return { reason_code: 'task_dependency_cycle' };
    for (const id of ready) {
      ordered.push(normalized.find(task => task.id === id));
      remaining.delete(id);
      for (const dependencies of remaining.values()) dependencies.delete(id);
    }
  }
  return { tasks: ordered };
}

function costFor(tasks, kind, bounds) {
  const sum = field => tasks.reduce((total, task) => total + task.resources[field], 0);
  const coordination = sum('coordination_cost') + (kind === 'direct' ? 0 : tasks.length);
  return {
    expected_time_ms: kind === 'parallel' ? Math.max(...tasks.map(task => task.resources.expected_time_ms)) : sum('expected_time_ms'),
    expected_tokens: sum('expected_tokens'), calls: sum('calls'), retries: sum('retries'), failures: sum('failures'), coordination_cost: coordination,
    within_bounds: sum('expected_tokens') <= bounds.max_tokens && (kind === 'parallel' ? Math.max(...tasks.map(task => task.resources.expected_time_ms)) : sum('expected_time_ms')) <= bounds.max_time_ms
      && sum('calls') <= bounds.max_calls && sum('retries') <= bounds.max_retries && sum('failures') <= bounds.max_failures && coordination <= bounds.max_coordination_cost,
  };
}

function hardConstraints(tasks, candidate, cost) {
  const facts = Object.fromEntries(HARD_FIELDS.map(field => [field, field === 'quality' ? true : tasks.every(task => task[field])]));
  const explicit = candidate?.hard_constraints;
  if (explicit !== undefined) {
    if (!object(explicit) || unknown(explicit, new Set(HARD_FIELDS)) || HARD_FIELDS.some(field => typeof explicit[field] !== 'boolean')) return null;
    for (const field of HARD_FIELDS) facts[field] = facts[field] && explicit[field];
  }
  facts.resources = cost.within_bounds;
  return { ...facts, passed: Object.values(facts).every(Boolean) };
}

function candidateList(tasks, candidates, bounds, evidence) {
  const base = [
    { id: 'direct', kind: 'direct', task_ids: tasks.map(task => task.id), child_agents: false },
    ...(tasks.length > 1 ? [
      { id: 'sequential', kind: 'sequential', task_ids: tasks.map(task => task.id), child_agents: false },
      { id: 'parallel', kind: 'parallel', task_ids: tasks.map(task => task.id), child_agents: true },
    ] : []),
  ];
  const supplied = candidates === undefined ? base : candidates;
  if (!Array.isArray(supplied) || supplied.length === 0) return { reason_code: 'candidates_invalid' };
  const byId = new Set(); const evaluated = [];
  for (const candidate of supplied) {
    if (!object(candidate) || unknown(candidate, CANDIDATE_FIELDS) || !validId(candidate.id) || byId.has(candidate.id)
      || !['direct', 'sequential', 'parallel', 'specialist', 'composed'].includes(candidate.kind)) return { reason_code: 'candidate_invalid' };
    byId.add(candidate.id);
    const selectedTasks = candidate.task_ids === undefined ? tasks : tasks.filter(task => candidate.task_ids.includes(task.id));
    if (!Array.isArray(candidate.task_ids ?? tasks.map(task => task.id)) || selectedTasks.length !== (candidate.task_ids ?? tasks).length || selectedTasks.length === 0) return { reason_code: 'candidate_tasks_invalid' };
    const cost = candidate.cost === undefined ? costFor(selectedTasks, candidate.kind, bounds) : candidate.cost;
    if (!object(cost) || unknown(cost, new Set([...COST_FIELDS, 'within_bounds'])) || COST_FIELDS.some(field => !finiteBounded(cost[field], bounds[`max_${field}`] ?? 1000000000))) return { reason_code: 'candidate_cost_invalid' };
    const calculated = { ...cost, within_bounds: cost.within_bounds ?? costFor(selectedTasks, candidate.kind, bounds).within_bounds };
    const hard = hardConstraints(selectedTasks, candidate, calculated);
    if (!hard) return { reason_code: 'candidate_constraints_invalid' };
    const specialistRequired = candidate.specialist_required === true || (candidate.kind === 'specialist' && selectedTasks.some(task => task.specialist_value > 0 && (task.verification_need > 0 || task.correct)));
    if ((candidate.kind === 'specialist' || candidate.child_agents === true) && !specialistRequired && evidence?.specialist_required !== true) hard.fit = false;
    hard.passed = Object.values(hard).every(Boolean);
    evaluated.push({ id: candidate.id, kind: candidate.kind, task_ids: selectedTasks.map(task => task.id), child_agents: candidate.child_agents === true, hard_constraints: hard, cost: calculated, specialist_required: specialistRequired });
  }
  evaluated.sort((left, right) => left.id.localeCompare(right.id));
  return { evaluated };
}

const STRATEGY_HARD_FIELDS = ['safe', 'correct', 'quality', 'fit', 'available', 'in_scope'];
const STRATEGY_COST_LIMITS = [
  ['expected_time_ms', 'max_time_ms'], ['expected_tokens', 'max_tokens'], ['calls', 'max_calls'],
  ['retries', 'max_retries'], ['failures', 'max_failures'], ['coordination_cost', 'max_coordination_cost'],
];

function strategyParts(action) {
  const plan = action?.strategy_plan ?? action?.plan ?? action;
  const strategy = plan?.strategy ?? plan;
  return { plan, strategy };
}

function validHardContract(strategy) {
  const hard = strategy?.hard_constraints;
  return object(hard) && HARD_FIELDS.every(field => hard[field] === true)
    && hard.resources === true && hard.passed === true;
}

function validResourceContract(strategy) {
  const limits = strategy?.resource_limits;
  const cost = strategy?.cost;
  return object(limits) && object(cost) && STRATEGY_COST_LIMITS.every(([costField, limitField]) =>
    finiteBounded(cost[costField], 10 ** 12) && finiteBounded(limits[limitField], 10 ** 12));
}

function withinResourceBounds(strategy) {
  return STRATEGY_COST_LIMITS.every(([costField, limitField]) => strategy.cost[costField] <= strategy.resource_limits[limitField]);
}

/** Validate the optional strategy contract at the dispatch boundary. */
export function validateStrategyBounds(action = {}) {
  const hasPlan = action?.strategy !== undefined || action?.strategy_plan !== undefined || action?.plan !== undefined;
  if (!hasPlan) return { ok: true };
  const { plan, strategy } = strategyParts(action);
  if (plan?.status === 'blocked' || strategy?.status === 'blocked') return { ok: false, reason: 'strategy_blocked' };
  if (plan?.status !== 'planned' || plan?.dispatch_eligible !== true) return { ok: false, reason: 'strategy_not_dispatch_eligible' };
  if (strategy?.contract_version !== STRATEGY_CONTRACT_VERSION) return { ok: false, reason: 'strategy_contract_invalid' };
  if (action.strategy_id && plan?.strategy_id && action.strategy_id !== plan.strategy_id) return { ok: false, reason: 'strategy_identity_mismatch' };
  if (action.workflow_id && plan?.workflow_id && action.workflow_id !== plan.workflow_id) return { ok: false, reason: 'strategy_identity_mismatch' };
  if (action.transition_id && plan?.transition_id && action.transition_id !== plan.transition_id) return { ok: false, reason: 'strategy_identity_mismatch' };
  if (!strategy || typeof strategy !== 'object' || !Array.isArray(strategy.work)) return { ok: false, reason: 'strategy_work_invalid' };
  if (!validHardContract(strategy)) return { ok: false, reason: 'strategy_constraints_failed' };
  if (!validResourceContract(strategy)) return { ok: false, reason: 'strategy_resource_contract_invalid' };
  if (!withinResourceBounds(strategy)) return { ok: false, reason: 'strategy_resource_bound_exceeded' };
  const workIds = new Set();
  for (const work of strategy.work) {
    if (!work || !validId(work.id) || workIds.has(work.id)) return { ok: false, reason: 'strategy_work_invalid' };
    workIds.add(work.id);
    if (work.status === 'completed' || work.completed === true) return { ok: false, reason: 'strategy_work_unfinished_required' };
    if (STRATEGY_HARD_FIELDS.some(field => work[field] === false)) return { ok: false, reason: 'strategy_constraints_failed' };
  }
  if (action.work_id && !workIds.has(action.work_id)) return { ok: false, reason: 'strategy_work_unplanned' };
  const limits = strategy.resource_limits;
  const cost = strategy.cost;
  if (!validResourceContract(strategy)) return { ok: false, reason: 'strategy_resource_contract_invalid' };
  return { ok: true };
}

function completedIds(checkpoints) {
  const values = [checkpoints?.completed_work, checkpoints?.completed_actions, checkpoints?.claimed_actions]
    .find(value => Array.isArray(value)) || [];
  return new Set(values.filter(validId));
}

function replacementParts(replacement) {
  const plan = replacement?.strategy ?? replacement;
  return { plan: replacement, strategy: plan?.strategy ?? plan };
}

/** Allow one evidence-bound, hard-gated transition and return safe unfinished work only. */
export function replanStrategy({ current, failure, replacement, checkpoints, bounds } = {}) {
  const completed = [...completedIds(checkpoints)];
  const finish = (reason_code, facts = {}) => blocked(reason_code, { replan_count: Number.isInteger(current?.replan_count) ? current.replan_count : 0, completed_work: completed, resume_work: [], ...facts });
  if (!current || current.status !== 'planned' || current.dispatch_eligible !== true) return finish('current_strategy_invalid');
  const strategyId = current.strategy_id ?? current.strategy?.strategy_id;
  if (!failure || !validId(strategyId) || failure.strategy_id !== strategyId || !validId(failure.work_id)) return finish(failure?.strategy_id && failure.strategy_id !== strategyId ? 'replan_evidence_mismatch' : 'replan_evidence_missing');
  if (!['resource_exhausted', 'repeated_failure', 'failure'].includes(failure.reason_code)) return finish('replan_evidence_missing');
  if (!Number.isInteger(current.replan_count)) return finish('replan_count_invalid');
  if (current.replan_count !== 0) return finish('one_replan_exhausted');
  const currentWork = current.strategy?.work;
  if (!Array.isArray(currentWork) || !currentWork.some(work => work?.id === failure.work_id) || completed.includes(failure.work_id)) return finish('replan_evidence_mismatch');
  const { plan, strategy } = replacementParts(replacement);
  if (!strategy || !Array.isArray(strategy.work)) return finish('replacement_invalid');
  if (plan?.status !== 'planned' || plan?.dispatch_eligible !== true || plan?.strategy_id !== strategyId) return finish('replan_evidence_mismatch');
  if (strategy.contract_version !== STRATEGY_CONTRACT_VERSION || !validHardContract(strategy)) return finish('replacement_not_safe');
  if (!validResourceContract(strategy)) return finish('replacement_invalid');
  if (!withinResourceBounds(strategy)) return finish('replacement_over_bound');
  const replacementIds = new Set();
  for (const work of strategy.work) {
    if (!work || !validId(work.id) || replacementIds.has(work.id)) return finish('replacement_invalid');
    replacementIds.add(work.id);
    if (STRATEGY_HARD_FIELDS.some(field => work[field] === false)) return finish('replacement_not_safe');
  }
  const limits = bounds ?? current.strategy?.resource_limits;
  const cost = strategy.cost;
  if (cost && limits && STRATEGY_COST_LIMITS.some(([costField, limitField]) => !finiteBounded(cost[costField], 10 ** 12) || !finiteBounded(limits[limitField], 10 ** 12) || cost[costField] > limits[limitField])) return finish('replacement_over_bound');
  const resume = strategy.work.filter(work => !completed.includes(work.id));
  return {
    status: 'planned', dispatch_eligible: true, reason_code: 'evidence_backed_replan',
    strategy_id: strategyId, workflow_id: current.workflow_id, transition_id: current.transition_id,
    replan_count: 1, completed_work: completed, resume_work: resume,
    strategy: { ...current.strategy, ...strategy, work: resume },
  };
}

export function planStrategy({ workflow, closure, tasks, candidates, bounds: rawBounds, evidence } = {}) {
  const selected = token(workflow);
  if (!selected) return blocked('workflow_not_dispatch_eligible');
  if (!safeClosure(closure, selected)) return blocked('dependency_closure_not_dispatch_eligible');
  const bounds = boundsFor(rawBounds);
  if (!bounds) return blocked('resource_bounds_invalid');
  const facts = taskFacts(tasks, bounds);
  if (facts.reason_code) return blocked(facts.reason_code);
  const options = candidateList(facts.tasks, candidates, bounds, evidence);
  if (options.reason_code) return blocked(options.reason_code);
  const eligible = options.evaluated.filter(candidate => candidate.hard_constraints.passed);
  if (eligible.length === 0) return blocked('no_candidate_satisfies_hard_constraints', { candidates: options.evaluated });
  eligible.sort((left, right) => stableStringify(left.cost).localeCompare(stableStringify(right.cost)) || left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
  const chosen = eligible.find(candidate => candidate.kind === 'direct' && facts.tasks.length === 1) ?? eligible[0];
  const work = facts.tasks.map(task => ({ id: task.id, depends_on: [...task.depends_on] }));
  return {
    status: 'planned', dispatch_eligible: true, reason_code: chosen.kind === 'direct' ? 'direct_proportional_baseline' : 'eligible_strategy_minimum_cost',
    workflow_id: selected.workflow_id, transition_id: selected.transition_id, replan_count: 0,
    strategy_id: `${selected.workflow_id}:${selected.transition_id}:${chosen.id}`,
    strategy: { contract_version: STRATEGY_CONTRACT_VERSION, kind: chosen.kind, child_agents: chosen.child_agents, work, dependencies: work.flatMap(task => task.depends_on.map(depends_on => ({ task_id: task.id, depends_on }))), hard_constraints: chosen.hard_constraints, resource_limits: bounds, measured_facts: facts.tasks.map(({ id, size, verification_need, specialist_value, quality_required, risk }) => ({ id, size, verification_need, specialist_value, quality_required, risk })), cost: chosen.cost, reason_code: chosen.kind === 'direct' ? 'direct_proportional_baseline' : 'eligible_strategy_minimum_cost', candidates: options.evaluated.map(({ id, kind, hard_constraints, cost }) => ({ id, kind, hard_constraints, cost })) },
  };
}

// Production seam: markers from older installs contain only lease metadata.
// Give those markers the same validated direct baseline as fully populated
// workflow markers, while preserving supplied planning inputs for strict
// validation by the dispatch contract.
export function planProductionDispatch(action = {}) {
  const suppliedPlan = action?.strategy_plan ?? action?.strategy;
  if (suppliedPlan !== undefined) return { ...action, status: suppliedPlan?.status || action.status, strategy_plan: suppliedPlan };
  const hasInputs = ['workflow', 'closure', 'tasks', 'candidates', 'bounds'].some(key => Object.hasOwn(action, key));
  const workflowId = validId(action.workflow_id) ? action.workflow_id : 'native-dispatch';
  const transitionId = validId(action.transition_id) ? action.transition_id : 'native-dispatch';
  const workId = validId(action.work_id) ? action.work_id : 'native-work';
  const workflow = hasInputs ? action.workflow : {
    status: 'selected', dispatch_eligible: true,
    selection: { transition_id: transitionId, workflow_id: workflowId, family: 'native', from: 'route', to: 'dispatch' },
  };
  const closure = hasInputs ? action.closure : {
    status: 'resolved', dispatch_eligible: true, workflow_id: workflowId, transition_id: transitionId,
  };
  const tasks = hasInputs ? action.tasks : [{
    id: workId, depends_on: [], size: 1, verification_need: 0, specialist_value: 0,
    quality_required: 1, coordination_cost: 0, risk: 0, available: true, in_scope: true,
    safe: true, correct: true, fit: true,
    resources: { expected_time_ms: 1000, expected_tokens: 100, calls: 1, retries: 0, failures: 0, coordination_cost: 0 },
  }];
  const plan = planStrategy({ workflow, closure, tasks, candidates: action.candidates, bounds: action.bounds, evidence: action.evidence });
  return {
    ...action,
    status: plan.status,
    strategy_plan: plan,
    ...(plan.status === 'planned' ? { strategy_id: plan.strategy_id, workflow_id: plan.workflow_id, transition_id: plan.transition_id } : {}),
  };
}
