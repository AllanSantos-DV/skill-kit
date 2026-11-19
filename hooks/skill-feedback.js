#!/usr/bin/env node
// Stop hook: capture skill feedback — only when skills with Feedback Protocol were used
// @permissions: fs.read, fs.write
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readStdinJson, guardStopActive, readTranscript, lastUserMessageIdx, emitStopBlock } = require('./_lib/hook-io');

/**
 * Directories holding skills/ and agents/.feedback/: the repository checkout (hook run in place)
 * and ~/.copilot (hook installed under ~/.copilot/hooks/scripts, where the checkout layout is absent).
 */
function feedbackRoots() {
  return [...new Set([path.join(__dirname, '..'), path.join(os.homedir(), '.copilot')])];
}

/**
 * Feedback sources whose reviews live under .vscode/skill-reviews/<name>/: one FEEDBACK.md per
 * skill and one agents/.feedback/<name>.md per agent. The first root that has a name wins.
 *
 * @returns {{name: string, file: string, guide: string}[]}
 */
function feedbackSources() {
  const sources = new Map();
  const add = (name, file, guide) => { if (!sources.has(name)) sources.set(name, { name, file, guide }); };
  for (const root of feedbackRoots()) {
    try {
      for (const skill of fs.readdirSync(path.join(root, 'skills'))) {
        add(skill, path.join(root, 'skills', skill, 'FEEDBACK.md'), 'skills/' + skill + '/FEEDBACK.md');
      }
    } catch (_) { /* no skills directory under this root */ }
    try {
      const dir = path.join(root, 'agents', '.feedback');
      for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.md'))) {
        add(f.slice(0, -3), path.join(dir, f), 'agents/.feedback/' + f);
      }
    } catch (_) { /* no agent feedback directory under this root */ }
  }
  return [...sources.values()];
}

/**
 * Skills and agents whose accumulated reviews reached the `threshold:` declared in their feedback file.
 *
 * Reviews are the *.json files in <cwd>/.vscode/skill-reviews/<name>/. A missing or
 * unreadable directory counts as zero, and a source without a numeric threshold is skipped.
 *
 * @param {string} cwd - Project root holding .vscode/skill-reviews.
 * @returns {{skill: string, count: number, threshold: number, guide: string}[]}
 */
function skillsAtThreshold(cwd) {
  const reached = [];
  for (const { name, file, guide } of feedbackSources()) {
    let threshold;
    try {
      const feedback = fs.readFileSync(file, 'utf8');
      const front = feedback.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const m = front && front[1].match(/^threshold:\s*(\d+)\s*$/m);
      threshold = m ? Number(m[1]) : NaN;
    } catch (_) { continue; }
    if (!(threshold > 0)) continue;

    let count = 0;
    try {
      count = fs.readdirSync(path.join(cwd, '.vscode', 'skill-reviews', name))
        .filter((f) => f.endsWith('.json')).length;
    } catch (_) { /* missing dir: zero reviews */ }
    if (count >= threshold) reached.push({ skill: name, count, threshold, guide });
  }
  return reached;
}

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
  const thresholdLines = skillsAtThreshold(hookInput.cwd || process.cwd()).map((r) =>
    '\nREVIEW THRESHOLD REACHED - ' + r.skill + ': ' + r.count + ' reviews (threshold ' + r.threshold +
    '); the maintainer should consolidate them (see ' + r.guide + ').');
  const message = 'SKILL FEEDBACK CHECK: Skills with Feedback Protocol were used in this session:\n' +
    skillList + '\n\n' +
    'If the user expressed dissatisfaction or corrections were needed:\n' +
    '1. Ask the user what specifically didn\'t work well\n' +
    '2. Follow the Feedback Protocol in the skill\'s SKILL.md to create a structured review\n' +
    '3. Create the review directory if it doesn\'t exist\n\n' +
    'If the session went well and the user didn\'t complain, skip this entirely.' +
    thresholdLines.join('');

  emitStopBlock(message);
});
