export const PREFERENCE_POLICY_VERSION = 'preference-policy-v1';
export const PREFERENCE_SCOPES = Object.freeze(['global-user', 'runtime', 'project', 'workflow']);
export const ROUTING_MODES = Object.freeze(['direct', 'adaptive', 'semantic', 'pass_through']);

const ROUTING_MODE_ALIASES = new Map([
  ['observation', 'pass_through'],
  ['observation/pass-through', 'pass_through'],
  ['observation/pass_through', 'pass_through'],
  ['observation_pass_through', 'pass_through'],
]);

const PRECEDENCE = new Map(PREFERENCE_SCOPES.map((scope, index) => [scope, index]));

function list(value) {
  return typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

function candidateAliases(candidate) {
  return new Set([
    candidate?.stable_id, candidate?.canonical_id, candidate?.record?.canonical_identity,
    ...list(candidate?.aliases), ...list(candidate?.record?.semantic?.aliases),
    ...list(candidate?.roles), ...list(candidate?.workflow_coverage?.covered_roles),
  ].filter(Boolean).map(value => String(value).toLowerCase()));
}

function applies(preference, scope = {}) {
  if (!PREFERENCE_SCOPES.includes(preference?.scope)) return false;
  if (preference.scope === 'runtime') return preference.runtime === scope.runtime;
  if (preference.scope === 'project') return preference.project_id === scope.project_id;
  if (preference.scope === 'workflow') return preference.workflow_id === scope.workflow_id;
  return true;
}

function normalizeRoutingMode(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const mode = ROUTING_MODE_ALIASES.get(normalized) || normalized;
  return ROUTING_MODES.includes(mode) ? mode : null;
}

/** Resolve the user-controlled routing mode without changing capability preferences. */
export function resolveRoutingMode({ mode, routingMode, preferences, routingPreferences, scope = {}, now = Date.now() } = {}) {
  const explicit = routingMode ?? mode;
  if (explicit !== undefined) {
    const resolved = normalizeRoutingMode(explicit);
    return resolved
      ? { mode: resolved, source: 'call', reason_code: null }
      : { mode: 'adaptive', source: 'fallback', reason_code: 'invalid_routing_mode' };
  }

  const applicable = (Array.isArray(routingPreferences) ? routingPreferences : (Array.isArray(preferences) ? preferences : []))
    .filter(preference => applies(preference, scope))
    .filter(preference => preference.expires_at_ms === undefined || preference.expires_at_ms >= now)
    .map(preference => ({ ...preference, rank: PRECEDENCE.get(preference.scope) ?? -1 }))
    .sort((left, right) => right.rank - left.rank || String(left.preference_id || '').localeCompare(String(right.preference_id || '')));

  for (const preference of applicable) {
    const candidate = preference.routing_mode ?? preference.routingMode ?? preference.mode;
    const resolved = normalizeRoutingMode(candidate);
    if (resolved) return { mode: resolved, source: preference.scope, preference_id: preference.preference_id || null, reason_code: null };
  }
  return { mode: 'adaptive', source: 'default', reason_code: null };
}

function preferenceTarget(preference) {
  return [preference?.capability_id, preference?.alias, preference?.role, preference?.semantic_role]
    .filter(value => typeof value === 'string').map(value => value.toLowerCase());
}

/** Apply preferences only after eligibility/policy filtering. */
export function applyPreferences({ candidates = [], preferences = [], scope = {}, now = Date.now() } = {}) {
  const warnings = [];
  const eligible = (Array.isArray(candidates) ? candidates : []).filter(candidate => (
    candidate?.eligibility?.eligible === true
    && (candidate.workflow_coverage === undefined || candidate.workflow_coverage.complete === true)
  ));
  const applicable = (Array.isArray(preferences) ? preferences : [])
    .filter(preference => applies(preference, scope))
    .map(preference => ({ ...preference, rank: PRECEDENCE.get(preference.scope) ?? -1 }))
    .sort((left, right) => right.rank - left.rank || String(left.preference_id || '').localeCompare(String(right.preference_id || '')));
  const known = new Set(eligible.flatMap(candidate => candidateAliases(candidate)));
  for (const preference of applicable) {
    if (!preferenceTarget(preference).some(target => known.has(target))) {
      warnings.push({ preference_id: preference.preference_id || null, reason_code: 'preference_alias_unresolved' });
    }
  }
  const ranked = eligible.map(candidate => {
    const aliases = candidateAliases(candidate);
    const matches = applicable.filter(preference => preferenceTarget(preference).some(target => aliases.has(target)));
    const valid = matches.filter(preference => {
      if (preference.expires_at_ms !== undefined && (!Number.isSafeInteger(preference.expires_at_ms) || preference.expires_at_ms < now)) {
        warnings.push({ preference_id: preference.preference_id || null, reason_code: 'preference_expired' });
        return false;
      }
      if (preference.source_fingerprint && preference.source_fingerprint !== candidate?.source_fingerprint
        && preference.source_fingerprint !== candidate?.record?.source_freshness?.fingerprint) {
        warnings.push({ preference_id: preference.preference_id || null, reason_code: 'preference_source_stale' });
        return false;
      }
      return true;
    });
    return {
      ...candidate,
      preference: valid[0] ? { scope: valid[0].scope, preference_id: valid[0].preference_id || null } : null,
      preference_rank: valid[0]?.rank ?? -1,
    };
  });
  const maxScore = Math.max(...ranked.map(candidate => Number(candidate.score) || 0), 0);
  ranked.sort((left, right) => (Number(right.score) || 0) - (Number(left.score) || 0) || right.preference_rank - left.preference_rank
    || left.stable_id.localeCompare(right.stable_id));
  const selected = ranked.find(candidate => (Number(candidate.score) || 0) === maxScore) || null;
  return {
    schema_version: 1,
    policy_version: PREFERENCE_POLICY_VERSION,
    status: selected ? 'resolved' : 'unresolved',
    selected,
    candidates: ranked,
    preference_applied: !!selected?.preference,
    warnings: [...new Map(warnings.map(warning => [JSON.stringify(warning), warning])).values()]
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  };
}

export const resolvePreferences = applyPreferences;
