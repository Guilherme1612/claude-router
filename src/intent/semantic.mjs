import { classifyAuthority } from './authority.mjs';
import { classifyIntent } from './classify.mjs';

export const SEMANTIC_INTENT_POLICY_VERSION = 'semantic-intent-v1';

export const SEMANTIC_INTENT_LIMITS = Object.freeze({
  input_chars: 4096,
  tokens: 96,
  values: 8,
  workflow_hints: 4,
});

const VOCABULARY = Object.freeze({
  database: ['database', 'databases', 'db', 'schema', 'schemas', 'table', 'tables', 'model', 'models', 'sql'],
  relationship: ['relationship', 'relationships', 'relation', 'relations', 'foreign-key', 'foreign-keys', 'dependency', 'dependencies', 'connection', 'connections', 'graph', 'lineage'],
  ui: ['ui', 'ux', 'interface', 'frontend', 'front-end', 'screen', 'screens', 'page', 'pages', 'component', 'components', 'visual', 'responsive', 'accessibility'],
  codebase: ['code', 'codebase', 'repo', 'repository', 'project', 'module', 'modules', 'architecture'],
  phase: ['phase', 'milestone', 'workflow', 'task', 'tasks', 'plan', 'planning'],
  inspect: ['inspect', 'inspecting', 'inspection', 'examine', 'examination', 'analyze', 'analysis', 'map', 'mapping', 'trace', 'tracing', 'understand', 'explore', 'audit', 'diagnose', 'inventory'],
  redesign: ['redesign', 'redesigning', 'overhaul', 'overhauling', 'revamp', 'revamping', 'rework', 'polish', 'improve', 'improving'],
  implement: ['build', 'building', 'create', 'creating', 'make', 'add', 'implement', 'implementing', 'change', 'fix', 'repair', 'update'],
  review: ['review', 'reviewing', 'critique', 'evaluate', 'evaluation', 'quality'],
  verify: ['verify', 'verified', 'verification', 'test', 'tests', 'testing', 'proof', 'evidence', 'receipt', 'receipts', 'report'],
  safe: ['safe', 'bounded', 'local', 'existing', 'preserve', 'minimal', 'without', 'only'],
});

const POLICY_DISCUSSION = /\b(the\s+policy|policy\s+(?:says|discussion)|according\s+to\s+(?:the\s+)?(?:policy|rules)|what\s+should\s+(?:the\s+router|you)\s+do)\b/i;
const EXAMPLE_FRAMING = /\b(?:for example|e\.g\.?|such as|like when|suppose|imagine)\b/i;
const TOKEN_RE = /[a-z0-9]+(?:-[a-z0-9]+)*/gi;

function bounded(value, maximum) {
  return [...new Set((Array.isArray(value) ? value : []).filter(Boolean))].sort().slice(0, maximum);
}

