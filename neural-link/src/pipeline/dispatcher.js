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
import { tryNonCriticalAsync } from '../infra/error-handler.js';

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
 * Create the response-critical pipeline (stages needed before stdout).
 * Stages: sensor → [overrides‖scoring] → llm → filter → executor → compositor.
 */
function createResponsePipeline() {
  return createPipeline()
    .use(senseStage)
    .use(overridesAndScoringStage)
    .use(llmFallbackStage)
    .use(filterStage)
    .use(executeStage)
    .use(composeStage);
}

/**
 * Create the deferred pipeline (post-response stages).
 * Stages: logger → record → feedback → postTool → falseNeg.
 */
function createDeferredPipeline() {
  return createPipeline()
    .use(logStage)
    .use(recordDecisionsStage)
    .use(feedbackStage)
    .use(postToolFeedbackStage)
    .use(falseNegativeStage);
}

/**
 * Create the default Neural Link pipeline.
 * Stages: sensor → [overrides‖scoring] → llm → filter → executor → compositor → [post-response].
 *
 * Parallelization:
 *   - checkOverrides and scoring are independent → Promise.all
 *   - Post-response stages (log, record, feedback, postTool, falseNeg) have
 *     no output dependency → Promise.all in background
 */
function createDefaultPipeline() {
  return createPipeline()
    .use(senseStage)
    .use(overridesAndScoringStage)
    .use(llmFallbackStage)
    .use(filterStage)
    .use(executeStage)
    .use(composeStage)
    .use(postResponseStage);
}

/**
 * Main dispatch function.
 * Orchestrates: sensor → scoring → threshold → executor → compositor → feedback.
 *
 * When earlyReturn is true, returns { output, runPostResponse } so callers
 * can emit stdout before deferred stages (logging, feedback, weight saving).
 */
export async function dispatch(stdinJson, { earlyReturn = false } = {}) {
  if (!earlyReturn) {
    const pipeline = createDefaultPipeline();
    const result = await pipeline.execute({ stdinJson });
    return result.output ?? {};
  }

  // Early-return mode: split response from deferred work
  const responsePipeline = createResponsePipeline();
  const ctx = await responsePipeline.execute({ stdinJson });
  const output = ctx.output ?? {};

  const runPostResponse = async () => {
    const deferred = createDeferredPipeline();
    await deferred.execute(ctx);
  };

  return { output, runPostResponse };
}

// ============================================================================
// Pipeline Stages
// ============================================================================

async function senseStage(ctx) {
  const config = loadConfig();
  const context = sense(ctx.stdinJson);
  return { ...ctx, config, context };
}

/**
 * Parallel stage: checkOverrides and scoring run concurrently.
 * checkOverrides updates learner with override signals (past decisions);
 * scoring computes handler scores for the current context.
 * Both are independent of each other's output.
 */
async function overridesAndScoringStage(ctx) {
  const [, scored] = await Promise.all([
    tryNonCriticalAsync(async () => {
      const overrideSignals = checkOverrides(ctx.context.sessionId, ctx.context.tool_name, ctx.context.command);
      if (overrideSignals.length > 0) {
        const learner = await getLearner(ctx.config.learning || {}, ctx.context.cwd);
        const features = extractFeatures(ctx.context);
        for (const signal of overrideSignals) {
          learner.update(signal.handler, features.vector, signal.reward);
        }
      }
    }, 'checkOverrides'),
    scoreHandlers(ctx.context, ctx.config),
  ]);
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
  const results = await executeHandlers(ctx.active, ctx.stdinJson, ctx.config, ctx.context);
  return { ...ctx, results };
}

async function composeStage(ctx) {
  if (!ctx.results) {
    return ctx;
  }
  const output = compose(ctx.results, ctx.context);
  return { ...ctx, output };
}

/**
 * Parallel post-response stage: all tasks run concurrently via Promise.all.
 * None of these produce output needed by the pipeline — they are
 * side-effect-only (logging, weight updates, session tracking).
 */
async function postResponseStage(ctx) {
  await Promise.all([
    // Logging
    ctx.results
      ? tryNonCriticalAsync(
          () => logActivation(ctx.context, ctx.active, ctx.results, ctx.output),
          'logActivation'
        )
      : Promise.resolve(),

    // Record decisions to session tracker
    ctx.results
      ? tryNonCriticalAsync(() => {
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
        }, 'recordDecision')
      : Promise.resolve(),

    // Feedback — update learner weights from handler results
    ctx.results
      ? tryNonCriticalAsync(
          () => processFeedback(ctx.context, ctx.scored, ctx.results, ctx.config.learning || {}),
          'processFeedback'
        )
      : Promise.resolve(),

    // Post-tool feedback
    ctx.active?.length
      ? tryNonCriticalAsync(
          () => processPostToolFeedback(ctx.context, ctx.config, ctx.config.learning || {}),
          'processPostToolFeedback'
        )
      : Promise.resolve(),

    // False negative detection
    ctx.active
      ? tryNonCriticalAsync(
          () => detectFalseNegatives(ctx.context, ctx.scored, ctx.active, ctx.config, ctx.config.learning || {}),
          'detectFalseNegatives'
        )
      : Promise.resolve(),
  ]);

  return ctx;
}

// Individual stage functions for the deferred pipeline (earlyReturn mode)

async function logStage(ctx) {
  if (ctx.results) {
    logActivation(ctx.context, ctx.active, ctx.results, ctx.output);
  }
  return ctx;
}

async function recordDecisionsStage(ctx) {
  if (!ctx.results) return ctx;
  tryNonCriticalAsync(() => {
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
  if (!ctx.results) return ctx;
  await tryNonCriticalAsync(
    () => processFeedback(ctx.context, ctx.scored, ctx.results, ctx.config.learning || {}),
    'processFeedback'
  );
  return ctx;
}

async function postToolFeedbackStage(ctx) {
  if (!ctx.active?.length) return ctx;
  await tryNonCriticalAsync(
    () => processPostToolFeedback(ctx.context, ctx.config, ctx.config.learning || {}),
    'processPostToolFeedback'
  );
  return ctx;
}

async function falseNegativeStage(ctx) {
  if (!ctx.active) return ctx;
  await tryNonCriticalAsync(
    () => detectFalseNegatives(ctx.context, ctx.scored, ctx.active, ctx.config, ctx.config.learning || {}),
    'detectFalseNegatives'
  );
  return ctx;
}
