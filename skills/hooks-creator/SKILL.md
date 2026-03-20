---
name: hooks-creator
description: "**WORKFLOW SKILL** — Create and configure agent hooks for VS Code Copilot and Claude Code. USE FOR: creating hook scripts, configuring lifecycle hooks (SessionStart, PreToolUse, PostToolUse, Stop), adding hooks to agent frontmatter, cross-platform hook scripts, security best practices. DO NOT USE FOR: general coding, creating agents (use agent-creator), creating skills (use skill-creator)."
argument-hint: Describe what the hook should enforce or automate
license: MIT
---

# Hooks Creator — Complete Guide to Agent Lifecycle Hooks

You are an expert at creating and configuring lifecycle hooks for AI agents. When the user asks you to create a hook, follow this guide to produce a complete, cross-platform, well-structured hook configuration.

## What are Hooks?

Hooks are **deterministic shell commands** executed at specific lifecycle events during an agent session. Unlike instructions (which are non-deterministic — the agent may or may not follow them), hooks **guarantee execution**. They run as real processes, receive structured JSON input via stdin, and return structured JSON output via stdout. Use hooks when you need certainty: enforcement, logging, validation, or context injection that must happen every time.

## Platform Detection

Before creating hooks, determine the target platform:

| Signal | Platform | Hook Support |
|--------|----------|-------------|
| `.agent.md` in workspace | VS Code Copilot | 8 events, `command` type only |
| `.claude/` directory exists | Claude Code | 20 events, 4 hook types |
| Both present | Hybrid | Use `.claude/settings.json` (read by both) |

**Detection strategy**: Check for `.agent.md` files in `.github/agents/` or workspace root, check for `.claude/` directory, inspect `settings.json` patterns. If the platform is unclear, **ask the user** — don't assume.

## Lifecycle Events

Complete event table across platforms:

| Event | VS Code | Claude Code | Trigger |
|-------|:-------:|:-----------:|---------|
| SessionStart | ✅ | ✅ | First prompt of session |
| UserPromptSubmit | ✅ | ✅ | User sends message |
| PreToolUse | ✅ | ✅ | Before any tool invocation |
| PostToolUse | ✅ | ✅ | After tool completes |
| PreCompact | ✅ | ✅ | Before context compaction |
| SubagentStart | ✅ | ✅ | Subagent created |
| SubagentStop | ✅ | ✅ | Subagent completes |
| Stop | ✅ | ✅ | Session ends |
| PermissionRequest | ❌ | ✅ | Tool needs permission |
| PostToolUseFailure | ❌ | ✅ | Tool fails |
| Notification | ❌ | ✅ | Status notification |
| TaskCompleted | ❌ | ✅ | Task finishes |
| Others (6 more) | ❌ | ✅ | Various |

When targeting VS Code only, use the 8 shared events. When targeting Claude Code or hybrid, the full 20 events are available.

## Configuration Locations

| Location | Scope | Platform |
|----------|-------|----------|
| `.github/hooks/*.json` | Workspace (shared with team) | VS Code |
| `.agent.md` frontmatter `hooks:` | Agent-specific | VS Code (requires `chat.useCustomAgentHooks: true`) |
| `.claude/settings.json` | Workspace | Claude Code + VS Code |
| `~/.claude/settings.json` | User global | Claude Code + VS Code |

**Scope rules:**
- Hooks are **per-workspace** — they only apply inside the project where they are configured. Other workspaces are unaffected.
- VS Code has no global hooks path for **workspace hooks** (`.github/hooks/`). To reuse those across projects, copy the files or use a template repo.
- Claude Code supports `~/.claude/settings.json` as a **user-global** hook location — hooks defined there apply to all projects.

**Global vs workspace scripts for agent-scoped hooks:**
- Agent-scoped hooks (frontmatter) reference **shell scripts by path**. If the scripts live inside the workspace (e.g., `.github/hooks/scripts/`), they only work in that workspace.
- **Recommended for portable agents**: store hook scripts in a **global user directory** (e.g., `~/.copilot/hooks/scripts/`) and reference them with portable paths:
  - **bash/macOS/Linux**: `bash ~/.copilot/hooks/scripts/<script>.sh` — `~` expands at runtime
  - **Windows**: `powershell -ExecutionPolicy Bypass -File "%USERPROFILE%\.copilot\hooks\scripts\<script>.ps1"` — `%USERPROFILE%` is expanded by `cmd.exe` (the shell VS Code uses to spawn hooks on Windows), and `-File` preserves stdin passthrough
