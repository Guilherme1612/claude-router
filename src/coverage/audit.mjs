import { createHash } from 'node:crypto';

const CAPABILITY_COLLECTIONS = [
  'agents',
  'agents_store_skills',
  'commands',
  'hooks',
  'plugin_skills',
  'project_scoped_skills',
  'skills',
];
const SKILL_COLLECTIONS = new Set([
  'agents_store_skills', 'plugin_skills', 'project_scoped_skills', 'skills',
]);
const ALLOWED_BASELINE = new Set(['expected_bm25_only', 'expected_phase_internal']);

const cleanId = value => String(value || '').replace(/^\/+/, '').trim();
const compareIdentity = (left, right) =>
  left.category.localeCompare(right.category) || left.id.localeCompare(right.id);
const compareDiagnostic = (left, right) =>
  left.code.localeCompare(right.code)
    || String(left.route || '').localeCompare(String(right.route || ''))
    || String(left.target || '').localeCompare(String(right.target || ''))
    || String(left.category || '').localeCompare(String(right.category || ''));

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const fingerprint = value => createHash('sha256').update(stable(value)).digest('hex');
const identityKey = (category, id) => `${category}\0${id}`;

function capabilities(manifest) {
  const rows = [];
  for (const category of CAPABILITY_COLLECTIONS) {
    const entries = Array.isArray(manifest?.[category]) ? manifest[category] : [];
    for (const entry of entries) {
      const id = cleanId(entry?.id || entry?.name);
      if (!id) continue;
      rows.push({
        category,
        id,
        scope: entry?.scope === 'project' || category === 'project_scoped_skills' ? 'project' : 'global',
        missingMcp: category === 'agents' && Array.isArray(entry?.requires_mcp_not_in_manifest)
          ? entry.requires_mcp_not_in_manifest.map(cleanId).filter(Boolean).sort()
          : [],
      });
    }
  }
  return rows.sort(compareIdentity);
}

function targetIndexes(rows) {
  const indexes = {
    command: new Set(),
    skill: new Set(),
    agent: new Set(),
    blockedAgent: new Set(),
  };
  for (const row of rows) {
    if (row.category === 'commands') indexes.command.add(row.id);
    if (SKILL_COLLECTIONS.has(row.category)) indexes.skill.add(row.id);
    if (row.category === 'agents') {
      indexes.agent.add(row.id);
      if (row.missingMcp.length) indexes.blockedAgent.add(row.id);
    }
  }
  return indexes;
}

function typedMappings(modeMap, indexes) {
  const mapped = { command: new Set(), skill: new Set(), agent: new Set() };
  const diagnostics = [];
  if (!modeMap || !Array.isArray(modeMap.entries)) {
    diagnostics.push({ code: 'mode_map_malformed', route: '', target: '', category: 'mode_map',
      reason: 'mode-map entries must be an array' });
    return { mapped, diagnostics };
  }

  const routeIds = new Set(modeMap.entries.map(entry => cleanId(entry?.id)).filter(Boolean));
  for (const entry of modeMap.entries) {
    const route = cleanId(entry?.id) || '<missing id>';
    const mode = cleanId(entry?.mode);
    if (entry?.invoke_kind === 'slash') {
      const alias = mode && mode !== route && routeIds.has(mode);
      const schemaRoute = mode && mode === route && Boolean(modeMap.schema_version);
      if (indexes.command.has(mode)) mapped.command.add(mode);
      else if (!alias && !schemaRoute) diagnostics.push({
        code: 'stale_target', route, target: mode || '<mode>', category: 'commands',
        reason: 'slash mode must match a manifest command or intentional mode-map route id',
      });
    }

    const skills = Array.isArray(entry?.recommended_skills) ? entry.recommended_skills : [];
    for (const rawTarget of skills) {
      const target = cleanId(rawTarget);
      if (indexes.skill.has(target)) mapped.skill.add(target);
      else diagnostics.push({ code: 'stale_skill_target', route, target: target || '<skill>',
        category: 'skills', reason: 'recommended skill is absent from the manifest' });
    }

    const agents = Array.isArray(entry?.recommended_agents) ? entry.recommended_agents : [];
    for (const rawTarget of agents) {
      const target = cleanId(rawTarget);
      if (!indexes.agent.has(target)) diagnostics.push({
        code: 'stale_agent_target', route, target: target || '<agent>', category: 'agents',
        reason: 'recommended agent is absent from the manifest',
      });
      else if (indexes.blockedAgent.has(target)) diagnostics.push({
        code: 'blocked_agent_target', route, target, category: 'agents',
        reason: 'agent requires unavailable MCP and cannot be dispatched',
      });
      else mapped.agent.add(target);
    }
  }
  return { mapped, diagnostics };
}

