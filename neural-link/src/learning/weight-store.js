/**
 * Weight persistence layer for the learner.
 * 
 * Encapsulates file I/O logic and backup fallback strategy.
 * Allows for testability via dependency injection (MockWeightStore).
 */

import { readFileSync, existsSync, copyFileSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PATHS, FILES } from '../infra/paths.js';

/**
 * Persistent weight storage with backup fallback.
 */
export class WeightStore {
  constructor() {
    this._workspacePath = null;
    this._loadedFrom = null;
  }

  /**
   * Load weights from disk. Returns { weights, activations } or null if not found.
   * Tries workspace paths first, then global, then backups.
   */
  load(workspacePath = null) {
    if (workspacePath) this._workspacePath = workspacePath;

    const candidates = [];
    if (this._workspacePath) {
      const wsFile = join(this._workspacePath, '.neural-link.weights.json');
      candidates.push(wsFile);
      candidates.push(wsFile.replace('.json', '.backup.json'));
    }
    candidates.push(FILES.LEARNED_WEIGHTS);
    candidates.push(FILES.BACKUP_WEIGHTS);

    for (const path of candidates) {
      if (!existsSync(path)) continue;
      try {
        const raw = readFileSync(path, 'utf-8');
        const data = JSON.parse(raw);
        this._loadedFrom = path;
        return {
          weights: data.weights || {},
          activations: data.activations || {},
        };
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Save weights to disk. Writes to workspace (if available) and global.
   * Creates backup before overwriting.
   */
  async save(weights, activations, vectorSize) {
    const data = {
      version: '1.0',
      vectorSize,
      updatedAt: new Date().toISOString(),
      activations,
      weights,
    };

    const json = JSON.stringify(data, null, 2);

    // Save to workspace if available
    if (this._workspacePath) {
      const wsPath = join(this._workspacePath, '.neural-link.weights.json');
      const wsBackup = wsPath.replace('.json', '.backup.json');
      try {
        if (existsSync(wsPath)) {
          copyFileSync(wsPath, wsBackup);
        }
        await writeFile(wsPath, json);
      } catch {
        // Workspace save failed — fall through to global
      }
    }

    // Always save to global as well (fallback copy)
    try {
      await mkdir(PATHS.WEIGHTS, { recursive: true });
      if (existsSync(FILES.LEARNED_WEIGHTS)) {
        copyFileSync(FILES.LEARNED_WEIGHTS, FILES.BACKUP_WEIGHTS);
      }
      await writeFile(FILES.LEARNED_WEIGHTS, json);
    } catch {
      // Persistence failure is non-critical
    }
  }

  /**
   * Path that was successfully loaded (for debugging).
   */
  get loadedFrom() {
    return this._loadedFrom;
  }
}
