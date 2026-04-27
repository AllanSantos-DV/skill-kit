#!/usr/bin/env node
// Stop hook: capture skill feedback — only when skills with Feedback Protocol were used
'use strict';
const fs = require('fs');
const path = require('path');
const { readStdinJson, guardStopActive, readTranscript, lastUserMessageIdx, emitStopBlock } = require('./_lib/hook-io');

readStdinJson((hookInput) => {
  guardStopActive(hookInput);

  const lines = readTranscript(hookInput);
  if (!lines) process.exit(0);

  const startIdx = lastUserMessageIdx(lines);

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

  emitStopBlock(message);
});
