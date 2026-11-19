'use strict';
// Credential guard: staged diff on `git commit` and content of agent writes.
// Fixtures are secret-SHAPED strings assembled at run time from fragments; none is a real credential.
// Run: node --test tests/hooks/credential-guard.test.js

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const scan = require('../../hooks/_lib/credential-scan');

const HOOK = path.join(__dirname, '..', '..', 'hooks', 'pre-commit-guard.js');
const temps = [];
after(() => { for (const d of temps) fs.rmSync(d, { recursive: true, force: true }); });

const AWS = 'AKIA' + 'QWERTYUIOP' + '123456';
const GITHUB = 'ghp_' + 'a1B2c3D4'.repeat(5);
const ANTHROPIC = 'sk-ant-' + 'abcDEF123456'.repeat(3);
const PEM_HEADER = '-----BEGIN ' + 'RSA PRIVATE KEY-----';

const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-guard-'));
  temps.push(dir);
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  return dir;
}

function stage(repo, file, content) {
  fs.writeFileSync(path.join(repo, file), content);
  git(repo, 'add', file);
}

function hook(payload, env) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8', windowsHide: true, timeout: 15000,
    env: { ...process.env, SKILL_KIT_ALLOW_SECRETS: '', ...(env || {}) },
  });
  assert.strictEqual(r.status, 0, r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
}

const commit = (repo, env) => hook({ tool_name: 'Bash', cwd: repo, tool_input: { command: 'git commit -m "feat: x"' } }, env);
const passes = (out) => out === null || out.permissionDecision === 'allow';

test('scanText: each provider shape is found by line and kind, never by value', () => {
  const text = ['ok', 'aws=' + AWS, 'token ' + GITHUB, 'k=' + ANTHROPIC, PEM_HEADER].join('\n');
  const f = scan.scanText(text);
  assert.deepStrictEqual(f.map((x) => [x.line, x.kind]), [
    [2, 'AWS access key id'], [3, 'GitHub token'], [4, 'Anthropic API key'], [5, 'private key']]);
  assert.ok(!JSON.stringify(f).includes(AWS) && !JSON.stringify(f).includes(GITHUB));
});

test('scanText: placeholders, examples and the allow marker are skipped', () => {
  assert.deepStrictEqual(scan.scanText('aws=AKIAIOSFODNN7EXAMPLE'), []);
  assert.deepStrictEqual(scan.scanText('token=' + GITHUB + ' # ' + scan.ALLOW_MARKER), []);
  assert.deepStrictEqual(scan.scanText('const note = "AKIA is the prefix of an AWS key id"'), []);
});

test('isSensitiveFileName: .env and keys yes, templates no', () => {
  for (const n of ['.env', '.env.production', 'a/b/id_rsa', 'cert.pem', 'k.key']) assert.ok(scan.isSensitiveFileName(n), n);
  for (const n of ['.env.example', '.env.sample', 'README.md', 'environment.js']) assert.ok(!scan.isSensitiveFileName(n), n);
});

test('commit: denies a staged credential, naming file, line and kind but not the value', () => {
  const repo = makeRepo();
  stage(repo, 'cfg.js', 'const a = 1;\nconst key = "' + AWS + '";\n');
  const out = commit(repo);
  assert.strictEqual(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /AWS access key id at cfg\.js:2/);
  assert.ok(!out.permissionDecisionReason.includes(AWS));
  assert.match(out.permissionDecisionReason, /skill-kit:allow-secret/);
});

test('commit: denies a staged credential file even when its content has no known shape', () => {
  const repo = makeRepo();
  stage(repo, '.env', 'PLAIN=value\n');
  assert.match(commit(repo).permissionDecisionReason, /credential file staged: \.env/);
});

test('commit: allows a clean diff and the template file', () => {
  const repo = makeRepo();
  stage(repo, '.env.example', 'TOKEN=\n');
  stage(repo, 'a.js', 'module.exports = 1;\n');
  assert.ok(passes(commit(repo)));
});

test('commit: only added lines count, so removing a leaked line is allowed', () => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'cfg.js'), 'const key = "' + AWS + '";\n');
  git(repo, 'add', 'cfg.js');
  git(repo, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--no-verify', '-m', 'chore: leak');
  stage(repo, 'cfg.js', 'const key = process.env.KEY;\n');
  assert.ok(passes(commit(repo)));
});

test('commit: the marker on the line is the escape hatch kept in the repository', () => {
  const repo = makeRepo();
  stage(repo, 'cfg.js', 'const key = "' + AWS + '"; // ' + scan.ALLOW_MARKER + '\n');
  assert.ok(passes(commit(repo)));
});

test('commit: SKILL_KIT_ALLOW_SECRETS=1 from the user environment lets it through', () => {
  const repo = makeRepo();
  stage(repo, 'cfg.js', 'const key = "' + GITHUB + '";\n');
  assert.strictEqual(commit(repo).permissionDecision, 'deny');
  assert.ok(passes(commit(repo, { SKILL_KIT_ALLOW_SECRETS: '1' })));
});

test('commit: outside a repository the guard stays out of git’s way', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-norepo-'));
  temps.push(dir);
  assert.ok(passes(commit(dir)));
});

test('--check shows the credential denial without committing', () => {
  const repo = makeRepo();
  stage(repo, 'cfg.js', 'k="' + ANTHROPIC + '"\n');
  const r = spawnSync(process.execPath, [HOOK, '--check', 'git commit -m "feat: x"', '--json'], {
    cwd: repo, encoding: 'utf8', windowsHide: true, env: { ...process.env, SKILL_KIT_ALLOW_SECRETS: '' },
  });
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.decision, 'deny');
  assert.match(out.reason, /Anthropic API key at cfg\.js:1/);
  assert.strictEqual(git(repo, 'log', '--oneline').status !== 0 || git(repo, 'log', '--oneline').stdout === '', true);
});

test('write tools: deny content with a credential, for Write, Edit and MultiEdit shapes', () => {
  const cases = [
    { tool_name: 'Write', tool_input: { file_path: 'a.js', content: 'x=1\nk="' + AWS + '"' } },
    { tool_name: 'Edit', tool_input: { file_path: 'a.js', old_string: 'x', new_string: 'k="' + GITHUB + '"' } },
    { tool_name: 'MultiEdit', tool_input: { file_path: 'a.js', edits: [{ old_string: 'x', new_string: PEM_HEADER }] } },
    { tool_name: 'create_file', tool_input: { filePath: 'a.js', content: ANTHROPIC } },
  ];
  for (const c of cases) {
    const out = hook(c);
    assert.strictEqual(out.permissionDecision, 'deny', c.tool_name);
    assert.match(out.permissionDecisionReason, /contains credentials/);
    assert.ok(![AWS, GITHUB, ANTHROPIC].some((s) => out.permissionDecisionReason.includes(s)));
  }
});

test('write tools: harmless content, the marker and the user switch are all allowed (no output)', () => {
  assert.strictEqual(hook({ tool_name: 'Write', tool_input: { file_path: 'a.js', content: 'const a = 1;' } }), null);
  assert.strictEqual(hook({ tool_name: 'Write', tool_input: { content: 'k="' + AWS + '" // ' + scan.ALLOW_MARKER } }), null);
  assert.strictEqual(hook({ tool_name: 'Write', tool_input: { content: AWS } }, { SKILL_KIT_ALLOW_SECRETS: '1' }), null);
});

test('non-write, non-terminal tools stay untouched', () => {
  assert.strictEqual(hook({ tool_name: 'Read', tool_input: { file_path: AWS } }), null);
});
