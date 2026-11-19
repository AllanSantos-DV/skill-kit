'use strict';
// stop-alert: opt-in alert at the end of a long run. The alert is always a stub command that writes
// a file; no test raises a real notification or sound.
// Run: node --test tests/hooks/stop-alert.test.js

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const alert = require('../../hooks/stop-alert');

const HOOK = path.join(__dirname, '..', '..', 'hooks', 'stop-alert.js');
const temps = [];
after(() => { for (const d of temps) fs.rmSync(d, { recursive: true, force: true }); });

const NOW = Date.parse('2026-11-18T12:00:00.000Z');
const iso = (secondsAgo) => new Date(NOW - secondsAgo * 1000).toISOString();

test('thresholdSeconds: off by default, "on" is 120, a number is that many seconds, junk is off', () => {
  assert.strictEqual(alert.thresholdSeconds({}), null);
  assert.strictEqual(alert.thresholdSeconds({ SKILL_KIT_STOP_ALERT: 'on' }), 120);
  assert.strictEqual(alert.thresholdSeconds({ SKILL_KIT_STOP_ALERT: '45' }), 45);
  for (const v of ['0', 'off', '-3', 'abc', '']) assert.strictEqual(alert.thresholdSeconds({ SKILL_KIT_STOP_ALERT: v }), null, v);
});

test('elapsedSeconds: Copilot user.message and Claude user entries, ignoring tool results', () => {
  const copilot = [JSON.stringify({ type: 'user.message', timestamp: iso(300), data: {} }), '{"type":"noop"}'];
  assert.strictEqual(alert.elapsedSeconds(copilot, NOW), 300);
  const claude = [
    JSON.stringify({ type: 'user', timestamp: iso(200), message: { role: 'user', content: 'do it' } }),
    JSON.stringify({ type: 'user', timestamp: iso(10), message: { role: 'user', content: [{ type: 'tool_result', content: 'x' }] } }),
    JSON.stringify({ type: 'assistant', timestamp: iso(5), message: {} }),
  ];
  assert.strictEqual(alert.elapsedSeconds(claude, NOW), 200);
});

test('elapsedSeconds: no timestamped prompt means unknown (null), never zero', () => {
  assert.strictEqual(alert.elapsedSeconds(['{"type":"assistant"}', 'not json'], NOW), null);
  assert.strictEqual(alert.elapsedSeconds([JSON.stringify({ type: 'user.message', data: {} })], NOW), null);
});

test('builtinAlert: hidden PowerShell on Windows, bell (null) elsewhere', () => {
  const w = alert.builtinAlert('win32', 90);
  assert.strictEqual(w.command, 'powershell.exe');
  assert.ok(w.args.includes('Hidden') && w.args.includes('-NonInteractive'));
  assert.match(w.args[w.args.length - 1], /Ran for 90 s/);
  assert.strictEqual(alert.builtinAlert('linux', 90), null);
});

test('builtinAlert: the Windows script is valid PowerShell', { skip: process.platform !== 'win32' }, () => {
  const script = alert.builtinAlert('win32', 5).args.slice(-1)[0];
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '$null=[scriptblock]::Create($env:SK_SCRIPT); "ok"'], { env: { ...process.env, SK_SCRIPT: script }, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.match(r.stdout, /ok/);
});

/** Project with a transcript whose last prompt was `secondsAgo` seconds ago, and a stub alert command. */
function setup(secondsAgo) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-alert-'));
  temps.push(dir);
  const transcript = path.join(dir, 't.jsonl');
  fs.writeFileSync(transcript, [
    JSON.stringify({ type: 'user.message', timestamp: new Date(Date.now() - secondsAgo * 1000).toISOString(), data: {} }),
    '{"type":"assistant.message"}',
  ].join('\n'));
  const marker = path.join(dir, 'alerted.txt');
  const cmd = `"${process.execPath}" -e "require('fs').writeFileSync(process.argv[1], process.env.SKILL_KIT_ALERT_SECONDS)" "${marker}"`;
  return { transcript, marker, cmd };
}

function run(s, env, extra) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ transcript_path: s.transcript, ...(extra || {}) }), encoding: 'utf8', windowsHide: true, timeout: 15000,
    env: { ...process.env, SKILL_KIT_STOP_ALERT: '', SKILL_KIT_STOP_ALERT_CMD: s.cmd, ...env },
  });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(r.stdout, '', 'never blocks and never writes stdout');
  return r;
}

function waitFor(file, ms) {
  const end = Date.now() + (ms || 5000);
  while (Date.now() < end && !fs.existsSync(file)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  return fs.existsSync(file);
}

test('long run with the alert on: the command runs and receives the run length', () => {
  const s = setup(200);
  run(s, { SKILL_KIT_STOP_ALERT: '60' });
  assert.ok(waitFor(s.marker), 'alert command ran');
  assert.ok(Number(fs.readFileSync(s.marker, 'utf8')) >= 200);
});

test('short run: silent', () => {
  const s = setup(5);
  run(s, { SKILL_KIT_STOP_ALERT: '60' });
  assert.ok(!waitFor(s.marker, 1000), 'no alert');
});

test('alert off (variable unset): silent even after a long run', () => {
  const s = setup(900);
  run(s, {});
  assert.ok(!waitFor(s.marker, 1000));
});

test('stop_hook_active: exits without alerting', () => {
  const s = setup(900);
  run(s, { SKILL_KIT_STOP_ALERT: '1' }, { stop_hook_active: true });
  assert.ok(!waitFor(s.marker, 1000));
});

test('unreadable transcript: silent, exit 0', () => {
  const s = setup(900);
  s.transcript = path.join(os.tmpdir(), 'does-not-exist.jsonl');
  run(s, { SKILL_KIT_STOP_ALERT: '1' });
  assert.ok(!waitFor(s.marker, 1000));
});