- This way, agents synced to any workspace always find their hook scripts. No per-workspace setup needed.
- **Workspace hooks** (`.github/hooks/*.json`) should keep scripts inside the project — they are project-specific by nature (e.g., injecting git context).

**`chat.useCustomAgentHooks` setting:**
- This setting **only enables/disables** the agent-scoped hooks feature — it does NOT create or define any hooks.
- Hooks are defined in `.github/hooks/*.json` (workspace) and `.agent.md` frontmatter (agent-scoped). The setting just controls whether VS Code reads the frontmatter hooks.
- Recommended: set it **once in User Settings (global)** so it applies to all workspaces automatically — avoids repeating it in every `.vscode/settings.json`.

**Precedence**: Agent-scoped hooks (frontmatter) run in addition to workspace hooks (`.github/hooks/`). They do NOT replace each other — both execute.

## Multiple Hooks Behavior

When multiple hooks are defined for the same event (either multiple entries in the array, or workspace + agent-scoped):

- **All hooks execute** — no short-circuit. Even if hook 1 returns `deny`, hook 2 still runs.
- **Most restrictive wins**: `deny` > `ask` > `allow`. If any hook denies, the tool call is denied.
- **Independent evaluation**: each hook receives the original tool input. One hook's output does NOT affect another hook's input.
- **Synchronous execution** (VS Code): hooks run sequentially, not in parallel. The agent waits for each to complete.
- **Additive across scopes**: agent-scoped hooks run IN ADDITION TO workspace hooks — they don't replace each other.

| Hook A | Hook B | Result |
|--------|--------|--------|
| allow  | allow  | allow  |
| allow  | deny   | deny   |
| allow  | ask    | ask    |
| deny   | ask    | deny   |
| deny   | deny   | deny   |

**Implication**: A security hook that returns `deny` cannot be overridden by another hook returning `allow`. This makes `deny` hooks reliable safety nets.

## Hook Configuration Format

### VS Code JSON (workspace hooks in `.github/hooks/`)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "type": "command",
        "command": "./scripts/format.sh",
        "windows": "powershell -File scripts\\format.ps1",
        "timeout": 15
      }
    ]
  }
}
```

### Agent Frontmatter (agent-scoped hooks)

```yaml
hooks:
  PostToolUse:
    - type: command
      command: "./scripts/format.sh"
      windows: "powershell -File scripts\\format.ps1"
