import { extractFeatures } from '../learning/features.js';
import { getLearner } from '../learning/learner.js';
import { hasFileReferences, hasConfidenceTable, hasSkillRead } from '../infra/transcript.js';
import { DEFAULT_HANDLER_WEIGHT, EPSILON } from '../infra/constants.js';

/**
 * Score handlers against the current context.
 *
 * Two-phase approach (selective evaluation):
 *   Phase 1 — Declarative scoring: evaluate config weights and modifiers (cheap, no ML).
 *   Phase 2 — Learned scoring: init learner and combine only when at least one
 *             handler survived with declarativeScore > 0.
 *
 * Returns array of { name, handler, score, features } for all eligible handlers.
 */
export async function scoreHandlers(context, config) {
  const results = [];
  const learningConfig = config.learning || {};
  const features = extractFeatures(context);

  // --- Phase 1: Declarative scoring (no ML, no learner I/O) ---
  const declarativeResults = [];
  for (const [name, handler] of Object.entries(config.handlers)) {
    if (!handler.enabled) continue;
    if (!handler.events.includes(context.event_type)) continue;

    const defaultWeight = learningConfig.defaultWeight ?? DEFAULT_HANDLER_WEIGHT;
    let declarativeScore = handler.weight ?? defaultWeight;

    // Fast path: base weight is 0 and no modifier can raise it
    if (declarativeScore === 0 && !canModifiersElevate(handler.modifiers)) {
      declarativeResults.push({ name, handler, declarativeScore: 0.0 });
      continue;
    }

    for (const mod of handler.modifiers) {
      if (evaluateCondition(mod.condition, context)) {
        declarativeScore = applyAdjust(declarativeScore, mod.adjust);
      }
    }
    declarativeScore = Math.max(0.0, Math.min(1.0, declarativeScore));

    declarativeResults.push({ name, handler, declarativeScore });
  }

  // --- Phase 2: Learned scoring — lazy learner init ---
  const needsLearner = declarativeResults.some(r => r.declarativeScore > 0);
  let learner = null;

  if (needsLearner) {
    learner = await getLearner(learningConfig, context.cwd);
    learner.load(context.cwd);
  }

  for (const { name, handler, declarativeScore } of declarativeResults) {
    let score;
    if (declarativeScore === 0.0) {
      score = 0.0;
    } else {
      score = learner.combine(name, declarativeScore, features.vector);
    }
    results.push({ name, handler, score, declarativeScore, features });
  }

  return results;
}

/**
 * Check if any modifier can elevate a score from 0.
 * Only '+' with positive value or '=' with positive value can raise zero.
 * Multiplication and subtraction on zero remain zero.
 */
function canModifiersElevate(modifiers) {
  if (!modifiers || modifiers.length === 0) return false;
  return modifiers.some(mod => {
    if (!mod.adjust || typeof mod.adjust !== 'string') return false;
    const op = mod.adjust[0];
    const value = parseFloat(mod.adjust.slice(1));
    return (op === '+' && value > 0) || (op === '=' && value > 0);
  });
}

/**
 * Filter scored handlers by threshold.
 * Includes ε-greedy exploration: with probability epsilon, one below-threshold
 * handler is included to collect data and prevent cold lock.
 */
export function filterByThreshold(scored, config) {
  const active = scored.filter(s => {
    const threshold = s.handler.threshold ?? config.threshold;
    return s.score >= threshold;
  });

  // ε-greedy exploration
  const epsilon = config.learning?.epsilon ?? EPSILON;
  if (Math.random() < epsilon) {
    const belowThreshold = scored.filter(s => !active.includes(s));
    if (belowThreshold.length > 0) {
      // Pick the one closest to threshold (most likely to be useful)
      belowThreshold.sort((a, b) => b.score - a.score);
      active.push({ ...belowThreshold[0], explorative: true });
    }
  }

  return active;
}

// --- Condition evaluator ---

function getField(ctx, field) {
  // Support dotted paths like tool_input.command
  const parts = field.split('.');
  let value = ctx;
  for (const p of parts) {
    if (value == null) return undefined;
    value = value[p];
  }
  return value;
}

