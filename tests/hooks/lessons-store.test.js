'use strict';
// Unit tests for hooks/_lib/lessons-store.js
// Run: node --test tests/hooks/lessons-store.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const store = require('../../hooks/_lib/lessons-store.js');

const SAMPLE = [
  '---',
  'id: L001',
  'tags: [configure, agents]',
  'confidence: 0.8',
  'created: 2026-04-29',
  '---',
  '',
  '# Invert gate logic: no local result means escalate',
  '',
  '## Resumo',
  'When a gate returns zero results, escalate to a higher tier, do NOT skip.',
  'Low local confidence is the strongest signal external research is needed.',
  '',
  '## Registro',
  '- detail body here',
].join('\n');

test('parseLessonContent: extracts id/name/description/tags/confidence', () => {
  const p = store.parseLessonContent(SAMPLE, 'FALLBACK');
  assert.strictEqual(p.id, 'L001');
  assert.strictEqual(p.name, 'Invert gate logic: no local result means escalate');
  assert.match(p.description, /escalate to a higher tier/);
  assert.match(p.description, /strongest signal/); // multi-line Resumo joined
  assert.ok(!/## Registro/.test(p.description), 'Resumo must stop before next heading');
  assert.deepStrictEqual(p.tags, ['configure', 'agents']);
  assert.strictEqual(p.confidence, 0.8);
});

test('parseLessonContent: no frontmatter -> null', () => {
  assert.strictEqual(store.parseLessonContent('# just a title\n\nbody', 'X'), null);
});

test('CRLF input (100% of the real corpus) parses clean, no \\r leakage', () => {
  const crlf = SAMPLE.replace(/\n/g, '\r\n');
  const p = store.parseLessonContent(crlf, 'FALLBACK');
  assert.strictEqual(p.id, 'L001');
  assert.strictEqual(p.name, 'Invert gate logic: no local result means escalate');
  assert.ok(!/\r/.test(p.id), 'id must not carry \\r');
  assert.ok(!/\r/.test(p.name), 'name must not carry \\r');
  assert.ok(!/\r/.test(p.description), 'description must not carry \\r');
  assert.match(p.description, /escalate to a higher tier/);
  assert.match(p.description, /strongest signal/);
  assert.ok(!/Registro/.test(p.description), 'Resumo must stop before Registro under CRLF too');
});

test('title/Resumo ignore a "# ..." line inside the frontmatter', () => {
  const tricky = [
    '---',
    'id: L100',
    '# TODO: revisit this lesson',
    'tags: [git]',
    '---',
    '',
    '# Real Title Here',
    '',
    '## Resumo',
    'the actual summary',
  ].join('\n');
  const p = store.parseLessonContent(tricky, 'X');
  assert.strictEqual(p.name, 'Real Title Here', 'must use body title, not the frontmatter comment');
  assert.strictEqual(p.description, 'the actual summary');
});

test('empty "## Resumo" does not swallow the "## Registro" section', () => {
  const empty = [
    '---', 'id: L101', '---', '', '# Title', '', '## Resumo', '## Registro', '- body detail line',
  ].join('\n');
  const p = store.parseLessonContent(empty, 'X');
  assert.strictEqual(p.description, '', 'empty Resumo must yield empty description');
  assert.ok(!/Registro/.test(p.description));
});

test('parseLessonContent: missing id uses fallback', () => {
  const p = store.parseLessonContent('---\ntags: [git]\n---\n# Title here', 'L999');
  assert.strictEqual(p.id, 'L999');
  assert.strictEqual(p.name, 'Title here');
});

test('parseLessonContent: bad confidence -> default 0.7', () => {
  const p = store.parseLessonContent('---\nid: L2\nconfidence: abc\n---\n# T', 'x');
  assert.strictEqual(p.confidence, 0.7);
});

test('buildLessonDoc: content = name + summary, metadata carries fields', () => {
  const doc = store.buildLessonDoc({ id: 'L1', name: 'Title', description: 'Summary text', tags: ['a'], confidence: 0.9 });
  assert.strictEqual(doc.id, 'L1');
  assert.strictEqual(doc.content, 'Title\n\nSummary text');
  assert.strictEqual(doc.metadata.name, 'Title');
  assert.strictEqual(doc.metadata.description, 'Summary text');
  assert.deepStrictEqual(doc.metadata.tags, ['a']);
  assert.strictEqual(doc.metadata.confidence, 0.9);
  assert.strictEqual(doc.metadata.source, 'copilot-lessons');
});

test('buildLessonDoc: no description -> content is just the name', () => {
  const doc = store.buildLessonDoc({ id: 'L1', name: 'OnlyTitle', description: '', tags: [], confidence: 0.7 });
  assert.strictEqual(doc.content, 'OnlyTitle');
});

test('buildLessonDoc: invalid input -> null', () => {
  assert.strictEqual(store.buildLessonDoc(null), null);
  assert.strictEqual(store.buildLessonDoc({ id: 'x' }), null);
});

test('listLessonFiles: filters L*.md; missing dir -> []', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-store-'));
  try {
    fs.writeFileSync(path.join(dir, 'L001-foo.md'), SAMPLE);
    fs.writeFileSync(path.join(dir, 'README.md'), '# not a lesson');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
    const files = store.listLessonFiles(dir);
    assert.strictEqual(files.length, 1);
    assert.match(files[0], /L001-foo\.md$/);
    assert.deepStrictEqual(store.listLessonFiles(path.join(dir, 'nope')), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('loadLessons: builds docs, skips invalid files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-load-'));
  try {
    fs.writeFileSync(path.join(dir, 'L001-a.md'), SAMPLE);
    fs.writeFileSync(path.join(dir, 'L002-b.md'), '---\nid: L002\n---\n# Second lesson\n\n## Resumo\nshort');
    fs.writeFileSync(path.join(dir, 'L003-bad.md'), 'no frontmatter here');
    const docs = store.loadLessons(dir);
    assert.strictEqual(docs.length, 2, 'invalid L003 must be skipped');
    const ids = docs.map((d) => d.id).sort();
    assert.deepStrictEqual(ids, ['L001', 'L002']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('sync manifest: missing -> {}, roundtrip read/write, corrupt -> {}', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-manifest-'));
  try {
    assert.deepStrictEqual(store.readSyncManifest(dir), {}, 'absent manifest -> {}');
    assert.match(store.syncManifestPath(dir), /\.mcp-sync\.json$/);
    const entries = { L1: 'aaa', L2: 'bbb' };
    assert.strictEqual(store.writeSyncManifest(entries, dir), true);
    assert.deepStrictEqual(store.readSyncManifest(dir), entries, 'roundtrip preserves entries');
    // manifest dotfile must never be picked up as a lesson
    assert.deepStrictEqual(store.listLessonFiles(dir), [], 'dotfile is not a lesson');
    fs.writeFileSync(store.syncManifestPath(dir), '{ this is not json');
    assert.deepStrictEqual(store.readSyncManifest(dir), {}, 'corrupt manifest -> {}');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
