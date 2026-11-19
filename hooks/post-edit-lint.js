#!/usr/bin/env node
// PostToolUse hook: after a file edit, run the project's own linter on that file and hand its
// output back to the agent. Opt-in per project through <cwd>/.skill-kit/lint.json:
//
//   { "commands": { "js": "npx eslint {file}", "py": "ruff check {file}" }, "timeoutMs": 20000 }
//
// `{file}` becomes the quoted path of the edited file; the key is its extension. It never blocks
// the edit: the result is additionalContext only, and the hook always exits 0. A broken config or
// a linter that cannot run is reported in that context instead of being skipped silently.
//
// @permissions: fs.read, process.spawn
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readStdinJson, emitResponse } = require('./_lib/hook-io');

const CONFIG_PATH = path.join('.skill-kit', 'lint.json');
const DEFAULT_TIMEOUT_MS = 20000;
const MAX_OUTPUT_CHARS = 2000;
const WRITE_TOOLS = new Set([
  'write', 'edit', 'multiedit', 'create_file', 'write_file', 'edit_file',
  'replace_string_in_file', 'multi_replace_string_in_file', 'insert_edit_into_file',
]);

/**
 * Edited file path from a tool input, resolved against the project directory.
 * @param {object} toolInput
 * @param {string} cwd
 * @returns {string|null}
 */
function editedFile(toolInput, cwd) {
  const p = toolInput && (toolInput.file_path || toolInput.filePath || toolInput.path);
  return typeof p === 'string' && p ? path.resolve(cwd, p) : null;
}

/**
 * Load the project's lint config.
 * @param {string} cwd
 * @returns {{config: object|null, error: string|null}} config is null (no error) when the project did not opt in
 */
function loadConfig(cwd) {
  const file = path.join(cwd, CONFIG_PATH);
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) {
    return e.code === 'ENOENT' ? { config: null, error: null } : { config: null, error: CONFIG_PATH + ' is unreadable: ' + e.message };
  }
  let config;
  try { config = JSON.parse(raw); } catch (e) { return { config: null, error: CONFIG_PATH + ' is not valid JSON: ' + e.message }; }
  if (!config || typeof config.commands !== 'object' || Array.isArray(config.commands)) {
    return { config: null, error: CONFIG_PATH + ' needs a "commands" object keyed by file extension' };
  }
  return { config, error: null };
}

/**
 * Lint one file.
 * @param {string} file absolute path of the edited file
 * @param {object} config parsed lint config
 * @param {string} cwd project directory the command runs in
 * @returns {string|null} message for the agent, or null when the file is clean or has no command
 */
function lintFile(file, config, cwd) {
  const command = config.commands[path.extname(file).slice(1).toLowerCase()];
  if (typeof command !== 'string' || !command) return null;
  if (/["`$%]/.test(file)) return 'lint skipped: the path of the edited file has characters a shell command cannot take safely';
  const timeout = Number.isInteger(config.timeoutMs) && config.timeoutMs > 0 ? config.timeoutMs : DEFAULT_TIMEOUT_MS;
  const res = spawnSync(command.replace(/\{file\}/g, '"' + file + '"'), {
    cwd, shell: true, encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024,
  });
  const name = path.relative(cwd, file) || file;
  if (res.error) {
    const why = res.error.code === 'ETIMEDOUT' ? 'timed out after ' + timeout + ' ms' : res.error.message;
    return 'lint could not run on ' + name + ': ' + why;
  }
  if (res.status === 0) return null;
  const output = ((res.stdout || '') + (res.stderr || '')).trim();
  const clipped = output.length > MAX_OUTPUT_CHARS ? output.slice(0, MAX_OUTPUT_CHARS) + '\n[output cut]' : output;
  return 'Lint reported problems in ' + name + ' (exit ' + res.status + '):\n' + (clipped || '(no output)');
}

/**
 * Message for one PostToolUse payload.
 * @param {object} input hook payload
 * @returns {string|null}
 */
function review(input) {
  if (!WRITE_TOOLS.has(String(input.tool_name || '').toLowerCase())) return null;
  const cwd = input.cwd || process.cwd();
  const file = editedFile(input.tool_input, cwd);
  if (!file) return null;
  const { config, error } = loadConfig(cwd);
  if (error) return error;
  return config ? lintFile(file, config, cwd) : null;
}

if (require.main === module) {
  readStdinJson((input) => {
    const message = review(input || {});
    if (message) emitResponse({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: message } });
  });
}

module.exports = { review, loadConfig, editedFile };
