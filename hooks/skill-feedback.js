#!/usr/bin/env node
// Stop hook: capture skill feedback — only when skills with Feedback Protocol were used
'use strict';
const fs = require('fs');
const path = require('path');

let rawInput = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { rawInput += chunk; });
process.stdin.on('end', () => {
  let hookInput;
  try { hookInput = JSON.parse(rawInput); } catch (_) { process.exit(0); }
  if (hookInput.stop_hook_active === true) process.exit(0);

  const transcriptPath = hookInput.transcript_path;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) process.exit(0);

  let lines;
  try { lines = fs.readFileSync(transcriptPath, 'utf8').split('\n'); } catch (_) { process.exit(0); }
  if (!lines || lines.length < 5) process.exit(0);

  // Scope to current interaction: find last user.message
  let startIdx = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('"user.message"')) {
      startIdx = i;
      break;
    }
  }

  // Find SKILL.md reads in tool.execution_start events
  const skillPaths = new Set();
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length < 20) continue;
    if (!line.includes('"tool.execution_start"')) continue;

    let evt;
    try { evt = JSON.parse(line); } catch (_) { continue; }

    if (evt.type === 'tool.execution_start' && evt.data && evt.data.toolName === 'read_file') {
      const fp = evt.data.arguments && evt.data.arguments.filePath;
      if (fp && /[\\\/]skills[\\\/]/.test(fp) && /SKILL\.md$/.test(fp)) {
        skillPaths.add(fp);
      }
    }
  }

  if (skillPaths.size === 0) process.exit(0);

  // Check which skills have Feedback Protocol
  const feedbackSkills = [];
  for (const sp of skillPaths) {
    if (fs.existsSync(sp)) {
      let content;
      try { content = fs.readFileSync(sp, 'utf8'); } catch (_) { continue; }
      if (content && (/Feedback Protocol/.test(content) || /FEEDBACK:START/.test(content))) {
        const m = sp.match(/[\\\/]skills[\\\/]([^\\\/]+)[\\\/]SKILL\.md/);
        if (m) feedbackSkills.push(m[1]);
      }
    }
  }

  if (feedbackSkills.length === 0) process.exit(0);

  const skillList = feedbackSkills.map(s => '  - ' + s).join('\n');
  const message = 'SKILL FEEDBACK CHECK: Skills with Feedback Protocol were used in this session:\n' +
    skillList + '\n\n' +
    'If the user expressed dissatisfaction or corrections were needed:\n' +
    '1. Ask the user what specifically didn\'t work well\n' +
    '2. Follow the Feedback Protocol in the skill\'s SKILL.md to create a structured review\n' +
    '3. Create the review directory if it doesn\'t exist\n\n' +
    'If the session went well and the user didn\'t complain, skip this entirely.';

  const result = {
    decision: 'block',
    reason: message,
    hookSpecificOutput: {
      hookEventName: 'Stop',
      decision: 'block',
      reason: message
    }
  };
  process.stdout.write(JSON.stringify(result) + '\n');
});
