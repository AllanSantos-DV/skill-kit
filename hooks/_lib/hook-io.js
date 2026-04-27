#!/usr/bin/env node
'use strict';
const fs = require('fs');

/**
 * Read stdin as UTF-8, parse JSON, call handler(parsed).
 * On parse failure: process.exit(0) (fail-open convention).
 * @param {function(object): void} handler
 */
function readStdinJson(handler) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { process.exit(0); }
    handler(parsed);
  });
}

/**
 * Guard for Stop hooks: exit if stop_hook_active === true.
 * @param {object} input
 * @returns {object} input unchanged
 */
function guardStopActive(input) {
  if (input.stop_hook_active === true) process.exit(0);
  return input;
}

/**
 * Read transcript lines from hookInput.transcript_path.
 * Returns null if unavailable or too short.
 * @param {object} hookInput
 * @param {object} [options]
 * @param {number} [options.minLines=5] - Minimum transcript lines required
 * @returns {string[] | null}
 */
function readTranscript(hookInput, options) {
  const minLines = (options && options.minLines) || 5;
  const transcriptPath = hookInput.transcript_path;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  let lines;
  try { lines = fs.readFileSync(transcriptPath, 'utf8').split('\n'); } catch (_) { return null; }
  if (!lines || lines.length < minLines) return null;
  return lines;
}

/**
 * Read transcript as raw string.
 * Returns null if unavailable or empty.
 * @param {object} hookInput
 * @returns {string | null}
 */
function readTranscriptRaw(hookInput) {
  const transcriptPath = hookInput.transcript_path;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  let content;
  try { content = fs.readFileSync(transcriptPath, 'utf8'); } catch (_) { return null; }
  return content || null;
}

/**
 * Find the index of the last user.message in transcript lines.
 * @param {string[]} lines
 * @returns {number}
 */
function lastUserMessageIdx(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('"user.message"')) return i;
  }
  return 0;
}

/**
 * Build and write a Stop hook block response to stdout.
 * @param {string} reason
 */
function emitStopBlock(reason) {
  const result = {
    decision: 'block',
    reason: reason,
    hookSpecificOutput: {
      hookEventName: 'Stop',
      decision: 'block',
      reason: reason
    }
  };
  process.stdout.write(JSON.stringify(result) + '\n');
}

/**
 * Write an arbitrary JSON response to stdout.
 * @param {object} result
 */
function emitResponse(result) {
  process.stdout.write(JSON.stringify(result) + '\n');
}

module.exports = {
  readStdinJson,
  guardStopActive,
  readTranscript,
  readTranscriptRaw,
  lastUserMessageIdx,
  emitStopBlock,
  emitResponse
};
