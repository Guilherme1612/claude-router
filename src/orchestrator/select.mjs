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
export function resolveDependencies({ roots = [], registry, requestedScope } = {}) {
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
  const token = resolvedToken(options.workflow);
  if (!token) return blocked('workflow_not_dispatch_eligible');

  const declaration = declarationFor(token.workflow_id, options.workflowDeclarations);
  if (!declaration) return blocked('workflow_declaration_invalid', { workflow_id: token.workflow_id });

  const registry = typeof options.getRegistry === 'function' ? options.getRegistry() : options.registry;
  if (!registry || !Array.isArray(registry.records)) {
    return blocked('registry_invalid', { workflow_id: token.workflow_id });
  }

  const explicit = options.explicitCapability;
  if (explicit !== undefined && (!validId(explicit) || !declaration.compatible.includes(explicit)
    || !declaration.owners.includes(explicit))) {
    return blocked('explicit_capability_incompatible', {
      workflow_id: token.workflow_id,
      capability_id: validId(explicit) ? explicit : '',
    });
  }

  const roots = explicit === undefined
    ? canonicalIds([...declaration.owners, ...declaration.requirements])
    : canonicalIds([explicit, ...declaration.requirements]);
  const closure = resolveDependencies({ roots, registry, requestedScope: options.requestedScope });
  return {
    ...closure,
    workflow_id: token.workflow_id,
    transition_id: token.transition_id,
    roots,
  };
}
