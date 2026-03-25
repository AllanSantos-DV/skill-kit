#!/usr/bin/env node

/**
 * Neural Link Training CLI — manual reward injection.
 *
 * Allows an LLM agent (or human) to submit explicit reward signals
 * when a hook decision was wrong.
 *
 * Usage:
 *   node train.js --handler=pre-commit-guard --reward=0.0 [--session=abc123] [--context='{"event_type":"PreToolUse"}']
 *
 * If --session is provided, reconstructs features from the session file.
 * Otherwise, uses --context JSON or empty features.
 */

import { parseArgs } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getLearner } from './learning/learner.js';
import { extractFeatures } from './learning/features.js';
import { loadConfig } from './infra/config.js';

const { values } = parseArgs({
  options: {
    handler: { type: 'string' },
    reward: { type: 'string' },
    session: { type: 'string' },
    context: { type: 'string' },
  },
  strict: false,
});

if (!values.handler || values.reward == null) {
  console.error('Usage: node train.js --handler=<name> --reward=<0.0-1.0> [--session=<id>] [--context=<json>]');
  process.exit(1);
}

const handlerName = values.handler;
const reward = parseFloat(values.reward);

if (isNaN(reward) || reward < 0 || reward > 1) {
  console.error('Error: --reward must be a number between 0.0 and 1.0');
  process.exit(1);
}

const config = loadConfig();
const learningConfig = config.learning || {};

// Determine CWD for workspace-scoped weights
const cwd = process.cwd();

// Reconstruct features
let features;

if (values.session) {
  // Try to load session file and extract last entry for this handler
  const safe = values.session.replace(/[^a-zA-Z0-9_-]/g, '_');
  const sessionPath = join(tmpdir(), `neural-link-session-${safe}.json`);

  if (existsSync(sessionPath)) {
    try {
      const raw = readFileSync(sessionPath, 'utf-8');
      const history = JSON.parse(raw);
      // Find the last entry for this handler to reconstruct context
      const lastEntry = [...history].reverse().find(h => h.handler === handlerName);
      if (lastEntry) {
        // Build minimal context from session entry
        const ctx = {
          event_type: null,
          tool_name: lastEntry.tool || null,
          command: lastEntry.command || null,
          cwd,
        };
        features = extractFeatures(ctx);
        console.log(`Reconstructed features from session (tool=${lastEntry.tool}, cmd=${lastEntry.command})`);
      }
    } catch {
      console.warn('Warning: Could not parse session file, using empty features');
    }
  } else {
    console.warn(`Warning: Session file not found for session=${values.session}`);
  }
}

if (!features && values.context) {
  try {
    const ctx = JSON.parse(values.context);
    ctx.cwd = ctx.cwd || cwd;
    features = extractFeatures(ctx);
    console.log('Using features from --context JSON');
  } catch {
    console.error('Error: --context must be valid JSON');
    process.exit(1);
  }
}

if (!features) {
  // Empty features — still useful for updating activation count
  features = extractFeatures({ cwd });
  console.log('Using minimal features (no session or context provided)');
}

// Load learner and apply update
const learner = await getLearner(learningConfig, cwd);
learner.load(cwd);

const before = learner.predict(handlerName, features.vector);
learner.update(handlerName, features.vector, reward);
const after = learner.predict(handlerName, features.vector);

await learner.save();

console.log(`Training applied:`);
console.log(`  handler:    ${handlerName}`);
console.log(`  reward:     ${reward}`);
console.log(`  prediction: ${before.toFixed(4)} → ${after.toFixed(4)}`);
console.log(`  features:   ${features.names.length} active`);
console.log(`  activations: ${learner.activations[handlerName] || 0}`);
