#!/usr/bin/env node
// PreToolUse hook: guard destructive commands (supports chained commands)
// - Splits chained commands by ; && || (respecting quoted strings)
// - git commit: deny unless -m with conventional commit message
// - git push/tag: ask user for confirmation
// - git push --force-with-lease: ask (confirmation)
// - git push --force: deny (destructive)
// - git reset --hard: ask (recoverable via reflog)
// - git rebase: ask (history rewrite)
// - git clean -f*: ask (routine cleanup)
// - git checkout -- <path>: ask (discards working tree changes)
// - git branch -D: ask (force-deletes branch)
// - git stash drop/clear: ask (loses stashed changes)
// - Remove-Item -Recurse -Force: deny (PS equivalent of rm -rf)
// - Destructive filesystem commands (rm -rf, etc.): deny
// - Most restrictive wins: deny > ask > allow

'use strict';
const { readStdinJson, emitResponse } = require('./_lib/hook-io');

readStdinJson((inputJson) => {

  // Only intercept terminal commands
  if (inputJson.tool_name !== 'run_in_terminal' && inputJson.tool_name !== 'Bash') {
    process.exit(0);
  }

  const cmd = (inputJson.tool_input && inputJson.tool_input.command) || '';
  if (!cmd) process.exit(0);

  // Split chained commands by ; && || (respecting quoted strings)
  const subCommands = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === "'" && !inDouble) { inSingle = !inSingle; }
    else if (c === '"' && !inSingle) { inDouble = !inDouble; }
    else if (!inSingle && !inDouble) {
      if (c === ';') {
        subCommands.push(current.trim());
        current = '';
        continue;
      }
      if (c === '&' && i + 1 < cmd.length && cmd[i + 1] === '&') {
        subCommands.push(current.trim());
        current = '';
        i++;
        continue;
      }
      if (c === '|' && i + 1 < cmd.length && cmd[i + 1] === '|') {
        subCommands.push(current.trim());
        current = '';
        i++;
        continue;
      }
    }
    current += c;
  }
  if (current.trim()) subCommands.push(current.trim());

  let finalDecision = 'allow';
  const contexts = [];
  let hasGitCommand = false;

  for (const sub of subCommands) {
    // --- Destructive filesystem commands ---
    if (/\brm\s+.*-[rR]/.test(sub) || /\brm\s+-[fF][rR]/.test(sub) || /\brm\s+-[rR][fF]/.test(sub) ||
        /\brmdir\s+\/[sS]/.test(sub) || /\bdel\s+\/[sS]/.test(sub) ||
        /\bformat\s+[a-zA-Z]:/.test(sub) || /\bmkfs\b/.test(sub)) {
      hasGitCommand = true;
      contexts.push('Destructive filesystem command requires confirmation: ' + sub);
      finalDecision = 'deny';
      continue;
    }

    // --- Git destructive commands ---
    // git reset --hard
    if (/git\s+(-[^\s]+\s+)*reset\s+--hard/.test(sub)) {
      hasGitCommand = true;
      contexts.push('git reset --hard discards uncommitted changes — requires confirmation');
      if (finalDecision !== 'deny') finalDecision = 'ask';
      continue;
    }

    // git push --force-with-lease (safer variant — ask)
    if (/git\s+(-[^\s]+\s+)*push\s+.*--force-with-lease/.test(sub)) {
      hasGitCommand = true;
      contexts.push('git push --force-with-lease requires confirmation');
      if (finalDecision !== 'deny') finalDecision = 'ask';
      continue;
    }

    // git push --force (destructive — deny)
    if (/git\s+(-[^\s]+\s+)*push\s+.*--force/.test(sub)) {
      hasGitCommand = true;
      contexts.push('git push --force rewrites remote history — denied');
      finalDecision = 'deny';
      continue;
    }

    // git rebase (interactive or not)
    if (/git\s+(-[^\s]+\s+)*rebase\b/.test(sub)) {
      hasGitCommand = true;
      contexts.push('git rebase rewrites history — requires confirmation');
      if (finalDecision !== 'deny') finalDecision = 'ask';
      continue;
    }

    // git clean with -f flag (routine cleanup — ask)
    if (/git\s+(-[^\s]+\s+)*clean\s+.*-[a-zA-Z]*f/.test(sub)) {
      hasGitCommand = true;
      contexts.push('git clean removes untracked files — requires confirmation');
      if (finalDecision !== 'deny') finalDecision = 'ask';
      continue;
    }

    // git checkout -- (discards working tree changes)
    if (/git\s+(-[^\s]+\s+)*checkout\s+.*--\s/.test(sub)) {
      hasGitCommand = true;
      contexts.push('git checkout -- discards working tree changes — requires confirmation');
      if (finalDecision !== 'deny') finalDecision = 'ask';
      continue;
    }

    // git branch -D (force delete) — case sensitive
    if (/git\s+(-[^\s]+\s+)*branch\s+.*-D/.test(sub)) {
      hasGitCommand = true;
      contexts.push('git branch -D force-deletes a branch — requires confirmation');
      if (finalDecision !== 'deny') finalDecision = 'ask';
      continue;
    }

    // git stash drop / git stash clear
    if (/git\s+(-[^\s]+\s+)*stash\s+(drop|clear)\b/.test(sub)) {
      hasGitCommand = true;
      contexts.push('git stash drop/clear loses stashed changes — requires confirmation');
      if (finalDecision !== 'deny') finalDecision = 'ask';
      continue;
    }

    // Remove-Item -Recurse -Force (PowerShell equivalent of rm -rf)
    if (/\b(Remove-Item|ri|del|erase|rd|rmdir)\b.*-Recurse.*-Force|\b(Remove-Item|ri|del|erase|rd|rmdir)\b.*-Force.*-Recurse/.test(sub)) {
      hasGitCommand = true;
      contexts.push('Remove-Item -Recurse -Force is destructive — denied');
      finalDecision = 'deny';
      continue;
    }

    const gitMatch = sub.match(/git\s+(-[^\s]+\s+)*(commit|push|tag)\b/);
    if (!gitMatch) continue;
    hasGitCommand = true;
    const action = gitMatch[2];

    if (action === 'push') {
      contexts.push('git push requires user confirmation');
      if (finalDecision !== 'deny') finalDecision = 'ask';
      continue;
    }

    if (action === 'tag') {
      contexts.push('git tag requires user confirmation');
      if (finalDecision !== 'deny') finalDecision = 'ask';
      continue;
    }

    // git commit — check for conventional commit message
    const msgMatch = sub.match(/-a?m\s+["'](.+?)["']/) || sub.match(/-a?m\s+(\S+)/);
    if (msgMatch) {
      const commitMsg = msgMatch[1];
      if (/^(feat|fix|docs|chore|refactor|test|ci|build|perf|style|revert)(\(.+\))?(!)?\:\s+.+/i.test(commitMsg)) {
        // valid conventional commit — allow (don't override higher restriction)
      } else {
        contexts.push('Commit message must follow conventional commits pattern (e.g. feat: add feature, fix(scope): description)');
        finalDecision = 'deny';
      }
    } else {
      contexts.push('Commit must include -m with a conventional commit message');
      finalDecision = 'deny';
    }
  }

  // No git commands found — passthrough
  if (!hasGitCommand) process.exit(0);

  const result = {
    hookSpecificOutput: {
      permissionDecision: finalDecision
    }
  };
  if (contexts.length > 0) {
    const contextText = contexts.join('; ');
    result.hookSpecificOutput.additionalContext = contextText;
    result.hookSpecificOutput.permissionDecisionReason = contextText;
  }

  emitResponse(result);
});
