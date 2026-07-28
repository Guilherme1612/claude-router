import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveObservations } from '../health/catalog.mjs';
import { createHealthStore } from '../health/store.mjs';
import { stableCapabilityId } from '../registry/identity.mjs';
import { selectSuggestion, startupPointer } from './suggestion.mjs';
import { createStewardStore } from './state.mjs';
import { compileStartupPointer } from './startup-pointer.mjs';

function json(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function authoritativeRegistry(ownedRoot) {
  const tuple = json(join(ownedRoot, 'release-tuples', 'active.json'));
  if (typeof tuple?.tuple_version_id === 'string') {
    return json(join(
      ownedRoot, 'release-tuples', 'versions', tuple.tuple_version_id, 'registry.json',
    ));
  }
  const active = json(join(ownedRoot, 'active.json'));
  if (typeof active?.version_id === 'string') {
    return json(join(ownedRoot, 'versions', active.version_id, 'registry.json'));
  }
  const legacy = join(ownedRoot, 'registry', 'registry.json');
  return existsSync(legacy) ? json(legacy) : null;
}

function loadInputs(ownedRoot, now) {
  const source = authoritativeRegistry(ownedRoot) || {};
  const registry = Array.isArray(source.records) ? source.records : [];
  const contracts = new Map();
  for (const record of registry) {
    if (!record?.contract) continue;
    try {
      contracts.set(record.stable_id || stableCapabilityId(record), record.contract);
    } catch {
      // Malformed immutable records are ignored by the conservative projection.
    }
  }
  return {
    registry,
    relationships: source.relationships || {},
    contracts,
    outcomes: createHealthStore({ root: join(ownedRoot, 'health') }).readWindow({ now }).records,
    state: createStewardStore({ root: join(ownedRoot, 'steward') }).readState(),
    healthDisposed: existsSync(join(ownedRoot, 'health', 'state.disposed.json'))
      && !existsSync(join(ownedRoot, 'health', 'state.json')),
  };
}

export function refreshSuggestionPointer({
  ownedRoot,
  now = Date.now(),
  dependencies = {},
} = {}) {
  if (typeof ownedRoot !== 'string') throw new TypeError('ownedRoot is required');
  const inputs = (dependencies.loadInputs || loadInputs)(ownedRoot, now);
  const selected = inputs.healthDisposed
    ? { reason_code: 'suggestion_none', suggestion: null }
    : (dependencies.selectSuggestion || selectSuggestion)({
      observations: (dependencies.deriveObservations || deriveObservations)({
        registry: inputs.registry,
        relationships: inputs.relationships,
        contracts: inputs.contracts,
        outcomes: inputs.outcomes,
        now,
      }).observations,
      state: inputs.state,
      now,
    });
  const pointer = (dependencies.startupPointer || startupPointer)(selected, inputs.state, now);
  return (dependencies.compileStartupPointer || compileStartupPointer)({ ownedRoot, pointer });
}
