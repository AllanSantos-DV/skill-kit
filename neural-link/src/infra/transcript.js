/**
 * Transcript parser for neural-link evaluators.
 * 
 * Reads the VS Code Copilot transcript JSON and provides
 * boolean queries used by scoring condition evaluators.
 * 
 * Transcript is a JSON file at the path from stdin `transcript_path`.
 * Parsed once per dispatch cycle and cached by path.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { MAX_TRANSCRIPT_SIZE } from './constants.js';

// Cache: one transcript per dispatch (same path in a single invocation)
let _cache = { path: null, data: null };

// Text extraction cache: avoids re-extracting text for the same transcript
let _textCache = { path: null, text: null };

/**
 * Parse transcript from disk. Returns array of entries or null on failure.
 * Cached by path — safe to call multiple times per dispatch.
 */
export function parseTranscript(transcriptPath) {
  if (!transcriptPath) return null;
  if (_cache.path === transcriptPath) return _cache.data;

  try {
    if (!existsSync(transcriptPath)) return null;
    const stat = statSync(transcriptPath);
    if (stat.size > MAX_TRANSCRIPT_SIZE) return null;

    const raw = readFileSync(transcriptPath, 'utf-8');
    const data = JSON.parse(raw);
    _cache = { path: transcriptPath, data };
    return data;
  } catch {
    return null;
  }
}

// Patterns for file path detection
const FILE_PATH_RE = /(?:\/[\w.-]+){2,}|[A-Z]:\\[\w\\.-]+|\b[\w.-]+\.(?:js|ts|py|md|json|yaml|yml|html|css|sh|ps1|mjs|cjs|jsx|tsx)\b/i;

// Patterns for confidence table detection
const CONFIDENCE_RE = /[\u{1F7E1}\u{1F534}\u{1F7E2}]|confidence\s*(?:table|level|score|rating|assessment)/iu;

// Patterns for skill read detection
const SKILL_READ_RE = /SKILL\.md|read_file.*skill|skill.*read/i;

/**
 * Extract all text content from a transcript structure.
 * Handles both array-of-objects and nested formats.
 */
function extractText(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return data.map(extractText).join('\n');
  if (typeof data === 'object') {
    // Common fields in transcript entries
    const parts = [];
    for (const key of ['content', 'text', 'message', 'value', 'output', 'result', 'prompt']) {
      if (data[key]) parts.push(extractText(data[key]));
    }
    // Recurse into children/entries/messages
    for (const key of ['children', 'entries', 'messages', 'turns']) {
      if (Array.isArray(data[key])) parts.push(extractText(data[key]));
    }
    return parts.join('\n');
  }
  return String(data);
}

/**
 * Get extracted text from transcript, with caching.
 * Parses and extracts text once per path, reuses across all has* queries.
 */
function getTranscriptText(transcriptPath) {
  if (!transcriptPath) return null;
  if (_textCache.path === transcriptPath) return _textCache.text;
  const data = parseTranscript(transcriptPath);
  if (!data) return null;
  const text = extractText(data);
  _textCache = { path: transcriptPath, text };
  return text;
}

/**
 * Check if transcript contains file path references.
 */
export function hasFileReferences(transcriptPath) {
  const text = getTranscriptText(transcriptPath);
  if (text === null) return true; // conservative: assume yes when unknown
  return FILE_PATH_RE.test(text);
}

/**
 * Check if transcript contains a confidence table/assessment.
 */
export function hasConfidenceTable(transcriptPath) {
  const text = getTranscriptText(transcriptPath);
  if (text === null) return true; // conservative
  return CONFIDENCE_RE.test(text);
}

/**
 * Check if transcript shows the agent read a SKILL.md file.
 */
export function hasSkillRead(transcriptPath) {
  const text = getTranscriptText(transcriptPath);
  if (text === null) return true; // conservative
  return SKILL_READ_RE.test(text);
}

/** Reset cache — for testing */
export function _resetTranscriptCache() {
  _cache = { path: null, data: null };
  _textCache = { path: null, text: null };
}