function baselinePolicy(baseline, rows) {
  const accepted = new Map();
  const diagnostics = [];
  if (!baseline || baseline.schema_version !== 1 || !Array.isArray(baseline.entries)) {
    diagnostics.push({ code: 'baseline_malformed', category: 'baseline', id: '',
      reason: 'baseline requires schema_version 1 and an entries array' });
    return { accepted, diagnostics };
  }

  const present = new Set(rows.map(row => identityKey(row.category, row.id)));
  const seen = new Set();
  const duplicates = new Set();
  for (const entry of baseline.entries) {
    const category = String(entry?.category || '');
    const id = cleanId(entry?.id);
    const key = identityKey(category, id);
    if (seen.has(key)) {
      diagnostics.push({ code: 'baseline_duplicate', category, id, reason: 'duplicate category and id' });
      duplicates.add(key);
      accepted.delete(key);
      continue;
    }
    seen.add(key);
    if (duplicates.has(key)) continue;
    if (!ALLOWED_BASELINE.has(entry?.classification) || !String(entry?.reason || '').trim()) {
      diagnostics.push({ code: 'baseline_disallowed_classification', category, id,
        reason: 'classification must be allowed and reason must be non-empty' });
      continue;
    }
    if (!present.has(key)) {
      diagnostics.push({ code: 'baseline_stale', category, id, reason: 'capability is absent from the manifest' });
      continue;
    }
    accepted.set(key, {
      classification: entry.classification,
      reason: String(entry.reason).trim(),
    });
  }
  return { accepted, diagnostics };
}

function mapped(row, mappings) {
  if (row.category === 'commands') return mappings.command.has(row.id);
  if (SKILL_COLLECTIONS.has(row.category)) return mappings.skill.has(row.id);
  return row.category === 'agents' && mappings.agent.has(row.id);
}

export function auditCoverage({ manifest, modeMap, baseline } = {}) {
  const rows = capabilities(manifest);
  const indexes = targetIndexes(rows);
  const routes = typedMappings(modeMap, indexes);
  const policy = baselinePolicy(baseline, rows);

  const records = rows.map(row => {
    if (row.category === 'hooks') return {
      category: row.category, id: row.id, coverage_status: 'unmapped',
      classification: 'expected_hook', reason: 'hooks are event-bound, not route targets',
    };
    if (row.category === 'agents' && row.missingMcp.length) return {
      category: row.category, id: row.id, coverage_status: 'unmapped',
      classification: 'expected_warn_mcp', reason: `requires unavailable MCP: ${row.missingMcp.join(', ')}`,
    };
    if (row.scope === 'project') return {
      category: row.category, id: row.id, coverage_status: 'unmapped',
      classification: 'expected_scope_project', reason: 'project-scoped capability is not globally routeable',
    };
    if (mapped(row, routes.mapped)) return {
      category: row.category, id: row.id, coverage_status: 'mapped', classification: null,
    };
    const acknowledgement = policy.accepted.get(identityKey(row.category, row.id));
    if (acknowledgement) return {
      category: row.category, id: row.id, coverage_status: 'unmapped', ...acknowledgement,
    };
    return {
      category: row.category, id: row.id, coverage_status: 'unmapped',
      classification: 'gap', reason: 'no typed mode-map target or intentional classification',
    };
  });

  const byClassification = {};
  for (const entry of records) {
    const key = entry.classification || 'mapped';
    byClassification[key] = (byClassification[key] || 0) + 1;
  }
  const unacknowledgedGaps = records
    .filter(entry => entry.classification === 'gap')
    .map(({ category, id }) => ({ category, id }));
  const forwardDiagnostics = routes.diagnostics.sort(compareDiagnostic);
  const baselineDiagnostics = policy.diagnostics.sort((left, right) =>
    left.code.localeCompare(right.code)
      || left.category.localeCompare(right.category)
      || left.id.localeCompare(right.id));

  return {
    schema_version: 1,
    records,
    forward_diagnostics: forwardDiagnostics,
    baseline_diagnostics: baselineDiagnostics,
    counts: {
      total: records.length,
      mapped: records.filter(entry => entry.coverage_status === 'mapped').length,
      unmapped: records.filter(entry => entry.coverage_status === 'unmapped').length,
      forward_diagnostics: forwardDiagnostics.length,
      baseline_diagnostics: baselineDiagnostics.length,
      by_classification: Object.fromEntries(Object.entries(byClassification).sort(([a], [b]) => a.localeCompare(b))),
    },
    unacknowledged_gaps: unacknowledgedGaps,
    fingerprints: {
      manifest: fingerprint(rows.map(({ category, id, scope, missingMcp }) => ({ category, id, scope, missingMcp }))),
      mode_map: fingerprint({
        command: [...routes.mapped.command].sort(),
        skill: [...routes.mapped.skill].sort(),
        agent: [...routes.mapped.agent].sort(),
        diagnostics: forwardDiagnostics,
      }),
      baseline: fingerprint({
        accepted: [...policy.accepted].sort(([a], [b]) => a.localeCompare(b)),
        diagnostics: baselineDiagnostics,
      }),
    },
  };
}
