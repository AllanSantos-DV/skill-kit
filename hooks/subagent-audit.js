#!/usr/bin/env node
// SubagentStart hook: log routing decisions
'use strict';

let rawInput = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { rawInput += chunk; });
process.stdin.on('end', () => {
  let agent = 'unknown';
  try {
    const inputJson = JSON.parse(rawInput);
    if (inputJson.agentName) agent = inputJson.agentName;
  } catch (_) {
    // Empty or invalid JSON — use default agent name
  }
  const now = new Date();
  const ts = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':' +
    String(now.getSeconds()).padStart(2, '0');

  // Log to stderr (doesn't affect hook output)
  process.stderr.write('[' + ts + '] Subagent started: ' + agent + '\n');

  // Return empty success
  process.stdout.write('{}');
});
