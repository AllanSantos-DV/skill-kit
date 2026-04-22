#!/usr/bin/env node
// Stop hook: remind implementor of checklist
'use strict';

let rawInput = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { rawInput += chunk; });
process.stdin.on('end', () => {
  try {
    const inputJson = JSON.parse(rawInput);
    if (inputJson.stop_hook_active === true) process.exit(0);
  } catch (_) {
    // Empty or invalid JSON — continue to output reminder
  }

  const result = {
    decision: 'block',
    reason: 'Before finishing: 1) Did you run tests? 2) Did you produce a task map (if decisions were made)? 3) Is the quality checklist satisfied?',
    hookSpecificOutput: {
      hookEventName: 'Stop',
      decision: 'block',
      reason: 'Before finishing: 1) Did you run tests? 2) Did you produce a task map (if decisions were made)? 3) Is the quality checklist satisfied?'
    }
  };
  process.stdout.write(JSON.stringify(result) + '\n');
});
