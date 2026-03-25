import { loadConfig } from '../infra/config.js';
import { sense } from './sensor.js';
import { scoreHandlers, filterByThreshold } from './scoring.js';
import { executeHandlers } from './executor.js';
import { compose } from './compositor.js';
import { logActivation } from '../infra/logger.js';
import { processFeedback, processPostToolFeedback, detectFalseNegatives } from '../learning/feedback.js';
import { recordDecision, checkOverrides } from '../infra/session-tracker.js';
import { extractFeatures } from '../learning/features.js';
import { getLearner } from '../learning/learner.js';
import { applyLLMFallback } from '../learning/llm-evaluator.js';
import { tryNonCritical, tryNonCriticalAsync } from '../infra/error-handler.js';

/**
 * Pipeline builder for composable stage execution.
 * Each stage receives accumulated context and returns updated context.
 */
class Pipeline {
  constructor() {
    this.stages = [];
  }

  use(stage) {
    this.stages.push(stage);
    return this;
  }

  async execute(initialContext) {
    let context = initialContext;
    for (const stage of this.stages) {
      context = await stage(context);
    }
    return context;
  }
}

/**
 * Create a custom pipeline with specified stages.
 */
export function createPipeline() {
  return new Pipeline();
}

/**
 * Create the default Neural Link pipeline.
 * Stages: sensor → scoring → threshold → executor → compositor → feedback.
 */
function createDefaultPipeline() {
  return createPipeline()
    .use(senseStage)
    .use(checkOverridesStage)
    .use(scoringStage)
    .use(llmFallbackStage)
    .use(filterStage)
    .use(executeStage)
    .use(composeStage)
    .use(logStage)
    .use(recordDecisionsStage)
    .use(feedbackStage)
    .use(postToolFeedbackStage)
    .use(falseNegativeStage);
}

/**
 * Main dispatch function.
 * Orchestrates: sensor → scoring → threshold → executor → compositor → feedback.
 */
export async function dispatch(stdinJson) {
  const pipeline = createDefaultPipeline();
  const result = await pipeline.execute({ stdinJson });
  return result.output ?? {};
}

// ============================================================================
// Pipeline Stages
// ============================================================================

async function senseStage(ctx) {
  const config = loadConfig();
  const context = sense(ctx.stdinJson);
  return { ...ctx, config, context };
}

async function checkOverridesStage(ctx) {
  await tryNonCriticalAsync(async () => {
    const overrideSignals = checkOverrides(ctx.context.sessionId, ctx.context.tool_name, ctx.context.command);
    if (overrideSignals.length > 0) {
      const learner = await getLearner(ctx.config.learning || {}, ctx.context.cwd);
      const features = extractFeatures(ctx.context);
      for (const signal of overrideSignals) {
        learner.update(signal.handler, features.vector, signal.reward);
      }
    }
  }, 'checkOverrides');
  return ctx;
}

async function scoringStage(ctx) {
  const scored = await scoreHandlers(ctx.context, ctx.config);
  return { ...ctx, scored };
}

async function llmFallbackStage(ctx) {
  await tryNonCriticalAsync(
    () => applyLLMFallback(ctx.scored, ctx.context, ctx.config),
    'applyLLMFallback'
  );
  return ctx;
}

async function filterStage(ctx) {
  const active = filterByThreshold(ctx.scored, ctx.config);
  if (active.length === 0) {
    return { ...ctx, output: {}, active: [] };
  }
  return { ...ctx, active };
}

async function executeStage(ctx) {
  if (!ctx.active || ctx.active.length === 0) {
    return ctx;
  }
  const results = await executeHandlers(ctx.active, ctx.stdinJson, ctx.config);
  return { ...ctx, results };
}

async function composeStage(ctx) {
  if (!ctx.results) {
    return ctx;
  }
  const output = compose(ctx.results, ctx.context);
  return { ...ctx, output };
}

async function logStage(ctx) {
  if (ctx.results) {
    logActivation(ctx.context, ctx.active, ctx.results, ctx.output);
  }
  return ctx;
}

async function recordDecisionsStage(ctx) {
  if (!ctx.results) {
    return ctx;
  }
  tryNonCritical(() => {
    for (const r of ctx.results) {
      const decision = r.result?.decision
        ?? r.result?.hookSpecificOutput?.permissionDecision
        ?? 'allow';
      recordDecision(ctx.context.sessionId, {
        handler: r.name,
        tool: ctx.context.tool_name,
        command: ctx.context.command,
        decision,
      });
    }
  }, 'recordDecision');
  return ctx;
}

async function feedbackStage(ctx) {
  if (!ctx.results) {
    return ctx;
  }
  await tryNonCriticalAsync(
    () => processFeedback(ctx.context, ctx.scored, ctx.results, ctx.config.learning || {}),
    'processFeedback'
  );
  return ctx;
}

async function postToolFeedbackStage(ctx) {
  await tryNonCriticalAsync(
    () => processPostToolFeedback(ctx.context, ctx.config, ctx.config.learning || {}),
    'processPostToolFeedback'
  );
  return ctx;
}

async function falseNegativeStage(ctx) {
  if (!ctx.active) {
    return ctx;
  }
  await tryNonCriticalAsync(
    () => detectFalseNegatives(ctx.context, ctx.scored, ctx.active, ctx.config, ctx.config.learning || {}),
    'detectFalseNegatives'
  );
  return ctx;
}
