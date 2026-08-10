import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';

import { parseSemanticIntent } from '../intent/semantic.mjs';
import { planWorkflow } from '../orchestrator/workflow-plan.mjs';
import { executeWorkflowPlan } from '../orchestrator/workflow-execution.mjs';
import { stableStringify } from '../registry/schema.mjs';

export const EVALUATION_V20_VERSION = 'v2.0-evaluation-v1';
export const EVALUATION_V20_BUDGETS = Object.freeze({
  prompt_max_ms: 100,
  planning_max_context_bytes: 18432,
  planning_max_tokens: 6144,
});

const FAMILY_CASES = [
  {
    case_id: 'quality-audit-positive',
    prompt: 'audit the whole repository and report findings',
    expected_task_family: 'quality-audit',
    required_stages: ['baseline', 'parallel-read-only-audits', 'synthesis', 'regression-checks', 'final-report'],
  },
  {
    case_id: 'quality-audit-paraphrase',
    prompt: 'perform a quality check on this project',
    expected_task_family: 'quality-audit',
    required_stages: ['baseline', 'parallel-read-only-audits', 'synthesis', 'regression-checks', 'final-report'],
  },
  {
    case_id: 'feature-build-positive',
    prompt: 'build the missing feature in the project and test it',
    expected_task_family: 'feature-build',
    required_stages: ['baseline', 'isolated-fixes', 'targeted-validation', 'final-report'],
  },
  {
    case_id: 'feature-build-paraphrase',
    prompt: 'implement this functionality in the application',
    expected_task_family: 'feature-build',
    required_stages: ['baseline', 'isolated-fixes', 'targeted-validation', 'final-report'],
  },
  {
    case_id: 'bug-fix-positive',
    prompt: 'diagnose and fix the failing bug in the module',
    expected_task_family: 'bug-diagnosis-fix',
    required_stages: ['baseline', 'isolated-fixes', 'targeted-validation', 'final-report'],
  },
  {
    case_id: 'bug-fix-paraphrase',
    prompt: 'troubleshoot the error in the module',
    expected_task_family: 'bug-diagnosis-fix',
    required_stages: ['baseline', 'isolated-fixes', 'targeted-validation', 'final-report'],
  },
  {
    case_id: 'refactor-positive',
    prompt: 'refactor the slow module and benchmark it',
    expected_task_family: 'refactor-optimization',
    required_stages: ['baseline', 'parallel-read-only-audits', 'synthesis', 'isolated-fixes', 'targeted-validation', 'final-report'],
  },
  {
    case_id: 'refactor-paraphrase',
    prompt: 'optimize the performance of this codebase',
    expected_task_family: 'refactor-optimization',
    required_stages: ['baseline', 'parallel-read-only-audits', 'synthesis', 'isolated-fixes', 'targeted-validation', 'final-report'],
  },
  {
    case_id: 'design-review-positive',
    prompt: 'review the interface design in the application',
    expected_task_family: 'design-review',
    required_stages: ['baseline', 'parallel-read-only-audits', 'synthesis', 'final-report'],
  },
  {
    case_id: 'design-review-paraphrase',
    prompt: 'perform a usability review on the interface',
    expected_task_family: 'design-review',
    required_stages: ['baseline', 'parallel-read-only-audits', 'synthesis', 'final-report'],
  },
  {
    case_id: 'browser-positive',
    prompt: 'verify the user flow in a browser',
    expected_task_family: 'browser-interaction-verification',
    browser_required: true,
    required_stages: ['baseline', 'interaction-inventory', 'targeted-validation', 'browser-uat', 'final-report'],
  },
  {
    case_id: 'browser-paraphrase',
    prompt: 'click through the website and report the result',
    expected_task_family: 'browser-interaction-verification',
    browser_required: true,
    required_stages: ['baseline', 'interaction-inventory', 'browser-uat', 'final-report'],
  },
  {
    case_id: 'broad-coordinator',
    prompt: 'audit the repository, fix the bug, and verify the browser flow',
    expected_task_family: 'coordinator-workflow',
    browser_required: true,
    required_stages: [
      'baseline', 'interaction-inventory', 'parallel-read-only-audits', 'synthesis',
      'isolated-fixes', 'targeted-validation', 'browser-uat', 'regression-checks', 'final-report',
    ],
  },
];

