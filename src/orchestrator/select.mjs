const TOKEN_FIELDS = ['transition_id', 'workflow_id', 'family', 'from', 'to'];
const KIND_ORDER = new Map(['skill', 'command', 'agent', 'mcp', 'tool', 'model', 'permission', 'hook']
  .map((kind, index) => [kind, index]));

function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

function blocked(reason_code, facts = {}) {
  return { status: 'blocked', dispatch_eligible: false, reason_code, ...facts };
}

function resolvedToken(workflow) {
  if (!workflow || workflow.status !== 'selected' || workflow.dispatch_eligible !== true) return null;
  const selection = workflow.selection;
  if (!selection || typeof selection !== 'object' || !TOKEN_FIELDS.every(field => validId(selection[field]))) return null;
  return Object.fromEntries(TOKEN_FIELDS.map(field => [field, selection[field]]));
}

function canonicalIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(validId))].sort();
}

function list(value) {
  return typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

function scopeKey(value, seen = new Set()) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return null;
  seen.add(value);
  const parts = [];
  for (const [key, item] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    const child = scopeKey(item, seen);
    if (child === null) return null;
    parts.push(`${key}=${child}`);
  }
  return parts.join('&');
}

function scopeMatches(candidate, requested) {
  if (requested === undefined || requested === null || requested === '') return true;
  const candidateKey = scopeKey(candidate?.scope);
  const requestedKey = scopeKey(requested);
  if (requestedKey === '') return true;
  return candidateKey !== null && requestedKey !== null && candidateKey === requestedKey;
}

function runtimeMatches(candidate, requested) {
  if (requested === undefined || requested === null || requested === '') return true;
  return (candidate?.runtime || candidate?.record?.invocation?.runtime) === requested;
}

function latencyValue(candidate) {
  const value = candidate?.cost?.latency_ms ?? candidate?.latency_ms;
  if (Number.isFinite(value)) return value;
  return ({ low: 1, medium: 2, high: 3, unknown: 4 })[candidate?.cost?.value] ?? 4;
}