```

**Field reference:**

| Field | Required | Description |
|-------|----------|-------------|
| `type` | Yes | Hook type. VS Code supports `command` only. |
| `command` | Yes | Shell command (Linux/macOS default). |
| `windows` | No | Windows override command. **Always provide this.** |
| `timeout` | No | Max seconds before the hook is killed. Default varies by platform. |

## Input/Output Contract

Hooks receive JSON via **stdin** and return JSON via **stdout**.

### Exit Codes

| Code | Meaning | Behavior |
|------|---------|----------|
| `0` | Success | stdout parsed as JSON |
| `2` | Blocking error | stderr content → agent feedback |
| Other | Warning | Non-blocking, hook output ignored |

### Key Input Fields

| Field | Type | Description |
|-------|------|-------------|
| `tool_name` | string | Name of the tool being invoked (PreToolUse/PostToolUse) |
| `tool_input` | object | Arguments passed to the tool |
| `hookEventName` | string | Which lifecycle event triggered this hook |
| `sessionId` | string | Current session identifier |
| `cwd` | string | Current working directory |

### Key Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `continue` | bool | Whether the agent should proceed |
| `stopReason` | string | Why the hook stopped execution |
| `systemMessage` | string | Message injected into agent context |
| `hookSpecificOutput` | object | Event-specific data (wrapped output) |

### What Reaches the Agent vs. UI-Only

Not all output mechanisms inject content into the agent's context. Some only display warnings in the VS Code UI that the user sees but the agent does not.

| Mechanism | Agent sees it? | Use case |
|-----------|:--------------:|----------|
| `hookSpecificOutput.additionalContext` | ✅ Yes | Inject context (SessionStart, PreToolUse, PostToolUse, SubagentStart) |
| `hookSpecificOutput.decision: "block"` + `reason` | ✅ Yes | Force agent to act before stopping (workspace Stop, PostToolUse) |
| Top-level `decision: "block"` + `reason` | ✅ Yes | Force agent to act before stopping (SubagentStop, custom agent Stop) |
| `hookSpecificOutput.permissionDecision` + `additionalContext` | ✅ Yes | Control tool approval with context (PreToolUse) |
| Exit code `2` + stderr | ✅ Yes | Block operation, stderr shown to model (any event) |
| `systemMessage` (top-level) | ❌ No — UI only | Visual warning for the user |
| `continue: false` + `stopReason` | ❌ No — UI only | Stop session, reason shown to user |

**Critical implication**: If you want the agent to react to a Stop hook message (e.g., "run tests before finishing"), use `hookSpecificOutput.decision: "block"` with `reason` — NOT `systemMessage`. The `systemMessage` field only shows a warning banner in the VS Code chat UI; the agent never sees it.

### PreToolUse-Specific Output

| Field | Type | Description |
|-------|------|-------------|
| `permissionDecision` | string | See values below |
| `updatedInput` | object | Modified tool arguments |
| `additionalContext` | string | Extra context for the agent |

**`permissionDecision` values:**

| Value | Behavior |
|-------|----------|
| `"allow"` | Auto-approve the tool call — no user prompt |
| `"deny"` | Block the tool call. Agent receives `additionalContext` and must adapt. |
| `"ask"` | VS Code shows a confirmation prompt to the user. If user approves, tool executes. If user denies, tool is blocked. |

> **⚠️ PreToolUse fields (`permissionDecision`, `updatedInput`, `additionalContext`) MUST be inside `hookSpecificOutput`.** Placing them at the JSON top-level causes VS Code to silently ignore the output — the tool call proceeds as if no hook existed. This is the most common PreToolUse hook bug.
>
> ```json
> // ❌ WRONG — VS Code ignores these fields at top-level
> {
>   "permissionDecision": "deny",
>   "additionalContext": "reason"
> }
>
> // ✅ CORRECT — fields inside hookSpecificOutput
> {
>   "hookSpecificOutput": {
>     "permissionDecision": "deny",
>     "additionalContext": "reason"
>   }
> }
> ```

### Stop-Specific Output

| Field | Type | Description |
|-------|------|-------------|
| `decision` | string | `"block"` — prevents the agent from stopping |
| `reason` | string | Required when decision is "block". Tells the agent why it should continue |

> **⚠️ Custom agent Stop hooks are treated as SubagentStop.** When a Stop hook is scoped to a custom agent (defined in `.agent.md` frontmatter), VS Code treats it as a `SubagentStop` event. The SubagentStop format expects `decision` and `reason` at the **JSON top-level**, not inside `hookSpecificOutput`. If you only put them inside `hookSpecificOutput`, the hook fires but the agent **ignores the output** — the block instruction never reaches the agent's context.
>
> **Best practice:** Always output `decision`/`reason` at **both** top-level AND inside `hookSpecificOutput`. This ensures the hook works whether VS Code routes it as Stop or SubagentStop:
>
> ```json
> {
>   "decision": "block",
>   "reason": "Run tests before finishing.",
>   "hookSpecificOutput": {
>     "hookEventName": "Stop",
>     "decision": "block",
>     "reason": "Run tests before finishing."
>   }
> }
> ```

> **⚠️ Agents with ONLY `Stop` hooks (no `PreToolUse`) crash as subagents.** When an agent defines `hooks:` with only `Stop` events and no `PreToolUse`, invoking it via `runSubagent` crashes with `Cannot read properties of undefined (reading 'length')`. **Workaround:** Always include at least one `PreToolUse` hook entry. For read-only agents, use a no-op guard (e.g., `pre-commit-guard` which only fires on destructive operations).

> **⚠️ `systemMessage` is UI-only — the agent never sees it.** It displays a warning banner in the chat for the user. If you need the agent to act on a Stop hook, use `decision: "block"` with `reason` — this IS injected into the agent's context. Putting `systemMessage` inside `hookSpecificOutput` is never valid — it's not a recognized field there and causes unintended blocking.

## Cross-Platform Scripts

Always provide both `command` (Linux/macOS default) and `windows` override for portability:

```json
{
  "type": "command",
  "command": "bash ./hooks/my-hook.sh",
  "windows": "powershell -ExecutionPolicy Bypass -File hooks\\my-hook.ps1"
}
```

### Windows Quoting — Critical

The `windows:` field passes through multiple escaping layers. Getting this wrong causes PowerShell errors.

**For workspace hooks (JSON config):** Simple — use `-File` for relative paths:
```json
"windows": "powershell -ExecutionPolicy Bypass -File .github\\hooks\\scripts\\my-hook.ps1"
```

**For global scripts (agent frontmatter YAML):** Use `-Command` with `$HOME`:
```yaml
windows: "powershell -NoProfile -ExecutionPolicy Bypass -Command \"& '$HOME\\.copilot\\hooks\\scripts\\my-hook.ps1'\""
```

After YAML parsing, this becomes:
```
powershell -NoProfile -ExecutionPolicy Bypass -Command "& '$HOME\.copilot\hooks\scripts\my-hook.ps1'"
```

**Why `-Command` with `$HOME`?**
- `-Command "& '...'"` correctly passes piped stdin to the script — `$input` and `[Console]::In.ReadToEnd()` both work (tested 2026-03-17).
- `$HOME` is a PowerShell automatic variable that resolves at runtime to the user's home directory.
- `%USERPROFILE%` is NOT expanded by PowerShell (VS Code calls PowerShell directly, not via `cmd.exe`).
- `-File` treats `$HOME` as literal text, so it cannot resolve variable paths.

> **⚠️ YAML ESCAPE TRAP**: In YAML double-quoted strings, `\v` is a valid escape sequence (vertical tab). If a script name starts with `v` (e.g., `verify-claims`), the path `\scripts\verify-claims.ps1` becomes `\scripts` + vertical-tab + `erify-claims.ps1`. **Fix:** double-escape with `\\v` in the YAML source → `\\verify-claims.ps1`. The same applies to any YAML escape: `\n`, `\t`, `\b`, `\f`, `\r`, `\e`, `\a`, `\0`.

| Context | Recommended Pattern |
|---------|-------------------|
| JSON config, relative path | `powershell -ExecutionPolicy Bypass -File scripts\\my-hook.ps1` |
| JSON config, global path | `powershell -NoProfile -ExecutionPolicy Bypass -Command "& '$HOME\\.copilot\\hooks\\scripts\\my-hook.ps1'"` |
| YAML frontmatter, global path | `"powershell -NoProfile -ExecutionPolicy Bypass -Command \"& '$HOME\\.copilot\\hooks\\scripts\\my-hook.ps1'\""` |

**Rules:**
- Bash scripts: always start with `#!/bin/bash`
- PowerShell scripts: read stdin with the pipeline-then-console fallback (see below)
- Bash scripts: use `INPUT=$(cat 2>/dev/null || true)` then prefer `jq` for JSON parsing with `grep`/`sed` as fallback (jq may not be installed everywhere):
  ```bash
  if command -v jq &>/dev/null; then
    TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
  else
    TOOL=$(echo "$INPUT" | grep -o '"tool_name"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
  fi
  ```
