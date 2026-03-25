import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, normalize } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { PATHS } from './paths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(dirname(__dirname)); // src/infra → src → project root

let cached = null;
let lastConfigRaw = null;

const CONFIG_CACHE_FILE = join(PATHS.BASE, '.config-cache.json');

/**
 * FNV-1a hash (32-bit) — fast, good distribution, zero deps.
 * Duplicated from features.js to avoid circular dependency.
 */
function fnv1aHash(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Try loading config from cross-invocation cache.
 * Returns cached config if the source file content hash matches, null otherwise.
 */
function tryLoadFromDiskCache() {
  try {
    if (!existsSync(CONFIG_CACHE_FILE)) return null;
    const cacheRaw = readFileSync(CONFIG_CACHE_FILE, 'utf-8');
    const cache = JSON.parse(cacheRaw);

    if (!cache.configPath || !cache.contentHash || !cache.config) return null;
    if (!existsSync(cache.configPath)) return null;

    const raw = readFileSync(cache.configPath, 'utf-8');
    if (fnv1aHash(raw) !== cache.contentHash) return null;

    return cache.config;
  } catch {
    return null;
  }
}

/**
 * Persist validated config to disk cache for fast reload on next invocation.
 */
function writeDiskCache(configPath, raw, config) {
  try {
    mkdirSync(PATHS.BASE, { recursive: true });
    const cache = {
      configPath,
      contentHash: fnv1aHash(raw),
      config,
    };
    writeFileSync(CONFIG_CACHE_FILE, JSON.stringify(cache));
  } catch {
    // Cache write failure is non-critical
  }
}

/**
 * Load config from (in order):
 * 0. Cross-invocation disk cache (hash-validated, skips re-validation)
 * 1. .neural-link.config.json in cwd (workspace)
 * 2. ~/.copilot/neural-link.config.json (global)
 * 3. bundled neural-link.config.json (project root)
 */
export function loadConfig() {
  if (cached) return cached;

  // E-03/E-05: Try cross-invocation cache first
  const diskCached = tryLoadFromDiskCache();
  if (diskCached) {
    cached = diskCached;
    return cached;
  }

  const cwd = process.cwd();
  const normalizedCwd = normalize(cwd);

  const candidates = [
    join(normalizedCwd, '.neural-link.config.json'),
    join(homedir(), '.copilot', 'neural-link.config.json'),
    join(projectRoot, 'neural-link.config.json'),
  ];

  for (const path of candidates) {
    const resolvedPath = resolve(path);

    if (resolvedPath.includes('\0')) {
      console.error(`[Security] Null byte in config path: ${path}`);
      continue;
    }

    if (existsSync(resolvedPath)) {
      try {
        const raw = readFileSync(resolvedPath, 'utf-8');

        if (raw.length > 10 * 1024 * 1024) {
          console.error(`[Security] Config file too large (>10MB): ${resolvedPath}`);
          continue;
        }

        const config = JSON.parse(raw);
        validateConfig(config);
        validateEvaluatorNames(config);
        cached = config;
        lastConfigRaw = raw;

        // E-03: Persist to disk cache for next invocation
        writeDiskCache(resolvedPath, raw, config);

        return cached;
      } catch (error) {
        console.error(`[Config] Failed to load ${resolvedPath}: ${error.message}`);
        continue;
      }
    }
  }

  // Fallback: minimal allow-all config
  cached = {
    version: '1.0',
    threshold: 0.5,
    defaultTimeout: 5000,
    eventTimeouts: {},
    handlers: {},
  };
  return cached;
}

function validateConfig(config) {
  if (typeof config !== 'object' || config === null) {
    throw new Error('Config must be an object');
  }

  if (typeof config.version !== 'string' || !config.version) {
    throw new Error('version must be a non-empty string');
  }

  if (typeof config.threshold !== 'number') {
    throw new Error('threshold must be a number');
  }
  
  if (config.threshold < 0 || config.threshold > 1) {
    throw new Error('threshold must be between 0 and 1');
  }

  if (typeof config.defaultTimeout !== 'number') {
    throw new Error('defaultTimeout must be a number');
  }
  
  if (config.defaultTimeout < 0 || config.defaultTimeout > 300000) {
    throw new Error('defaultTimeout must be between 0 and 300000ms (5 minutes)');
  }

  if (typeof config.handlers !== 'object' || config.handlers === null) {
    throw new Error('handlers must be an object');
  }

  if (config.eventTimeouts !== undefined) {
    if (typeof config.eventTimeouts !== 'object' || config.eventTimeouts === null) {
      throw new Error('eventTimeouts must be an object');
    }
    
    for (const [event, timeout] of Object.entries(config.eventTimeouts)) {
      if (typeof timeout !== 'number' || timeout < 0 || timeout > 300000) {
        throw new Error(`eventTimeouts.${event} must be a number between 0 and 300000ms`);
      }
    }
  }

  for (const [handlerName, handler] of Object.entries(config.handlers)) {
    validateHandler(handlerName, handler);
  }

  if (config.learning !== undefined) {
    validateLearningConfig(config.learning);
  }
}

function validateHandler(name, handler) {
  if (typeof handler !== 'object' || handler === null) {
    throw new Error(`Handler '${name}' must be an object`);
  }

  if (handler.enabled !== undefined && typeof handler.enabled !== 'boolean') {
    throw new Error(`Handler '${name}': enabled must be a boolean`);
  }

  if (!Array.isArray(handler.events)) {
    throw new Error(`Handler '${name}': events must be an array`);
  }

  if (handler.events.length === 0) {
    throw new Error(`Handler '${name}': events array cannot be empty`);
  }

  handler.events.forEach((event, idx) => {
    if (typeof event !== 'string' || !event.trim()) {
      throw new Error(`Handler '${name}': events[${idx}] must be a non-empty string`);
    }
  });

  if (!handler.script || typeof handler.script !== 'object') {
    throw new Error(`Handler '${name}': script must be an object with bash/windows paths`);
  }

  if (typeof handler.script.bash !== 'string' || !handler.script.bash.trim()) {
    throw new Error(`Handler '${name}': script.bash must be a non-empty string`);
  }

  if (typeof handler.script.windows !== 'string' || !handler.script.windows.trim()) {
    throw new Error(`Handler '${name}': script.windows must be a non-empty string`);
  }

  if (handler.timeout !== undefined && handler.timeout !== null) {
    if (typeof handler.timeout !== 'number' || handler.timeout < 0 || handler.timeout > 300000) {
      throw new Error(`Handler '${name}': timeout must be a number between 0 and 300000ms`);
    }
  }

  if (handler.threshold !== undefined && handler.threshold !== null) {
    if (typeof handler.threshold !== 'number' || handler.threshold < 0 || handler.threshold > 1) {
      throw new Error(`Handler '${name}': threshold must be a number between 0 and 1`);
    }
  }

  if (handler.weight !== undefined && handler.weight !== null) {
    if (typeof handler.weight !== 'number' || handler.weight < 0 || handler.weight > 1) {
      throw new Error(`Handler '${name}': weight must be a number between 0 and 1`);
    }
  }

  if (handler.modifiers !== undefined) {
    if (!Array.isArray(handler.modifiers)) {
      throw new Error(`Handler '${name}': modifiers must be an array`);
    }

    handler.modifiers.forEach((mod, idx) => {
      if (typeof mod !== 'object' || mod === null) {
        throw new Error(`Handler '${name}': modifiers[${idx}] must be an object`);
      }

      if (typeof mod.condition !== 'string' || !mod.condition.trim()) {
        throw new Error(`Handler '${name}': modifiers[${idx}].condition must be a non-empty string`);
      }

      if (mod.condition.length > 1000) {
        throw new Error(`Handler '${name}': modifiers[${idx}].condition too long (max 1000 chars)`);
      }

      if (typeof mod.adjust !== 'string' || !mod.adjust.trim()) {
        throw new Error(`Handler '${name}': modifiers[${idx}].adjust must be a non-empty string`);
      }

      if (!/^[+\-*=][\d.]+$/.test(mod.adjust)) {
        throw new Error(`Handler '${name}': modifiers[${idx}].adjust must match pattern: [+\\-*=]<number>`);
      }
    });
  }
}

function validateLearningConfig(learning) {
  if (typeof learning !== 'object' || learning === null) {
    throw new Error('learning must be an object');
  }

  const numericFields = ['lambda', 'defaultWeight', 'learningRate', 'epsilon'];
  for (const field of numericFields) {
    if (learning[field] !== undefined) {
      if (typeof learning[field] !== 'number' || learning[field] < 0 || learning[field] > 1) {
        throw new Error(`learning.${field} must be a number between 0 and 1`);
      }
    }
  }

  if (learning.minActivations !== undefined) {
    if (!Number.isInteger(learning.minActivations) || learning.minActivations < 0) {
      throw new Error('learning.minActivations must be a non-negative integer');
    }
  }

  if (learning.enableDefaultWeight !== undefined && typeof learning.enableDefaultWeight !== 'boolean') {
    throw new Error('learning.enableDefaultWeight must be a boolean');
  }

  if (learning.floors !== undefined) {
    if (typeof learning.floors !== 'object' || learning.floors === null) {
      throw new Error('learning.floors must be an object');
    }
    
    for (const [key, value] of Object.entries(learning.floors)) {
      if (typeof value !== 'number' || value < 0 || value > 1) {
        throw new Error(`learning.floors.${key} must be a number between 0 and 1`);
      }
    }
  }

  if (learning.ceilings !== undefined) {
    if (typeof learning.ceilings !== 'object' || learning.ceilings === null) {
      throw new Error('learning.ceilings must be an object');
    }
    
    for (const [key, value] of Object.entries(learning.ceilings)) {
      if (typeof value !== 'number' || value < 0 || value > 1) {
        throw new Error(`learning.ceilings.${key} must be a number between 0 and 1`);
      }
    }
  }
}

/**
 * Known evaluator functions (DEV-12).
 * This list must be kept in sync with scoring.js evaluators object.
 */
const KNOWN_EVALUATORS = [
  'eq',
  'neq',
  'command_matches',
  'transcript_has_file_references',
  'transcript_has_confidence_table',
  'transcript_has_skill_read',
  'active_skills_include',
];

/**
 * Validate that all evaluator names used in handler conditions are known.
 * Logs warnings for unknown evaluators to catch config typos.
 * Addresses DEV-12: Inconsistent Unknown-Evaluator Defaults
 */
function validateEvaluatorNames(config) {
  const FUNC_CALL_RE = /(\w+)\([^)]*\)/g;
  const FUNC_EQ_RE = /(\w+)\s*==\s*(true|false)/g;
  
  for (const [handlerName, handler] of Object.entries(config.handlers)) {
    if (!handler.modifiers) continue;
    
    for (const mod of handler.modifiers) {
      const condition = mod.condition;
      const evaluators = new Set();
      
      // Extract function names from condition
      let match;
      while ((match = FUNC_CALL_RE.exec(condition)) !== null) {
        evaluators.add(match[1]);
      }
      
      // Reset regex state
      FUNC_CALL_RE.lastIndex = 0;
      
      while ((match = FUNC_EQ_RE.exec(condition)) !== null) {
        evaluators.add(match[1]);
      }
      
      FUNC_EQ_RE.lastIndex = 0;
      
      // Check each evaluator
      for (const evalName of evaluators) {
        if (!KNOWN_EVALUATORS.includes(evalName)) {
          console.warn(`[Config] Handler '${handlerName}': Unknown evaluator '${evalName}' in condition: ${condition}`);
        }
      }
    }
  }
}

/** Reset cache — used in tests */
export function resetConfigCache() {
  cached = null;
  lastConfigRaw = null;
}

/** Get raw config content from last load (for snapshot hashing) */
export function getConfigRaw() {
  return lastConfigRaw;
}
