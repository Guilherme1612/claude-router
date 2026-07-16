const TOKEN_FIELDS = ['transition_id', 'workflow_id', 'family', 'from', 'to'];

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

function declarationFor(workflowId, declarations) {
  const matches = (Array.isArray(declarations) ? declarations : [])
    .filter(value => value && value.workflow_id === workflowId)
    .map(value => ({
      workflow_id: workflowId,
      owners: canonicalIds(value.owners),
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

  const roots = explicit === undefined ? declaration.owners : [explicit];
  return {
    status: 'selected',
    dispatch_eligible: true,
    reason_code: explicit === undefined ? 'workflow_capabilities_declared' : 'explicit_capability_compatible',
    workflow_id: token.workflow_id,
    transition_id: token.transition_id,
    roots,
  };
}