- Always test both platforms when possible

## VS Code Matcher Workaround

**CRITICAL**: VS Code currently ignores matchers in hook configuration. To filter by tool name, you must filter **inside the script**.

### Bash

```bash
#!/bin/bash
INPUT=$(cat 2>/dev/null || true)
TOOL=$(echo "$INPUT" | grep -o '"tool_name"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
# Only run for file edits
if [[ "$TOOL" != "replace_string_in_file" && "$TOOL" != "create_file" && "$TOOL" != "multi_replace_string_in_file" ]]; then
  exit 0
fi
# ... actual hook logic
```

### PowerShell

```powershell
$rawInput = @($input) -join "`n"
if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
$input_json = $rawInput | ConvertFrom-Json
$tool = $input_json.tool_name
if ($tool -notin @('replace_string_in_file', 'create_file', 'multi_replace_string_in_file')) {
    exit 0
}
# ... actual hook logic
```

This pattern is essential for any hook that should only trigger on specific tools.

## Common Patterns

Ready-to-use recipes (see `references/examples.md` for complete implementations):

| Pattern | Event | Purpose |
|---------|-------|---------|
| Auto-format after edit | PostToolUse | Run prettier/eslint after file changes |
| Project context injection | SessionStart | Feed project info to agent at start |
| Block dangerous commands | PreToolUse | Prevent rm -rf, DROP TABLE, etc. |
| Task completion reminder | Stop | Remind agent to produce task map |
| Subagent audit | SubagentStart | Log which subagent was invoked |
| Output format enforcement | Stop | Remind of required output template |
| Conditional git guard | PreToolUse | Different decisions per git action (commit/push/tag) |

## Conditional Hook Logic

When a hook needs different decisions for different scenarios, implement decision tree logic **inside the script** rather than using multiple hooks (since multiple hooks aggregate with "most restrictive wins", they can't implement priority/fallback logic).

Example: git guard with conventional commit validation:
- `git commit` + conventional message → `allow`
- `git commit` + bad message → `deny`
- `git push` / `git tag` → `ask` (user confirmation)

### PowerShell pattern (abbreviated)

```powershell
# Extract git action from regex match
$gitAction = $Matches[2]  # commit, push, or tag

