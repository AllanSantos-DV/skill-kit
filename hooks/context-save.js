#!/usr/bin/env node
// PreCompact hook: save session state snapshot before context compaction
'use strict';
const fs = require('fs');
const path = require('path');

let rawInput = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { rawInput += chunk; });
process.stdin.on('end', () => {
  let hookInput;
  try { hookInput = JSON.parse(rawInput); } catch (_) { process.exit(0); }

  const transcriptPath = hookInput.transcript_path;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) process.exit(0);

  const sessionId = hookInput.sessionId || 'unknown';
  const cwd = hookInput.cwd || process.cwd();

  let lines;
  try { lines = fs.readFileSync(transcriptPath, 'utf8').split('\n'); } catch (_) { process.exit(0); }

  // Scope to content since last user.message
  let startIdx = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('"user.message"')) {
      startIdx = i;
      break;
    }
  }

  const fileTools = [
    'read_file', 'create_file', 'replace_string_in_file',
    'multi_replace_string_in_file', 'edit_notebook_file'
  ];

  const filesTouched = new Set();
  const commandsRun = new Set();
  const errors = [];
  const decisions = [];
  const openWork = [];
  let sessionStartTime = '';

  const errorPatterns = /\berror:/i;
  const failPatterns = /\bFAIL\b|✗|\bstderr\b/;
  const decisionPatterns = /\bdecidi\b|\bdecision:\b|\bescolhi\b|\btrade-off:\b|\bchose\b|\bopted for\b/i;
  const openWorkPatterns = /\bTODO:\b|\bpróximo passo:\b|\bnext step:\b|\bfalta:\b|\bpending:\b|- \[ \]/i;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length < 10) continue;

    let evt;
    try { evt = JSON.parse(line); } catch (_) { continue; }

    // Capture session start time
    if (evt.type === 'session.start' && evt.timestamp && !sessionStartTime) {
      sessionStartTime = evt.timestamp;
    }

    // Files touched from tool.execution_start
    if (evt.type === 'tool.execution_start' && evt.data) {
      const toolName = evt.data.toolName;
      const args = evt.data.arguments || {};

      if (fileTools.includes(toolName)) {
        const fp = args.filePath || args.path || '';
        if (fp) filesTouched.add(fp);
        // multi_replace has replacements array
        if (args.replacements) {
          for (const r of args.replacements) {
            if (r.filePath) filesTouched.add(r.filePath);
          }
        }
      }

      if (toolName === 'run_in_terminal' || toolName === 'Bash') {
        const cmd = args.command || '';
        if (cmd) commandsRun.add(cmd.length > 80 ? cmd.substring(0, 80) + '…' : cmd);
      }
    }

    // Errors from tool.execution_complete
    if (evt.type === 'tool.execution_complete' && evt.data) {
      const output = evt.data.output || evt.data.result || '';
      if (typeof output === 'string') {
        const outputLines = output.split('\n');
        for (const ol of outputLines) {
          if (errorPatterns.test(ol) || failPatterns.test(ol)) {
            const trimmed = ol.trim().substring(0, 120);
            if (trimmed) errors.push(trimmed);
          }
        }
      }
    }

    // Decisions and errors from assistant.message
    if (evt.type === 'assistant.message' && evt.data) {
      const content = evt.data.content || '';
      if (typeof content === 'string') {
        const contentLines = content.split('\n');
        for (const cl of contentLines) {
          if (errorPatterns.test(cl) || failPatterns.test(cl)) {
            const trimmed = cl.trim().substring(0, 120);
            if (trimmed) errors.push(trimmed);
          }
          if (decisionPatterns.test(cl)) {
            const trimmed = cl.trim().substring(0, 150);
            if (trimmed) decisions.push(trimmed);
          }
          if (openWorkPatterns.test(cl)) {
            const trimmed = cl.trim().substring(0, 150);
            if (trimmed) openWork.push(trimmed);
          }
        }
      }
    }
  }

  // Dedup and cap lists at 20
  const cap = (arr, max) => [...new Set(arr)].slice(0, max || 20);
  const filesArr = cap([...filesTouched], 20);
  const cmdsArr = cap([...commandsRun], 20);
  const errorsArr = cap(errors, 20);
  const decisionsArr = cap(decisions, 20);
  const openWorkArr = cap(openWork, 20);

  // Build snapshot
  const now = new Date();
  const ts = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0');

  const sections = [];
  sections.push('# Session Snapshot — ' + ts);
  sections.push('- Session ID: ' + sessionId);
  if (sessionStartTime) sections.push('- Session started: ' + sessionStartTime);
  sections.push('');

  sections.push('## Files in progress (' + filesArr.length + ')');
  if (filesArr.length > 0) filesArr.forEach(f => sections.push('- ' + f));
  else sections.push('No files detected.');
  sections.push('');

  sections.push('## Commands run (' + cmdsArr.length + ')');
  if (cmdsArr.length > 0) cmdsArr.forEach(c => sections.push('- ' + c));
  else sections.push('No commands detected.');
  sections.push('');

  sections.push('## Decisions captured (' + decisionsArr.length + ')');
  if (decisionsArr.length > 0) decisionsArr.forEach(d => sections.push('- ' + d));
  else sections.push('No decisions detected.');
  sections.push('');

  sections.push('## Open work items (' + openWorkArr.length + ')');
  if (openWorkArr.length > 0) openWorkArr.forEach(o => sections.push('- ' + o));
  else sections.push('No open items detected.');
  sections.push('');

  sections.push('## Recent errors (' + errorsArr.length + ')');
  if (errorsArr.length > 0) errorsArr.forEach(e => sections.push('- ' + e));
  else sections.push('No errors detected.');
  sections.push('');

  let snapshot = sections.join('\n');

  // Cap at 10KB
  if (Buffer.byteLength(snapshot, 'utf8') > 10240) {
    snapshot = snapshot.substring(0, 10000) + '\n\n... (truncated to 10KB limit)';
  }

  // Save to docs/maps/
  const mapsDir = path.join(cwd, 'docs', 'maps');
  try {
    if (!fs.existsSync(path.join(cwd, 'docs'))) fs.mkdirSync(path.join(cwd, 'docs'));
    if (!fs.existsSync(mapsDir)) fs.mkdirSync(mapsDir);
    const snapshotFile = path.join(mapsDir, 'session-' + sessionId + '-snapshot.md');
    fs.writeFileSync(snapshotFile, snapshot, 'utf8');

    const relPath = 'docs/maps/session-' + sessionId + '-snapshot.md';
    const result = {
      hookSpecificOutput: {
        hookEventName: 'PreCompact',
        additionalContext: 'Session context snapshot saved to ' + relPath + '. If detail was lost during compaction, read this file to recover state.'
      }
    };
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (_) {
    process.exit(0);
  }
});
