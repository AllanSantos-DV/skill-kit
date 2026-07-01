'use strict';
// Integration tests for hooks/lessons-sync.js — spawns the REAL SessionStart
// hook as a child process, points it at a temp lessons dir (LESSONS_DIR) and a
// mock daemon (MCP_RUN_DIR), and asserts the side effects: daemon calls made,
// manifest advanced, and ALWAYS silent (no stdout/stderr, exit 0).
// Run: node --test tests/hooks/lessons-sync.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { startMock, tmpRunDir } = require('./_mock-daemon.js');
const store = require('../../hooks/_lib/lessons-store.js');
const client = require('../../hooks/_lib/mcp-lessons-client.js');

const HOOK = path.join(__dirname, '..', '..', 'hooks', 'lessons-sync.js');

function runHook(extraEnv) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HOOK], {
      env: Object.assign({}, process.env, extraEnv || {}),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (status) => resolve({ stdout, stderr, status }));
    child.stdin.end(JSON.stringify({ hookEventName: 'SessionStart', cwd: process.cwd() }));
  });
}

const LESSON = [
  '---', 'id: L001', 'tags: [git]', 'confidence: 0.8', '---',
  '', '# A real lesson title', '', '## Resumo', 'the distilled summary',
].join('\n');

/** Fingerprint the doc content exactly as the hook's pipeline would. */
function fpOf(content, id) {
  const doc = store.buildLessonDoc(store.parseLessonContent(content, id));
  return client.fingerprint(doc.content);
}

function seedLessonsDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-hook-lessons-'));
  fs.writeFileSync(path.join(dir, 'L001-a.md'), LESSON);
  return dir;
}

test('delta: new lesson is upserted and manifest is written; silent exit 0', async () => {
  const captured = [];
  const mock = await startMock({ captured });
  const runDir = tmpRunDir(mock.url);
  const lessonsDir = seedLessonsDir();
  try {
    const r = await runHook({ LESSONS_DIR: lessonsDir, MCP_RUN_DIR: runDir });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, '', 'hook must be silent');
    assert.strictEqual(r.stderr, '');
    const adds = captured.filter((c) => c.params && c.params.name === 'add_document');
    assert.strictEqual(adds.length, 1);
    assert.strictEqual(adds[0].params.arguments.documentId, 'lesson:L001');
    const manifest = store.readSyncManifest(lessonsDir);
    assert.strictEqual(manifest.L001, fpOf(LESSON, 'L001'), 'manifest records the fingerprint');
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); fs.rmSync(lessonsDir, { recursive: true, force: true }); }
});

test('no-op: manifest already matches -> zero daemon calls', async () => {
  const captured = [];
  const mock = await startMock({ captured });
  const runDir = tmpRunDir(mock.url);
  const lessonsDir = seedLessonsDir();
  try {
    store.writeSyncManifest({ L001: fpOf(LESSON, 'L001') }, lessonsDir);
    const r = await runHook({ LESSONS_DIR: lessonsDir, MCP_RUN_DIR: runDir });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(captured.filter((c) => c.params).length, 0, 'nothing changed -> no tools/call');
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); fs.rmSync(lessonsDir, { recursive: true, force: true }); }
});

test('prune: a lesson removed on disk is deleted from the namespace', async () => {
  const captured = [];
  const mock = await startMock({ captured });
  const runDir = tmpRunDir(mock.url);
  const lessonsDir = seedLessonsDir();
  try {
    // manifest knows L001 (still on disk, matching) + L900 (orphan, gone)
    store.writeSyncManifest({ L001: fpOf(LESSON, 'L001'), L900: 'orphan-hash' }, lessonsDir);
    const r = await runHook({ LESSONS_DIR: lessonsDir, MCP_RUN_DIR: runDir });
    assert.strictEqual(r.status, 0);
    const dels = captured.filter((c) => c.params && c.params.name === 'delete_document');
    assert.strictEqual(dels.length, 1);
    assert.strictEqual(dels[0].params.arguments.documentId, 'lesson:L900');
    const manifest = store.readSyncManifest(lessonsDir);
    assert.ok(!('L900' in manifest), 'orphan pruned from manifest');
    assert.ok(manifest.L001, 'live lesson kept');
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); fs.rmSync(lessonsDir, { recursive: true, force: true }); }
});

test('GUARD: empty lessons dir never mass-prunes the namespace', async () => {
  const captured = [];
  const mock = await startMock({ captured });
  const runDir = tmpRunDir(mock.url);
  const lessonsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-hook-empty-'));
  try {
    store.writeSyncManifest({ L001: 'h1', L002: 'h2', L003: 'h3' }, lessonsDir);
    const r = await runHook({ LESSONS_DIR: lessonsDir, MCP_RUN_DIR: runDir });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(captured.filter((c) => c.params).length, 0, 'must NOT issue any delete on empty read');
    assert.deepStrictEqual(store.readSyncManifest(lessonsDir), { L001: 'h1', L002: 'h2', L003: 'h3' }, 'manifest untouched');
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); fs.rmSync(lessonsDir, { recursive: true, force: true }); }
});

test('fail-open: no daemon -> silent exit 0, manifest not advanced', async () => {
  const noDaemon = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-hook-nodaemon-'));
  const lessonsDir = seedLessonsDir();
  try {
    const r = await runHook({ LESSONS_DIR: lessonsDir, MCP_RUN_DIR: noDaemon });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(r.stderr, '');
    assert.deepStrictEqual(store.readSyncManifest(lessonsDir), {}, 'manifest stays empty when daemon is down');
  } finally { fs.rmSync(noDaemon, { recursive: true, force: true }); fs.rmSync(lessonsDir, { recursive: true, force: true }); }
});
