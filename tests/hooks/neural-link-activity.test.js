'use strict';
// node --test tests/hooks/neural-link-activity.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MOD = pathToFileURL(path.resolve(__dirname, '../../neural-link/src/activity.js')).href;

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nl-activity-'));
}

const L = (o) => JSON.stringify(o);
const A = { ts: '2026-11-01T10:00:00.000Z', event: 'PreToolUse', handler: 'guard', decision: 'allow' };
const B = { ts: '2026-11-01T10:01:00.000Z', event: 'PreToolUse', handler: 'guard', decision: 'deny' };
const C = { ts: '2026-11-01T10:02:00.000Z', event: 'SubagentStart', handler: 'subagent-audit', decision: 'allow' };

test('parseJsonl counts malformed lines and keeps valid ones', async () => {
  const { parseJsonl } = await import(MOD);
  const r = parseJsonl([L(A), '{not json', '', L(B), '[1,2]', 'null'].join('\n'));
  assert.strictEqual(r.entries.length, 2);
  assert.strictEqual(r.malformed, 3);
});

test('summarize aggregates per event, handler and decision', async () => {
  const { summarize } = await import(MOD);
  const s = summarize([A, B, C], { last: 2 });
  assert.deepStrictEqual(s.byEvent, { PreToolUse: 2, SubagentStart: 1 });
  assert.deepStrictEqual(s.byHandler, { guard: 2, 'subagent-audit': 1 });
  assert.deepStrictEqual(s.byDecision, { allow: 2, deny: 1 });
  assert.strictEqual(s.total, 3);
  assert.deepStrictEqual(s.lastEntries.map((e) => e.handler), ['guard', 'subagent-audit']);
});

test('summarize filters by event and handler before aggregating', async () => {
  const { summarize } = await import(MOD);
  assert.strictEqual(summarize([A, B, C], { event: 'SubagentStart' }).total, 1);
  assert.strictEqual(summarize([A, B, C], { handler: 'guard' }).total, 2);
  assert.strictEqual(summarize([A, B, C], { handler: 'guard', event: 'SubagentStart' }).total, 0);
});

test('summarize orders entries by ts regardless of input order and defaults last to 20', async () => {
  const { summarize } = await import(MOD);
  const s = summarize([C, A, B]);
  assert.deepStrictEqual(s.lastEntries.map((e) => e.ts), [A.ts, B.ts, C.ts]);
});

test('readLogs reads every .jsonl in the dir and reports malformed lines; missing dir is empty', async () => {
  const { readLogs } = await import(MOD);
  const dir = tmp();
  try {
    fs.writeFileSync(path.join(dir, '2026-11-01.jsonl'), [L(A), 'garbage'].join('\n') + '\n');
    fs.writeFileSync(path.join(dir, '2026-11-02.jsonl'), L(C) + '\n');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
    const r = readLogs(dir);
    assert.strictEqual(r.entries.length, 2);
    assert.strictEqual(r.malformed, 1);
    assert.strictEqual(r.files, 2);
    assert.deepStrictEqual(readLogs(path.join(dir, 'nope')), { entries: [], malformed: 0, files: 0 });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('parseActivityArgs: defaults, flags and invalid --last fails loud', async () => {
  const { parseActivityArgs } = await import(MOD);
  assert.deepStrictEqual(parseActivityArgs([]), { last: 20, event: undefined, handler: undefined, session: undefined, json: false });
  assert.deepStrictEqual(
    parseActivityArgs(['--last', '5', '--event', 'X', '--handler', 'h', '--json']),
    { last: 5, event: 'X', handler: 'h', session: undefined, json: true });
  assert.throws(() => parseActivityArgs(['--last', 'abc']), /--last/);
  assert.throws(() => parseActivityArgs(['--last', '0']), /--last/);
  assert.throws(() => parseActivityArgs(['--event']), /--event/);
});

test('renderActivity text mentions counts and malformed; json mode is parseable', async () => {
  const { summarize, renderActivity } = await import(MOD);
  const s = summarize([A, B, C], { last: 5 });
  const text = renderActivity(s, { malformed: 2, files: 1 }, { json: false });
  assert.match(text, /PreToolUse\s+2/);
  assert.match(text, /subagent-audit\s+1/);
  assert.match(text, /deny\s+1/);
  assert.match(text, /2 malformed/);
  const parsed = JSON.parse(renderActivity(s, { malformed: 2, files: 1 }, { json: true }));
  assert.strictEqual(parsed.total, 3);
  assert.strictEqual(parsed.malformed, 2);
});

test('CLI activity subcommand runs against NEURAL_LINK_HOME silently', () => {
  const { spawnSync } = require('node:child_process');
  const home = tmp();
  try {
    fs.mkdirSync(path.join(home, 'logs'));
    fs.writeFileSync(path.join(home, 'logs', '2026-11-01.jsonl'), [L(A), L(C), 'bad'].join('\n') + '\n');
    const cli = path.resolve(__dirname, '../../neural-link/src/cli.js');
    const r = spawnSync(process.execPath, [cli, 'activity', '--json'], {
      env: { ...process.env, NEURAL_LINK_HOME: home }, encoding: 'utf8', windowsHide: true,
    });
    assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.total, 2);
    assert.strictEqual(out.malformed, 1);
    const help = spawnSync(process.execPath, [cli, 'help'], { encoding: 'utf8', windowsHide: true });
    assert.doesNotMatch(help.stdout, /dashboard/);
    assert.match(help.stdout, /activity/);
    assert.match(help.stdout, /prune/);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('summarize filters by session id and combines with the other filters', async () => {
  const { summarize } = await import(MOD);
  const a = { ...A, sessionId: 's-1' };
  const b = { ...B, sessionId: 's-2' };
  const c = { ...C, sessionId: 's-1' };
  assert.strictEqual(summarize([a, b, c], { session: 's-1' }).total, 2);
  assert.strictEqual(summarize([a, b, c], { session: 's-1', event: 'SubagentStart' }).total, 1);
  assert.strictEqual(summarize([a, b, c], { session: 'nope' }).total, 0);
  assert.strictEqual(summarize([A, B], { session: 's-1' }).total, 0);
});

test('parseActivityArgs reads --session and rejects it without a value', async () => {
  const { parseActivityArgs } = await import(MOD);
  assert.strictEqual(parseActivityArgs(['--session', 's-1']).session, 's-1');
  assert.strictEqual(parseActivityArgs([]).session, undefined);
  assert.throws(() => parseActivityArgs(['--session']), /--session requires a value/);
  assert.throws(() => parseActivityArgs(['--session', '--json']), /--session requires a value/);
});