function costValue(candidate, field, fallback = 1_000_000_000) {
  const value = candidate?.cost?.[field] ?? candidate?.[field];
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function verifiedEvidence(candidate) {
  return candidate?.evidence?.verified === true
    || candidate?.evidence?.strength === 'verified'
    || Number(candidate?.evidence?.verified_count) > 0;
}

function candidateId(candidate) {
  return String(candidate?.stable_id || candidate?.canonical_id || '');
}

function compareSelection(left, right, { runtime, scope, roles } = {}) {
  const leftRoles = new Set(list(left?.roles).concat(list(left?.workflow_coverage?.covered_roles)));
  const rightRoles = new Set(list(right?.roles).concat(list(right?.workflow_coverage?.covered_roles)));
  const leftTuple = [
    runtimeMatches(left, runtime),
    scopeMatches(left, scope),
    left?.availability?.available === true,
    left?.eligibility?.eligible === true,
    left?.dispatchable === true,
    roles.filter(role => leftRoles.has(role)).length,
    verifiedEvidence(left),
    -costValue(left, 'estimated_tokens'),
    -costValue(left, 'context_bytes'),
    -latencyValue(left),
    -costValue(left, 'retries', 1_000_000),
  ];
  const rightTuple = [
    runtimeMatches(right, runtime),
    scopeMatches(right, scope),
    right?.availability?.available === true,
    right?.eligibility?.eligible === true,
    right?.dispatchable === true,
    roles.filter(role => rightRoles.has(role)).length,
    verifiedEvidence(right),
    -costValue(right, 'estimated_tokens'),
    -costValue(right, 'context_bytes'),
    -latencyValue(right),
    -costValue(right, 'retries', 1_000_000),
  ];
  for (let index = 0; index < leftTuple.length; index += 1) {
    if (leftTuple[index] === rightTuple[index]) continue;
    if (typeof leftTuple[index] === 'boolean') return leftTuple[index] ? -1 : 1;
    return rightTuple[index] - leftTuple[index];
  }
  return candidateId(left).localeCompare(candidateId(right));
}

/** Rank bounded candidates by independent gates; never collapse them into an authority score. */
export function rankSelectionCandidates(options = {}) {
  const {
    candidates = [], explicitCapability, runtime, scope, requiredRoles = [],
    mode, maxCandidates = 16, maxContextBytes = 12_288,
  } = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const source = Array.isArray(candidates) ? candidates : [];
  const roles = list(requiredRoles);
  const limit = Number.isSafeInteger(maxCandidates) && maxCandidates > 0 ? maxCandidates : 16;
  const bypass = mode === 'direct' || mode === 'pass_through';
  const local = source.filter(candidate => runtimeMatches(candidate, runtime) && scopeMatches(candidate, scope));
  const bounded = (bypass || explicitCapability !== undefined)
    ? source.slice(0, limit)
    : [...local].sort((left, right) => compareSelection(left, right, { runtime, scope, roles })).slice(0, limit);
  const omitted_candidate_count = Math.max(0, source.length - bounded.length);
  const base = {
    schema_version: 1,
    status: 'unresolved',
    dispatch_eligible: false,
    selected: null,
    candidates: bounded,
    omitted_candidate_count,
    selection_order: ['explicit', 'runtime', 'scope', 'availability', 'eligibility', 'dispatchability', 'role_fit', 'verified_evidence', 'estimated_tokens', 'context_bytes', 'latency', 'retries', 'stable_identity'],
    budget: { max_candidates: bounded.length, max_context_bytes: maxContextBytes },
  };
  if (bypass) {
    return { ...base, status: 'bypassed', reason_codes: [`${mode}_mode_bypass`], candidates: [] };
  }
  if (explicitCapability !== undefined) {
    const explicit = source.find(candidate => candidateId(candidate) === String(explicitCapability));
    if (!explicit) return { ...base, reason_codes: ['explicit_capability_unknown'] };
    if (!runtimeMatches(explicit, runtime)) return { ...base, reason_codes: ['explicit_capability_runtime_mismatch'] };
    if (!scopeMatches(explicit, scope)) return { ...base, reason_codes: ['explicit_capability_scope_mismatch'] };
    if (explicit?.availability?.available !== true) return { ...base, reason_codes: ['explicit_capability_unavailable'] };
    if (explicit?.eligibility?.eligible !== true) return { ...base, reason_codes: ['explicit_capability_ineligible'] };
    if (explicit?.dispatchable !== true) return { ...base, reason_codes: ['explicit_capability_not_dispatchable'] };
    return { ...base, status: 'resolved', dispatch_eligible: true, selected: explicit, reason_codes: ['explicit_capability_selected'] };
  }
  const ranked = bounded;
  const selected = ranked.find(candidate => (
    runtimeMatches(candidate, runtime)
    && scopeMatches(candidate, scope)
    && candidate?.availability?.available === true
    && candidate?.eligibility?.eligible === true
    && candidate?.dispatchable === true
  )) || null;
  return {
    ...base,
    status: selected ? 'resolved' : 'unresolved',
    dispatch_eligible: !!selected,
    selected,
    candidates: ranked,
    reason_codes: selected ? ['adaptive_candidate_selected'] : ['no_dispatchable_candidate'],
  };
}

function candidateRoles(candidate) {
  return new Set(list(candidate?.roles).concat(list(candidate?.workflow_coverage?.covered_roles)));
}

function safeStage(stage, result, candidateCount) {
  return {
    stage,
    status: result?.status || 'unresolved',
    reason_codes: Array.isArray(result?.reason_codes)
      ? result.reason_codes.filter(value => /^[a-z0-9_:-]{1,96}$/.test(value)).slice(0, 8)
      : [result?.reason_code || 'unresolved'],
    candidate_count: candidateCount,
    omitted_candidate_count: Number.isSafeInteger(result?.omitted_candidate_count) ? result.omitted_candidate_count : 0,
  };
}

/**
 * Apply the public decision cascade once. It is deliberately separate from
 * semantic retrieval so direct and explicit users never pay adaptive costs.
 */
export function decideCapabilityRoute(options = {}) {
  const {
    explicitCapability,
    mode,
    exactCapability,
    workflow = {},
    candidates = [],
    records = [],
    runtime,
    scope,
    limits = {},
    compose = composeForDecision,
  } = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const source = Array.isArray(candidates) ? candidates : [];
  const roles = list(workflow.roles || workflow.required_roles);
  const stages = [];
  const policyLimits = limits && typeof limits === 'object' && !Array.isArray(limits) ? limits : {};
  const maxCandidates = policyLimits.max_candidates;

  if (explicitCapability !== undefined) {
    const explicit = rankSelectionCandidates({ candidates: source, explicitCapability, runtime, scope, requiredRoles: roles, maxCandidates });
    stages.push(safeStage('explicit', explicit, source.length));
    return explicit.status === 'resolved'
      ? { status: 'resolved', dispatch_eligible: true, stage: 'explicit', selected: [candidateId(explicit.selected)], explanation: { cascade: stages } }
      : { status: 'blocked', dispatch_eligible: false, stage: 'explicit', reason_code: explicit.reason_codes?.[0] || 'explicit_capability_blocked', explanation: { cascade: stages } };
  }

  if (mode === 'direct' || mode === 'pass_through' || mode === 'trivial') {
    const bypass = rankSelectionCandidates({ candidates: source, mode: mode === 'trivial' ? 'pass_through' : mode, maxCandidates });
    stages.push(safeStage('direct-pass-through', bypass, source.length));
    return { status: 'bypassed', dispatch_eligible: false, stage: 'direct-pass-through', reason_code: `${mode}_mode_bypass`, explanation: { cascade: stages } };
  }

  if (exactCapability !== undefined) {
    const exact = rankSelectionCandidates({ candidates: source, explicitCapability: exactCapability, runtime, scope, requiredRoles: roles, maxCandidates });
    stages.push(safeStage('exact-local-capability', exact, source.length));
    if (exact.status === 'resolved') return { status: 'resolved', dispatch_eligible: true, stage: 'exact-local-capability', selected: [candidateId(exact.selected)], explanation: { cascade: stages } };
  } else {
    stages.push({ stage: 'exact-local-capability', status: 'skipped', reason_codes: ['exact_capability_not_requested'], candidate_count: source.length, omitted_candidate_count: 0 });
  }

  const roleCandidates = source.filter(candidate => roles.length > 0 && roles.every(role => candidateRoles(candidate).has(role)));
  const roleFit = rankSelectionCandidates({ candidates: roleCandidates, runtime, scope, requiredRoles: roles, maxCandidates });
  stages.push(safeStage('workflow-role', roleFit, roleCandidates.length));
  if (roleFit.status === 'resolved') return { status: 'resolved', dispatch_eligible: true, stage: 'workflow-role', selected: [candidateId(roleFit.selected)], explanation: { cascade: stages } };

  const composition = typeof compose === 'function'
    ? compose({ workflow, candidates: source, records, runtime, scope, limits })
    : composeForDecision({ workflow, candidates: source, records, runtime, scope, limits });
  stages.push(safeStage('minimal-composition', composition, source.length));
  if (composition.status === 'resolved') return { status: 'resolved', dispatch_eligible: true, stage: 'minimal-composition', selected: composition.selected, explanation: { cascade: stages } };
  return {
    status: roles.length ? 'clarify' : 'abstained',
    dispatch_eligible: false,
    stage: roles.length ? 'clarification' : 'abstention',
    reason_code: composition.reason_code || roleFit.reason_codes?.[0] || 'no_dispatchable_capability',
    explanation: { cascade: stages },
  };
}

function composeForDecision({ workflow, candidates, records, runtime, scope, limits }) {
  // Late import would introduce a cycle; the caller supplies this hook below.
  return { status: 'blocked', dispatch_eligible: false, reason_code: 'composition_unavailable' };
}

function recordId(record) {
  if (validId(record?.id)) return record.id;
  if (validId(record?.canonical_identity)) return record.canonical_identity;
  return null;
}

function compareNodes(left, right) {
  const kind = (KIND_ORDER.get(left?.type) ?? KIND_ORDER.size) - (KIND_ORDER.get(right?.type) ?? KIND_ORDER.size);
  return kind || String(recordId(left) || '').localeCompare(String(recordId(right) || ''));
}

function scopeApplies(scope, requested) {
  if (!requested || scope?.kind === 'global') return true;
  if (!scope || scope.kind !== requested.kind || scope.repository !== requested.repository) return false;
  return scope.kind !== 'worktree' || scope.worktree === requested.worktree;
}

function nodeBlocker(record, requestedScope) {
  if (record.available === false) return 'dependency_unavailable';
  if (record.safe === false) return 'dependency_unsafe';
  if (record.lifecycle !== 'ready') return 'dependency_not_ready';
  if (record.type !== 'hook' && record.dispatchable !== true) return 'dependency_not_dispatchable';
  if (!scopeApplies(record.scope, requestedScope)) return 'dependency_out_of_scope';
  const permissions = record.permissions && typeof record.permissions === 'object' ? record.permissions : {};
  const required = canonicalIds(permissions.required);
  const grants = new Set(canonicalIds(permissions.grants));
  const denied = new Set(canonicalIds(permissions.denied));
  if (required.some(value => denied.has(value) || !grants.has(value))) return 'dependency_permission_incomplete';
  if ((Array.isArray(record.conflicts) ? record.conflicts : [])
    .some(value => ['dispatch-blocking', 'build-blocking'].includes(value?.severity))) return 'dependency_conflict';
  return null;
}

function closureBlocked(reason_code, id, kind = 'unknown') {
  return blocked(reason_code, {
    blocker: { kind, canonical_id: id }, closure: [],
  });
}

/** Resolve only declared registry edges into a pure, deterministic closure. */
export function resolveDependencies(options = {}) {
  const { roots = [], registry, requestedScope } = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  if (!registry || !Array.isArray(registry.records)) return blocked('registry_invalid', { closure: [] });
  const records = [...registry.records].sort(compareNodes);
  const recordsById = new Map();
  for (const record of records) {
    const id = recordId(record);
    if (!id || recordsById.has(id)) return closureBlocked('dependency_identity_ambiguous', id || '', record?.type || 'unknown');
    recordsById.set(id, record);
  }

  const ordered = values => canonicalIds(values).map(id => recordsById.get(id) || { id, type: 'unknown' }).sort(compareNodes);
  const visiting = new Set();
  const visited = new Set();
  const completed = [];
  let failure = null;

  function visit(record) {
    const id = recordId(record);
    if (failure || visited.has(id)) return;
    if (!recordsById.has(id)) { failure = closureBlocked('dependency_missing', id, record.type || 'unknown'); return; }
    if (visiting.has(id)) { failure = closureBlocked('dependency_cycle', id, record.type); return; }
    const reason = nodeBlocker(record, requestedScope);
    if (reason) { failure = closureBlocked(reason, id, record.type); return; }

    visiting.add(id);
    const dependencies = [
      ...(Array.isArray(record.dependencies?.items) ? record.dependencies.items : []),
      ...(Array.isArray(record.lifecycle_requirements) ? record.lifecycle_requirements.map(value => (
        validId(value) ? { id: value, available: true } : value
      )) : []),
    ];
    const availability = new Map();
    for (const value of dependencies.filter(value => validId(value?.id))) {
      availability.set(value.id, availability.get(value.id) !== false && value.available !== false);
    }
    for (const dependency of ordered(dependencies.map(value => value?.id))) {
      const dependencyId = recordId(dependency);
      if (availability.get(dependencyId) === false) {
        failure = closureBlocked('dependency_unavailable', dependencyId, dependency.type || 'unknown');
        break;
      }
      visit(dependency);
      if (failure) break;
    }
    visiting.delete(id);
    if (!failure) { visited.add(id); completed.push(record); }
  }

  for (const root of ordered(roots)) {
    visit(root);
    if (failure) return failure;
  }

  const canonical = [...completed].sort(compareNodes);
  const facts = record => ({
    kind: record.type,
    canonical_id: recordId(record),
    provenance: (Array.isArray(record.provenance) ? record.provenance : []).map(source => ({
      runtime: source?.runtime || '', scope: source?.scope || '', logical_root: source?.logical_root || '',
      relative_path: source?.relative_path || '', source_fingerprint: source?.source_fingerprint || '',
      adapter: source?.adapter || '',
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))).slice(0, 16),
  });
  const requiredPermissionNames = canonical.flatMap(record => canonicalIds(record.permissions?.required));
  return {
    status: 'resolved', dispatch_eligible: true, reason_code: 'dependency_closure_safe',
    closure: canonical.map(facts),
    invokable_capabilities: canonical.filter(record => !['hook', 'model', 'permission'].includes(record.type)).map(facts),
    required_models: canonical.filter(record => record.type === 'model').map(recordId),
    required_permissions: canonicalIds([
      ...canonical.filter(record => record.type === 'permission').map(recordId), ...requiredPermissionNames,
    ]),
    lifecycle_bindings: canonical.filter(record => record.type === 'hook').map(record => ({
      canonical_id: recordId(record), event: validId(record.event) ? record.event : 'unspecified',
    })),
  };
}

function declarationFor(workflowId, declarations) {
  const matches = (Array.isArray(declarations) ? declarations : [])
    .filter(value => value && value.workflow_id === workflowId)
    .map(value => ({
      workflow_id: workflowId,
      owners: canonicalIds(value.owners),
      requirements: canonicalIds(value.requirements),
      compatible: canonicalIds(value.compatible),
    }));
  if (matches.length !== 1) return null;
  return matches[0];
}

/**
 * Accept a capability concern only after a single bounded workflow token has
 * passed transition selection. Roots come exclusively from workflow metadata;
 * prompt text and registry names are deliberately not selection inputs.
 */
export function selectCapabilities(options = {}) {
  const input = options && typeof options === 'object' && !Array.isArray(options) ? options : {};
  const token = resolvedToken(input.workflow);
  if (!token) return blocked('workflow_not_dispatch_eligible');

  const declaration = declarationFor(token.workflow_id, input.workflowDeclarations);
  if (!declaration) return blocked('workflow_declaration_invalid', { workflow_id: token.workflow_id });

  const registry = typeof input.getRegistry === 'function' ? input.getRegistry() : input.registry;
  if (!registry || !Array.isArray(registry.records)) {
    return blocked('registry_invalid', { workflow_id: token.workflow_id });
  }

  const explicit = input.explicitCapability;
  if (explicit !== undefined && (!validId(explicit) || !declaration.compatible.includes(explicit))) {
    return blocked('explicit_capability_incompatible', {
      workflow_id: token.workflow_id,
      capability_id: validId(explicit) ? explicit : '',
    });
  }

  const roots = explicit === undefined
    ? canonicalIds([...declaration.owners, ...declaration.requirements])
    : canonicalIds([explicit, ...declaration.requirements]);
  const closure = resolveDependencies({ roots, registry, requestedScope: input.requestedScope });
  return {
    ...closure,
    workflow_id: token.workflow_id,
    transition_id: token.transition_id,
    roots,
  };
}
