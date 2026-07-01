'use strict';
// Unit + hermetic integration tests for hooks/_lib/mcp-lessons-client.js
// Run: node --test tests/hooks/mcp-lessons-client.test.js
// No external deps, no real daemon — a tiny in-process HTTP server mimics the
// MCP Streamable HTTP transport so the full handshake path is exercised.

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const client = require('../../hooks/_lib/mcp-lessons-client.js');
const { startMock, tmpRunDir } = require('./_mock-daemon.js');

// --- pure helpers ----------------------------------------------------------

test('parseDaemonRegistry: valid url', () => {
  assert.deepStrictEqual(client.parseDaemonRegistry('{"url":"http://127.0.0.1:49226/","port":49226}'), { url: 'http://127.0.0.1:49226', port: 49226 });
});
test('parseDaemonRegistry: port-only derives url', () => {
  assert.deepStrictEqual(client.parseDaemonRegistry('{"port":5000}'), { url: 'http://127.0.0.1:5000', port: 5000 });
});
test('parseDaemonRegistry: corrupt/missing -> null', () => {
  assert.strictEqual(client.parseDaemonRegistry('not json'), null);
  assert.strictEqual(client.parseDaemonRegistry('{"foo":1}'), null);
  assert.strictEqual(client.parseDaemonRegistry(''), null);
});

test('extractSsePayload: single data event', () => {
  const p = client.extractSsePayload('event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"ok":true}}\n\n');
  assert.strictEqual(JSON.parse(p).result.ok, true);
});
test('extractSsePayload: skips non-response events, returns the response', () => {
  const body = 'data: {"jsonrpc":"2.0","method":"x"}\n\ndata: {"jsonrpc":"2.0","id":2,"result":{"n":9}}\n\n';
  assert.strictEqual(JSON.parse(client.extractSsePayload(body)).result.n, 9);
});

test('parseHttpBody: json / sse / 202', () => {
  assert.strictEqual(client.parseHttpBody(202, '', ''), null);
  assert.strictEqual(client.parseHttpBody(200, 'application/json; charset=utf-8', '{"result":1}').result, 1);
  assert.strictEqual(client.parseHttpBody(200, 'text/event-stream', 'data: {"id":2,"result":7}\n\n').result, 7);
  assert.strictEqual(client.parseHttpBody(200, 'application/json', 'garbage'), null);
});

test('buildSearchArgs: stamps namespace + procedural + always minScore 0', () => {
  const a = client.buildSearchArgs('hello');
  assert.strictEqual(a.metadata.project_id, '__lessons__');
  assert.strictEqual(a.metadata.type, 'procedural');
  assert.strictEqual(a.projection, 'summary');
  assert.strictEqual(a.topK, 5);
  // minScore is ALWAYS 0 to the daemon — the real threshold is applied
  // client-side (the daemon switches to a non-cosine metric above ~0.68).
  assert.strictEqual(a.minScore, 0);
  assert.strictEqual(client.buildSearchArgs('x', { topK: 3 }).topK, 3);
  assert.strictEqual(client.buildSearchArgs('x', { minScore: 0.9 }).minScore, 0);
});

