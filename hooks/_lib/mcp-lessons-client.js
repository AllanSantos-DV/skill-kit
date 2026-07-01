#!/usr/bin/env node
'use strict';
// Shared MCP Memory client for the lesson hooks (semantic recall + ingest).
// Zero external deps — Node core only. Talks to the local mcp-memory daemon
// (native-java) over the MCP "Streamable HTTP" transport.
//
// Spec (2025-06-18): https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
//   POST /mcp  initialize            -> 200 + Mcp-Session-Id header
//   POST /mcp  notifications/initialized (Mcp-Session-Id + MCP-Protocol-Version) -> 202
//   POST /mcp  tools/call            -> 200 (application/json OR text/event-stream)
//   DELETE /mcp (Mcp-Session-Id)     -> best-effort cleanup (SHOULD)
//
// Cross-project lessons live under a FIXED synthetic project_id ("__lessons__"):
// passing project_id explicitly in the tool metadata overrides the daemon's
// per-session project scope, so a lesson written from any project is retrievable
// from every project (proven empirically). search_memory is project-scoped by
// design, so this namespace is what makes recall cross-project.
//
// INVARIANT: this module is imported by hooks — it MUST NEVER write to stdout or
// stderr, and MUST NEVER throw across its public API. Every failure degrades to
// an empty/false result so the caller can fail open (exit 0, inject nothing).
//
// @permissions: net.fetch, fs.read

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const NAMESPACE = '__lessons__';
const PROTOCOL_VERSION = '2025-06-18';
const GLOBAL_DIR = '.mcp-memory';
const RUN_DIR = 'run';
const DAEMON_JSON = 'daemon.json';

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests — no I/O, no throw across boundary)
// ---------------------------------------------------------------------------

/** Resolve the daemon run-dir: env MCP_RUN_DIR -> <home>/.mcp-memory/run. */
function resolveRunDir(env) {
  const e = env || process.env;
  const override = e.MCP_RUN_DIR;
  if (override && String(override).trim().length > 0) return String(override).trim();
  return path.join(os.homedir(), GLOBAL_DIR, RUN_DIR);
}

/** Path to <run-dir>/daemon.json. */
function daemonJsonPath(runDir) {
  return path.join(runDir, DAEMON_JSON);
}

/**
 * Tolerant parse of daemon.json content. Missing/corrupt/partial -> null.
 * Returns { url, port } when both are present; url is derived from port when absent.
 */
function parseDaemonRegistry(raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch (_) { return null; }
  if (!parsed || typeof parsed !== 'object') return null;
  const port = typeof parsed.port === 'number' ? parsed.port : null;
  let url = typeof parsed.url === 'string' && parsed.url ? parsed.url : null;
  if (!url && port) url = 'http://127.0.0.1:' + port;
  if (!url) return null;
  return { url: url.replace(/\/+$/, ''), port: port || null };
}

/**
 * Extract the JSON-RPC payload string from an SSE body (text/event-stream).
 * Concatenates `data:` lines per event; returns the payload of the first event
 * that parses to a JSON-RPC response (has result or error), else the last data blob.
 */
function extractSsePayload(body) {
  const events = String(body).split(/\r?\n\r?\n/);
  let lastData = '';
  for (const ev of events) {
    const data = ev.split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .join('\n');
    if (!data) continue;
    lastData = data;
    try {
      const msg = JSON.parse(data);
      if (msg && (Object.prototype.hasOwnProperty.call(msg, 'result') || Object.prototype.hasOwnProperty.call(msg, 'error'))) {
        return data;
      }
    } catch (_) { /* keep scanning */ }
  }
  return lastData;
}

/**
 * Normalize an HTTP response into a JSON-RPC message object (or null).
 * 202 (notification accepted) -> null. Handles application/json and text/event-stream.
 */
function parseHttpBody(status, contentType, body) {
  if (status === 202 || status === 204) return null;
  const ct = String(contentType || '');
  const text = ct.includes('text/event-stream') ? extractSsePayload(body) : String(body || '');
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return null; }
}

/**
 * Build the search_memory arguments for a lesson query in the fixed namespace.
 *
 * NOTE: minScore is ALWAYS 0 here, on purpose. Empirically the daemon switches
 * to a different (non-cosine, BM25-like) scoring mode once the minScore arg
 * crosses ~0.68 — it then returns uncomparable scores (e.g. 4.2, 14.3, 21.2) and
 * an unpredictable result count. So we NEVER let the daemon filter: we ask for
 * cosine-ranked candidates (minScore 0) and apply the real relevance threshold
 * client-side in searchLessons().
 */
