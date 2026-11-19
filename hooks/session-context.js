#!/usr/bin/env node
// SessionStart hook: inject git/project context into agent context at session start
// @permissions: exec, fs.read, fs.write
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { readStdinJson, emitResponse } = require('./_lib/hook-io');

const MAX_CONTEXT = 800;
const SNAPSHOT_MAX_AGE_MS = 24 * 3600 * 1000;

/**
 * One line pointing to the newest docs/maps/session-<id>-snapshot.md written by context-save.js.
 *
 * @param {string} cwd - Project root the snapshots live under.
 * @returns {string} The line, or '' when there is no snapshot younger than 24 h (never throws).
 */
function snapshotPointer(cwd) {
  try {
    const dir = path.join(cwd, 'docs', 'maps');
    let newest = null;
    for (const name of fs.readdirSync(dir)) {
      if (!/^session-.+-snapshot\.md$/.test(name)) continue;
      const mtime = fs.statSync(path.join(dir, name)).mtimeMs;
      if (!newest || mtime > newest.mtime) newest = { name, mtime };
    }
    if (!newest) return '';
    const ageMs = Date.now() - newest.mtime;
    if (ageMs >= SNAPSHOT_MAX_AGE_MS) return '';
    const minutes = Math.max(0, Math.round(ageMs / 60000));
    const age = minutes < 60 ? minutes + ' min' : Math.floor(minutes / 60) + ' h';
    return 'Pre-compact snapshot: docs/maps/' + newest.name + ' (' + age + ' ago)';
  } catch (_) {
    return '';
  }
}

readStdinJson((hookInput) => {

  const cwd = hookInput.cwd || process.cwd();
  const parts = [];

  // Check package.json for project name/version
  try {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const name = pkg.name || '';
      const version = pkg.version || '';
      if (name) parts.push('Project: ' + name + (version ? '@' + version : ''));
    }
  } catch (_) { /* silent */ }

  // Git info — all commands silent-fail individually
  const execOpts = { cwd, timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] };

  let branch = '';
  try { branch = execSync('git branch --show-current', execOpts).toString().trim(); } catch (_) { /* not a git repo or git not available */ }

  // If branch is empty, skip all git info (likely not a git repo)
  if (branch) {
    parts.push('Branch: ' + branch);

    let headCommit = '';
    try { headCommit = execSync('git log --oneline -1', execOpts).toString().trim(); } catch (_) { /* silent */ }
    if (headCommit) parts.push('HEAD: ' + headCommit);

    let uncommitted = 0;
    try {
      const status = execSync('git status --porcelain', execOpts).toString().trim();
      if (status) uncommitted = status.split('\n').filter(l => l.trim()).length;
    } catch (_) { /* silent */ }
    if (uncommitted > 0) parts.push('Uncommitted changes: ' + uncommitted + ' files');

    let recentCommits = [];
    try {
      const log = execSync('git log --oneline -5', execOpts).toString().trim();
      if (log) recentCommits = log.split('\n').filter(l => l.trim());
    } catch (_) { /* silent */ }

    if (recentCommits.length > 0) {
      parts.push('Recent commits:\n' + recentCommits.map(c => '- ' + c).join('\n'));
    }
  }

  const snapshotLine = hookInput.source === 'compact' ? snapshotPointer(cwd) : '';

  if (parts.length === 0 && !snapshotLine) process.exit(0);

  let context = parts.join(' | ');
  // If the compact form (before recent commits) is fine, use pipe-separated
  // But recent commits have newlines, so restructure
  const inlineParts = [];
  const blockParts = [];
  for (const p of parts) {
    if (p.includes('\n')) blockParts.push(p);
    else inlineParts.push(p);
  }
  context = inlineParts.join(' | ');
  if (blockParts.length > 0) context += '\n' + blockParts.join('\n');

  const room = Math.max(0, MAX_CONTEXT - (snapshotLine ? snapshotLine.length + 1 : 0));
  if (context.length > room) context = context.substring(0, Math.max(0, room - 3)) + '...';
  if (snapshotLine) context = context ? context + '\n' + snapshotLine : snapshotLine;

  emitResponse({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: context
    }
  });
});
