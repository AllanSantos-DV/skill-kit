/**
 * Weight persistence layer for the learner.
 * 
 * Encapsulates file I/O logic and backup fallback strategy.
 * Allows for testability via dependency injection (MockWeightStore).
 *
 * E-02: Optimized loading with "last known good path" hint file.
 * Instead of cascading through all candidates every time, we remember
 * which path succeeded and try it first on the next invocation.
 */

import { readFileSync, existsSync, copyFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { PATHS, FILES } from '../infra/paths.js';

const WEIGHT_PATH_HINT = join(PATHS.BASE, '.weight-path-hint');

/**
 * Persistent weight storage with backup fallback.
 */
export class WeightStore {
  constructor() {
    this._workspacePath = null;
    this._loadedFrom = null;
  }

  /**
   * Try reading and parsing weights from a single path.
   * Returns { weights, activations } or null on failure.
   */
  _tryRead(path) {
    try {
      if (!existsSync(path)) return null;
      const raw = readFileSync(path, 'utf-8');
      const data = JSON.parse(raw);
      return {
        weights: data.weights || {},
        activations: data.activations || {},
      };
    } catch {
      return null;
    }
  }

  /**
   * Load weights from disk. Returns { weights, activations } or null if not found.
   * E-02: Tries last-known-good path first, then falls back to full cascade.
   */
  load(workspacePath = null) {
    if (workspacePath) this._workspacePath = workspacePath;

    // E-02: Try last-known-good path hint first (fast path)
    const hintPath = this._readPathHint();
    if (hintPath) {
      const result = this._tryRead(hintPath);
      if (result) {
        this._loadedFrom = hintPath;
        return result;
      }
    }

    // Full cascade fallback
    const candidates = [];
    if (this._workspacePath) {
      const wsFile = join(this._workspacePath, '.neural-link.weights.json');
      candidates.push(wsFile);
      candidates.push(wsFile.replace('.json', '.backup.json'));
    }
    candidates.push(FILES.LEARNED_WEIGHTS);
    candidates.push(FILES.BACKUP_WEIGHTS);
    // Por último, a cópia de fora da pasta do runtime: só chega aqui quando a pasta foi
    // apagada ou recriada — e então os pesos voltam para o lugar em vez de recomeçar do zero.
    candidates.push(FILES.SAFE_WEIGHTS);
    candidates.push(FILES.SAFE_WEIGHTS_PREV);

    for (const path of candidates) {
      const result = this._tryRead(path);
      if (result) {
        this._loadedFrom = path;
        if (path === FILES.SAFE_WEIGHTS || path === FILES.SAFE_WEIGHTS_PREV) {
          this._restaurar(path);
        } else {
          this._writePathHint(path);
        }
        return result;
      }
    }

    return null;
  }

  /**
   * Devolve a cópia segura para `weights/learned.json` quando a pasta do runtime foi recriada.
   *
   * Sem isto o learner até carregaria da cópia, mas o arquivo principal só renasceria no próximo
   * `save` — e um novo sumiço antes disso não teria nada no lugar. Avisa no stderr: restaurar é
   * sintoma de que alguém apagou a pasta, e isso tem de aparecer.
   */
  _restaurar(origem) {
    try {
      mkdirSync(PATHS.WEIGHTS, { recursive: true });
      copyFileSync(origem, FILES.LEARNED_WEIGHTS);
      this._writePathHint(FILES.LEARNED_WEIGHTS);
      console.error(`[neural-link] pesos restaurados de ${origem} (a pasta do runtime tinha sumido)`);
    } catch (e) {
      console.error(`[neural-link] pesos carregados de ${origem}, mas a restauracao falhou: ${e.message}`);
    }
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
        // E-02: Update hint to workspace path (most specific)
        this._writePathHint(wsPath);
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

    // Cópia rotativa fora da pasta do runtime (a anterior vira `prev`): é a que sobrevive se
    // `~/.copilot/neural-link` for apagada inteira, como aconteceu em 2026-10-11.
    try {
      await mkdir(dirname(FILES.SAFE_WEIGHTS), { recursive: true });
      if (existsSync(FILES.SAFE_WEIGHTS)) {
        copyFileSync(FILES.SAFE_WEIGHTS, FILES.SAFE_WEIGHTS_PREV);
      }
      await writeFile(FILES.SAFE_WEIGHTS, json);
    } catch (e) {
      // Não derruba o dispatch, mas não pode sumir em silêncio: sem a cópia, o próximo
      // apagamento da pasta leva os pesos de novo.
      console.error(`[neural-link] copia segura dos pesos falhou: ${e.message}`);
    }
  }

  /**
   * Read last-known-good path from hint file.
   */
  _readPathHint() {
    try {
      if (!existsSync(WEIGHT_PATH_HINT)) return null;
      const hint = readFileSync(WEIGHT_PATH_HINT, 'utf-8').trim();
      return hint || null;
    } catch {
      return null;
    }
  }

  /**
   * Persist successful load path for next invocation.
   */
  _writePathHint(path) {
    try {
      mkdirSync(PATHS.BASE, { recursive: true });
      writeFileSync(WEIGHT_PATH_HINT, path);
    } catch {
      // Hint write failure is non-critical
    }
  }

  /**
   * Path that was successfully loaded (for debugging).
   */
  get loadedFrom() {
    return this._loadedFrom;
  }
}
