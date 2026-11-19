'use strict';
// node --test tests/hooks/subagent-audit.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.resolve(__dirname, '../../hooks/subagent-audit.js');

function run(input, env) {
  return spawnSync(process.execPath, [HOOK], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    env: { ...process.env, ...env },
    encoding: 'utf8',
    windowsHide: true,
  });
}

function readRecords(home) {
  const dir = path.join(home, 'logs');
  return fs.readdirSync(dir).flatMap((f) =>
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
}

test('appends one SubagentStart record under NEURAL_LINK_HOME/logs and keeps stdout/stderr contract', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-audit-'));
  try {
    const r = run({ agentName: 'implementor', sessionId: 's-1' }, { NEURAL_LINK_HOME: home });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, '{}');
    assert.match(r.stderr, /Subagent started: implementor/);
    const recs = readRecords(home);
    assert.strictEqual(recs.length, 1);
    assert.strictEqual(recs[0].event, 'SubagentStart');
    assert.strictEqual(recs[0].handler, 'subagent-audit');
    assert.strictEqual(recs[0].decision, 'allow');
    assert.strictEqual(recs[0].agent, 'implementor');
    assert.strictEqual(recs[0].sessionId, 's-1');
    assert.ok(!Number.isNaN(Date.parse(recs[0].ts)));
    assert.match(fs.readdirSync(path.join(home, 'logs'))[0], /^\d{4}-\d{2}-\d{2}\.jsonl$/);
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('accepts host field names (agent_type, session_id) and omits absent fields', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-audit-'));
  try {
    run({ agent_type: 'Explore', session_id: 's-2' }, { NEURAL_LINK_HOME: home });
    run({}, { NEURAL_LINK_HOME: home });
    const [a, b] = readRecords(home);
    assert.strictEqual(a.agent, 'Explore');
    assert.strictEqual(a.sessionId, 's-2');
    assert.ok(!('agent' in b));
    assert.ok(!('sessionId' in b));
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('fail-open: unwritable logs dir still yields {} and exit 0', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-audit-'));
  try {
    const blocker = path.join(home, 'file');
    fs.writeFileSync(blocker, 'x');
    const r = run({ agentName: 'x' }, { NEURAL_LINK_HOME: blocker });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, '{}');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

test('invalid stdin: exit 0, no stdout, no record', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-audit-'));
  try {
    const r = run('not json', { NEURAL_LINK_HOME: home });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, '');
    assert.ok(!fs.existsSync(path.join(home, 'logs')));
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});
