#!/usr/bin/env node
// SessionStart hook: reconcile the semantic lessons namespace with the on-disk
// corpus (~/.copilot/lessons/). Pushes only the delta since the last session
// (new/changed lessons upserted, deleted lessons pruned) using a content
// fingerprint manifest, so the common case (nothing changed) is a no-op and
// costs no tokens. Silent by design — the work is a side effect on the daemon,
// nothing is injected into the agent context.
//
// Fail-open: on any error, or when the daemon is down, it exits 0 and touches
// nothing. It NEVER writes to stdout/stderr.
//
// @permissions: net.fetch, fs.read, fs.write
'use strict';

const { readStdinJson } = require('./_lib/hook-io');
const store = require('./_lib/lessons-store');
const client = require('./_lib/mcp-lessons-client');

function toPositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Short internal deadline so SessionStart never stalls. If a bootstrap ever has
// a large backlog, each run makes granular progress and the next resumes it.
const DEADLINE_MS = Math.max(1500, Math.round(toPositiveNumber(process.env.LESSONS_SYNC_DEADLINE_MS, 4000)));

async function run() {
  const docs = store.loadLessons();
  // Guard: reading zero lessons from disk is almost always a transient/path
  // issue, not "the user deleted all 186". Never mass-prune the namespace on it.
  if (!docs.length) return;

  const prev = store.readSyncManifest();
  const res = await client.syncLessons(docs, prev, { deadlineMs: DEADLINE_MS });
  // Persist progress whenever the manifest actually advanced (even partial), so
  // confirmed upserts/prunes aren't repeated next session.
  if (res && (res.upserted > 0 || res.deleted > 0 || res.completed)) {
    store.writeSyncManifest(res.entries);
  }
}

readStdinJson(() => {
  try {
    run().catch(() => { /* fail-open: never surface sync errors */ });
  } catch (_) { /* fail-open */ }
});
