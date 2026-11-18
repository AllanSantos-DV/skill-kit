'use strict';
// Guards the doc-to-markdown skill wording against what markitdown really converts.
// Run: node --test tests/hooks/doc-to-markdown-skill.test.js

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SKILL_DIR = path.join(__dirname, '..', '..', 'skills', 'doc-to-markdown');
const read = (rel) => fs.readFileSync(path.join(SKILL_DIR, rel), 'utf8').replace(/\r\n/g, '\n');

const REQUIRED = [
  ['legacy .doc is not read by markitdown', /\| Word \(legacy\) \| \.doc \| _not supported_/],
  ['legacy .ppt is not read by markitdown', /\| PowerPoint \(legacy\) \| \.ppt \| _not supported_/],
  ['.xls only through xlrd', /\.xls[^\n]{0,80}xlrd|xlrd[^\n]{0,80}\.xls/i],
  ['an image gives EXIF and an LLM caption, OCR needs the markitdown-ocr plugin and an LLM client', /EXIF[\s\S]{0,300}caption[\s\S]{0,600}markitdown-ocr[\s\S]{0,300}llm_client/i],
  ['OCR is skipped silently without the LLM client', /skipped silently|skips the OCR silently/i],
  ['markitdown[all] may resolve to an old version because of a pre-release extra', /markitdown\[all\][\s\S]{0,400}pre-release[\s\S]{0,200}markitdown --version/i],
];

const FORBIDDEN = [
  ['.doc listed as read by markitdown', /\| Word \(legacy\) \| \.doc \| markitdown/],
  ['.ppt listed as read by markitdown', /\| PowerPoint \(legacy\) \| \.ppt \| markitdown/],
  ['images read by OCR out of the box', /markitdown uses OCR to extract text from images/],
  ['[all] promised to include OCR', /includes OCR, all optional deps/],
  ['[all] promised to describe images with OCR', /\[all\]` uses OCR/],
];

test('SKILL.md says only what markitdown does', () => {
  const text = read('SKILL.md');
  for (const [label, re] of REQUIRED) assert.match(text, re, `missing: ${label}`);
  for (const [label, re] of FORBIDDEN) assert.doesNotMatch(text, re, `old rule still there: ${label}`);
});

test('the inline batch SUPPORTED list does not include .doc or .ppt', () => {
  const line = read('SKILL.md').split('\n').find((l) => l.startsWith('SUPPORTED = {'));
  assert.ok(line, 'SUPPORTED line not found');
  assert.doesNotMatch(line, /"\.doc"|"\.ppt"/);
});

for (const script of ['scripts/convert.py', 'scripts/batch_convert.py']) {
  test(`${script} does not accept .doc or .ppt`, () => {
    const text = read(script);
    const set = text.match(/SUPPORTED_EXTENSIONS = \{[\s\S]*?\n\}/);
    assert.ok(set, 'SUPPORTED_EXTENSIONS not found');
    assert.doesNotMatch(set[0], /"\.doc"|"\.ppt"/);
    assert.doesNotMatch(text, /Supported formats:[^\n]*\.doc,/);
    assert.doesNotMatch(text, /Supported formats:[\s\S]{0,60}\.ppt,/);
  });
}

test('convert.py --ocr uses the OCR plugin with an LLM client and fails loud without it', () => {
  const text = read('scripts/convert.py');
  assert.doesNotMatch(text, /enable_llm_extraction/);
  assert.match(text, /"enable_plugins": True/);
  assert.match(text, /llm_client/);
  assert.match(text, /markitdown-ocr/);
});

test('references do not repeat the old claims', () => {
  const stale = [
    /OCR requires `\[all\]`|markitdown\[all\] \(OCR\)|PyMuPDF \+ OCR or markitdown\[all\]|Install with OCR support|Use `markitdown\[all\]` for OCR/,
    /pip install 'markitdown\[all\]'\n\s*markitdown \/tmp\/diagram\.png/,
    /"\.doc", "\.xlsx"/,
    /Try markitdown first, then LibreOffice/,
  ];
  for (const f of ['examples.md', 'tools-reference.md', 'troubleshooting.md']) {
    const text = read(`references/${f}`);
    for (const re of stale) assert.doesNotMatch(text, re, `${f}: ${re}`);
  }
});
