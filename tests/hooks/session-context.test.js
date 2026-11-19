'use strict';
// Tests for hooks/session-context.js: the post-compact pointer to the latest context-save snapshot.
// Run: node --test tests/hooks/session-context.test.js

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', '..', 'hooks', 'session-context.js');
const HOUR = 3600 * 1000;
const temps = [];

after(() => { for (const d of temps) fs.rmSync(d, { recursive: true, force: true }); });

/** Temp project dir with a package.json (so the hook always has base context). */
function makeProject(pkgName) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-ctx-'));
  temps.push(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: pkgName || 'demo', version: '1.0.0' }));
  return dir;
}

function writeSnapshot(cwd, id, ageMs) {
  const dir = path.join(cwd, 'docs', 'maps');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'session-' + id + '-snapshot.md');
  fs.writeFileSync(file, '# Session Snapshot\n');
  const t = new Date(Date.now() - ageMs);
  fs.utimesSync(file, t, t);
  return file;
}

function run(cwd, source) {
  const input = { hook_event_name: 'SessionStart', cwd };
  if (source !== undefined) input.source = source;
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(input), encoding: 'utf8', windowsHide: true, timeout: 15000,
  });
  assert.strictEqual(r.status, 0, r.stderr);
  const out = r.stdout.trim() ? JSON.parse(r.stdout) : null;
  return { raw: r.stdout, context: out ? out.hookSpecificOutput.additionalContext : '' };
}

test('compact: points to the most recent snapshot with relative path and age', () => {
  const cwd = makeProject();
  writeSnapshot(cwd, 'old', 5 * HOUR);
  writeSnapshot(cwd, 'new', 10 * 60 * 1000);
  const { context } = run(cwd, 'compact');
  assert.match(context, /docs[\\/]maps[\\/]session-new-snapshot\.md/);
  assert.doesNotMatch(context, /session-old-snapshot/);
  assert.match(context, /10 min/);
  assert.ok(!context.includes(cwd), 'path must be relative to the project');
});

test('compact: snapshot older than 24 h is ignored', () => {
  const cwd = makeProject();
  writeSnapshot(cwd, 'stale', 25 * HOUR);
  const { context } = run(cwd, 'compact');
  assert.doesNotMatch(context, /snapshot/i);
});

test('compact: age is shown in hours past one hour', () => {
  const cwd = makeProject();
  writeSnapshot(cwd, 'h', 3 * HOUR + 60000);
  assert.match(run(cwd, 'compact').context, /3 h/);
});

test('other sources never mention the snapshot', () => {
  const cwd = makeProject();
  writeSnapshot(cwd, 'fresh', 60000);
  for (const source of ['startup', 'resume', 'clear', 'fork', undefined]) {
    assert.doesNotMatch(run(cwd, source).context, /snapshot/i, 'source=' + source);
  }
});

test('compact without docs/maps keeps the base context and does not throw', () => {
  const cwd = makeProject('plain');
  const { context } = run(cwd, 'compact');
  assert.match(context, /Project: plain@1\.0\.0/);
});

test('800-character cap holds and the pointer survives truncation of the base context', () => {
  const cwd = makeProject('x'.repeat(1200));
  writeSnapshot(cwd, 'cap', 60000);
  const { context } = run(cwd, 'compact');
  assert.ok(context.length <= 800, 'length ' + context.length);
  assert.match(context, /session-cap-snapshot\.md/);
});

test('compact with no base context but a fresh snapshot still emits the pointer', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'session-ctx-bare-'));
  temps.push(cwd);
  writeSnapshot(cwd, 'bare', 60000);
  assert.match(run(cwd, 'compact').context, /session-bare-snapshot\.md/);
});
