#!/usr/bin/env node
'use strict';
// Shared lesson-store helpers: read the on-disk lessons corpus
// (~/.copilot/lessons/L*.md) and turn each into a document ready for the
// mcp-memory client's addLessons(). Also persists a small sync manifest
// (fs.read for the corpus, fs.write for the manifest) so both the initial
// import and the SessionStart sync hook can reuse it.
//
// The embedded `content` is the title + summary — the distilled "what this
// lesson teaches" — which is what should match a user's prompt semantically.
// The full body is kept out of the embedding (it would dilute the vector) but
// the id points back to the file for full-text read on demand.
//
// @permissions: fs.read, fs.write

const fs = require('fs');
const os = require('os');
const path = require('path');

const LESSON_FILE_RE = /^L.*\.md$/;

/** Resolve the lessons directory: env LESSONS_DIR -> <home>/.copilot/lessons. */
function resolveLessonsDir(env) {
  const e = env || process.env;
  const override = e.LESSONS_DIR;
  if (override && String(override).trim()) return String(override).trim();
  return path.join(os.homedir(), '.copilot', 'lessons');
}

/** List absolute paths of lesson files in `dir`. Missing/unreadable dir -> []. */
function listLessonFiles(dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch (_) { return []; }
  return names.filter((n) => LESSON_FILE_RE.test(n)).map((n) => path.join(dir, n));
}

/**
 * Parse a lesson markdown string into structured fields (or null if it has no
 * frontmatter / no title). `fallbackId` is used when frontmatter omits `id`.
 * Pure — takes the content string so it is trivially unit-testable.
 */
function parseLessonContent(content, fallbackId) {
  if (!content || typeof content !== 'string') return null;
  const fm = content.match(/^---\s*\r?\n([\s\S]+?)\r?\n---/);
  if (!fm) return null;
  const f = fm[1];
  const id = ((f.match(/^id:\s*(.+)$/m) || [])[1] || fallbackId || '').trim();
  if (!id) return null;
  let tags = [];
  const tb = (f.match(/^tags:\s*\[([^\]]*)\]/m) || [])[1];
  if (tb) tags = tb.split(',').map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  let confidence = parseFloat((f.match(/^confidence:\s*([\d.]+)/m) || [])[1]);
  if (!Number.isFinite(confidence)) confidence = 0.7;
  // Title/Resumo must be matched against the BODY (after the closing '---'),
  // never the whole file — otherwise a '# ...' line inside the frontmatter is
  // mis-grabbed as the title (which becomes the recall projection name).
  const body = content.slice(fm.index + fm[0].length);
  const title = ((body.match(/^#\s+(.+)$/m) || [])[1] || id).trim();
  let resumo = ((body.match(/##\s*Resumo\s*\r?\n([\s\S]+?)(?:\r?\n##\s|\s*$)/) || [])[1] || '');
  // An empty '## Resumo' immediately followed by '## Registro' would otherwise
  // let the capture start on the next heading and swallow that whole section.
  if (/^\s*##\s/.test(resumo)) resumo = '';
  resumo = resumo.trim().replace(/\s+/g, ' ');
  if (!title) return null;
  return { id, name: title, description: resumo, tags, confidence };
}

/** Read + parse a lesson file. Unreadable/invalid -> null. */
function parseLessonFile(filePath) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf8'); } catch (_) { return null; }
  return parseLessonContent(content, path.basename(filePath, '.md'));
}

/**
 * Turn a parsed lesson into the { id, content, metadata } document the client
 * ingests. `content` (embedded) = title + summary; the body stays on disk.
 */
function buildLessonDoc(parsed) {
  if (!parsed || !parsed.id || !parsed.name) return null;
  const content = parsed.description ? parsed.name + '\n\n' + parsed.description : parsed.name;
  const metadata = {
    name: parsed.name,
    description: parsed.description || '',
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    confidence: Number.isFinite(parsed.confidence) ? parsed.confidence : 0.7,
    source: 'copilot-lessons',
  };
  return { id: parsed.id, content, metadata };
}

/**
 * Load every lesson under `dir` (default: resolved lessons dir) as ingest docs.
 * Returns [] on any failure. Invalid individual files are skipped.
 */
function loadLessons(dir, env) {
  const target = dir || resolveLessonsDir(env);
  const docs = [];
  for (const file of listLessonFiles(target)) {
    const doc = buildLessonDoc(parseLessonFile(file));
    if (doc) docs.push(doc);
  }
  return docs;
}

// ---------------------------------------------------------------------------
// Sync manifest (id -> content fingerprint) — lets the SessionStart sync push
// only the delta instead of re-uploading the whole corpus every session. Lives
// as a dotfile beside the lessons; never matched by LESSON_FILE_RE.
// ---------------------------------------------------------------------------

/** Absolute path of the sync manifest for a lessons dir. */
function syncManifestPath(dir, env) {
  return path.join(dir || resolveLessonsDir(env), '.mcp-sync.json');
}

/** Read the manifest map { id: fingerprint }. Missing/corrupt -> {}. Never throws. */
function readSyncManifest(dir, env) {
  try {
    const raw = fs.readFileSync(syncManifestPath(dir, env), 'utf8');
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object' && obj.entries && typeof obj.entries === 'object') return obj.entries;
    return {};
  } catch (_) { return {}; }
}

/** Persist the manifest map atomically-ish. Returns true on success. Never throws. */
function writeSyncManifest(entries, dir, env) {
  try {
    const p = syncManifestPath(dir, env);
    const body = JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), entries: entries || {} });
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, p);
    return true;
  } catch (_) { return false; }
}

module.exports = {
  LESSON_FILE_RE,
  resolveLessonsDir,
  listLessonFiles,
  parseLessonContent,
  parseLessonFile,
  buildLessonDoc,
  loadLessons,
  syncManifestPath,
  readSyncManifest,
  writeSyncManifest,
};
