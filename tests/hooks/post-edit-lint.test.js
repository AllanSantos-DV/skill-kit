'use strict';
// post-edit-lint: opt-in per project, never blocks. The "linter" is a node one-liner stub.
// Run: node --test tests/hooks/post-edit-lint.test.js

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', '..', 'hooks', 'post-edit-lint.js');
const temps = [];
after(() => { for (const d of temps) fs.rmSync(d, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

/** Stub linter: fails with a message when the file contains the word BAD. */
const STUB = path.join(os.tmpdir(), 'skill-kit-lint-stub.js');
fs.writeFileSync(STUB, "const f=require('fs').readFileSync(process.argv[2],'utf8');" +
  "if(f.includes('BAD')){console.log('line 1: bad word');process.exit(3)}");
const stubCommand = `"${process.execPath}" "${STUB}" {file}`;

function project(config, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'post-lint-'));
  temps.push(dir);
  if (config !== undefined) {
    fs.mkdirSync(path.join(dir, '.skill-kit'));
    fs.writeFileSync(path.join(dir, '.skill-kit', 'lint.json'), typeof config === 'string' ? config : JSON.stringify(config));
  }
  for (const [name, text] of Object.entries(files || {})) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

function run(cwd, tool, input) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ cwd, tool_name: tool, tool_input: input }), encoding: 'utf8', windowsHide: true, timeout: 30000,
  });
  assert.strictEqual(r.status, 0, 'never fails the tool call: ' + r.stderr);
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : null;
}

test('project without .skill-kit/lint.json: silent (opt-in)', () => {
  const dir = project(undefined, { 'a.js': 'BAD' });
  assert.strictEqual(run(dir, 'Edit', { file_path: 'a.js' }), null);
});

test('lint problems come back as additionalContext, with exit code and linter output', () => {
  const dir = project({ commands: { js: stubCommand } }, { 'a.js': 'BAD' });
  const out = run(dir, 'Edit', { file_path: path.join(dir, 'a.js') });
  assert.strictEqual(out.hookEventName, 'PostToolUse');
  assert.match(out.additionalContext, /Lint reported problems in a\.js \(exit 3\)/);
  assert.match(out.additionalContext, /line 1: bad word/);
});

test('clean file, and an extension with no command: silent', () => {
  const dir = project({ commands: { js: stubCommand } }, { 'a.js': 'fine', 'b.md': 'BAD' });
  assert.strictEqual(run(dir, 'Write', { file_path: 'a.js', content: 'fine' }), null);
  assert.strictEqual(run(dir, 'Write', { file_path: 'b.md', content: 'BAD' }), null);
});

test('read-only tools and payloads without a path are ignored', () => {
  const dir = project({ commands: { js: stubCommand } }, { 'a.js': 'BAD' });
  assert.strictEqual(run(dir, 'Read', { file_path: 'a.js' }), null);
  assert.strictEqual(run(dir, 'Edit', {}), null);
});

test('accepts the Copilot path keys (filePath, path)', () => {
  const dir = project({ commands: { js: stubCommand } }, { 'a.js': 'BAD' });
  assert.match(run(dir, 'create_file', { filePath: 'a.js' }).additionalContext, /exit 3/);
  assert.match(run(dir, 'replace_string_in_file', { path: 'a.js' }).additionalContext, /exit 3/);
});

test('broken config fails loud in the context instead of skipping silently', () => {
  assert.match(run(project('{nope', { 'a.js': 'x' }), 'Edit', { file_path: 'a.js' }).additionalContext, /not valid JSON/);
  assert.match(run(project({ cmd: 1 }, { 'a.js': 'x' }), 'Edit', { file_path: 'a.js' }).additionalContext, /needs a "commands" object/);
});

test('a linter that cannot start or times out is reported, and the hook still exits 0', () => {
  const missing = project({ commands: { js: 'definitely-not-a-linter-xyz {file}' } }, { 'a.js': 'x' });
  assert.match(run(missing, 'Edit', { file_path: 'a.js' }).additionalContext, /Lint reported problems in a\.js \(exit/);
  const slow = project({ timeoutMs: 300, commands: { js: `"${process.execPath}" -e "setTimeout(()=>{},2000)" {file}` } }, { 'a.js': 'x' });
  assert.match(run(slow, 'Edit', { file_path: 'a.js' }).additionalContext, /timed out after 300 ms/);
});

test('long linter output is cut', () => {
  const dir = project({ commands: { js: `"${process.execPath}" -e "console.log('x'.repeat(5000));process.exit(1)" {file}` } }, { 'a.js': 'x' });
  const ctx = run(dir, 'Edit', { file_path: 'a.js' }).additionalContext;
  assert.ok(ctx.length < 2300);
  assert.match(ctx, /\[output cut\]/);
});

test('a path with shell metacharacters is not handed to a shell', () => {
  const dir = project({ commands: { js: stubCommand } }, {});
  const out = run(dir, 'Edit', { file_path: 'a$(x).js' });
  assert.match(out.additionalContext, /lint skipped/);
});