function fold(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokens(value) {
  return fold(value).match(TOKEN_RE)?.slice(0, SEMANTIC_INTENT_LIMITS.tokens) || [];
}

function distance(left, right) {
  if (left === right) return 0;
  if (!left || !right) return Math.max(left.length, right.length);
  if (Math.abs(left.length - right.length) > 2) return 3;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function matches(actual, expected) {
  const normalized = fold(actual);
  const ceiling = expected.length >= 8 ? 2 : 1;
  return normalized === expected || (expected.length >= 5 && distance(normalized, expected) <= ceiling);
}

function findMatches(inputTokens, family) {
  const terms = VOCABULARY[family] || [];
  return terms.filter(term => inputTokens.some(token => matches(token, term)));
}

function firstFamily(inputTokens, families) {
  return families.find(family => findMatches(inputTokens, family).length > 0) || null;
}

function inferWorkflow(subjects, operations) {
  if (subjects.includes('database') && (subjects.includes('relationship') || operations.includes('inspect'))) {
    return 'relationship-inspection';
  }
  if (subjects.includes('ui') && (operations.includes('redesign') || operations.includes('implement'))) {
    return 'substantial-ui-redesign';
  }
  if (operations.includes('inspect')) return 'generic-inspection';
  if (operations.includes('review') || operations.includes('verify')) return 'generic-review';
  if (operations.includes('implement') || operations.includes('redesign')) return 'generic-change';
  return null;
}

function confidence({ matchesCount, subjectCount, operationCount, disposition }) {
  if (['quoted', 'explain', 'hypothetical', 'negated', 'prohibited', 'preview'].includes(disposition)) {
    return { tier: 'high', basis_points: 10000 };
  }
  const score = Math.min(10000, 2500 + matchesCount * 900 + subjectCount * 1200 + operationCount * 1300);
  return { tier: score >= 7600 ? 'high' : score >= 4800 ? 'medium' : 'low', basis_points: score };
}

function safeExecutionSignal({ disposition, authorityClass, policyDiscussion, exampleFraming }) {
  if (policyDiscussion || exampleFraming) return 'none';
  if (authorityClass === 'persistent_goal_action') return 'persistent';
  if (authorityClass === 'one_turn_action') return 'one-turn';
  if (authorityClass === 'inspection') return 'inspect';
  return 'none';
}

/**
 * Reduce one prompt to bounded semantic workflow inputs. This function never
 * returns the prompt or a capability locator; it is safe to use before local
 * candidate ranking and does not grant execution authority.
 */
export function parseSemanticIntent(prompt, { policyVersion } = {}) {
  if (policyVersion !== undefined && policyVersion !== SEMANTIC_INTENT_POLICY_VERSION) {
    return {
      schema_version: 1,
      policy_version: SEMANTIC_INTENT_POLICY_VERSION,
      disposition: 'ambiguous',
      dispatch_eligible: false,
      execution_signal: 'none',
      reason_codes: ['policy_version_mismatch'],
      goal: 'unknown', subjects: [], operations: [], constraints: [], evidence_needs: [],
      workflow_hints: [], confidence: { tier: 'low', basis_points: 0 },
    };
  }

  const source = typeof prompt === 'string' ? prompt.slice(0, SEMANTIC_INTENT_LIMITS.input_chars) : '';
  const base = classifyIntent(source);
  const authority = classifyAuthority(source, { intent: base });
  const inputTokens = tokens(source);
  const subjectFamilies = ['database', 'relationship', 'ui', 'codebase', 'phase'];
  const operationFamilies = ['inspect', 'redesign', 'implement', 'review', 'verify'];
  const subjects = bounded(subjectFamilies.filter(family => findMatches(inputTokens, family).length > 0), SEMANTIC_INTENT_LIMITS.values);
  const operations = bounded(operationFamilies.filter(family => findMatches(inputTokens, family).length > 0), SEMANTIC_INTENT_LIMITS.values);
  const constraints = bounded(findMatches(inputTokens, 'safe'), SEMANTIC_INTENT_LIMITS.values);
  const evidenceNeeds = findMatches(inputTokens, 'verify').length ? ['verify'] : [];
  const workflow = inferWorkflow(subjects, operations);
  const workflowHints = workflow ? [workflow] : [];
  const goal = operations.includes('redesign') ? 'redesign'
    : operations.includes('implement') ? 'implement'
      : operations.includes('inspect') ? 'inspect'
        : operations.includes('review') ? 'review'
          : operations.includes('verify') ? 'verify' : 'unknown';
  const matchedTerms = [...subjects, ...operations, ...constraints, ...evidenceNeeds];
  const policyDiscussion = POLICY_DISCUSSION.test(source);
  const exampleFraming = EXAMPLE_FRAMING.test(source) && base.disposition !== 'execute';
  const executionSignal = safeExecutionSignal({
    disposition: base.disposition,
    authorityClass: authority.authority_class,
    policyDiscussion,
    exampleFraming,
  });
  const dispatchEligible = base.dispatch_eligible === true
    && ['one-turn', 'persistent'].includes(executionSignal)
    && !policyDiscussion && !exampleFraming;
  const reasonCodes = [];
  if (workflow) reasonCodes.push('workflow_inferred');
  if (matchedTerms.length === 0) reasonCodes.push('no_semantic_signal');
  if (base.disposition !== 'execute') reasonCodes.push(`disposition_${base.disposition}`);
  if (policyDiscussion || exampleFraming) reasonCodes.push('non_authorizing_framing');
  return {
    schema_version: 1,
    policy_version: SEMANTIC_INTENT_POLICY_VERSION,
    disposition: base.disposition,
    authority_class: authority.authority_class,
    dispatch_eligible: dispatchEligible,
    execution_signal: executionSignal,
    goal,
    subjects,
    operations,
    constraints,
    evidence_needs: evidenceNeeds,
    workflow_hints: workflowHints,
    confidence: confidence({
      matchesCount: matchedTerms.length,
      subjectCount: subjects.length,
      operationCount: operations.length,
      disposition: base.disposition,
    }),
    token_count: inputTokens.length,
    reason_codes: [...new Set(reasonCodes)].sort(),
  };
}

export const structuredIntent = parseSemanticIntent;
