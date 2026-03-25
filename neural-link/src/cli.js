#!/usr/bin/env node

/**
 * Neural Link CLI — management commands.
 * 
 * Usage:
 *   neural-link stats            Show quick stats
 *   neural-link explain <json>   Dry-run: show what would activate
 *   neural-link reset handler <n> Reset weights for a handler
 *   neural-link reset agent <n>   Reset weights for an agent  
 *   neural-link reset all         Factory reset all weights
 *   neural-link rollback          Restore weights from backup
 *   neural-link dashboard [opts]  Full dashboard (delegates to tools/dashboard.mjs)
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { sense } from './pipeline/sensor.js';
import { scoreHandlers, filterByThreshold } from './pipeline/scoring.js';
import { loadConfig } from './infra/config.js';
import { _resetLearner } from './learning/learner.js';
import { FILES } from './infra/paths.js';
import { MIN_ACTIVATIONS } from './infra/constants.js';

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case 'stats':
    commandStats();
    break;
  case 'explain':
    commandExplain(rest.join(' '));
    break;
  case 'reset':
    commandReset(rest[0], rest[1]);
    break;
  case 'rollback':
    commandRollback();
    break;
  default:
    console.log(`Neural Link CLI

Commands:
  stats              Quick stats from weights
  explain <json>     Dry-run: show what handlers would activate
  reset handler <n>  Reset weights for a specific handler
  reset all          Factory reset — remove all learned weights
  rollback           Restore weights from backup
  dashboard [opts]   Full dashboard (use: node tools/dashboard.mjs)`);
}

function commandStats() {
  if (!existsSync(FILES.LEARNED_WEIGHTS)) {
    console.log('No weights found. System is in cold-start mode.');
    return;
  }

  const data = JSON.parse(readFileSync(FILES.LEARNED_WEIGHTS, 'utf-8'));
  console.log(`Neural Link Weights`);
  console.log(`  Updated: ${data.updatedAt}`);
  console.log(`  Version: ${data.version}`);
  console.log(`  Vector size: ${data.vectorSize}`);
  console.log('');
  console.log('  Handlers:');
  for (const [name, count] of Object.entries(data.activations || {})) {
    const hasWeights = !!data.weights[name];
    const active = count >= MIN_ACTIVATIONS;
    console.log(`    ${name}: ${count} activations, weights=${hasWeights}, learning=${active ? 'active' : 'warmup'}`);
  }
}

function commandExplain(jsonStr) {
  if (!jsonStr) {
    console.error('Usage: neural-link explain \'{"event":"PreToolUse","agentName":"implementor","tool_name":"run_in_terminal","tool_input":{"command":"git push"}}\'');
    process.exit(1);
  }

  let stdinJson;
  try {
    stdinJson = JSON.parse(jsonStr);
  } catch {
    console.error('Invalid JSON input');
    process.exit(1);
  }

  _resetLearner();
  const config = loadConfig();
  const context = sense(stdinJson);
  const scored = scoreHandlers(context, config);
  const active = filterByThreshold(scored, config);

  console.log('Context:');
  console.log(`  event_type: ${context.event_type}`);
  console.log(`  agent: ${context.agent}`);
  console.log(`  tool: ${context.tool_name || '(none)'}`);
  console.log(`  command: ${context.command || '(none)'}`);
  console.log('');

  console.log('All scored handlers:');
  for (const s of scored) {
    const isActive = active.some(a => a.name === s.name);
    const marker = isActive ? '✓' : '✗';
    console.log(`  ${marker} ${s.name}`);
    console.log(`      declarative: ${s.declarativeScore.toFixed(4)}`);
    console.log(`      final:       ${s.score.toFixed(4)}`);
    console.log(`      features:    ${s.features.names.length} (${s.features.names.slice(0, 5).join(', ')}${s.features.names.length > 5 ? '...' : ''})`);
  }
  console.log('');
  console.log(`Active handlers: ${active.length} / ${scored.length}`);
}

function commandReset(scope, name) {
  if (scope === 'all') {
    if (existsSync(FILES.LEARNED_WEIGHTS)) {
      if (existsSync(FILES.BACKUP_WEIGHTS)) {
        console.log('Keeping backup at:', FILES.BACKUP_WEIGHTS);
      }
      copyFileSync(FILES.LEARNED_WEIGHTS, FILES.BACKUP_WEIGHTS);
      writeFileSync(FILES.LEARNED_WEIGHTS, JSON.stringify({
        version: '1.0',
        vectorSize: 256,
        updatedAt: new Date().toISOString(),
        activations: {},
        weights: {},
      }, null, 2));
      console.log('All weights reset. Backup saved.');
    } else {
      console.log('No weights to reset.');
    }
    return;
  }

  if (scope === 'handler' && name) {
    if (!existsSync(FILES.LEARNED_WEIGHTS)) {
      console.log('No weights found.');
      return;
    }
    const data = JSON.parse(readFileSync(FILES.LEARNED_WEIGHTS, 'utf-8'));
    if (data.weights[name]) {
      delete data.weights[name];
      delete data.activations[name];
      data.updatedAt = new Date().toISOString();
      copyFileSync(FILES.LEARNED_WEIGHTS, FILES.BACKUP_WEIGHTS);
      writeFileSync(FILES.LEARNED_WEIGHTS, JSON.stringify(data, null, 2));
      console.log(`Reset handler: ${name}. Backup saved.`);
    } else {
      console.log(`Handler "${name}" has no learned weights.`);
    }
    return;
  }

  console.error('Usage: neural-link reset handler <name> | neural-link reset all');
  process.exit(1);
}

function commandRollback() {
  if (!existsSync(FILES.BACKUP_WEIGHTS)) {
    console.log('No backup found.');
    return;
  }
  copyFileSync(FILES.BACKUP_WEIGHTS, FILES.LEARNED_WEIGHTS);
  console.log('Weights restored from backup.');
}
