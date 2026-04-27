#!/usr/bin/env node
// SubagentStart hook: log routing decisions
'use strict';
const { readStdinJson } = require('./_lib/hook-io');

readStdinJson((input) => {
  const agent = input.agentName || 'unknown';
  const now = new Date();
  const ts = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':' +
    String(now.getSeconds()).padStart(2, '0');

  process.stderr.write('[' + ts + '] Subagent started: ' + agent + '\n');
  process.stdout.write('{}');
});
