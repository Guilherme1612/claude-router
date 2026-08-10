export const TASK_FAMILY_CORPUS_VERSION = 'task-family-corpus-v1';

const freeze = family => Object.freeze({
  ...family,
  signals: Object.freeze([...family.signals]),
  scope_signals: Object.freeze([...family.scope_signals]),
  evidence_needs: Object.freeze([...family.evidence_needs]),
  positive_examples: Object.freeze([...family.positive_examples]),
  safety_negatives: Object.freeze([...family.safety_negatives]),
});

export const TASK_FAMILY_CORPUS = Object.freeze([
  freeze({
    id: 'quality-audit', outcome: 'audit',
    signals: ['quality audit', 'audit', 'quality check', 'quality review'],
    scope_signals: ['repository', 'repo', 'codebase', 'project', 'application', 'whole'],
    evidence_needs: ['audit', 'report'],
    positive_examples: ['audit the whole repository', 'perform a quality check on this project'],
    safety_negatives: ['do not audit the repository', 'what if we audit the project'],
  }),
  freeze({
    id: 'feature-build', outcome: 'build',
    signals: ['build', 'create', 'implement', 'add a feature', 'feature build'],
    scope_signals: ['feature', 'functionality', 'application', 'project', 'module'],
    evidence_needs: ['tests', 'report'],
    positive_examples: ['build the missing feature', 'implement this functionality'],
    safety_negatives: ['do not build the feature', 'explain how to build the feature'],
  }),
  freeze({
    id: 'bug-diagnosis-fix', outcome: 'diagnose-fix',
    signals: ['bug', 'issue', 'debug', 'diagnose', 'troubleshoot', 'fix'],
    scope_signals: ['bug', 'issue', 'error', 'failure', 'application', 'module', 'repository'],
    evidence_needs: ['diagnosis', 'tests', 'report'],
    positive_examples: ['diagnose and fix the failing bug', 'troubleshoot the error in the module'],
    safety_negatives: ['do not fix the bug', 'what if we fix the issue'],
  }),
  freeze({
    id: 'refactor-optimization', outcome: 'refactor-optimize',
    signals: ['refactor', 'optimization', 'optimize', 'improve performance', 'speed up'],
    scope_signals: ['module', 'code', 'codebase', 'performance', 'slow'],
    evidence_needs: ['benchmark', 'tests', 'report'],
    positive_examples: ['refactor the slow module', 'optimize the performance of this code'],
    safety_negatives: ['do not refactor the module', 'explain how to optimize the code'],
  }),
  freeze({
    id: 'design-review', outcome: 'design-review',
    signals: ['design review', 'review the design', 'review the interface', 'usability', 'visual review', 'interface design'],
    scope_signals: ['design', 'interface', 'ui', 'ux', 'frontend', 'screen'],
    evidence_needs: ['design', 'review', 'report'],
    positive_examples: ['review the interface design', 'perform a usability review'],
    safety_negatives: ['do not review the design', 'what if we review the interface'],
  }),
  freeze({
    id: 'browser-interaction-verification', outcome: 'browser-verify',
    signals: ['browser', 'browser test', 'interact with', 'user flow', 'end-to-end browser', 'click through'],
    scope_signals: ['browser', 'user flow', 'web', 'website', 'interface'],
    evidence_needs: ['browser', 'screenshots', 'report'],
    positive_examples: ['verify the user flow in a browser', 'click through the website and report the result'],
    safety_negatives: ['do not verify the flow in a browser', 'explain how to test this in a browser'],
  }),
].sort((left, right) => left.id.localeCompare(right.id)));

function fold(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function signalMatches(source, signal) {
  if (signal.includes(' ')) return source.includes(signal);
  return new RegExp(`\\b${signal.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(source);
}

export function matchTaskFamilies(input) {
  const source = fold(typeof input === 'string' ? input.slice(0, 4096) : '');
  return TASK_FAMILY_CORPUS
    .filter(family => family.signals.some(signal => signalMatches(source, signal)))
    .map(family => family.id)
    .sort()
    .slice(0, TASK_FAMILY_CORPUS.length);
}
