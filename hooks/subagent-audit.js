#!/usr/bin/env node
// SubagentStart/SubagentStop hook: log the subagent lifecycle to stderr and to the neural-link activity log
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
 * Append one SubagentStart or SubagentStop record to today's JSONL. Never throws.
 * A stop record keeps the subagent id and the size of its final message, not the text.
 * @param {object} input hook payload
 * @param {string|undefined} agent
 * @param {boolean} stopped true for SubagentStop
 */
function appendActivity(input, agent, stopped) {
  try {
    const now = new Date();
    const record = {
      ts: now.toISOString(),
      event: stopped ? 'SubagentStop' : 'SubagentStart',
      handler: 'subagent-audit',
      decision: 'allow',
    };
    if (agent) record.agent = agent;
    const sessionId = input.sessionId || input.session_id;
    if (sessionId) record.sessionId = sessionId;
    if (stopped) {
      if (input.agent_id) record.agentId = input.agent_id;
      if (typeof input.last_assistant_message === 'string') record.lastMessageChars = input.last_assistant_message.length;
    }
    const dir = logsDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, now.toISOString().slice(0, 10) + '.jsonl'), JSON.stringify(record) + '\n');
  } catch (_) { /* audit must never break the hook */ }
}

readStdinJson((parsed) => {
  const input = parsed || {};
  const named = input.agentName || input.agent_type || input.agent_name;
  const agent = named || 'unknown';
  const stopped = (input.hook_event_name || input.hookEventName) === 'SubagentStop';
  const now = new Date();
  const ts = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':' +
    String(now.getSeconds()).padStart(2, '0');

  appendActivity(input, named, stopped);
  process.stderr.write('[' + ts + '] Subagent ' + (stopped ? 'stopped' : 'started') + ': ' + agent + '\n');
  process.stdout.write('{}');
});
