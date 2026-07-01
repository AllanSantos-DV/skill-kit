'use strict';
// Integration tests for hooks/lesson-injector.js — spawns the REAL hook as a
// child process (exactly how the runtime invokes it), pipes stdin, points it at
// a mock daemon via MCP_RUN_DIR, and asserts the emitted stdout envelope.
// Run: node --test tests/hooks/lesson-injector.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { startMock, tmpRunDir } = require('./_mock-daemon.js');

const HOOK = path.join(__dirname, '..', '..', 'hooks', 'lesson-injector.js');

/** Spawn the hook with `stdin` (string) and extra env; resolve {stdout,stderr,status}. */
function runHook(stdin, extraEnv) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HOOK], {
      env: Object.assign({}, process.env, extraEnv || {}),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (status) => resolve({ stdout, stderr, status }));
    child.stdin.end(stdin);
  });
}

test('injects semantic recall envelope on a matching prompt', async () => {
  const captured = [];
  const mock = await startMock({ captured, results: [
    { id: 'lesson:L018', name: 'Redesign before rewriting tests', description: 'When a design changes, redesign the tests too', type: 'procedural', score: 0.71 },
  ] });
  const runDir = tmpRunDir(mock.url);
  try {
    const r = await runHook(JSON.stringify({ chatMessage: 'preciso refatorar os testes depois de mudar o design' }), { MCP_RUN_DIR: runDir });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stderr, '', 'hook must not write stderr: ' + r.stderr);
    const out = JSON.parse(r.stdout);
    assert.strictEqual(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(out.hookSpecificOutput.additionalContext, /Redesign before rewriting tests/);
    assert.match(out.hookSpecificOutput.additionalContext, /semantic recall/);
    // The prompt text was used verbatim as the semantic query, scoped to the namespace.
    const call = captured.find((c) => c.params);
    assert.strictEqual(call.params.arguments.query, 'preciso refatorar os testes depois de mudar o design');
    assert.strictEqual(call.params.arguments.metadata.project_id, '__lessons__');
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('emits nothing when the namespace returns no matches', async () => {
  const mock = await startMock({ results: [] });
  const runDir = tmpRunDir(mock.url);
  try {
    const r = await runHook(JSON.stringify({ chatMessage: 'algo totalmente sem relacao' }), { MCP_RUN_DIR: runDir });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, '', 'no matches -> nothing injected, got: ' + r.stdout);
    assert.strictEqual(r.stderr, '');
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('fail-open: no daemon -> empty stdout, exit 0', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'inj-nodaemon-'));
  try {
    const r = await runHook(JSON.stringify({ chatMessage: 'qualquer coisa' }), { MCP_RUN_DIR: empty });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(r.stderr, '');
  } finally { fs.rmSync(empty, { recursive: true, force: true }); }
});

test('no user prompt -> emits nothing, exit 0', async () => {
  const r = await runHook(JSON.stringify({ something: 'else' }), {});
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
  assert.strictEqual(r.stderr, '');
});

test('invalid JSON stdin -> fail-open, exit 0, empty stdout', async () => {
  const r = await runHook('this is not json', {});
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
  assert.strictEqual(r.stderr, '');
});

test('lifecycle: slow-but-successful daemon still injects (socket keeps loop alive)', async () => {
  const mock = await startMock({ delayMs: 600, results: [{ id: 'lesson:L9', name: 'Slow but sure', score: 0.72 }] });
  const runDir = tmpRunDir(mock.url);
  const t0 = Date.now();
  try {
    const r = await runHook(JSON.stringify({ chatMessage: 'prompt lento' }), { MCP_RUN_DIR: runDir });
    const elapsed = Date.now() - t0;
    assert.strictEqual(r.status, 0);
    assert.ok(elapsed >= 550, 'should have waited for the slow response, took ' + elapsed + 'ms');
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /Slow but sure/);
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('lifecycle: hung daemon -> exit 0, empty, within the hook timeout window', async () => {
  const mock = await startMock({ hangOnCall: true });
  const runDir = tmpRunDir(mock.url);
  const t0 = Date.now();
  try {
    // Tight deadline so the test is fast; proves the process ends on its own well under 5s.
    const r = await runHook(JSON.stringify({ chatMessage: 'daemon travado' }), { MCP_RUN_DIR: runDir, LESSON_INJECTOR_DEADLINE_MS: '1200' });
    const elapsed = Date.now() - t0;
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(r.stderr, '');
    assert.ok(elapsed < 4000, 'must self-terminate well under the 5s hook timeout, took ' + elapsed + 'ms');
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('fail-open: tool call JSON-RPC error -> emits nothing, exit 0', async () => {
  const mock = await startMock({ toolError: true });
  const runDir = tmpRunDir(mock.url);
  try {
    const r = await runHook(JSON.stringify({ chatMessage: 'x' }), { MCP_RUN_DIR: runDir });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(r.stderr, '');
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('clamps: absurd TOP_K/MIN_SCORE do not break and MIN_SCORE>1 falls back', async () => {
  const captured = [];
  const mock = await startMock({ captured, results: [{ id: 'lesson:L1', name: 'Clamped', score: 0.9 }] });
  const runDir = tmpRunDir(mock.url);
  try {
    const r = await runHook(JSON.stringify({ chatMessage: 'x' }), { MCP_RUN_DIR: runDir, LESSON_INJECTOR_TOPK: '1000000000', LESSON_INJECTOR_MINSCORE: '999' });
    assert.strictEqual(r.status, 0);
    const call = captured.find((c) => c.params);
    // Absurd TOP_K is clamped to 20 client-side, so the daemon candidate pool is
    // max(20, 25) = 25 — NOT the billion requested (which would hammer the daemon).
    assert.ok(call.params.arguments.topK <= 25, 'absurd TOP_K clamped before becoming the pool, got ' + call.params.arguments.topK);
    // The daemon is ALWAYS asked with minScore 0 — the real threshold is applied
    // client-side (the daemon switches to a non-cosine metric above ~0.68).
    assert.strictEqual(call.params.arguments.minScore, 0, 'daemon minScore is always 0');
    // The out-of-range MIN_SCORE (999) falls back to the 0.68 default; the lesson
    // scores 0.9 (>= 0.68) so it is still injected — proving the fallback held
    // (a literal 999 threshold would have filtered everything out).
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /Clamped/);
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('reads prompt from nested data.message shape', async () => {
  const mock = await startMock({ results: [{ id: 'lesson:L1', name: 'Nested works', score: 0.72 }] });
  const runDir = tmpRunDir(mock.url);
  try {
    const r = await runHook(JSON.stringify({ data: { message: 'testar shape aninhado' } }), { MCP_RUN_DIR: runDir });
    assert.strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /Nested works/);
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('reads prompt from top-level message shape', async () => {
  const mock = await startMock({ results: [{ id: 'lesson:L1', name: 'Top message', score: 0.72 }] });
  const runDir = tmpRunDir(mock.url);
  try {
    const r = await runHook(JSON.stringify({ message: 'testar shape top-level message' }), { MCP_RUN_DIR: runDir });
    assert.strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /Top message/);
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('reads prompt from nested data.prompt shape', async () => {
  const mock = await startMock({ results: [{ id: 'lesson:L1', name: 'Nested prompt', score: 0.72 }] });
  const runDir = tmpRunDir(mock.url);
  try {
    const r = await runHook(JSON.stringify({ data: { prompt: 'testar shape data.prompt' } }), { MCP_RUN_DIR: runDir });
    assert.strictEqual(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /Nested prompt/);
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});
