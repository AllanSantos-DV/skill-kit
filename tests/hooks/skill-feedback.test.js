'use strict';
// Tests for hooks/skill-feedback.js: review-threshold line added to the Stop output.
// Thresholds come from the repo's real skills/*/FEEDBACK.md (all declare `threshold: 5`).
// Run: node --test tests/hooks/skill-feedback.test.js

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', '..', 'hooks', 'skill-feedback.js');
const temps = [];

after(() => { for (const d of temps) fs.rmSync(d, { recursive: true, force: true }); });

/** Temp project with a transcript where `used` skills' SKILL.md were read this turn. */
function makeProject(used) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-fb-'));
  temps.push(cwd);
  const lines = [JSON.stringify({ type: 'user.message', data: { content: 'hi' } })];
  for (const skill of used) {
    const skillMd = path.join(cwd, 'skills', skill, 'SKILL.md');
    fs.mkdirSync(path.dirname(skillMd), { recursive: true });
    fs.writeFileSync(skillMd, '## Feedback Protocol\n');
    lines.push(JSON.stringify({
      type: 'tool.execution_start',
      data: { toolName: 'read_file', arguments: { filePath: skillMd } },
    }));
  }
  while (lines.length < 6) lines.push(JSON.stringify({ type: 'noop', data: {} }));
  const transcript = path.join(cwd, 'transcript.jsonl');
  fs.writeFileSync(transcript, lines.join('\n'));
  return { cwd, transcript };
}

function addReviews(cwd, skill, count, extraName) {
  const dir = path.join(cwd, '.vscode', 'skill-reviews', skill);
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < count; i++) fs.writeFileSync(path.join(dir, '2026-01-0' + (i + 1) + 'T10-00.json'), '{}');
  if (extraName) fs.writeFileSync(path.join(dir, extraName), 'not a review');
}

function run(project) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ cwd: project.cwd, transcript_path: project.transcript }),
    encoding: 'utf8', windowsHide: true, timeout: 15000,
  });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
}

test('count >= threshold adds one line naming skill, count and threshold', () => {
  const p = makeProject(['task-map']);
  addReviews(p.cwd, 'task-map', 5);
  const out = run(p);
  assert.strictEqual(out.decision, 'block');
  assert.match(out.reason, /SKILL FEEDBACK CHECK/);
  const lines = out.reason.split('\n').filter((l) => l.includes('task-map: 5 reviews (threshold 5)'));
  assert.strictEqual(lines.length, 1);
});

test('below threshold: existing output only, no threshold line', () => {
  const p = makeProject(['task-map']);
  addReviews(p.cwd, 'task-map', 4);
  const out = run(p);
  assert.match(out.reason, /SKILL FEEDBACK CHECK/);
  assert.doesNotMatch(out.reason, /threshold \d/);
});

test('only .json files count as reviews', () => {
  const p = makeProject(['task-map']);
  addReviews(p.cwd, 'task-map', 4, 'notes.txt');
  assert.doesNotMatch(run(p).reason, /threshold \d/);
});

test('each skill that reached its threshold gets its own line; missing dirs count as zero', () => {
  const p = makeProject(['task-map']);
  addReviews(p.cwd, 'task-map', 6);
  addReviews(p.cwd, 'safety-check', 5);
  const reason = run(p).reason;
  assert.match(reason, /task-map: 6 reviews \(threshold 5\)/);
  assert.match(reason, /safety-check: 5 reviews \(threshold 5\)/);
  assert.doesNotMatch(reason, /skill-creator: \d/);
});

test('reviews path that is a file instead of a directory fails open as zero', () => {
  const p = makeProject(['task-map']);
  const dir = path.join(p.cwd, '.vscode', 'skill-reviews');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'task-map'), 'oops');
  const out = run(p);
  assert.match(out.reason, /SKILL FEEDBACK CHECK/);
  assert.doesNotMatch(out.reason, /threshold \d/);
});

test('no skill used in the turn: silent, even with reviews over the threshold', () => {
  const p = makeProject([]);
  addReviews(p.cwd, 'task-map', 9);
  assert.strictEqual(run(p), null);
});

test('an agent that reached its threshold gets a line pointing at its feedback file', () => {
  const p = makeProject(['task-map']);
  addReviews(p.cwd, 'implementor', 5);
  addReviews(p.cwd, 'validator', 4);
  const reason = run(p).reason;
  assert.match(reason, /implementor: 5 reviews \(threshold 5\)/);
  assert.match(reason, /agents\/\.feedback\/implementor\.md/);
  assert.doesNotMatch(reason, /validator: \d/);
});

test('agent reviews over the threshold stay silent when no skill was used in the turn', () => {
  const p = makeProject([]);
  addReviews(p.cwd, 'orchestrator', 9);
  assert.strictEqual(run(p), null);
});

test('installed layout: thresholds come from ~/.copilot when the hook has no checkout beside it', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-fb-home-'));
  temps.push(home);
  fs.mkdirSync(path.join(home, '.copilot', 'agents', '.feedback'), { recursive: true });
  fs.writeFileSync(path.join(home, '.copilot', 'agents', '.feedback', 'zeta.md'), '---\nthreshold: 2\n---\n');
  const p = makeProject(['task-map']);
  addReviews(p.cwd, 'zeta', 2);
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ cwd: p.cwd, transcript_path: p.transcript }),
    env: { ...process.env, USERPROFILE: home, HOME: home },
    encoding: 'utf8', windowsHide: true, timeout: 15000,
  });
  assert.match(JSON.parse(r.stdout).reason, /zeta: 2 reviews \(threshold 2\)/);
});
