#!/usr/bin/env node
// PreToolUse hook: guard destructive commands (supports chained commands)
// - Splits chained commands by ; && || (respecting quoted strings)
// - git commit: deny unless -m with conventional commit message
// - git add -A/./--all and git commit -a: deny (scoped staging — see below)
// - git push/tag: ask user for confirmation
// - git push --force-with-lease: ask (confirmation)
// - git push --force: deny (destructive)
// - git reset --hard / clean -f / checkout -- : deny when the tree is DIRTY, else ask
// - git rebase: ask (history rewrite)
// - git branch -D: ask (force-deletes branch)
// - git stash drop/clear: ask (loses stashed changes)
// - Remove-Item -Recurse -Force: deny (PS equivalent of rm -rf)
// - Destructive filesystem commands (rm -rf, etc.): deny
// - Most restrictive wins: deny > ask > allow

'use strict';
const { readStdinJson, emitResponse } = require('./_lib/hook-io');
const { spawnSync } = require('node:child_process');

// Tool names that carry a shell command. `run_in_terminal`/`Bash` alone left PowerShell
// and other terminal tools completely unguarded, so a destructive command issued through
// them bypassed every rule below. Matched case-insensitively against a known set.
const TERMINAL_TOOLS = new Set([
  'run_in_terminal', 'bash', 'shell', 'powershell', 'terminal',
  'execution_subagent', 'copilot-delegate_run_shell',
]);

/**
 * Is the working tree dirty (uncommitted changes or untracked files)?
 *
 * This is what separates "recoverable" from "destroys work": `git reset --hard` on a clean
 * tree is a no-op, but on a dirty tree it deletes work that exists NOWHERE else — not in
 * the reflog, not in a commit. Same for `clean -fd` and `checkout -- .`.
 *
 * Returns null when git can't answer (not a repo, git missing, timeout). The caller must
 * treat null as "unknown", NOT as clean — guessing clean is what loses work.
 */
function isTreeDirty(cwd) {
  const res = spawnSync('git', ['status', '--porcelain'], {
    cwd: cwd || process.cwd(), encoding: 'utf8', timeout: 3000, windowsHide: true,
  });
  if (!res || res.error || res.status !== 0 || typeof res.stdout !== 'string') { return null; }
  return res.stdout.trim().length > 0;
}

