#!/usr/bin/env node
// Stop hook for researcher/validator: remind output format
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
    reason: 'Verify your output follows the required format: Research Summary (researcher) or Validation Report (validator) with all mandatory sections.',
    hookSpecificOutput: {
      hookEventName: 'Stop',
      decision: 'block',
      reason: 'Verify your output follows the required format: Research Summary (researcher) or Validation Report (validator) with all mandatory sections.'
    }
  };
  process.stdout.write(JSON.stringify(result) + '\n');
});
