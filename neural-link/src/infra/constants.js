/**
 * Named constants for Neural Link.
 * 
 * Extracted magic numbers with clear documentation to improve
 * code readability and maintainability.
 */

// ========================================
// Machine Learning Defaults
// ========================================

/** Default learning rate for online gradient descent. Slow = stable. */
export const DEFAULT_LEARNING_RATE = 0.01;

/** Mix ratio between declarative and learned scores: (1-λ) * declarative + λ * learned */
export const DEFAULT_LAMBDA = 0.1;

/** Minimum observations before adjusting weights (avoid overfitting on sparse data) */
export const MIN_ACTIVATIONS = 20;

/** Default handler weight when not specified in config */
export const DEFAULT_HANDLER_WEIGHT = 0.55;

/** Epsilon for ε-greedy exploration: probability of including below-threshold handler */
export const EPSILON = 0.05;

// ========================================
// LLM Fallback
// ========================================

/** LLM cache time-to-live in milliseconds (5 minutes) */
export const LLM_CACHE_TTL = 5 * 60 * 1000;

/** LLM request timeout in milliseconds (2 seconds) */
export const LLM_TIMEOUT = 2000;

/** LLM score adjustment margin (score within ±margin of threshold → inconclusive) */
export const LLM_MARGIN = 0.1;

/** How much to nudge score up/down based on LLM suggestion */
export const LLM_ADJUSTMENT = 0.1;

// ========================================
// Execution
// ========================================

/** Default per-handler timeout in milliseconds (final fallback when config doesn't specify) */
export const HANDLER_TIMEOUT_MS = 5000;

// ========================================
// Persistence and I/O
// ========================================

/** Save weights to disk every N total activations (minimize I/O overhead) */
export const SAVE_INTERVAL = 50;

/** Maximum session history entries to retain (FIFO) */
export const MAX_SESSION_HISTORY = 50;

/** Maximum transcript file size in bytes (10 MB safety limit) */
export const MAX_TRANSCRIPT_SIZE = 10 * 1024 * 1024;

// ========================================
// Permission Decision Mapping
// ========================================

/** Maps internal decision values to VS Code permission decisions */
export const PERMISSION_MAP = {
  block: 'deny',
  ask: 'ask',
  allow: 'allow',
};

// ========================================
// Auto-Registration / Discovery
// ========================================

/** Valid registration modes */
export const REGISTRATION_MODES = ['manual', 'auto'];

/** Valid registration sources */
export const REGISTRATION_SOURCES = ['global', 'workspace'];

/** Default registration mode (backward-compatible) */
export const DEFAULT_REGISTRATION = 'manual';

/** Workspace-relative directories to scan for hooks */
export const WORKSPACE_HOOKS_DIRS = ['.github/hooks', '.copilot/hooks'];

/**
 * Name-prefix → event mapping for auto-discovered hooks.
 * Order matters: first match wins.
 */
export const NAME_EVENT_PATTERNS = [
  { prefix: 'pre-',      events: ['PreToolUse'] },
  { prefix: 'stop-',     events: ['Stop'] },
  { prefix: 'verify-',   events: ['Stop'] },
  { prefix: 'output-',   events: ['Stop'] },
  { prefix: 'subagent-', events: ['SubagentStart'] },
  { prefix: 'session-',     events: ['SessionStart'] },
  { prefix: 'context-save', events: ['PreCompact'] },
  { prefix: 'lesson-',   events: ['UserPromptSubmit'] },
  { prefix: 'prompt-',   events: ['UserPromptSubmit'] },
];

/** Default events when no prefix matches */
export const DEFAULT_INFERRED_EVENTS = ['PreToolUse', 'Stop'];

/** Script extensions per platform */
export const PLATFORM_EXTENSIONS = {
  win32: '.ps1',
  unix: '.sh',
  node: '.js',
};
