import { createHash } from 'node:crypto';
import {
  mkdir, open, readFile as readFileFs, readdir, realpath, rename, rm,
} from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { stableStringify } from './schema.mjs';

const SCHEMA_VERSION = 1;

function hash(value) {
  return createHash('sha256').update(stableStringify(value), 'utf8').digest('hex');
}

function portablePath(value) {
  if (typeof value !== 'string' || !value || isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) return null;
  const normalized = posix.normalize(value.replaceAll('\\', '/'));
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) return null;
  return normalized;
}

function contained(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function diagnostic(code, logicalRoot, relativePath, detail) {
  return { code, logical_root: logicalRoot, relative_path: relativePath, detail };
}

function buildSubtreeHashes(roots, entries) {
  const nodes = [];
  for (const logicalRoot of roots) {
    const directories = new Set(['.']);
    for (const entry of entries.filter(item => item.logical_root === logicalRoot)) {
      const segments = entry.relative_path.split('/');
      for (let index = 1; index < segments.length; index += 1) {
        directories.add(segments.slice(0, index).join('/'));
      }
    }
    for (const relativePath of [...directories].sort()) {
      const prefix = relativePath === '.' ? '' : `${relativePath}/`;
      const descendants = entries.filter(entry => entry.logical_root === logicalRoot
        && (relativePath === '.' || entry.relative_path.startsWith(prefix)));
      nodes.push({ logical_root: logicalRoot, relative_path: relativePath, hash: hash(descendants) });
    }
  }
  return nodes;
}

async function walk(rootPath, logicalRoot, options, entries, diagnostics, current = rootPath) {
  let children;
  try {
    children = await readdir(current, { withFileTypes: true });
  } catch (error) {
    diagnostics.push(diagnostic(
      error?.code === 'EACCES' || error?.code === 'EPERM' ? 'access_denied' : 'scan_error',
      logicalRoot,
      portablePath(relative(rootPath, current).replaceAll(sep, '/')) || '.',
      error?.code || 'UNKNOWN',
    ));
    return;
  }
  children.sort((a, b) => a.name.localeCompare(b.name));
  for (const child of children) {
    const absolute = resolve(current, child.name);
    const relativePath = portablePath(relative(rootPath, absolute).replaceAll(sep, '/'));
    if (!relativePath) throw new Error(`invalid portable path beneath ${logicalRoot}`);
    if ((options.ignoredRelativePaths || []).some(prefix => (
      relativePath === prefix || relativePath.startsWith(`${prefix}/`)
    ))) continue;
    let canonical;
    try {
      canonical = await realpath(absolute);
    } catch (error) {
      diagnostics.push(diagnostic('scan_error', logicalRoot, relativePath, error?.code || 'UNKNOWN'));
      continue;
    }
    if (!contained(rootPath, canonical)) {
      diagnostics.push(diagnostic('path_escape', logicalRoot, relativePath, 'outside_logical_root'));
      continue;
    }
    if (child.isDirectory()) {
      await walk(rootPath, logicalRoot, options, entries, diagnostics, canonical);
      continue;
    }
    if (!child.isFile()) continue;
    try {
      const bytes = await options.readFile(canonical);
      entries.push({
        logical_root: logicalRoot,
        relative_path: relativePath,
        entry_type: 'file',
        content_hash: createHash('sha256').update(bytes).digest('hex'),
      });
    } catch (error) {
      diagnostics.push(diagnostic(
        error?.code === 'EACCES' || error?.code === 'EPERM' ? 'access_denied' : 'read_error',
        logicalRoot,
        relativePath,
        error?.code || 'UNKNOWN',
      ));
    }
  }
}

export async function scanFingerprintTree(rootSpecs, options = {}) {
  if (!Array.isArray(rootSpecs) || rootSpecs.length === 0) throw new TypeError('rootSpecs must be a non-empty array');
  const readFile = options.readFile || readFileFs;
  const resolveRealpath = options.realpath || realpath;
  const containmentRoot = options.containmentRoot ? await resolveRealpath(resolve(options.containmentRoot)) : null;
  const normalizedSpecs = [];
  for (const spec of rootSpecs) {
    if (!spec || typeof spec.logicalRoot !== 'string' || !spec.logicalRoot.trim()) {
      throw new TypeError('rootSpecs logicalRoot must be a non-empty string');
    }
    if (spec.logicalRoot.includes('/') || spec.logicalRoot.includes('\\') || isAbsolute(spec.logicalRoot)) {
      throw new TypeError('logicalRoot must be portable');
    }
    const resolvedRoot = resolve(spec.path);
    let canonicalRoot = null;
    let rootMissing = false;
    try {
      canonicalRoot = await resolveRealpath(resolvedRoot);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const missingSegments = [];
      let existingAncestor = resolvedRoot;
      let canonicalAncestor;
      while (true) {
        missingSegments.unshift(basename(existingAncestor));
        existingAncestor = dirname(existingAncestor);
        try {
          canonicalAncestor = await resolveRealpath(existingAncestor);
          break;
        } catch (ancestorError) {
          if (ancestorError?.code !== 'ENOENT' || dirname(existingAncestor) === existingAncestor) throw ancestorError;
        }
      }
      const canonicalMissingRoot = resolve(canonicalAncestor, ...missingSegments);
      if (containmentRoot && !contained(containmentRoot, canonicalMissingRoot)) {
        throw new Error(`${spec.logicalRoot} is outside configured containment root`);
      }
      rootMissing = true;
    }
    if (containmentRoot && !rootMissing && !contained(containmentRoot, canonicalRoot)) {
      throw new Error(`${spec.logicalRoot} is outside configured containment root`);
    }
    const ignoredRelativePaths = (spec.ignoredRelativePaths || []).map(portablePath);
    if (ignoredRelativePaths.some(value => !value)) throw new TypeError('ignoredRelativePaths must be portable');
    normalizedSpecs.push({ logicalRoot: spec.logicalRoot.trim(), canonicalRoot, ignoredRelativePaths, rootMissing });
  }
  normalizedSpecs.sort((a, b) => a.logicalRoot.localeCompare(b.logicalRoot));
  if (new Set(normalizedSpecs.map(spec => spec.logicalRoot)).size !== normalizedSpecs.length) {
    throw new TypeError('logicalRoot values must be unique');
  }
  const entries = [], diagnostics = [];
  for (const spec of normalizedSpecs) {
    if (spec.rootMissing) {
      diagnostics.push({ code: 'root_missing', logical_root: spec.logicalRoot, relative_path: '.', reason: 'ENOENT' });
      continue;
    }
    await walk(spec.canonicalRoot, spec.logicalRoot, { readFile, ignoredRelativePaths: spec.ignoredRelativePaths }, entries, diagnostics);
  }
  entries.sort((a, b) => `${a.logical_root}:${a.relative_path}:${a.entry_type}`
    .localeCompare(`${b.logical_root}:${b.relative_path}:${b.entry_type}`));
  diagnostics.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
  const roots = normalizedSpecs.map(spec => spec.logicalRoot);
  const subtreeHashes = buildSubtreeHashes(roots, entries);
  const rootHashes = subtreeHashes.filter(node => node.relative_path === '.')
    .map(({ logical_root, hash: rootHash }) => ({ logical_root, hash: rootHash }));
  const canonical = {
    schema_version: SCHEMA_VERSION, roots, root_hashes: rootHashes,
    subtree_hashes: subtreeHashes, entries, diagnostics,
  };
  return { ...canonical, hash: hash(canonical) };
}

function invalidState(code) {
  return { clean_scan_required: true, state: null, diagnostics: [{ code }] };
}

function validateState(state, expectedRoots) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return 'invalid_state';
  if (state.schema_version !== SCHEMA_VERSION) return 'incompatible_state';
  if (!Array.isArray(state.roots) || stableStringify([...state.roots].sort()) !== stableStringify([...expectedRoots].sort())) {
    return 'root_set_mismatch';
  }
  if (!Array.isArray(state.entries) || !Array.isArray(state.diagnostics)
    || !Array.isArray(state.root_hashes) || !Array.isArray(state.subtree_hashes)) return 'invalid_state';
  for (const entry of state.entries) {
    if (!state.roots.includes(entry.logical_root) || !portablePath(entry.relative_path)) return 'invalid_portable_path';
    if (entry.entry_type !== 'file' || typeof entry.content_hash !== 'string') return 'invalid_state';
  }
  for (const item of state.diagnostics) {
    if (!item || !state.roots.includes(item.logical_root)) return 'invalid_state';
    if (item.relative_path !== '.' && !portablePath(item.relative_path)) return 'invalid_portable_path';
  }
  const derivedSubtrees = buildSubtreeHashes(state.roots, state.entries);
  const derivedRoots = derivedSubtrees.filter(node => node.relative_path === '.')
    .map(({ logical_root, hash: rootHash }) => ({ logical_root, hash: rootHash }));
  if (stableStringify(state.subtree_hashes) !== stableStringify(derivedSubtrees)
    || stableStringify(state.root_hashes) !== stableStringify(derivedRoots)) return 'state_hash_mismatch';
  const canonical = {
    schema_version: state.schema_version,
    roots: state.roots,
    root_hashes: state.root_hashes,
    subtree_hashes: state.subtree_hashes,
    entries: state.entries,
    diagnostics: state.diagnostics,
  };
  if (typeof state.hash !== 'string' || state.hash !== hash(canonical)) return 'state_hash_mismatch';
  return null;
}

export async function loadFingerprintState(path, expectedRoots) {
  let state;
  try {
    state = JSON.parse(await readFileFs(path, 'utf8'));
  } catch (error) {
    return invalidState(error?.code === 'ENOENT' ? 'state_missing' : 'state_malformed');
  }
  const error = validateState(state, expectedRoots);
  return error
    ? invalidState(error)
    : { clean_scan_required: false, state, diagnostics: [] };
}

export async function saveFingerprintState(path, state) {
  const error = validateState(state, state?.roots || []);
  if (error) throw new TypeError(`cannot save fingerprint state: ${error}`);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp.${process.pid}.${createHash('sha256').update(path).digest('hex').slice(0, 8)}`;
  try {
    const handle = await open(temporary, 'w');
    try {
      await handle.writeFile(`${stableStringify(state)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
