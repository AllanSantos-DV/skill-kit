#!/usr/bin/env node
// UserPromptSubmit hook: inject SEMANTICALLY relevant lessons into agent context.
//
// Replaces the old keyword/tag matcher (blind, high false-positive, injected up
// to 10 lessons on a coarse word overlap) with embedding-based recall via the
// local mcp-memory daemon: the user's prompt is matched by MEANING against the
// lessons stored in the fixed "__lessons__" namespace, and only the few above a
// relevance threshold are injected.
//
// Fail-open by construction: if the daemon is down, slow, or the namespace is
// empty, nothing is injected and the turn proceeds normally. The hook writes
// ONLY its final JSON envelope to stdout — never diagnostics.
//
// @permissions: net.fetch, fs.read
'use strict';
const { readStdinJson, emitResponse } = require('./_lib/hook-io');
const lessons = require('./_lib/mcp-lessons-client');

function toPositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Tunable without editing code (used by config/tests). All clamped to sane
// bounds so a stray/hostile env value can't hammer the daemon or silently
// disable recall on a hook that runs every prompt.
//
// MIN_SCORE default 0.68 is empirically calibrated (E2E against bge-m3 + the
// real 186-lesson corpus): genuine task queries score their target at 0.72-0.85,
// while trivial acknowledgements ("ok", "obrigado", "sim") top out at ~0.645.
// 0.68 sits in that clean valley — real prompts inject their target(s), trivial
// ones inject nothing. bge-m3 cosine scores are compressed into ~[0.5, 0.85],
// so a low threshold (e.g. 0.4) would inject blind noise on every prompt.
const TOP_K = Math.min(20, Math.max(1, Math.round(toPositiveNumber(process.env.LESSON_INJECTOR_TOPK, 5))));
const RAW_MIN = toPositiveNumber(process.env.LESSON_INJECTOR_MINSCORE, 0.68);
const MIN_SCORE = RAW_MIN > 0 && RAW_MIN <= 1 ? RAW_MIN : 0.68; // scores are cosine in (0,1]
const DEADLINE_MS = Math.max(1000, Math.round(toPositiveNumber(process.env.LESSON_INJECTOR_DEADLINE_MS, 4000)));

/** Pull the user's prompt text out of the (multi-shape) hook input. */
function extractPrompt(hookInput) {
  if (!hookInput || typeof hookInput !== 'object') return null;
  if (typeof hookInput.chatMessage === 'string' && hookInput.chatMessage) return hookInput.chatMessage;
  if (typeof hookInput.user_message === 'string' && hookInput.user_message) return hookInput.user_message;
  if (typeof hookInput.prompt === 'string' && hookInput.prompt) return hookInput.prompt;
  if (typeof hookInput.message === 'string' && hookInput.message) return hookInput.message;
  const d = hookInput.data;
  if (d && typeof d === 'object') {
    if (typeof d.chatMessage === 'string' && d.chatMessage) return d.chatMessage;
    if (typeof d.user_message === 'string' && d.user_message) return d.user_message;
    if (typeof d.prompt === 'string' && d.prompt) return d.prompt;
    if (typeof d.message === 'string' && d.message) return d.message;
  }
  return null;
}

async function run(userPrompt) {
  try {
    const items = await lessons.searchLessons(userPrompt, { topK: TOP_K, minScore: MIN_SCORE, deadlineMs: DEADLINE_MS });
    const context = lessons.formatLessonsContext(items);
    if (context) {
      emitResponse({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } });
    }
  } catch (_) {
    // Fail-open: never let a hook error surface to the agent/user.
    return;
  }
  // No process.exit: let the loop drain naturally so stdout is flushed.
}

/**
 * Dry-run: prints the candidate pool for a text with its score and whether the cut would inject it.
 * Unlike the hook, it fails loud so a broken recall is visible.
 *
 * @param {string[]} argv - Arguments after the script name.
 * @returns {Promise<number>} 0 printed, 1 recall unavailable, 2 usage error.
 */
async function runCheck(argv) {
  const text = argv[argv.indexOf('--check') + 1];
  if (!text || text.startsWith('--')) {
    process.stderr.write('usage: node lesson-injector.js --check "<text>" [--json]\n');
    return 2;
  }
  const { status, pool } = await lessons.searchLessonPool(text, { topK: TOP_K, deadlineMs: DEADLINE_MS });
  if (status !== 'ok') {
    process.stderr.write('lesson recall unavailable: ' + status + (status === 'no-daemon' ? ' (no mcp-memory daemon registered)' : '') + '\n');
    return 1;
  }
  let injected = 0;
  const candidates = pool.map((r) => {
    const inject = r.score >= MIN_SCORE && injected < TOP_K;
    if (inject) injected++;
    return { id: String(r.id || '').replace(/^lesson:/, ''), name: r.name || '', score: r.score, inject };
  });
  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ minScore: MIN_SCORE, topK: TOP_K, candidates }) + '\n');
    return 0;
  }
  const out = ['cut: ' + MIN_SCORE + ' (top ' + TOP_K + '), ' + candidates.length + ' candidate(s), ' + injected + ' would be injected'];
  for (const c of candidates) {
    out.push('  ' + c.score.toFixed(2) + '  ' + (c.id || '-') + '  ' + (c.inject ? 'inject' : 'below cut') + '  ' + c.name);
  }
  process.stdout.write(out.join('\n') + '\n');
  return 0;
}

if (process.argv.includes('--check')) {
  runCheck(process.argv.slice(2)).then((code) => { process.exitCode = code; });
} else readStdinJson((hookInput) => {
  const userPrompt = extractPrompt(hookInput);
  if (!userPrompt) return; // nothing to match — exit 0 naturally
  run(userPrompt);
});