readStdinJson((inputJson) => {

  // Only intercept terminal commands
  const toolName = String(inputJson.tool_name || '');
  if (!TERMINAL_TOOLS.has(toolName.toLowerCase())) {
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
  // Resolved lazily and reused: one `git status` per tool call, not one per sub-command.
  let treeDirty;
  const dirty = () => (treeDirty === undefined ? (treeDirty = isTreeDirty(inputJson.cwd)) : treeDirty);

  /**
   * Escalate a work-destroying command: DENY when the tree is dirty (or when git could not
   * answer), ASK when it is provably clean.
   *
   * `ask` was not enough: the agent reads its own prompt and answers "yes", so the guard
   * became a formality on exactly the operations that delete uncommitted work. On a clean
   * tree there is nothing to lose, so `ask` still applies and the workflow is not blocked.
   */
  const guardWorkLoss = (what) => {
    hasGitCommand = true;
    const d = dirty();
    if (d === false) {
      contexts.push(what + ' — tree is clean, confirm to proceed');
      if (finalDecision !== 'deny') finalDecision = 'ask';
      return;
    }
    contexts.push(d === null
      ? what + ' — DENIED: could not verify the working tree (unknown state is treated as unsafe)'
      : what + ' — DENIED: the working tree has uncommitted work that exists nowhere else. Commit or stash it first.');
    finalDecision = 'deny';
  };

  /**
   * O nome do comando é insensível a maiúsculas; os FLAGS não são.
   *
   * No Windows o shell resolve o executável sem olhar caixa, e o PowerShell também ignora
   * caixa em cmdlet e parâmetro. Medido nesta máquina: `GIT --version` roda, e `RM -RF x`
   * é `Remove-Item`. Como todas as regras abaixo casavam o comando em minúsculo, `RM -RF`
   * atravessava o guard inteiro. Um guard que se desarma com Shift não é um guard.
   *
   * Sobre o subcomando do git, medi antes de afirmar: `git STATUS` responde
   * "'STATUS' is not a git command" — ou seja, `GIT PUSH --force` não empurra nada, o git
   * recusa. Não era buraco explorável, ao contrário do que parecia. Normalizo mesmo assim,
   * por defesa em profundidade: assim o guard não depende de conhecer o parser do git, e o
   * custo de bloquear algo que falharia sozinho é zero.
   *
   * A correção não pode ser um `/i` geral: a caixa dos flags carrega significado e as regras
   * dependem disso. `git branch -D` apaga à força e `-d` recusa apagar branch não mesclada;
   * com `/i` o guard passaria a interromper o `-d`, que é seguro. Por isso normalizo apenas
   * os tokens de COMANDO — executável e, quando é git, o subcomando — nunca os flags.
   */
  const normalizarComando = (s) => {
    let normalizados = 0;
    let ehGit = false;
    return s.replace(/\S+/g, (token) => {
      if (token.startsWith('-')) return token;          // flag: caixa é significativa
      if (normalizados === 0) {                          // executável
        normalizados = 1;
        ehGit = /^git$/i.test(token);
        return token.toLowerCase();
      }
      if (normalizados === 1 && ehGit) {                 // subcomando do git
        normalizados = 2;
        return token.toLowerCase();
      }
      return token;                                      // argumentos: intocados
    });
  };

  for (const original of subCommands) {
    const sub = normalizarComando(original);

    // --- Destructive filesystem commands ---
    // `rd` é o alias do cmd.exe para `rmdir` — mesma destruição de árvore, outro nome.
    // Estava fora da lista, então `rd /s /q` passava enquanto `rmdir /s /q` era negado.
    if (/\brm\s+.*-[rR]/.test(sub) || /\brm\s+-[fF][rR]/.test(sub) || /\brm\s+-[rR][fF]/.test(sub) ||
        /\b(rmdir|rd)\s+\/[sS]/.test(sub) || /\bdel\s+\/[sS]/.test(sub) ||
        /\bformat\s+[a-zA-Z]:/.test(sub) || /\bmkfs\b/.test(sub)) {
      hasGitCommand = true;
      contexts.push('Destructive filesystem command requires confirmation: ' + original);
      finalDecision = 'deny';
      continue;
    }

    // --- Git destructive commands ---
    // git reset --hard
    if (/git\s+(-[^\s]+\s+)*reset\s+--hard/.test(sub)) {
      guardWorkLoss('git reset --hard discards uncommitted changes');
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

    // git clean with -f flag (deletes untracked files — unrecoverable, no reflog)
    if (/git\s+(-[^\s]+\s+)*clean\s+.*-[a-zA-Z]*f/.test(sub)) {
      guardWorkLoss('git clean deletes untracked files (no reflog, unrecoverable)');
      continue;
    }

    // git checkout -- (discards working tree changes)
    if (/git\s+(-[^\s]+\s+)*checkout\s+.*--\s/.test(sub)) {
      guardWorkLoss('git checkout -- discards working tree changes');
      continue;
    }

    // --- Broad staging: the incident guard ---
    // `git add -A` / `git add .` stage EVERYTHING in the repo, including files another
    // session is editing right now. That is not hypothetical: a publish script did exactly
    // this and swallowed a sibling project's work into an unrelated release commit, and
    // carried a review marker along with it, neutralising the review gate.
    // There is no safe "yes" here, so this is a hard deny — the escape is explicit paths.
    if (/git\s+(-[^\s]+\s+)*add\s+(.*\s)?(-A\b|--all\b|\.(\s|$))/.test(sub)) {
      hasGitCommand = true;
      contexts.push('git add -A/. stages files that may belong to another session — DENIED. '
        + 'Stage explicit paths instead: git add <path1> <path2>');
      finalDecision = 'deny';
      continue;
    }

    // `git commit -a` (and `-am`) is the same failure with one fewer step: it stages every
    // tracked modification, so a sibling's edits ride along into your commit.
    if (/git\s+(-[^\s]+\s+)*commit\s+(.*\s)?(-a\b|-am\b|--all\b)/.test(sub)) {
      hasGitCommand = true;
      contexts.push('git commit -a/-am stages every tracked change, including another session\'s — DENIED. '
        + 'Stage explicit paths first: git add <path> && git commit -m "..."');
      finalDecision = 'deny';
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
    //
    // Case-insensitive por natureza do alvo, não por preguiça: no PowerShell o nome do
    // cmdlet E os parâmetros são insensíveis a caixa — `remove-item -recurse -force` apaga
    // exatamente igual a `Remove-Item -Recurse -Force`. Casar só a grafia canônica deixava
    // as outras passarem, e a normalização do executável (que baixa a caixa do primeiro
    // token) fazia até a canônica deixar de casar. É o oposto das regras do git logo acima,
    // onde a caixa do flag carrega significado (`-D` apaga à força, `-d` recusa).
    if (/\b(remove-item|ri|del|erase|rd|rmdir)\b.*-recurse.*-force|\b(remove-item|ri|del|erase|rd|rmdir)\b.*-force.*-recurse/i.test(sub)) {
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
      // `release` and `sync` are this ecosystem's own publish verbs (the marketplace uses
      // `release(<plugin>): x.y.z` and `sync(<plugin>): vX`). Leaving them out made the
      // guard block the very pipeline it ships in.
      if (/^(feat|fix|docs|chore|refactor|test|ci|build|perf|style|revert|release|sync)(\(.+\))?(!)?\:\s+.+/i.test(commitMsg)) {
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

  // PreToolUse output schema:
  //   hookSpecificOutput.hookEventName: 'PreToolUse'           (REQUIRED)
  //   hookSpecificOutput.permissionDecision: allow|deny|ask    (REQUIRED)
  //   hookSpecificOutput.permissionDecisionReason: string      (optional, shown to user)
  //   hookSpecificOutput.updatedInput: object                  (optional, rewrites tool input)
  // `additionalContext` is NOT valid here (it belongs to UserPromptSubmit/SessionStart).
  const result = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: finalDecision
    }
  };
  if (contexts.length > 0) {
    result.hookSpecificOutput.permissionDecisionReason = contexts.join('; ');
  }

  emitResponse(result);
});
