const DECISION_RANK = { block: 3, deny: 3, ask: 2, allow: 1, add: 0 };

import { PERMISSION_MAP } from '../infra/constants.js';

/**
 * Event-specific composers registry.
 * Each composer adapts the output format for a specific event type.
 */
const eventComposers = {
  PreToolUse: composePreToolUse,
  Stop: composeStop,
  UserPromptSubmit: composeUserPromptSubmit,
};

/**
 * Register a custom event composer.
 * Allows external code to add or override event-specific composition logic.
 */
export function registerComposer(eventType, composerFn) {
  eventComposers[eventType] = composerFn;
}

/**
 * Compose results from multiple handlers into a single response.
 * Strategy: most restrictive wins (block > ask > allow).
 */
export function compose(results, context) {
  if (results.length === 0) {
    return {};
  }

  // Normalize decisions: map permissionDecision → unified decision
  const normalized = results.map(r => ({
    ...r,
    effectiveDecision: getEffectiveDecision(r.result),
  }));

  // Most restrictive wins
  let finalDecision = 'allow';
  for (const r of normalized) {
    if (rank(r.effectiveDecision) > rank(finalDecision)) {
      finalDecision = r.effectiveDecision;
    }
  }

  // Map deny → block for final output
  if (finalDecision === 'deny') finalDecision = 'block';

  // Compose reasons
  const reasons = normalized
    .filter(r => r.result.reason)
    .map(r => `[${r.name}] ${r.result.reason}`);
  const composedReason = reasons.join('\n');

  // Merge hookSpecificOutputs from handlers
  let mergedHookOutput = {};
  for (const r of normalized) {
    if (r.result.hookSpecificOutput && typeof r.result.hookSpecificOutput === 'object') {
      mergedHookOutput = { ...mergedHookOutput, ...r.result.hookSpecificOutput };
    }
  }

  // Add Neural Link metadata
  const scores = {};
  const triggered = [];
  for (const r of normalized) {
    scores[r.name] = r.score;
    triggered.push(r.name);
  }

  mergedHookOutput.neural_link = {
    version: '1.0',
    event: context.event_type,
    agent: context.agent,
    handlers_evaluated: results.length,
    handlers_triggered: triggered,
    scores,
    composition: { final: finalDecision, rule: 'most_restrictive' },
  };

  // Build base output
  const output = {
    hookSpecificOutput: mergedHookOutput,
  };

  // Apply default composition (standard format)
  output.decision = finalDecision;
  if (composedReason) {
    output.reason = composedReason;
  }

  // Apply event-specific composition
  const composer = eventComposers[context.event_type];
  if (composer) {
    composer(output, normalized, composedReason, finalDecision, mergedHookOutput, context);
  }

  return output;
}

function getEffectiveDecision(result) {
  // Check permissionDecision first (PreToolUse handlers)
  const perm = result.hookSpecificOutput?.permissionDecision;
  if (perm) return perm;

  return result.decision ?? 'allow';
}

function rank(decision) {
  return DECISION_RANK[decision] ?? 0;
}

/**
 * Event-specific composer for PreToolUse events.
 * VS Code expects permissionDecision in hookSpecificOutput.
 */
function composePreToolUse(output, normalized, composedReason, finalDecision, mergedHookOutput) {
  // Remove default decision/reason (not used for PreToolUse)
  delete output.decision;
  delete output.reason;

  // VS Code expects permissionDecision in hookSpecificOutput for PreToolUse
  output.hookSpecificOutput.permissionDecision = PERMISSION_MAP[finalDecision] ?? finalDecision;
  
  // Collect reason: prefer composedReason (from handler top-level), fallback to merged additionalContext
  const askReason = composedReason || mergedHookOutput.additionalContext || '';
  if (askReason) {
    output.hookSpecificOutput.additionalContext = askReason;
    output.hookSpecificOutput.permissionDecisionReason = askReason;
  }
}

/**
 * Event-specific composer for Stop events.
 * VS Code treats custom agent Stop as SubagentStop, which expects top-level fields.
 * Best practice: include in BOTH levels for compatibility.
 */
function composeStop(output, normalized, composedReason, finalDecision) {
  output.hookSpecificOutput.decision = finalDecision;
  if (composedReason) {
    output.hookSpecificOutput.reason = composedReason;
  }
  output.hookSpecificOutput.hookEventName = 'Stop';
}

/**
 * Event-specific composer for UserPromptSubmit events.
 * Collects and concatenates content from "add" handlers.
 */
function composeUserPromptSubmit(output, normalized) {
  const addContents = normalized
    .filter(r => r.effectiveDecision === 'add' && r.result.content)
    .map(r => r.result.content);
  if (addContents.length > 0) {
    output.content = addContents.join('\n\n');
  }
}
