/**
 * E-09: Compiled loading snapshot.
 *
 * Combines validated config + weights into a single JSON file so that
 * a cold CLI start can load everything with one readFile instead of
 * multiple file reads + full config validation.
 *
 * Invalidation: FNV-1a hashes of the source config and weight files
 * are stored inside the snapshot. On load, hashes are recomputed
 * and compared — any mismatch causes a cache miss.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { PATHS, FILES } from '../infra/paths.js';
import { fnv1a } from '../infra/hash.js';
import { resolveConfigFile as resolveConfigFileCascade } from '../infra/config-paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(dirname(__dirname));

const SNAPSHOT_FILE = join(PATHS.BASE, '.loading-snapshot.json');

/**
 * Resolve the current config file path (delegates to config-paths.js cascade).
 * Returns { path, raw } or null.
 */
function resolveConfigFile() {
  return resolveConfigFileCascade({ cwd: process.cwd(), projectRoot });
}

/**
 * Resolve the current weight file content for hashing.
 * Returns raw string or null.
 */
function resolveWeightFileRaw() {
  const candidates = [FILES.LEARNED_WEIGHTS, FILES.BACKUP_WEIGHTS];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return readFileSync(p, 'utf-8');
      } catch {
        continue;
      }
    }
  }
  return null;
}

/**
 * Try loading from the compiled snapshot.
 * Returns { config, weights, activations } or null on miss.
 */
export function tryLoadSnapshot() {
  try {
    if (!existsSync(SNAPSHOT_FILE)) return null;

    const snapRaw = readFileSync(SNAPSHOT_FILE, 'utf-8');
    const snap = JSON.parse(snapRaw);

    if (!snap.configHash || !snap.config) return null;

    // Verify config hash
    const configFile = resolveConfigFile();
    if (!configFile) return null;
    if (fnv1a(configFile.raw) !== snap.configHash) return null;

    // Verify weights hash (optional — weights may not exist yet)
    if (snap.weightsHash != null) {
      const weightRaw = resolveWeightFileRaw();
      if (!weightRaw || fnv1a(weightRaw) !== snap.weightsHash) return null;
    }

    return {
      config: snap.config,
      weights: snap.weights ?? null,
      activations: snap.activations ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Write a compiled snapshot after a successful load of config + weights.
 * @param {object} config - Validated config object
 * @param {string} configRaw - Raw config file content (for hashing)
 * @param {object|null} weights - Weight data (may be null if no weights yet)
 * @param {object|null} activations - Activation counts
 */
export function writeSnapshot(config, configRaw, weights, activations) {
  try {
    mkdirSync(PATHS.BASE, { recursive: true });

    const snap = {
      configHash: fnv1a(configRaw),
      config,
      weights: weights ?? null,
      activations: activations ?? null,
    };

    // Compute weights hash from the global weights file if it exists
    const weightRaw = resolveWeightFileRaw();
    if (weightRaw) {
      snap.weightsHash = fnv1a(weightRaw);
    }

    writeFileSync(SNAPSHOT_FILE, JSON.stringify(snap));
  } catch {
    // Snapshot write failure is non-critical
  }
}