function buildSearchArgs(query, opts) {
  const o = opts || {};
  return {
    query: String(query || ''),
    topK: typeof o.topK === 'number' ? o.topK : 5,
    minScore: 0,
    projection: 'summary',
    metadata: { project_id: NAMESPACE, type: 'procedural' },
  };
}

/**
 * Extract the results array from a search_memory tool response. The daemon wraps
 * the JSON payload as text inside result.content[].text; we parse that too.
 * Always returns an array (possibly empty) — never throws.
 */
function extractSearchResults(rpcMessage) {
  try {
    const content = rpcMessage && rpcMessage.result && rpcMessage.result.content;
    if (!Array.isArray(content)) return [];
    const textNode = content.find((c) => c && c.type === 'text' && typeof c.text === 'string');
    if (!textNode) return [];
    const payload = JSON.parse(textNode.text);
    const results = payload && payload.results;
    return Array.isArray(results) ? results : [];
  } catch (_) { return []; }
}

/**
 * Format the recalled lessons into a compact additionalContext block.
 * Returns '' when there is nothing worth injecting (caller then injects nothing).
 */
function formatLessonsContext(items, opts) {
  const o = opts || {};
  const list = Array.isArray(items) ? items.filter((it) => it && (it.name || it.id)) : [];
  if (list.length === 0) return '';
  const maxDesc = typeof o.maxDesc === 'number' ? o.maxDesc : 220;
  const lines = [];
  lines.push('### Relevant lessons (semantic recall — top ' + list.length + ')');
  lines.push('These past lessons were semantically matched to THIS task by meaning (not keywords).');
  lines.push('Apply the ones that genuinely prevent a mistake here; ignore the rest silently — do not mention this block to the user.');
  lines.push('');
  for (const it of list) {
    const id = it.id ? String(it.id).replace(/^lesson:/, '') : '';
    const name = it.name ? String(it.name).trim() : id;
    let desc = it.description ? String(it.description).replace(/\s+/g, ' ').trim() : '';
    if (desc.length > maxDesc) desc = desc.slice(0, maxDesc - 1).trimEnd() + '…';
    const score = typeof it.score === 'number' ? ' (' + it.score.toFixed(2) + ')' : '';
    const tag = id ? '[' + id + '] ' : '';
    lines.push('- ' + tag + name + (desc ? ' — ' + desc : '') + score);
  }
  lines.push('');
  lines.push('Full text when needed: `~/.copilot/lessons/<id>-*.md`.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// I/O layer (network) — all failures resolve, never reject across public API
// ---------------------------------------------------------------------------

/** Low-level single HTTP request to the daemon. Resolves {status,headers,body,ct} or {error}. */
function request(method, baseUrl, pathname, headers, bodyStr, timeoutMs) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(baseUrl); } catch (_) { resolve({ error: 'bad-url' }); return; }
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    let req;
    try {
      req = http.request(
        { hostname: u.hostname, port: u.port, path: pathname, method, headers: headers || {} },
        (res) => {
          let buf = '';
          res.setEncoding('utf8');
          res.on('data', (c) => { buf += c; });
          res.on('end', () => done({ status: res.statusCode, headers: res.headers, body: buf, ct: res.headers['content-type'] || '' }));
          // Terminal settles: a mid-response socket reset (daemon dying in flight)
          // fires 'error'/'aborted'/'close' on the response — NOT req 'error',
          // and the socket timer is cleared on destroy. Without these the Promise
          // would never settle and the hook would hang past its deadline.
          res.on('error', () => done({ error: 'response-error' }));
          res.on('aborted', () => done({ error: 'response-aborted' }));
          res.on('close', () => done({ error: 'response-closed' }));
        },
      );
    } catch (_) { done({ error: 'request-throw' }); return; }
    req.on('error', () => done({ error: 'request-error' }));
    // 'close' always fires last; on the happy path 'end' already settled, so the
    // guard makes this a no-op. On connection failure it guarantees a settle.
    req.on('close', () => done({ error: 'request-closed' }));
    req.setTimeout(Math.max(1, timeoutMs | 0), () => { try { req.destroy(); } catch (_) { /* noop */ } done({ error: 'timeout' }); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/** POST a JSON-RPC message. */
function postRpc(baseUrl, message, sessionId, timeoutMs) {
  const payload = JSON.stringify(message);
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'Content-Length': Buffer.byteLength(payload),
  };
  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
    headers['MCP-Protocol-Version'] = PROTOCOL_VERSION;
  }
  return request('POST', baseUrl, '/mcp', headers, payload, timeoutMs);
}

/** GET /health — true when the daemon answers 200 or 503 (both = alive). */
async function healthCheck(baseUrl, timeoutMs) {
  const r = await request('GET', baseUrl, '/health', { Accept: 'application/json' }, null, timeoutMs || 700);
  return !r.error && (r.status === 200 || r.status === 503);
}

/** Read + validate the daemon registry from disk. Returns { url } or null. */
function discoverDaemon(env) {
  try {
    const raw = fs.readFileSync(daemonJsonPath(resolveRunDir(env)), 'utf8');
    return parseDaemonRegistry(raw);
  } catch (_) { return null; }
}

/** Content fingerprint for the sync manifest (stable across runs). */
function fingerprint(content) {
  return crypto.createHash('sha1').update(String(content), 'utf8').digest('hex');
}

/**
 * Diff current lesson docs against the previous sync manifest (id -> fingerprint).
 * Pure. Returns { toUpsert: [{id, content, metadata, fp}], toDelete: [id...] }.
 * A doc is upserted when its content fingerprint differs from the manifest;
 * a manifest id absent from the current docs is a delete (lesson removed on disk).
 */
function computeManifestDiff(docs, prevEntries) {
  const prev = prevEntries && typeof prevEntries === 'object' ? prevEntries : {};
  const list = Array.isArray(docs) ? docs.filter((d) => d && d.id && d.content) : [];
  const curIds = new Set();
  const toUpsert = [];
  for (const d of list) {
    const id = String(d.id);
    curIds.add(id);
    const fp = fingerprint(d.content);
    if (prev[id] !== fp) toUpsert.push({ id, content: d.content, metadata: d.metadata, fp });
  }
  const toDelete = Object.keys(prev).filter((id) => !curIds.has(id));
  return { toUpsert, toDelete };
}

/** Join the text payload of a tools/call result (or '' ). */
function resultText(msg) {
  return msg && msg.result && Array.isArray(msg.result.content)
    ? msg.result.content.map((c) => (c && c.text) || '').join(' ')
    : '';
}

function remaining(deadline) { return deadline - Date.now(); }

/**
 * Open an MCP session (initialize -> initialized), run fn(call) where
 * call(name, args, timeoutMs) invokes a tool, then best-effort DELETE.
 * Resolves whatever fn returns; resolves null on any handshake failure.
 *
 * `budget.projectId` scopes the WHOLE session to that project on the daemon
 * (initialize.params.projectId). We pin it to the fixed lessons namespace so
 * even tools without a metadata filter (e.g. delete_document) operate there.
 * @param {object} daemon { url }
 * @param {function} fn async (call) => any
 * @param {object} budget { deadline, projectId? }
 */
async function withSession(daemon, fn, budget) {
  const deadline = budget.deadline;
  if (remaining(deadline) <= 0) return null;

  const initParams = { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'skill-kit-lessons', version: '1.0.0' } };
  if (budget.projectId) initParams.projectId = budget.projectId;
  const initMsg = { jsonrpc: '2.0', id: 1, method: 'initialize', params: initParams };
  const initRes = await postRpc(daemon.url, initMsg, null, Math.min(1500, remaining(deadline)));
  if (initRes.error || initRes.status !== 200) return null;
  const sessionId = initRes.headers['mcp-session-id'] || initRes.headers['Mcp-Session-Id'];
  if (!sessionId) return null;

  // notifications/initialized (best-effort; daemon returns 202)
  if (remaining(deadline) > 0) {
    await postRpc(daemon.url, { jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId, Math.min(600, remaining(deadline)));
  }

  let out = null;
  try {
    let rid = 2;
    const call = async (name, args, timeoutMs) => {
      const budgetMs = Math.min(timeoutMs || 2500, Math.max(1, remaining(deadline)));
      const res = await postRpc(daemon.url, { jsonrpc: '2.0', id: rid++, method: 'tools/call', params: { name, arguments: args } }, sessionId, budgetMs);
      if (res.error) return null;
      return parseHttpBody(res.status, res.ct, res.body);
    };
    out = await fn(call);
  } catch (_) { out = null; }

  // Best-effort session teardown (SHOULD; ignore result). Capped so a blown
  // deadline adds at most ~250ms, keeping us inside the hook's kill window.
  try {
    const delMs = Math.min(250, Math.max(80, remaining(deadline)));
    await request('DELETE', daemon.url, '/mcp', { 'Mcp-Session-Id': sessionId, 'MCP-Protocol-Version': PROTOCOL_VERSION }, null, delMs);
  } catch (_) { /* noop */ }
  return out;
}

// ---------------------------------------------------------------------------
// Public API (high-level; fail-open — never throws, never logs)
// ---------------------------------------------------------------------------

/**
 * Semantic recall of lessons for a query. Returns an array of
 * { id, name, description, type, score } (possibly empty), sorted by score desc
 * and filtered to `minScore`. Never throws.
 *
 * The daemon's own minScore filter is unreliable (see buildSearchArgs), and it
 * does NOT return hits sorted by score. So we ask for a generous cosine-ranked
 * candidate pool (minScore 0) and do the thresholding + sorting client-side.
 */
async function searchLessons(query, opts) {
  const o = opts || {};
  if (!query || !String(query).trim()) return [];
  const topK = typeof o.topK === 'number' ? o.topK : 5;
  const minScore = typeof o.minScore === 'number' ? o.minScore : 0.35;
  const pool = Math.max(topK, 25);
  const daemon = discoverDaemon(o.env);
  if (!daemon) return [];
  const deadline = Date.now() + (typeof o.deadlineMs === 'number' ? o.deadlineMs : 4000);
  if (!(await healthCheck(daemon.url, Math.min(700, deadline - Date.now())))) return [];
  const res = await withSession(daemon, async (call) => {
    const msg = await call('search_memory', buildSearchArgs(query, { topK: pool }), 2500);
    return extractSearchResults(msg);
  }, { deadline, projectId: NAMESPACE });
  const list = Array.isArray(res) ? res : [];
  return list
    .filter((r) => r && typeof r.score === 'number' && r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Ingest one or more lessons in a single session. Each item:
 *   { id, content, metadata? }  (id is the stable documentId, sans "lesson:" prefix ok)
 * project_id/type are stamped into the fixed lessons namespace automatically.
 * Returns { ok, fail }. Never throws.
 */
async function addLessons(items, opts) {
  const o = opts || {};
  const list = Array.isArray(items) ? items.filter((it) => it && it.id && it.content) : [];
  if (list.length === 0) return { ok: 0, fail: 0 };
  const daemon = discoverDaemon(o.env);
  if (!daemon) return { ok: 0, fail: list.length };
  const deadline = Date.now() + (typeof o.deadlineMs === 'number' ? o.deadlineMs : Math.max(4000, list.length * 250 + 2000));
  if (!(await healthCheck(daemon.url, Math.min(700, deadline - Date.now())))) return { ok: 0, fail: list.length };

  const res = await withSession(daemon, async (call) => {
    let ok = 0; let fail = 0;
    for (const it of list) {
      if (remaining(deadline) <= 200) { fail += 1; continue; }
      const documentId = String(it.id).startsWith('lesson:') ? String(it.id) : 'lesson:' + String(it.id);
      // project_id AND type are namespace invariants (search always filters
      // type:'procedural'), so stamp them AFTER the caller metadata spread —
      // otherwise a caller-supplied type would make the lesson unrecallable.
      const metadata = Object.assign({ source: 'copilot-lessons' }, it.metadata || {}, { project_id: NAMESPACE, type: 'procedural' });
      const msg = await call('add_document', { content: String(it.content), documentId, metadata }, 3000);
      const txt = msg && msg.result && Array.isArray(msg.result.content)
        ? msg.result.content.map((c) => (c && c.text) || '').join(' ')
        : '';
      if (msg && !msg.error && /added|updated|success/i.test(txt)) ok += 1; else fail += 1;
    }
    return { ok, fail };
  }, { deadline, projectId: NAMESPACE });
  return res || { ok: 0, fail: list.length };
}

/**
 * Delete lessons from the fixed namespace by id (with or without the "lesson:"
 * prefix). Session is scoped to the namespace so delete_document — which has no
 * metadata filter of its own — resolves the right documents. Returns { ok, fail }.
 * Never throws. Used by the sync hook to prune stale/removed lessons.
 */
async function deleteLessons(ids, opts) {
  const o = opts || {};
  const list = (Array.isArray(ids) ? ids : []).filter((x) => x && String(x).trim());
  if (list.length === 0) return { ok: 0, fail: 0 };
  const daemon = discoverDaemon(o.env);
  if (!daemon) return { ok: 0, fail: list.length };
  const deadline = Date.now() + (typeof o.deadlineMs === 'number' ? o.deadlineMs : Math.max(4000, list.length * 200 + 2000));
  if (!(await healthCheck(daemon.url, Math.min(700, deadline - Date.now())))) return { ok: 0, fail: list.length };

  const res = await withSession(daemon, async (call) => {
    let ok = 0; let fail = 0;
    for (const raw of list) {
      if (remaining(deadline) <= 200) { fail += 1; continue; }
      const documentId = String(raw).startsWith('lesson:') ? String(raw) : 'lesson:' + String(raw);
      const msg = await call('delete_document', { documentId }, 2500);
      const t = msg && msg.result && Array.isArray(msg.result.content)
        ? msg.result.content.map((c) => (c && c.text) || '').join(' ')
        : '';
      if (msg && !msg.error && /removed|deleted|success/i.test(t)) ok += 1; else fail += 1;
    }
    return { ok, fail };
  }, { deadline, projectId: NAMESPACE });
  return res || { ok: 0, fail: list.length };
}

/**
 * Reconcile the lessons namespace with the current on-disk docs, given the
 * previous sync manifest (id -> fingerprint). Upserts changed/new lessons and
 * prunes lessons removed on disk, all in ONE session, granular and
 * deadline-aware: each confirmed op advances `entries` immediately, so a run cut
 * short by the deadline still makes progress and the next session resumes where
 * it left off (no cold re-upload loop). Never throws.
 *
 * Returns { upserted, deleted, failed, entries, completed } where `entries` is
 * the NEXT manifest to persist and `completed` is true iff nothing failed.
 */
async function syncLessons(docs, prevEntries, opts) {
  const o = opts || {};
  const prev = prevEntries && typeof prevEntries === 'object' ? prevEntries : {};
  // Defense-in-depth: never let an empty doc set prune a populated namespace.
  // The SessionStart hook already guards this, but mass-delete is irreversible,
  // so keep the primitive self-safe for any future caller too.
  const effective = Array.isArray(docs) ? docs.filter((d) => d && d.id && d.content) : [];
  if (effective.length === 0 && Object.keys(prev).length > 0) {
    return { upserted: 0, deleted: 0, failed: 0, entries: Object.assign({}, prev), completed: true };
  }
  const { toUpsert, toDelete } = computeManifestDiff(docs, prev);
  const entries = Object.assign({}, prev);
  const total = toUpsert.length + toDelete.length;
  if (total === 0) return { upserted: 0, deleted: 0, failed: 0, entries, completed: true };

  const daemon = discoverDaemon(o.env);
  if (!daemon) return { upserted: 0, deleted: 0, failed: total, entries, completed: false };
  const deadline = Date.now() + (typeof o.deadlineMs === 'number' ? o.deadlineMs : Math.max(4000, total * 250 + 2000));
  if (!(await healthCheck(daemon.url, Math.min(700, remaining(deadline))))) {
    return { upserted: 0, deleted: 0, failed: total, entries, completed: false };
  }

  let upserted = 0; let deleted = 0; let failed = 0; let sessionOk = false;
  await withSession(daemon, async (call) => {
    for (const id of toDelete) {
      if (remaining(deadline) <= 300) { failed += 1; continue; }
      const documentId = String(id).startsWith('lesson:') ? String(id) : 'lesson:' + String(id);
      const msg = await call('delete_document', { documentId }, 2500);
      if (msg && !msg.error && /removed|deleted|success/i.test(resultText(msg))) { delete entries[id]; deleted += 1; }
      else { failed += 1; }
    }
    for (const it of toUpsert) {
      if (remaining(deadline) <= 300) { failed += 1; continue; }
      const documentId = 'lesson:' + String(it.id);
      const metadata = Object.assign({ source: 'copilot-lessons' }, it.metadata || {}, { project_id: NAMESPACE, type: 'procedural' });
      const msg = await call('add_document', { content: String(it.content), documentId, metadata }, 3000);
      if (msg && !msg.error && /added|updated|success/i.test(resultText(msg))) { entries[it.id] = it.fp; upserted += 1; }
      else { failed += 1; }
    }
    sessionOk = true;
    return true;
  }, { deadline, projectId: NAMESPACE });

  if (!sessionOk && upserted === 0 && deleted === 0) failed = total;
  return { upserted, deleted, failed, entries, completed: failed === 0 };
}

module.exports = {
  // config
  NAMESPACE,
  PROTOCOL_VERSION,
  // pure helpers (tested)
  resolveRunDir,
  daemonJsonPath,
  parseDaemonRegistry,
  extractSsePayload,
  parseHttpBody,
  buildSearchArgs,
  extractSearchResults,
  formatLessonsContext,
  fingerprint,
  computeManifestDiff,
  // discovery + session
  discoverDaemon,
  healthCheck,
  withSession,
  // public API
  searchLessons,
  addLessons,
  deleteLessons,
  syncLessons,
};