if ($gitAction -eq 'push' -or $gitAction -eq 'tag') {
    # Ask user for confirmation
    @{ hookSpecificOutput = @{ permissionDecision = "ask"; additionalContext = "git $gitAction requires user confirmation" } } | ConvertTo-Json -Depth 3 | Write-Output
    exit 0
}

# git commit — validate message pattern
if ($cmd -match '-m\s+["\x27](.+?)["\x27]') {
    $msg = $Matches[1]
    if ($msg -match '^(feat|fix|docs|chore|refactor|test|ci|build|perf|style)(\(.+\))?(!)?\.?\:\s+.+') {
        @{ hookSpecificOutput = @{ permissionDecision = "allow" } } | ConvertTo-Json -Depth 3 | Write-Output
    } else {
        @{ hookSpecificOutput = @{ permissionDecision = "deny"; additionalContext = "Commit must follow conventional commits" } } | ConvertTo-Json -Depth 3 | Write-Output
    }
} else {
    @{ hookSpecificOutput = @{ permissionDecision = "deny"; additionalContext = "Commit must include -m with message" } } | ConvertTo-Json -Depth 3 | Write-Output
}
```

Key insight: a single script with branching logic is more expressive than multiple hooks, because multiple hooks can only **tighten** permissions (most restrictive wins), never **loosen** them.

## Security Best Practices

| ❌ Don't | ✅ Do |
|----------|-------|
| Hardcode secrets in hook scripts | Use environment variables |
| Trust `tool_input` without validation | Sanitize and quote all inputs |
| Run hooks from untrusted repos without review | Audit hook scripts before use |
| Allow agent to edit hook scripts | Set `chat.tools.edits.autoApprove` to require manual approval |

Hook scripts run with **the user's permissions**. A malicious hook in a cloned repo could exfiltrate data, modify files, or run arbitrary commands. Always review hook scripts from external sources.

## Common Pitfalls

| ❌ Pitfall | ✅ Fix |
|-----------|--------|
| Forgetting `windows:` override | Always provide cross-platform commands |
| Stop hook infinite loop (hook prevents stop → agent retries → hook prevents again) | Check `stop_hook_active` flag and exit 0 if true |
| Hook returning non-JSON to stdout | Return valid JSON or nothing (exit 0) |
| Assuming matchers work in VS Code | Filter `tool_name` inside the script |
| Hook script not executable on Linux | Run `chmod +x` on bash scripts |
| Long-running hooks blocking the agent | Set appropriate `timeout` values |
| Agent-scoped hooks not working | Enable `chat.useCustomAgentHooks: true` in VS Code User Settings (global) |
| Using `-File` with `$HOME` variable paths | `-File` treats `$HOME` literally — use `-Command "& '...'"` with `$HOME` instead |
| YAML `\v` escape in script paths | In double-quoted YAML, `\v` = vertical tab. Script names starting with `v` (e.g., `verify-claims`) need `\\v` escaping: `\\verify-claims.ps1`. Same for `\n`, `\t`, `\b`, `\f`, `\r`, `\e`, `\a` |
| Marker file for "retry guard" hooks | Marker auto-bypass lets agent pass on 2nd attempt without real verification — always block, let the agent demonstrate compliance |
| Claude Code terminal tool is `Bash`, not `run_in_terminal` | Check for both: `$tool -notin @('Bash', 'run_in_terminal')` |
| `INPUT=$(cat)` hanging if stdin empty | Use `INPUT=$(cat 2>/dev/null || true)` |
| PreToolUse fields at JSON top-level | Wrap in `hookSpecificOutput` — VS Code ignores top-level PreToolUse fields |
| Stop hook `decision`/`reason` only inside `hookSpecificOutput` for custom agents | VS Code treats custom agent Stop hooks as SubagentStop — needs `decision`/`reason` at **top-level**. Always output at both levels for safety |
| Claude hooks bleeding into VS Code Copilot sessions | `chat.useClaudeHooks: true` in VS Code imports ALL hooks from `~/.claude/settings.json` as global hooks — they fire for every agent, ignoring agent scoping. If hooks are already in agent frontmatter, set `chat.useClaudeHooks: false` to avoid duplication and unscoped blocking. **Tell the user** to check this setting if they report hooks firing from unexpected agents. |
| PS 7-only syntax in hook scripts | Windows ships with PS 5.1 (Windows PowerShell). Avoid: `` `u{XXXX} `` (Unicode escape — PS7+), `$var = if (...) {} else {}` (ternary assignment — PS7+), `??` and `?.` (null-coalescing — PS7+). Use instead: `[char]::ConvertFromUtf32(0xXXXX)`, `if (...) { $var = ... } else { $var = ... }`, explicit null checks. Use `[Environment]::NewLine` instead of backtick-n in complex string concatenation. |

