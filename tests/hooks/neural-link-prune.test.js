'use strict';
// node --test tests/hooks/neural-link-prune.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MOD = pathToFileURL(path.resolve(__dirname, '../../neural-link/src/prune.js')).href;
const DAY = 24 * 3600 * 1000;
const NOW = Date.parse('2026-11-18T12:00:00Z');

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nl-prune-'));
  const logs = path.join(base, 'logs');
  const debug = path.join(base, 'debug');
  const weights = path.join(base, 'weights');
  for (const d of [logs, debug, weights]) fs.mkdirSync(d);
  const put = (dir, name, bytes, ageDays) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, 'x'.repeat(bytes));
    const t = new Date(NOW - ageDays * DAY);
    fs.utimesSync(p, t, t);
    return p;
  };
  return { base, logs, debug, weights, put };
}

test('parseDays: default 14, valid integer, invalid fails loud', async () => {
  const { parseDays } = await import(MOD);
  assert.strictEqual(parseDays([]), 14);
  assert.strictEqual(parseDays(['--days', '3']), 3);
  for (const bad of ['0', '-1', 'abc', '1.5', '']) {
    assert.throws(() => parseDays(['--days', bad]), /--days/, bad);
  }
  assert.throws(() => parseDays(['--days']), /--days/);
});

test('prune deletes only old files in the given dirs and reports bytes', async () => {
  const { prune } = await import(MOD);
  const f = fixture();
  try {
    const oldLog = f.put(f.logs, 'old.jsonl', 100, 30);
    const newLog = f.put(f.logs, 'new.jsonl', 50, 1);
    const oldDbg = f.put(f.debug, 'old.log', 25, 20);
    const oldWeights = f.put(f.weights, 'learned.json', 10, 90);
    const r = prune({ dirs: [f.logs, f.debug], days: 14, now: NOW });
    assert.strictEqual(r.deleted, 2);
    assert.strictEqual(r.bytes, 125);
    assert.strictEqual(r.dryRun, false);
    assert.ok(!fs.existsSync(oldLog));
    assert.ok(!fs.existsSync(oldDbg));
    assert.ok(fs.existsSync(newLog));
    assert.ok(fs.existsSync(oldWeights), 'files outside the pruned dirs must survive');
  } finally { fs.rmSync(f.base, { recursive: true, force: true }); }
});

test('prune --dry-run lists but does not delete', async () => {
  const { prune } = await import(MOD);
  const f = fixture();
  try {
    const oldLog = f.put(f.logs, 'old.jsonl', 100, 30);
    const r = prune({ dirs: [f.logs, f.debug], days: 14, dryRun: true, now: NOW });
    assert.strictEqual(r.dryRun, true);
    assert.strictEqual(r.deleted, 1);
    assert.strictEqual(r.bytes, 100);
    assert.deepStrictEqual(r.files, [oldLog]);
    assert.ok(fs.existsSync(oldLog));
  } finally { fs.rmSync(f.base, { recursive: true, force: true }); }
});

test('prune ignores subdirectories and missing dirs', async () => {
  const { prune } = await import(MOD);
  const f = fixture();
  try {
    const sub = path.join(f.logs, 'sub');
    fs.mkdirSync(sub);
    const inner = f.put(sub, 'old.jsonl', 10, 99);
    const r = prune({ dirs: [f.logs, path.join(f.base, 'nope')], days: 1, now: NOW });
    assert.strictEqual(r.deleted, 0);
    assert.ok(fs.existsSync(inner));
  } finally { fs.rmSync(f.base, { recursive: true, force: true }); }
});

test('CLI prune: fails loud on invalid --days, honours --dry-run, never leaves NEURAL_LINK_HOME', () => {
  const { spawnSync } = require('node:child_process');
  const f = fixture();
  try {
    const cli = path.resolve(__dirname, '../../neural-link/src/cli.js');
    const run = (...args) => spawnSync(process.execPath, [cli, 'prune', ...args], {
      env: { ...process.env, NEURAL_LINK_HOME: f.base }, encoding: 'utf8', windowsHide: true,
    });
    const oldLog = f.put(f.logs, 'old.jsonl', 100, 30);
    const oldWeights = f.put(f.weights, 'learned.json', 10, 90);

    const bad = run('--days', 'abc');
    assert.notStrictEqual(bad.status, 0);
    assert.match(bad.stderr, /--days/);
    assert.ok(fs.existsSync(oldLog));

    const dry = run('--dry-run');
    assert.strictEqual(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /dry-run/);
    assert.ok(fs.existsSync(oldLog));

    const real = run('--days', '14');
    assert.strictEqual(real.status, 0, real.stderr);
    assert.match(real.stdout, /1 file/);
    assert.match(real.stdout, /100 bytes/);
    assert.ok(!fs.existsSync(oldLog));
    assert.ok(fs.existsSync(oldWeights));
  } finally { fs.rmSync(f.base, { recursive: true, force: true }); }
});