const NEGATIVE_CASES = [
  ['quality-audit-negative', 'do not audit the repository', 'quality-audit'],
  ['quality-audit-hypothetical', 'what if we audit the project', 'quality-audit'],
  ['feature-build-negative', 'do not build the feature', 'feature-build'],
  ['bug-fix-negative', 'do not fix the bug', 'bug-diagnosis-fix'],
  ['refactor-negative', 'explain how to optimize the code', 'refactor-optimization'],
  ['design-negative', 'do not review the design', 'design-review'],
  ['browser-negative', 'explain how to test this in a browser', 'browser-interaction-verification'],
].map(([case_id, prompt, expected_task_family]) => ({
  case_id, prompt, expected_task_family, negative: true, required_stages: [],
}));

export const V20_CASES = Object.freeze([...FAMILY_CASES, ...NEGATIVE_CASES]);

function hash(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function roleCapability(runtime, role, index) {
  const capability_id = 'evaluation/' + runtime + '/' + role + '/' + index;
  const write = role === 'implementation';
  return {
    capability_id,
    roles: [role],
    validated: true,
    available: true,
    eligible: true,
    runtime,
    safety_modes: write ? ['isolated-write'] : ['read-only'],
    action: {
      action_id: role,
      safety_mode: write ? 'isolated-write' : 'read-only',
      side_effects: [write ? 'isolated-write' : 'read-only'],
    },
    async invoke() {
      return {
        actual: { capability_id, role, runtime },
        observation: {
          runtime_observed: true,
          ...(role === 'browser-verification' ? { actual_interaction: true, verification_ref: 'evaluation-browser-observation' } : {}),
        },
        verdict: 'passed',
        evidence: { reference: 'evaluation-evidence-' + role },
      };
    },
  };
}

export function createEvaluationCapabilities(runtime) {
  return [
    'inspection', 'audit', 'synthesis', 'implementation',
    'testing', 'browser-verification', 'reporting',
  ].map((role, index) => roleCapability(runtime, role, index));
}

function rowFailure(row, code) {
  return { case_id: row.case_id, runtime: row.runtime, reason_code: code };
}

function safeReceiptPass(receipt) {
  return Boolean(receipt?.selected?.capability_id
    && receipt?.actual?.capability_id
    && receipt?.invocation_evidence?.receipt_id === receipt.receipt_id
    && receipt?.postcondition_evidence?.receipt_id === receipt.receipt_id
    && receipt?.postcondition_evidence?.verified === true);
}

function planningMeasure(capabilities, sample) {
  const coldStart = performance.now();
  const coldIntent = parseSemanticIntent(sample.prompt);
  const coldPlan = planWorkflow({ intent: coldIntent, capabilities });
  const coldMs = performance.now() - coldStart;
  const warm = [];
  for (let index = 0; index < 8; index += 1) {
    const start = performance.now();
    planWorkflow({ intent: parseSemanticIntent(sample.prompt), capabilities });
    warm.push(performance.now() - start);
  }
  warm.sort((left, right) => left - right);
  const planBytes = Buffer.byteLength(JSON.stringify(coldPlan), 'utf8');
  return {
    cold_ms: coldMs,
    warm_p95_ms: warm[Math.max(0, Math.ceil(warm.length * 0.95) - 1)],
    context_bytes: coldPlan.plan_bounds?.total_context_bytes || 0,
    estimated_tokens: Math.ceil(planBytes / 3),
  };
}

function parity(rows, variants) {
  const runtimes = variants.map(variant => variant.runtime).sort();
  const byCase = new Map();
  for (const row of rows) {
    if (!byCase.has(row.case_id)) byCase.set(row.case_id, []);
    byCase.get(row.case_id).push(row);
  }
  const failures = [];
  for (const [case_id, caseRows] of byCase) {
    const signatures = new Set(caseRows.map(row => JSON.stringify({
      runtime: row.runtime,
      stage_ids: row.stage_ids,
      execution_status: row.execution_status,
      negative_pass: row.negative_pass,
    })));
    if (caseRows.length !== runtimes.length || new Set(caseRows.map(row => row.runtime)).size !== runtimes.length
        || new Set(caseRows.map(row => JSON.stringify({ stage_ids: row.stage_ids, execution_status: row.execution_status, negative_pass: row.negative_pass }))).size !== 1) {
      failures.push({ case_id, runtimes, signatures: [...signatures].sort() });
    }
  }
  return { pass: failures.length === 0, runtimes, failures };
}

/**
 * Evaluate the complete v2.0 workflow outside the prompt path. Raw corpus
 * prompts are consumed internally and never copied into the returned report.
 */
export async function runV20Evaluation({
  variants = null,
  cases = V20_CASES,
  now = Date.now(),
} = {}) {
  const runtimeVariants = (Array.isArray(variants) && variants.length ? variants : [
    { runtime: 'claude', capabilities: createEvaluationCapabilities('claude') },
    { runtime: 'codex', capabilities: createEvaluationCapabilities('codex') },
  ]).map(variant => ({
    runtime: variant.runtime,
    capabilities: Array.isArray(variant.capabilities) ? variant.capabilities : createEvaluationCapabilities(variant.runtime),
  }));
  const rows = [];
  for (const variant of runtimeVariants) {
    for (const testCase of Array.isArray(cases) ? cases : []) {
      const intent = parseSemanticIntent(testCase.prompt);
      if (testCase.negative) {
        rows.push({
          case_id: testCase.case_id,
          runtime: variant.runtime,
          expected_task_family: testCase.expected_task_family,
          negative_pass: intent.dispatch_eligible !== true && intent.disposition !== 'execute',
          selection_pass: false,
          stage_ids: [],
          execution_status: 'not_planned',
          selected_actual_pass: true,
          browser_evidence_pass: true,
        });
        continue;
      }
      const plan = planWorkflow({ intent, capabilities: variant.capabilities });
      const stage_ids = Array.isArray(plan.stages) ? plan.stages.map(stage => stage.id) : [];
      const selection_pass = plan.status === 'planned'
        && JSON.stringify(stage_ids) === JSON.stringify(testCase.required_stages);
      const execution = plan.status === 'planned'
        ? await executeWorkflowPlan({
          plan,
          capabilities: variant.capabilities,
          authorization: { approved: true, runtime_gates: true, read_only: true, write: true },
          runtime: variant.runtime,
        })
        : null;
      const stageResults = execution?.stage_results || [];
      const browserResult = stageResults.find(stage => stage.stage_id === 'browser-uat');
      const receipts = execution?.receipts || [];
      const selectedActualPass = execution?.status === 'completed'
        && receipts.length > 0 && receipts.every(safeReceiptPass);
      rows.push({
        case_id: testCase.case_id,
        runtime: variant.runtime,
        expected_task_family: testCase.expected_task_family,
        negative_pass: null,
        selection_pass,
        stage_ids,
        execution_status: execution?.status || 'not_planned',
        execution_reason_code: execution?.reason_code || plan.reason_code,
        selected_actual_pass: selectedActualPass,
        browser_evidence_pass: testCase.browser_required
          ? Boolean(browserResult?.verified === true)
          : true,
        receipt_count: receipts.length,
      });
    }
  }

  const positiveRows = rows.filter(row => row.negative_pass === null);
  const negativeRows = rows.filter(row => row.negative_pass !== null);
  const expectedFamilies = [...new Set(positiveRows.map(row => row.expected_task_family)
    .filter(family => family !== 'coordinator-workflow'))].sort();
  const coveredFamilies = expectedFamilies.filter(family => positiveRows.some(row => (
    row.expected_task_family === family && row.selection_pass
  )));
  const selectionFailures = positiveRows.filter(row => row.selection_pass !== true)
    .map(row => rowFailure(row, 'complete_workflow_selection_failed'));
  const availabilityFailures = positiveRows.filter(row => row.selection_pass !== true)
    .map(row => rowFailure(row, 'expected_role_or_stage_unavailable'));
  const evidenceFailures = positiveRows.filter(row => row.selected_actual_pass !== true)
    .map(row => rowFailure(row, 'selected_actual_evidence_missing'));
  const browserFailures = positiveRows.filter(row => row.browser_evidence_pass !== true)
    .map(row => rowFailure(row, 'browser_runtime_evidence_missing'));
  const negativeFailures = negativeRows.filter(row => row.negative_pass !== true)
    .map(row => rowFailure(row, 'negative_planned_or_authorized'));
  const runtimeParity = parity(rows, runtimeVariants);
  const planning = planningMeasure(runtimeVariants[0].capabilities, positiveRows.length ? V20_CASES.find(testCase => testCase.case_id === positiveRows[0].case_id) : V20_CASES[0]);
  const planningEfficiency = {
    pass: planning.context_bytes <= EVALUATION_V20_BUDGETS.planning_max_context_bytes
      && planning.estimated_tokens <= EVALUATION_V20_BUDGETS.planning_max_tokens,
    ...planning,
    failures: planning.context_bytes > EVALUATION_V20_BUDGETS.planning_max_context_bytes
      ? ['planning_context_budget_exceeded'] : [],
  };
  const promptOverhead = {
    pass: planning.cold_ms <= EVALUATION_V20_BUDGETS.prompt_max_ms
      && planning.warm_p95_ms <= EVALUATION_V20_BUDGETS.prompt_max_ms,
    cold_ms: planning.cold_ms,
    warm_p95_ms: planning.warm_p95_ms,
    max_ms: EVALUATION_V20_BUDGETS.prompt_max_ms,
    failures: planning.cold_ms > EVALUATION_V20_BUDGETS.prompt_max_ms
      || planning.warm_p95_ms > EVALUATION_V20_BUDGETS.prompt_max_ms ? ['prompt_latency_regression'] : [],
  };
  const dimensions = {
    full_workflow_selection: { pass: selectionFailures.length === 0, failures: selectionFailures },
    task_family_coverage: { pass: coveredFamilies.length === expectedFamilies.length, expected_families: expectedFamilies, covered_families: coveredFamilies, failures: expectedFamilies.filter(family => !coveredFamilies.includes(family)) },
    runtime_parity: runtimeParity,
    selected_actual_evidence: { pass: evidenceFailures.length === 0, failures: evidenceFailures },
    browser_runtime_evidence: { pass: browserFailures.length === 0, failures: browserFailures },
    availability: { pass: availabilityFailures.length === 0, failures: availabilityFailures },
    safety_negatives: { pass: negativeFailures.length === 0, failures: negativeFailures, cases: negativeRows.length },
    planning_efficiency: planningEfficiency,
    prompt_overhead: promptOverhead,
  };
  const gates = Object.fromEntries(Object.entries(dimensions).map(([name, value]) => [name, value.pass === true]));
  const deterministicRows = rows.map(row => ({
    case_id: row.case_id,
    runtime: row.runtime,
    expected_task_family: row.expected_task_family,
    negative_pass: row.negative_pass,
    selection_pass: row.selection_pass,
    stage_ids: row.stage_ids,
    execution_status: row.execution_status,
    selected_actual_pass: row.selected_actual_pass,
    browser_evidence_pass: row.browser_evidence_pass,
  }));
  return {
    schema_version: 1,
    evaluation_version: EVALUATION_V20_VERSION,
    status: Object.values(gates).every(Boolean) ? 'passed' : 'failed',
    corpus_fingerprint: hash({ version: EVALUATION_V20_VERSION, cases: V20_CASES.map(testCase => ({ case_id: testCase.case_id, family: testCase.expected_task_family, negative: testCase.negative === true })) }),
    evaluation_fingerprint: hash({ runtimes: runtimeVariants.map(variant => variant.runtime).sort(), rows: deterministicRows }),
    generated_at: now,
    case_count: rows.length,
    case_results: rows,
    dimensions,
    mandatory_gates: { gates, no_composite_score: true },
  };
}