## Claude Code vs Copilot — Key Differences for Hook Scripts

When creating hooks that work on both platforms, be aware of these differences:

| Aspect | VS Code Copilot | Claude Code |
|--------|----------------|-------------|
| Terminal tool name | `run_in_terminal` | `Bash` (also accepts `run_in_terminal`) |
| Stop hook enforcement | For **workspace hooks** (`.github/hooks/`): `hookSpecificOutput.decision: "block"` + `reason`. For **custom agent hooks** (frontmatter): output `decision`/`reason` at **top-level** (SubagentStop format) — VS Code treats agent-scoped Stop as SubagentStop. **Best practice:** always include both top-level AND `hookSpecificOutput` for compatibility. Top-level `systemMessage` — rendered as warning in UI only (agent does NOT see it). | `decision: "block"` — blocks the agent from stopping |
| Windows config field | `windows:` in JSON/YAML | `command_win32` in `hooks-config.json` (not officially documented) |
| Global hooks location | `~/.copilot/hooks/scripts/` | `~/.claude/hooks-scripts/` |
| Matcher support | Ignored — filter inside script | Supported (regex on tool_name) |
| Hook import setting | `chat.useClaudeHooks` — when `true`, imports `~/.claude/settings.json` hooks as **global** (not agent-scoped). Default: `false` | N/A — Claude Code uses its own `~/.claude/settings.json` natively |

**Tool name check pattern** (handles both platforms):
```bash
# Bash
if [ "$TOOL" != "Bash" ] && [ "$TOOL" != "run_in_terminal" ]; then exit 0; fi
```
```powershell
# PowerShell
if ($input_json.tool_name -notin @('Bash', 'run_in_terminal')) { exit 0 }
```

## Neural Link Integration

When the user's environment uses **Neural Link** as the hook dispatcher (configured via Skill Manager), newly created hooks should include a `.neural-link.json` companion file. This file lives alongside the `.ps1` and `.sh` scripts and is automatically processed during `Pull All`.

### When to Generate

Generate a `.neural-link.json` companion file when:
- The hook is being placed in a repo that uses Skill Manager distribution (has `hooks/` directory)
- The user mentions Neural Link, adaptive scoring, or learning
- Ask the user if unsure: "Should I generate Neural Link configuration for adaptive scoring?"

Do NOT generate when:
- The hook is workspace-only (`.github/hooks/`)
- The user explicitly says they don't use Neural Link

### Companion File Schema

The file MUST be named `.neural-link.json` and placed in the same `hooks/` directory as the scripts:

```
hooks/
  my-hook.ps1
  my-hook.sh
  my-hook.neural-link.json    ← companion file
```

**IMPORTANT**: The filename pattern is `{hook-name}.neural-link.json` — matching the hook script name (without extension).

```jsonc
{
  // Handler name — must match the script base name (without .ps1/.sh)
  "handler": "my-hook",

  // Which lifecycle events this hook handles
  "events": ["PreToolUse"],

  // Default weights per agent (agents not listed get learning.defaultWeight from config)
  "weights": {
    "implementor": 0.8,
    "researcher": 0.5,
    "orchestrator": 0.3
  },

  // Optional modifiers — contextual score adjustments
  "modifiers": [
    {
      "condition": { "field": "tool_name", "op": "in", "value": ["run_in_terminal"] },
      "adjust": "+0.2"
    }
  ],

  // Optional: training scenarios for pre-training the learner
  "trainingScenarios": [
    {
      "input": {
        "event": "PreToolUse",
        "agentSlug": "implementor",
        "tool": "run_in_terminal",
        "payload": { "command": "rm -rf /", "isBackground": false }
      },
      "mockResults": [
        { "handler": "my-hook", "action": "block", "reason": "Dangerous command" }
      ],
      "label": "should block destructive terminal commands"
    },
    {
      "input": {
        "event": "PreToolUse",
        "agentSlug": "implementor",
        "tool": "read_file",
        "payload": { "filePath": "src/index.ts" }
      },
      "mockResults": [
        { "handler": "my-hook", "action": "allow" }
      ],
      "label": "should allow safe read operations"
    }
  ]
}
```

### Weight Guidelines

