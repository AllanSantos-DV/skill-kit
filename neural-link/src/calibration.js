/**
 * SessionStart auto-calibration detection.
 *
 * Scans installed hook scripts in ~/.copilot/hooks/scripts/
 * and compares against configured handlers in neural-link.config.json.
 * Returns a calibration-needed response when uncalibrated hooks are found.
 */

import { readdirSync, existsSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { COPILOT } from './infra/paths.js';

/**
 * Extract unique hook names from installed scripts.
 * e.g. "pre-commit-guard.ps1" and "pre-commit-guard.sh" → "pre-commit-guard"
 */
function getInstalledHookNames() {
  if (!existsSync(COPILOT.HOOKS_SCRIPTS)) return [];

  const files = readdirSync(COPILOT.HOOKS_SCRIPTS);
  const names = new Set();

  for (const f of files) {
    const ext = extname(f);
    if (ext === '.ps1' || ext === '.sh') {
      names.add(basename(f, ext));
    }
  }

  return [...names];
}

/**
 * Check for uncalibrated hooks — scripts installed but not in config handlers.
 *
 * @param {object} config - Loaded neural-link config
 * @returns {{ uncalibrated: string[] } | null} - List of uncalibrated hook names, or null if all calibrated
 */
export function checkCalibration(config) {
  const installed = getInstalledHookNames();
  if (installed.length === 0) return null;

  const configured = new Set(Object.keys(config.handlers || {}));
  const uncalibrated = installed.filter(name => !configured.has(name));

  if (uncalibrated.length === 0) return null;

  return { uncalibrated };
}

/**
 * Build the calibration-needed response for SessionStart.
 * Returns an object that index.js can write directly to stdout.
 *
 * @param {string[]} uncalibrated - Names of uncalibrated hooks
 * @returns {object} - Hook response with calibration instructions
 */
export function buildCalibrationResponse(uncalibrated) {
  const hookList = uncalibrated.map(h => `- \`${h}\``).join('\n');

  const content = [
    '⚠️ **Neural Link: Uncalibrated hooks detected**',
    '',
    'The following hook scripts are installed but have no Neural Link configuration:',
    hookList,
    '',
    'To calibrate, use the **hooks-creator** skill to generate companion `.neural-link.json` files for each hook,',
    'then run **Pull All** in Skill Manager to sync the configuration.',
    '',
    'Without calibration, these hooks will not be scored or dispatched by Neural Link.',
  ].join('\n');

  return {
    decision: 'add',
    reason: `[neural-link] ${uncalibrated.length} uncalibrated hook(s) detected`,
    content,
    hookSpecificOutput: {
      neural_link: {
        version: '1.0',
        calibration: {
          status: 'needed',
          uncalibrated,
        },
      },
    },
  };
}
