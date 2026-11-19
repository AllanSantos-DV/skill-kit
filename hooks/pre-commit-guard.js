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
// - git commit: deny when the staged changes add a credential or stage a credential file
// - Write/Edit tools: deny content that carries a credential
// - Most restrictive wins: deny > ask > allow
// - Escape hatch (user-controlled): SKILL_KIT_ALLOW_SECRETS=1 in the environment, or the
//   skill-kit:allow-secret marker on the line itself

'use strict';
const { readStdinJson, emitResponse } = require('./_lib/hook-io');
const { spawnSync } = require('node:child_process');
const credentials = require('./_lib/credential-scan');

// Tool names that carry a shell command. `run_in_terminal`/`Bash` alone left PowerShell
// and other terminal tools completely unguarded, so a destructive command issued through
// them bypassed every rule below. Matched case-insensitively against a known set.
const TERMINAL_TOOLS = new Set([
  'run_in_terminal', 'bash', 'shell', 'powershell', 'terminal',
  'execution_subagent', 'copilot-delegate_run_shell',
]);

// Tools that write file content, and the input keys that carry the text being written.
const WRITE_TOOLS = new Set([
  'write', 'edit', 'multiedit', 'create_file', 'write_file', 'edit_file',
  'replace_string_in_file', 'multi_replace_string_in_file', 'insert_edit_into_file',
]);
const WRITTEN_TEXT_KEYS = ['content', 'new_string', 'newString', 'file_text', 'text', 'new_str', 'insert_text'];

/**
 * Why a `git commit` must not go ahead because of what it records, or '' when it may.
 * Findings name file, line and kind; the secret itself is never printed.
 *
 * @param {string} cwd - Repository directory.
 * @returns {string}
 */
function stagedCredentialReason(cwd) {
  if (credentials.guardDisabled()) return '';
  const review = credentials.reviewStaged(cwd || process.cwd());
  if (!review.ok) return '';
  const parts = review.findings.slice(0, 5).map((f) => f.kind + ' at ' + f.file + ':' + f.line);
  for (const f of review.files.slice(0, 5)) parts.push('credential file staged: ' + f);
  if (!parts.length) return '';
  return 'Staged changes contain credentials (' + parts.join('; ') + '). Unstage them and keep the value in the environment. ' +
    'If it is not a secret, add `' + credentials.ALLOW_MARKER + '` to that line, or the user can set ' + credentials.ALLOW_ENV + '=1.';
}

/**
 * Why a write tool call must be denied, or '' when it may go ahead.
 *
 * @param {object} toolInput - The tool's input payload.
 * @returns {string}
 */
function writeCredentialReason(toolInput) {
  if (credentials.guardDisabled() || !toolInput || typeof toolInput !== 'object') return '';
  const texts = WRITTEN_TEXT_KEYS.map((k) => toolInput[k]).filter((v) => typeof v === 'string');
  for (const e of Array.isArray(toolInput.edits) ? toolInput.edits : []) {
    if (e && typeof e.new_string === 'string') texts.push(e.new_string);
    if (e && typeof e.newString === 'string') texts.push(e.newString);
  }
  const findings = texts.flatMap((t) => credentials.scanText(t));
  if (!findings.length) return '';
  const where = findings.slice(0, 5).map((f) => f.kind + ' at line ' + f.line).join('; ');
  return 'The content being written contains credentials (' + where + '). Keep the value in the environment. ' +
    'If it is not a secret, add `' + credentials.ALLOW_MARKER + '` to that line, or the user can set ' + credentials.ALLOW_ENV + '=1.';
}

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

/**
 * Decide allow/ask/deny for a shell command; the most restrictive sub-command wins.
 *
 * Nothing is executed. The only side effect is a `git status` in `cwd`, and only when a
 * work-loss rule matches.
 *
 * @param {string} cmd - Full command line, possibly chained with ; && ||.
 * @param {string} [cwd] - Directory whose git state decides the work-loss rules.
 * @returns {{decision: string, reasons: string[], matched: boolean, treeDirty: (boolean|null|undefined)}}
 *   `matched` is false when no rule applies (the hook then stays silent).
 *   `treeDirty` is undefined when no rule needed the tree state.
 */
function evaluateCommand(cmd, cwd) {
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
  const dirty = () => (treeDirty === undefined ? (treeDirty = isTreeDirty(cwd)) : treeDirty);

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

    const credentialReason = stagedCredentialReason(cwd);
    if (credentialReason) {
      contexts.push(credentialReason);
      finalDecision = 'deny';
    }
  }

  return { decision: finalDecision, reasons: contexts, matched: hasGitCommand, treeDirty };
}

/**
 * Dry-run of the guard: prints the decision for a command without executing it.
 *
 * @param {string[]} argv - Arguments after the script name.
 * @returns {number} Exit code: 0 whenever a decision was printed (even deny), 2 on usage error.
 */
function runCheck(argv) {
  const command = argv[argv.indexOf('--check') + 1];
  if (!command || command.startsWith('--')) {
    process.stderr.write('usage: node pre-commit-guard.js --check "<command>" [--json]\n');
    return 2;
  }
  const cwd = process.cwd();
  const res = evaluateCommand(command, cwd);
  const tree = res.treeDirty === undefined ? 'not consulted'
    : res.treeDirty === null ? 'unknown' : (res.treeDirty ? 'dirty' : 'clean');
  const reason = res.matched && res.reasons.length ? res.reasons.join('; ') : 'no guard rule matched';
  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ command, cwd, decision: res.decision, reason, tree }) + '\n');
  } else {
    process.stdout.write('decision: ' + res.decision + '\ncwd: ' + cwd + '\ntree: ' + tree + '\nreason: ' + reason + '\n');
  }
  return 0;
}

/**
 * PreToolUse entry point: reads the hook payload from stdin and emits the permission decision.
 *
 * Output schema: hookSpecificOutput.{hookEventName: 'PreToolUse', permissionDecision: allow|deny|ask,
 * permissionDecisionReason?: string, updatedInput?: object}. `additionalContext` is not valid
 * here (it belongs to UserPromptSubmit/SessionStart).
 */
function runHook() {
  readStdinJson((inputJson) => {
    const toolName = String(inputJson.tool_name || '').toLowerCase();
    if (WRITE_TOOLS.has(toolName)) {
      const reason = writeCredentialReason(inputJson.tool_input);
      if (!reason) process.exit(0);
      emitResponse({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
      return;
    }
    if (!TERMINAL_TOOLS.has(toolName)) {
      process.exit(0);
    }

    const cmd = (inputJson.tool_input && inputJson.tool_input.command) || '';
    if (!cmd) process.exit(0);

    const { decision, reasons, matched } = evaluateCommand(cmd, inputJson.cwd);
    if (!matched) process.exit(0);

    const result = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision
      }
    };
    if (reasons.length > 0) {
      result.hookSpecificOutput.permissionDecisionReason = reasons.join('; ');
    }

    emitResponse(result);
  });
}

if (require.main === module) {
  if (process.argv.includes('--check')) process.exit(runCheck(process.argv.slice(2)));
  runHook();
}

module.exports = { evaluateCommand, isTreeDirty, writeCredentialReason };