| Agent Role | Typical Weight | Rationale |
|-----------|---------------|----------|
| implementor | 0.7–0.9 | Full tool access, most hooks are relevant |
| researcher | 0.3–0.6 | Read-only, fewer hooks apply |
| orchestrator | 0.2–0.4 | Coordination only, minimal hook relevance |
| validator | 0.3–0.5 | Analysis focus, some hooks apply |

### Training Scenario Guidelines

- Include at least 2 scenarios: one that triggers the hook (block/deny) and one that doesn't (allow)
- Use realistic tool names and payloads
- The `label` field is human-readable — describe the expected behavior
- The `mockResults` format matches Neural Link's `e2e-pretrain.mjs` pipeline
- More scenarios = faster learner convergence. 4-6 scenarios per hook is a good target.

## Distribution via Skill Manager

The **Skill Manager extension** can automatically distribute hook scripts alongside agents and skills. This is the recommended approach for teams and shared repos.

### How it works

1. Place hook scripts (`.sh` and `.ps1`) in a `hooks/` directory at the repo root (alongside `agents/` and `skills/`)
2. When the extension runs `Pull All`, it syncs hooks to `~/.copilot/hooks/scripts/` — same global location referenced by agents
3. Hook scripts are always overwritten from the repo (repo is source of truth, no conflict resolution)

### Repo structure

```
my-repo/
  agents/         ← agent .md files (synced to ~/.copilot/agents/)
  skills/         ← skill directories (synced to ~/.copilot/skills/)
  hooks/          ← hook scripts (synced to ~/.copilot/hooks/scripts/)
    stop-checklist.sh
    stop-checklist.ps1
    output-format.sh
    output-format.ps1
```

### Configuration

The hooks directory path defaults to `hooks/` and can be overridden in `.skillmanager.json`:

```json
{
  "hooks": { "path": "hooks" }
}
```

The destination directory defaults to `~/.copilot/hooks/scripts/` and can be overridden via the `skillManager.hooksPath` VS Code setting.

### Why this matters

Without distribution, hook scripts must be manually copied to each machine. With the Skill Manager:
- **New team member** installs the extension → pulls → agents + hooks are ready
- **Hook update** pushed to repo → next pull automatically updates scripts everywhere
- **Cross-platform** — both `.sh` and `.ps1` variants are synced

## Advanced Patterns

### Policy Engine (Declarative Rules)

Separate rules (WHAT to enforce) from the executor (HOW to enforce). The hook becomes a generic engine that reads rules from a file:

```
Hook script → reads rules.json → evaluates input → returns decision
```

Rules can be:
- Local file (`~/.copilot/rules.json`) — synced via Skill Manager
- Repo file (`.github/hooks/rules.json`) — per-project
- Both (with inheritance/merge)

This enables standardized policies across teams without editing hook scripts.

### Server-Side Validation (Tamper-Proof)

For scenarios where the LLM must not be able to bypass the validation logic, move all decision-making to an external HTTP server. The hook becomes a thin client:

```powershell
$rawInput = @($input) -join "`n"
if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
$response = Invoke-RestMethod -Uri "$env:HOOK_API_URL/validate" -Method POST -ContentType "application/json" -Body $rawInput
$response | ConvertTo-Json -Depth 3 | Write-Output
```

Benefits:
- LLM cannot read server-side logic (blackbox)
- Rules update without redeploying hooks
- Centralized audit trail

Trade-offs:
- Requires network connectivity
- Adds latency (~100-200ms per hook call)
- Server must be maintained

### Compiled Blackbox Hooks

An alternative to server-side: compile the hook script to a binary (Go, Rust, C#). The LLM can see the binary exists but cannot read its logic. The binary reads secrets from environment variables at runtime, making the validation logic opaque.

Note: This is less practical than server-side for most teams but useful for offline/airgapped environments.

### Transcript-Aware Hooks (Smart Detection)

Instead of always blocking or always reminding, hooks can **analyze the session transcript** to make context-aware decisions. The VS Code Copilot transcript is a JSONL file where each line is a JSON event.

**Transcript location**: `%APPDATA%\Code\User\workspaceStorage\<id>\GitHub.copilot-chat\transcripts\*.jsonl`

The hook receives the transcript path via `transcript_path` in the stdin JSON.

**Event types in the transcript JSONL:**

| Event | Purpose |
|-------|--------|
| `session.start` | Session begins (1 per file) |
| `user.message` | User sends a message |
| `assistant.turn_start` | Agent turn begins |
| `assistant.message` | Agent response (contains `content` and `toolRequests`) |
| `tool.execution_start` | Tool invocation (contains `toolName` and `arguments`) |
| `tool.execution_complete` | Tool finished |
| `assistant.turn_end` | Agent turn ends |

Each interaction cycle: `user.message` → `assistant.turn_start` → `assistant.message` (with tool calls) → `assistant.turn_end`.

**Scoping to current interaction:**

A critical pattern — without scoping, hooks re-analyze the entire transcript and produce "sticky" false positives from old turns. Always find the **last `user.message`** and only process from there:

```powershell
# PowerShell — scope to current interaction
$startIdx = 0
for ($i = $lines.Count - 1; $i -ge 0; $i--) {
    if ($lines[$i] -like '*"user.message"*') {
        $startIdx = $i
        break
    }
}
for ($i = $startIdx; $i -lt $lines.Count; $i++) {
    # Process only events from this interaction
}
```

```bash
# Bash — scope to current interaction
START_LINE=1
LAST_USER_MSG=$(grep -n '"user\.message"' "$TRANSCRIPT_PATH" | tail -1 | cut -d: -f1 || true)
if [ -n "$LAST_USER_MSG" ]; then
  START_LINE=$LAST_USER_MSG
