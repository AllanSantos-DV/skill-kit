/**
 * Shared config path cascade used by config.js and snapshot.js.
 * Priority: cwd local → ~/.copilot global → projectRoot bundled.
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, normalize } from 'node:path';

/**
 * Returns ordered candidate paths for neural-link config.
 * @param {{ cwd: string, projectRoot: string }} opts
 * @returns {string[]}
 */
export function getConfigCandidates({ cwd, projectRoot }) {
  const normalizedCwd = normalize(cwd);
  return [
    join(normalizedCwd, '.neural-link.config.json'),
    join(homedir(), '.copilot', 'neural-link.config.json'),
    join(projectRoot, 'neural-link.config.json'),
  ];
}

/**
 * Resolves the first existing config file from the cascade.
 * @param {{ cwd: string, projectRoot: string }} opts
 * @returns {{ path: string, raw: string } | null}
 */
export function resolveConfigFile({ cwd, projectRoot }) {
  const candidates = getConfigCandidates({ cwd, projectRoot });
  for (const p of candidates) {
    const resolved = resolve(p);
    if (resolved.includes('\0')) continue;
    if (existsSync(resolved)) {
      try {
        const raw = readFileSync(resolved, 'utf-8');
        return { path: resolved, raw };
      } catch {
        continue;
      }
    }
  }
  return null;
}