test('searchLessons: filters below minScore and sorts desc (client-side)', async () => {
  // Daemon returns UNSORTED, mixed-score candidates; searchLessons must drop the
  // below-threshold one and return the rest sorted by score descending.
  const mock = await startMock({ results: [
    { id: 'lesson:Llow', name: 'below', score: 0.50 },
    { id: 'lesson:Lhi', name: 'high', score: 0.82 },
    { id: 'lesson:Lmid', name: 'mid', score: 0.71 },
  ] });
  const runDir = tmpRunDir(mock.url);
  try {
    const res = await client.searchLessons('q', { env: { MCP_RUN_DIR: runDir }, minScore: 0.68, topK: 5 });
    assert.deepStrictEqual(res.map((r) => r.name), ['high', 'mid']);
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('extractSearchResults: unwraps content[].text payload', () => {
  const msg = { result: { content: [{ type: 'text', text: JSON.stringify({ results: [{ id: 'lesson:L1', name: 'A', score: 0.9 }] }) }] } };
  const r = client.extractSearchResults(msg);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].id, 'lesson:L1');
  assert.deepStrictEqual(client.extractSearchResults(null), []);
  assert.deepStrictEqual(client.extractSearchResults({ result: {} }), []);
});

test('formatLessonsContext: empty -> empty string', () => {
  assert.strictEqual(client.formatLessonsContext([]), '');
  assert.strictEqual(client.formatLessonsContext(null), '');
});
test('formatLessonsContext: compact block, strips lesson: prefix, truncates desc', () => {
  const long = 'x'.repeat(400);
  const out = client.formatLessonsContext([{ id: 'lesson:L018', name: 'Redesign Test', description: long, score: 0.68 }]);
  assert.match(out, /Relevant lessons \(semantic recall/);
  assert.match(out, /\[L018\] Redesign Test/);
  assert.match(out, /\(0\.68\)/);
  assert.ok(out.includes('…'), 'long description should be truncated with ellipsis');
  assert.ok(!out.includes('lesson:L018'), 'lesson: prefix should be stripped');
});

// --- integration (mock daemon) --------------------------------------------

test('searchLessons: full handshake + JSON response', async () => {
  const mock = await startMock({ results: [{ id: 'lesson:L2', name: 'Avoid blocking hooks', description: 'use async queue', type: 'procedural', score: 0.72 }] });
  const runDir = tmpRunDir(mock.url);
  try {
    const res = await client.searchLessons('operação demorada trava o processo', { env: { MCP_RUN_DIR: runDir } });
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].name, 'Avoid blocking hooks');
    const toolCall = mock.captured.find((c) => c.params);
    // Assert the spec-required headers reached the tool call.
    const h = toolCall.headers;
    assert.strictEqual(h['mcp-session-id'], 'sess-abc-123');
    assert.strictEqual(h['mcp-protocol-version'], '2025-06-18');
    assert.match(h['accept'], /application\/json/);
    assert.match(h['accept'], /text\/event-stream/);
    // Assert the query was scoped to the fixed lessons namespace.
    assert.strictEqual(toolCall.params.arguments.metadata.project_id, '__lessons__');
    // Assert the whole session was pinned to the namespace via initialize.
    const initEntry = mock.captured.find((c) => c.initParams);
    assert.strictEqual(initEntry.initParams.projectId, '__lessons__');
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('searchLessons: SSE response is parsed', async () => {
  const mock = await startMock({ sseMode: true, results: [{ id: 'lesson:L3', name: 'SSE works', score: 0.6 }] });
  const runDir = tmpRunDir(mock.url);
  try {
    const res = await client.searchLessons('anything', { env: { MCP_RUN_DIR: runDir } });
    assert.strictEqual(res.length, 1);
    assert.strictEqual(res[0].name, 'SSE works');
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('searchLessons: no daemon.json -> fail-open []', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-empty-'));
  try {
    const res = await client.searchLessons('x', { env: { MCP_RUN_DIR: empty } });
    assert.deepStrictEqual(res, []);
  } finally { fs.rmSync(empty, { recursive: true, force: true }); }
});

test('searchLessons: unhealthy daemon -> fail-open []', async () => {
  const mock = await startMock({ healthStatus: 500 });
  const runDir = tmpRunDir(mock.url);
  try {
    const res = await client.searchLessons('x', { env: { MCP_RUN_DIR: runDir } });
    assert.deepStrictEqual(res, []);
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('searchLessons: initialize failure -> fail-open []', async () => {
  const mock = await startMock({ initStatus: 500 });
  const runDir = tmpRunDir(mock.url);
  try {
    const res = await client.searchLessons('x', { env: { MCP_RUN_DIR: runDir } });
    assert.deepStrictEqual(res, []);
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('addLessons: ingest stamps namespace + documentId prefix', async () => {
  const captured = [];
  const mock = await startMock({ captured });
  const runDir = tmpRunDir(mock.url);
  try {
    const r = await client.addLessons([
      { id: 'L100', content: 'Some lesson body', metadata: { name: 'X', confidence: 0.8 } },
      { id: 'lesson:L101', content: 'Another body' },
    ], { env: { MCP_RUN_DIR: runDir } });
    assert.strictEqual(r.ok, 2);
    assert.strictEqual(r.fail, 0);
    const calls = captured.filter((c) => c.params);
    assert.strictEqual(calls[0].params.arguments.documentId, 'lesson:L100');
    assert.strictEqual(calls[0].params.arguments.metadata.project_id, '__lessons__');
    assert.strictEqual(calls[0].params.arguments.metadata.type, 'procedural');
    assert.strictEqual(calls[1].params.arguments.documentId, 'lesson:L101');
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('deleteLessons: prunes by id, scoped session, normalizes prefix', async () => {
  const captured = [];
  const mock = await startMock({ captured });
  const runDir = tmpRunDir(mock.url);
  try {
    const r = await client.deleteLessons(['L100', 'lesson:L101'], { env: { MCP_RUN_DIR: runDir } });
    assert.strictEqual(r.ok, 2);
    assert.strictEqual(r.fail, 0);
    const calls = captured.filter((c) => c.params);
    assert.strictEqual(calls[0].params.name, 'delete_document');
    assert.strictEqual(calls[0].params.arguments.documentId, 'lesson:L100');
    assert.strictEqual(calls[1].params.arguments.documentId, 'lesson:L101');
    const initEntry = captured.find((c) => c.initParams);
    assert.strictEqual(initEntry.initParams.projectId, '__lessons__');
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('addLessons: no daemon -> ok:0, fail:N (never throws)', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-empty2-'));
  try {
    const r = await client.addLessons([{ id: 'L1', content: 'x' }], { env: { MCP_RUN_DIR: empty } });
    assert.deepStrictEqual(r, { ok: 0, fail: 1 });
  } finally { fs.rmSync(empty, { recursive: true, force: true }); }
});

// --- fault injection: the fail-open paths the design exists for --------------

test('searchLessons: mid-response socket reset -> [] within deadline', async () => {
  const mock = await startMock({ resetOnCall: true });
  const runDir = tmpRunDir(mock.url);
  const t0 = Date.now();
  try {
    const res = await client.searchLessons('x', { env: { MCP_RUN_DIR: runDir }, deadlineMs: 1500 });
    const elapsed = Date.now() - t0;
    assert.deepStrictEqual(res, []);
    assert.ok(elapsed < 1500, 'must resolve well within the deadline, took ' + elapsed + 'ms (regression guard for the hung-request bug)');
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('searchLessons: server hangs on call -> timeout -> [] within budget', async () => {
  const mock = await startMock({ hangOnCall: true });
  const runDir = tmpRunDir(mock.url);
  const t0 = Date.now();
  try {
    const res = await client.searchLessons('x', { env: { MCP_RUN_DIR: runDir }, deadlineMs: 1200 });
    const elapsed = Date.now() - t0;
    assert.deepStrictEqual(res, []);
    assert.ok(elapsed < 2000, 'timeout must fire inside budget, took ' + elapsed + 'ms');
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('searchLessons: connection refused (dead port) -> []', async () => {
  // Grab a real port then close it so connects are refused.
  const deadUrl = await new Promise((resolve) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => {
      const url = 'http://127.0.0.1:' + s.address().port;
      s.close(() => resolve(url));
    });
  });
  const runDir = tmpRunDir(deadUrl);
  try {
    const res = await client.searchLessons('x', { env: { MCP_RUN_DIR: runDir }, deadlineMs: 1500 });
    assert.deepStrictEqual(res, []);
  } finally { fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('searchLessons: tool call returns JSON-RPC error -> []', async () => {
  const mock = await startMock({ toolError: true });
  const runDir = tmpRunDir(mock.url);
  try {
    const res = await client.searchLessons('x', { env: { MCP_RUN_DIR: runDir } });
    assert.deepStrictEqual(res, []);
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('addLessons: tool call JSON-RPC error -> counts as fail (never throws)', async () => {
  const mock = await startMock({ toolError: true });
  const runDir = tmpRunDir(mock.url);
  try {
    const r = await client.addLessons([{ id: 'L1', content: 'x' }], { env: { MCP_RUN_DIR: runDir } });
    assert.deepStrictEqual(r, { ok: 0, fail: 1 });
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

// --- sync manifest: fingerprint + diff (pure) ------------------------------

test('fingerprint: deterministic, changes with content', () => {
  const a = client.fingerprint('hello world');
  assert.strictEqual(a, client.fingerprint('hello world'));
  assert.notStrictEqual(a, client.fingerprint('hello world!'));
  assert.match(a, /^[0-9a-f]{40}$/);
});

test('computeManifestDiff: classifies new / changed / removed / unchanged', () => {
  const fpUnchanged = client.fingerprint('body-A');
  const prev = { L1: fpUnchanged, L2: 'stale-hash', L9: client.fingerprint('gone') };
  const docs = [
    { id: 'L1', content: 'body-A' },   // unchanged -> skip
    { id: 'L2', content: 'body-B' },   // changed -> upsert
    { id: 'L3', content: 'body-C' },   // new -> upsert
    // L9 absent from disk -> delete
  ];
  const { toUpsert, toDelete } = client.computeManifestDiff(docs, prev);
  assert.deepStrictEqual(toUpsert.map((d) => d.id).sort(), ['L2', 'L3']);
  assert.deepStrictEqual(toDelete, ['L9']);
  assert.ok(toUpsert.every((d) => /^[0-9a-f]{40}$/.test(d.fp)), 'each upsert carries its fp');
});

test('computeManifestDiff: empty manifest -> everything is an upsert', () => {
  const { toUpsert, toDelete } = client.computeManifestDiff([{ id: 'L1', content: 'x' }, { id: 'L2', content: 'y' }], {});
  assert.strictEqual(toUpsert.length, 2);
  assert.strictEqual(toDelete.length, 0);
});

// --- syncLessons (mock daemon) ---------------------------------------------

test('syncLessons: upserts changed/new, prunes removed, advances manifest', async () => {
  const captured = [];
  const mock = await startMock({ captured });
  const runDir = tmpRunDir(mock.url);
  try {
    const prev = { L1: client.fingerprint('same'), L9: 'orphan' };
    const docs = [
      { id: 'L1', content: 'same', metadata: { name: 'One' } },   // unchanged
      { id: 'L2', content: 'fresh', metadata: { name: 'Two' } },  // new
      // L9 removed on disk -> prune
    ];
    const res = await client.syncLessons(docs, prev, { env: { MCP_RUN_DIR: runDir } });
    assert.strictEqual(res.upserted, 1);
    assert.strictEqual(res.deleted, 1);
    assert.strictEqual(res.failed, 0);
    assert.strictEqual(res.completed, true);
    // manifest advanced: L2 added, L9 dropped, L1 kept
    assert.ok(res.entries.L2 && res.entries.L2 === client.fingerprint('fresh'));
    assert.ok(!('L9' in res.entries));
    assert.ok(res.entries.L1);
    const calls = captured.filter((c) => c.params);
    assert.ok(calls.some((c) => c.params.name === 'delete_document' && c.params.arguments.documentId === 'lesson:L9'));
    assert.ok(calls.some((c) => c.params.name === 'add_document' && c.params.arguments.documentId === 'lesson:L2'));
    const initEntry = captured.find((c) => c.initParams);
    assert.strictEqual(initEntry.initParams.projectId, '__lessons__');
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('syncLessons: nothing changed -> no daemon call, completed true', async () => {
  const captured = [];
  const mock = await startMock({ captured });
  const runDir = tmpRunDir(mock.url);
  try {
    const prev = { L1: client.fingerprint('x') };
    const res = await client.syncLessons([{ id: 'L1', content: 'x' }], prev, { env: { MCP_RUN_DIR: runDir } });
    assert.deepStrictEqual({ u: res.upserted, d: res.deleted, f: res.failed, c: res.completed }, { u: 0, d: 0, f: 0, c: true });
    assert.strictEqual(captured.filter((c) => c.params).length, 0, 'no tools/call when diff is empty');
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('syncLessons: deadline cut mid-batch still advances what it confirmed', async () => {
  // 300ms per call, ~1.2s budget -> only a few of many upserts land; the rest
  // are failures, completed=false, but the confirmed ones ARE in entries.
  const mock = await startMock({ delayMs: 300 });
  const runDir = tmpRunDir(mock.url);
  try {
    const docs = [];
    for (let i = 0; i < 20; i++) docs.push({ id: 'B' + i, content: 'body-' + i });
    const res = await client.syncLessons(docs, {}, { env: { MCP_RUN_DIR: runDir }, deadlineMs: 1300 });
    assert.strictEqual(res.completed, false, 'deadline should cut the batch');
    assert.ok(res.upserted >= 1 && res.upserted < 20, 'partial progress, got ' + res.upserted);
    assert.strictEqual(Object.keys(res.entries).length, res.upserted, 'manifest holds exactly the confirmed upserts');
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('syncLessons: empty docs + populated manifest -> self-safe, NEVER prunes', async () => {
  const captured = [];
  const mock = await startMock({ captured });
  const runDir = tmpRunDir(mock.url);
  try {
    const prev = { L1: 'h1', L2: 'h2' };
    const res = await client.syncLessons([], prev, { env: { MCP_RUN_DIR: runDir } });
    assert.deepStrictEqual({ u: res.upserted, d: res.deleted, f: res.failed, c: res.completed }, { u: 0, d: 0, f: 0, c: true });
    assert.deepStrictEqual(res.entries, prev, 'manifest must be preserved intact');
    assert.strictEqual(captured.filter((c) => c.params).length, 0, 'must NOT issue any delete_document');
  } finally { mock.close(); fs.rmSync(runDir, { recursive: true, force: true }); }
});

test('syncLessons: no daemon -> failed=total, manifest unchanged, never throws', async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-nodaemon-'));
  try {
    const prev = { L1: 'h' };
    const res = await client.syncLessons([{ id: 'L2', content: 'y' }], prev, { env: { MCP_RUN_DIR: empty } });
    assert.strictEqual(res.upserted, 0);
    assert.strictEqual(res.completed, false);
    assert.ok(res.failed >= 1);
    assert.deepStrictEqual(res.entries, prev, 'manifest untouched when daemon is down');
  } finally { fs.rmSync(empty, { recursive: true, force: true }); }
});

test('INVARIANT: never writes to stdout/stderr on any path', async () => {
  // Run the client in an isolated child process (exactly how a hook runs) and
  // assert it emits absolutely nothing on stdout/stderr — happy AND failure
  // paths. Intercepting process.stdout in-process is unreliable under
  // `node --test` (the runner itself writes there), hence the child.
  const { spawnSync } = require('node:child_process');
  const okMock = await startMock({ results: [{ id: 'lesson:L1', name: 'A', score: 0.9 }] });
  const runDir = tmpRunDir(okMock.url);
  const clientPath = require.resolve('../../hooks/_lib/mcp-lessons-client.js');
  const script = 'const c = require(' + JSON.stringify(clientPath) + ');'
    + '(async () => {'
    + '  const live = { env: { MCP_RUN_DIR: ' + JSON.stringify(runDir) + ' } };'
    + '  await c.searchLessons("x", live);'                         // happy search
    + '  await c.addLessons([{ id: "L1", content: "x" }], live);'   // happy add
    + '  await c.deleteLessons(["L1"], live);'                      // happy delete
    + '  await c.searchLessons("x", { env: { MCP_RUN_DIR: ' + JSON.stringify(path.join(os.tmpdir(), 'no-such-dir-xyz')) + ' } });' // no daemon
    + '})().then(() => process.exit(0)).catch(() => process.exit(2));';
  try {
    const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
    assert.strictEqual(r.stdout, '', 'stdout leak: ' + r.stdout);
    assert.strictEqual(r.stderr, '', 'stderr leak: ' + r.stderr);
    assert.strictEqual(r.status, 0, 'child should exit 0 (fail-open), got ' + r.status);
  } finally {
    okMock.close(); fs.rmSync(runDir, { recursive: true, force: true });
  }
});