fi
tail -n +"$START_LINE" "$TRANSCRIPT_PATH" | while IFS= read -r line; do
  # Process only events from this interaction
done
```

**Example: Smart skill-feedback (only block when feedback-protocol skills were used)**

Instead of always reminding about feedback, the hook checks if a SKILL.md with "Feedback Protocol" was actually read during the session:

```powershell
# Find SKILL.md reads in tool.execution_start events
for ($i = $startIdx; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    if ($line -notlike '*"tool.execution_start"*') { continue }
    $evt = $line | ConvertFrom-Json -ErrorAction Stop
    if ($evt.data.toolName -eq 'read_file') {
        $fp = $evt.data.arguments.filePath
        if ($fp -match '[\\/]skills[\\/]' -and $fp -match 'SKILL\.md$') {
            # Check actual file for "Feedback Protocol"
            $content = Get-Content $fp -Raw -ErrorAction SilentlyContinue
            if ($content -match 'Feedback Protocol') {
                # This skill has feedback — block with reminder
            }
        }
    }
}
```

**Example: File reference verification (only block for unverified paths)**

The hook collects paths accessed via tools (`read_file`, `grep_search`, `file_search`, etc.) and compares against paths mentioned in `assistant.message` content. Only unverified mentions trigger a block:

```powershell
# Collect accessed paths from tool calls
if ($evt.type -eq 'tool.execution_start' -and $evt.data.toolName -in $fileTools) {
    if ($evt.data.arguments.filePath) {
        [void]$accessedPaths.Add($evt.data.arguments.filePath)
    }
}

# Extract mentioned paths from assistant content
$mentioned = [regex]::Matches($content, $relPathRegex)
foreach ($m in $mentioned) {
    if (-not (Test-Accessed $m.Value)) {
        $unverified.Add($m.Value)
    }
}
```

**Key design principles for transcript-aware hooks:**
- **Scope narrowly** — always use `user.message` boundary to avoid sticky false positives
- **Exit 0 when condition not met** — silent passthrough is the default; only block when there's a real finding
- **Read actual files when needed** — the transcript shows which tools were called, but checking file content (e.g., for "Feedback Protocol") requires reading the file from disk
- **Require `jq` in bash** — JSONL parsing without `jq` is fragile; fall back to a static reminder if `jq` is unavailable
- **PS 5.1 compatible** — avoid `u{}` escapes, ternary assignment, null-coalescing operators

## Companion Skills

- For creating the agents that use hooks: use **agent-creator**
- For creating skills (which cannot define hooks): use **skill-creator**

<!-- FEEDBACK:START -->
---
threshold: 5
---

## Feedback Protocol — hooks-creator

### When to Log a Review

Log a review whenever you help a user create hooks and:
- The instructions in SKILL.md were insufficient or unclear
- A hook event, configuration format, or platform behavior changed and the skill is outdated
- You had to improvise guidance not covered by the skill
- The user's resulting hook had issues traceable to missing instructions
- Cross-platform compatibility issues were encountered

### Review Format

Create a JSON file in `.vscode/skill-reviews/hooks-creator/`:

```json
{
  "date": "YYYY-MM-DD",
  "author": "dev-name",
  "type": "improvement | correction | addition",
  "section": "Section Name",
  "suggestion": "What should change",
  "context": "What prompted this feedback"
}
```

### Consolidation

When 5 reviews accumulate, summarize them into a single actionable
improvement for the skill maintainer.

<!-- FEEDBACK:END -->
