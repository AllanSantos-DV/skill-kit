/**
 * Auto-registration discovery for Neural Link.
 *
 * When registration mode is "auto", scans ~/.copilot/hooks/scripts/
 * (global) and optionally workspace hook directories for scripts
 * matching the current OS, infers event bindings from names,
 * and writes new handler entries into neural-link.config.json.
 *
 * Also provides a file-watcher that marks removed scripts as disabled.
 */

import { readdirSync, existsSync, writeFileSync, watch } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { platform } from 'node:os';
import { COPILOT } from './infra/paths.js';
import { getConfigPath } from './infra/config.js';
import {
  NAME_EVENT_PATTERNS,
  DEFAULT_INFERRED_EVENTS,
  PLATFORM_EXTENSIONS,
  DEFAULT_REGISTRATION,
  WORKSPACE_HOOKS_DIRS,
} from './infra/constants.js';

// ─── Helpers ────────────────────────────────────────────────

/**
 * Return the script file extension relevant for the current OS.
 * Windows → ".ps1", everything else → ".sh"
 */
export function platformExtension() {
  return platform() === 'win32'
    ? PLATFORM_EXTENSIONS.win32
    : PLATFORM_EXTENSIONS.unix;
}

/**
 * Infer hook events from the script name using prefix-matching.
 *
 * @param {string} name - Hook name without extension (e.g. "pre-commit-guard")
 * @returns {string[]} - Matching event names
 */
export function inferEvents(name) {
  for (const { prefix, events } of NAME_EVENT_PATTERNS) {
    if (name.startsWith(prefix)) return [...events];
  }
  return [...DEFAULT_INFERRED_EVENTS];
}

/**
 * Scan a directory and return names of scripts
 * that match the current platform extension.
 *
 * @param {string} dir - Absolute path to the directory to scan
 * @returns {string[]} - Unique hook names (without extension)
 */
export function scanDirectory(dir) {
  if (!existsSync(dir)) return [];

  const ext = platformExtension();
  const files = readdirSync(dir);
  const names = [];

  for (const f of files) {
    if (extname(f) === ext) {
      names.push(basename(f, ext));
    }
  }

  return names;
}

/**
 * Scan the global hooks/scripts directory and return names of scripts
 * that match the current platform extension.
 *
 * @returns {string[]} - Unique hook names (without extension)
 */
export function scanScripts() {
  return scanDirectory(COPILOT.HOOKS_SCRIPTS);
}

/**
 * Build a default handler entry for an auto-discovered script.
 *
 * @param {string} name    - Hook name (e.g. "my-hook")
 * @param {object} config  - Full neural-link config (for defaults)
 * @param {object} [options] - Additional options
 * @param {string} [options.source="global"] - Source: "global" or "workspace"
 * @param {string} [options.workingDirectory] - CWD for workspace hooks
 * @returns {object}       - Handler entry ready for config.handlers
 */
export function buildHandlerEntry(name, config, options = {}) {
  const { source = 'global', workingDirectory } = options;
  const defaultWeight = config.learning?.defaultWeight ?? 0.55;
  const timeout = config.defaultTimeout ?? 5000;

  let script;
  if (source === 'workspace' && workingDirectory) {
    // For workspace hooks, use paths relative to project root
    const relDirs = WORKSPACE_HOOKS_DIRS.filter(d =>
      existsSync(join(workingDirectory, d)),
    );
    const relDir = relDirs[0] ?? WORKSPACE_HOOKS_DIRS[0];
    script = {
      bash: `./${relDir}/${name}.sh`,
      windows: `.\\${relDir.replace(/\//g, '\\')}\\${name}.ps1`,
    };
  } else {
    script = {
      bash: `~/.copilot/hooks/scripts/${name}.sh`,
      windows: `$HOME\\.copilot\\hooks\\scripts\\${name}.ps1`,
    };
  }

  return {
    enabled: true,
    events: inferEvents(name),
    script,
    timeout,
    threshold: null,
    weight: defaultWeight,
    modifiers: [],
    source,
  };
}

// ─── Core: auto-register ────────────────────────────────────

