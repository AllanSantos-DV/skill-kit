#!/usr/bin/env node
// SessionStart hook: inject git/project context into agent context at session start
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { readStdinJson, emitResponse } = require('./_lib/hook-io');

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

  if (parts.length === 0) process.exit(0);

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

  // Cap at 800 chars
  if (context.length > 800) context = context.substring(0, 797) + '...';

  emitResponse({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: context
    }
  });
});
