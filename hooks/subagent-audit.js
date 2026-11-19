#!/usr/bin/env node
// SubagentStart hook: log subagent start to stderr and to the neural-link activity log
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readStdinJson } = require('./_lib/hook-io');

/**
 * Logs directory used by neural-link (NEURAL_LINK_HOME/logs, default ~/.copilot/neural-link/logs).
 * @returns {string}
 */
function logsDir() {
  const base = process.env.NEURAL_LINK_HOME || path.join(os.homedir(), '.copilot', 'neural-link');
  return path.join(base, 'logs');
}

/**
 * Append one SubagentStart record to today's JSONL. Never throws.
 * @param {object} input hook payload
 * @param {string|undefined} agent
 */
function appendActivity(input, agent) {
  try {
    const now = new Date();
    const record = {
      ts: now.toISOString(),
      event: 'SubagentStart',
      handler: 'subagent-audit',
      decision: 'allow',
    };
    if (agent) record.agent = agent;
    const sessionId = input.sessionId || input.session_id;
    if (sessionId) record.sessionId = sessionId;
    const dir = logsDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, now.toISOString().slice(0, 10) + '.jsonl'), JSON.stringify(record) + '\n');
  } catch (_) { /* audit must never break the hook */ }
}

readStdinJson((parsed) => {
  const input = parsed || {};
  const named = input.agentName || input.agent_type || input.agent_name;
  const agent = named || 'unknown';
  const now = new Date();
  const ts = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':' +
    String(now.getSeconds()).padStart(2, '0');

  appendActivity(input, named);
  process.stderr.write('[' + ts + '] Subagent started: ' + agent + '\n');
  process.stdout.write('{}');
});