/**
 * Normalize a registration value (string or object) into canonical object form.
 *
 * @param {string|object|undefined} registration
 * @returns {{ mode: string, sources: string[] }}
 */
export function normalizeRegistration(registration) {
  if (registration === undefined || registration === null) {
    return { mode: DEFAULT_REGISTRATION, sources: ['global'] };
  }
  if (typeof registration === 'string') {
    return { mode: registration, sources: ['global'] };
  }
  return {
    mode: registration.mode ?? DEFAULT_REGISTRATION,
    sources: registration.sources ?? ['global'],
  };
}

/**
 * Discover new scripts and write them into the config file.
 *
 * @param {object} config - The loaded neural-link config object
 * @param {object} [options] - Discovery options
 * @param {string} [options.workingDirectory] - CWD for resolving workspace hooks
 * @returns {{ registered: string[], disabled: string[] }}
 *   registered — names that were added to config
 *   disabled   — names whose scripts are gone (marked enabled:false)
 */
export function autoRegister(config, options = {}) {
  const result = { registered: [], disabled: [] };

  const reg = normalizeRegistration(config.registration);
  if (reg.mode !== 'auto') return result;

  const { workingDirectory } = options;
  const handlers = config.handlers ?? {};
  let dirty = false;

  // Collect scripts from each enabled source
  const globalNames = reg.sources.includes('global') ? scanScripts() : [];
  const workspaceNames = [];

  if (reg.sources.includes('workspace') && workingDirectory) {
    for (const relDir of WORKSPACE_HOOKS_DIRS) {
      const absDir = join(workingDirectory, relDir);
      const found = scanDirectory(absDir);
      for (const name of found) {
        if (!workspaceNames.includes(name)) {
          workspaceNames.push(name);
        }
      }
    }
  }

  // 1. Register new global scripts not yet in config
  for (const name of globalNames) {
    if (!handlers[name]) {
      handlers[name] = buildHandlerEntry(name, config, { source: 'global' });
      result.registered.push(name);
      dirty = true;
    }
  }

  // 2. Register new workspace scripts not yet in config
  for (const name of workspaceNames) {
    if (!handlers[name]) {
      handlers[name] = buildHandlerEntry(name, config, {
        source: 'workspace',
        workingDirectory,
      });
      result.registered.push(name);
      dirty = true;
    }
  }

  // 3. Disable handlers whose scripts are no longer on disk
  const allInstalledNames = new Set([...globalNames, ...workspaceNames]);
  for (const [name, handler] of Object.entries(handlers)) {
    if (handler.enabled && !allInstalledNames.has(name)) {
      handler.enabled = false;
      result.disabled.push(name);
      dirty = true;
    }
  }

  // 4. Persist to config file if anything changed
  if (dirty) {
    config.handlers = handlers;
    writeConfigFile(config);
  }

  return result;
}

/**
 * Serialize config back to the config file on disk.
 * Uses the resolved path from the last loadConfig() call.
 */
function writeConfigFile(config) {
  const configPath = getConfigPath();
  if (!configPath) return;

  const json = JSON.stringify(config, null, 2) + '\n';
  writeFileSync(configPath, json, 'utf-8');
}

// ─── File watcher ───────────────────────────────────────────

let activeWatcher = null;

/**
 * Start watching the hooks/scripts directory.
 * On changes, re-runs autoRegister so new scripts are picked up
 * and removed scripts are disabled.
 *
 * @param {object} config - The loaded neural-link config
 * @returns {import('node:fs').FSWatcher | null}
 */
export function startWatcher(config) {
  if (activeWatcher) return activeWatcher;

  const reg = normalizeRegistration(config.registration);
  if (reg.mode !== 'auto') return null;
  if (!existsSync(COPILOT.HOOKS_SCRIPTS)) return null;

  activeWatcher = watch(COPILOT.HOOKS_SCRIPTS, { persistent: false }, () => {
    try {
      autoRegister(config);
    } catch {
      // Watcher errors must never crash the process
    }
  });

  return activeWatcher;
}

/**
 * Stop the active watcher (if any).
 */
export function stopWatcher() {
  if (activeWatcher) {
    activeWatcher.close();
    activeWatcher = null;
  }
}