const REGEX_TIMEOUT_MS = 100;

function safeRegexTest(pattern, text, flags = 'i') {
  if (typeof pattern !== 'string' || pattern.length > 500) {
    return false;
  }
  
  const startTime = Date.now();
  try {
    const regex = new RegExp(pattern, flags);
    const result = regex.test(text);
    const elapsed = Date.now() - startTime;
    
    if (elapsed > REGEX_TIMEOUT_MS) {
      console.error(`[ReDoS protection] Regex exceeded ${REGEX_TIMEOUT_MS}ms, pattern: ${pattern}`);
      return false;
    }
    
    return result;
  } catch {
    return false;
  }
}

const evaluators = {
  eq: (ctx, field, value) => String(getField(ctx, field)) === value,
  neq: (ctx, field, value) => String(getField(ctx, field)) !== value,
  command_matches: (ctx, pattern) => {
    const cmd = ctx.command || '';
    if (cmd.length > 10000) {
      console.error('[ReDoS protection] Command text too long, skipping regex match');
      return false;
    }
    return safeRegexTest(pattern, cmd, 'i');
  },
  // Phase 2 — real transcript evaluators
  transcript_has_file_references: (ctx) => hasFileReferences(ctx.transcript_path),
  transcript_has_confidence_table: (ctx) => hasConfidenceTable(ctx.transcript_path),
  transcript_has_skill_read: (ctx) => hasSkillRead(ctx.transcript_path),
  // Conservative: without data, assume false
  active_skills_include: () => false,
};

// Patterns for condition parsing
const FUNC_CALL_RE = /^(\w+)\('([^']*)'\)$/;
const FUNC_EQ_FALSE_RE = /^(\w+)\s*==\s*false$/;
const FUNC_EQ_TRUE_RE = /^(\w+)\s*==\s*true$/;
const FIELD_EQ_RE = /^(\w+(?:\.\w+)*)\s*==\s*'([^']*)'$/;
const FIELD_NEQ_RE = /^(\w+(?:\.\w+)*)\s*!=\s*'([^']*)'$/;

/**
 * Evaluate a condition expression against context.
 * Supports compound conditions with &&.
 */
export function evaluateCondition(condition, context) {
  // Support && compound conditions
  if (condition.includes('&&')) {
    const parts = condition.split('&&').map(s => s.trim());
    return parts.every(part => evaluateSingle(part, context));
  }
  return evaluateSingle(condition, context);
}

function evaluateSingle(expr, ctx) {
  let match;

  // function('arg') — e.g. command_matches('git (push|tag)')
  match = expr.match(FUNC_CALL_RE);
  if (match) {
    const [, fn, arg] = match;
    if (evaluators[fn]) return evaluators[fn](ctx, arg);
    return false;
  }

  // function == false — e.g. transcript_has_file_references == false
  match = expr.match(FUNC_EQ_FALSE_RE);
  if (match) {
    const [, fn] = match;
    if (evaluators[fn]) return !evaluators[fn](ctx);
    return true; // unknown function == false → true (conservative)
  }

  // function == true
  match = expr.match(FUNC_EQ_TRUE_RE);
  if (match) {
    const [, fn] = match;
    if (evaluators[fn]) return evaluators[fn](ctx);
    return false;
  }

  // field == 'value'
  match = expr.match(FIELD_EQ_RE);
  if (match) {
    const [, field, value] = match;
    return evaluators.eq(ctx, field, value);
  }

  // field != 'value'
  match = expr.match(FIELD_NEQ_RE);
  if (match) {
    const [, field, value] = match;
    return evaluators.neq(ctx, field, value);
  }

  // Unknown expression → false (conservative)
  return false;
}

/**
 * Apply score adjustment.
 */
function applyAdjust(score, adjust) {
  const op = adjust[0];
  const value = parseFloat(adjust.slice(1));

  if (op === '+') return score + value;
  if (op === '-') return score - value;
  if (op === '*') return score * value;
  if (op === '=') return value;

  return score;
}
