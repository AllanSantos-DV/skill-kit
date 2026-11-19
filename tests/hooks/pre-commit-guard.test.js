'use strict';
// Tests for the --check dry-run of hooks/pre-commit-guard.js and for the unchanged stdin path.
// Run: node --test tests/hooks/pre-commit-guard.test.js

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', '..', 'hooks', 'pre-commit-guard.js');
const temps = [];

after(() => { for (const d of temps) fs.rmSync(d, { recursive: true, force: true }); });

function git(cwd, ...args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
}

/** Real throwaway repo; dirty adds an uncommitted edit. */
function makeRepo(dirty) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-check-'));
  temps.push(dir);
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'f.txt'), 'v1\n');
  git(dir, 'add', 'f.txt');
  git(dir, 'commit', '-q', '-m', 'chore: base');
  if (dirty) fs.writeFileSync(path.join(dir, 'f.txt'), 'uncommitted work\n');
  return dir;
}

function check(args, cwd) {
  return spawnSync(process.execPath, [HOOK, ...args], { cwd, encoding: 'utf8', windowsHide: true, timeout: 15000 });
}

test('--check: deny on dirty tree, names the cwd, exit 0, command not executed', () => {
  const repo = makeRepo(true);
  const r = check(['--check', 'git reset --hard HEAD'], repo);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /deny/i);
  assert.ok(r.stdout.includes(fs.realpathSync(repo)) || r.stdout.includes(repo), 'cwd must be reported');
  assert.match(r.stdout, /uncommitted work/);
  assert.strictEqual(fs.readFileSync(path.join(repo, 'f.txt'), 'utf8'), 'uncommitted work\n');
});

test('--check: same command asks on a clean tree (decision depends on cwd git state)', () => {
  const repo = makeRepo(false);
  const r = check(['--check', 'git reset --hard HEAD', '--json'], repo);
  assert.strictEqual(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.decision, 'ask');
  assert.strictEqual(path.resolve(out.cwd), path.resolve(repo));
  assert.match(out.reason, /tree is clean/);
});

test('--check --json: flag order is free and output is a single JSON document', () => {
  const repo = makeRepo(false);
  const r = check(['--json', '--check', 'git add -A'], repo);
  assert.strictEqual(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.decision, 'deny');
  assert.strictEqual(out.command, 'git add -A');
  assert.match(out.reason, /git add -A/);
});

test('--check: harmless command is allow with an explicit no-rule reason', () => {
  const r = check(['--check', 'echo ola', '--json'], makeRepo(false));
  assert.strictEqual(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.decision, 'allow');
  assert.match(out.reason, /no guard rule/i);
});

test('--check: filesystem deny is reported without deleting anything', () => {
  const repo = makeRepo(false);
  const victim = path.join(repo, 'victim');
  fs.mkdirSync(victim);
  const r = check(['--check', 'rm -rf ' + victim], repo);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /deny/i);
  assert.ok(fs.existsSync(victim));
});

test('--check without a command is a usage error (exit 2, stderr)', () => {
  const r = check(['--check'], makeRepo(false));
  assert.strictEqual(r.status, 2);
  assert.match(r.stderr, /usage/i);
});

test('stdin path is unchanged: deny payload on dirty tree, silence on harmless command', () => {
  const repo = makeRepo(true);
  const payload = (command) => JSON.stringify({ tool_name: 'Bash', cwd: repo, tool_input: { command } });
  const run = (command) => spawnSync(process.execPath, [HOOK], {
    input: payload(command), encoding: 'utf8', windowsHide: true, timeout: 15000,
  });
  const denied = run('git reset --hard HEAD');
  assert.strictEqual(denied.status, 0);
  assert.strictEqual(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision, 'deny');
  const silent = run('echo ola');
  assert.strictEqual(silent.status, 0);
  assert.strictEqual(silent.stdout, '');
});
