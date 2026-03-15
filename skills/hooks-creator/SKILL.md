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
  - **Windows**: `powershell -ExecutionPolicy Bypass -Command "& '$HOME\.copilot\hooks\scripts\<script>.ps1'"` — `$HOME` resolves at runtime
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
| `hookSpecificOutput.decision: "block"` + `reason` | ✅ Yes | Force agent to act before stopping (Stop, SubagentStop, PostToolUse) |
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

> **⚠️ `systemMessage` is UI-only — the agent never sees it.** It displays a warning banner in the chat for the user. If you need the agent to act on a Stop hook, use `hookSpecificOutput.decision: "block"` with `reason` — this IS injected into the agent's context. Putting `systemMessage` inside `hookSpecificOutput` is never valid — it's not a recognized field there and causes unintended blocking.

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

The `windows:` field passes through multiple escaping layers. Getting this wrong causes PowerShell `TerminatorExpectedAtEndOfString` errors.

**For workspace hooks (JSON config):** Simple — use `-File` for relative paths:
```json
"windows": "powershell -ExecutionPolicy Bypass -File .github\\hooks\\scripts\\my-hook.ps1"
```

**For global scripts with `$HOME` (agent frontmatter YAML):** Use `-Command` with single quotes around the path:
```yaml
windows: "powershell -ExecutionPolicy Bypass -Command \"& '$HOME\\.copilot\\hooks\\scripts\\my-hook.ps1'\""
```

After YAML parsing, this becomes:
```
powershell -ExecutionPolicy Bypass -Command "& '$HOME\.copilot\hooks\scripts\my-hook.ps1'"
```

**Why NOT `-File` for global paths?**
- `-File` treats `$HOME` as a **literal string** — it does NOT expand PowerShell variables
- `-Command` runs the argument as PowerShell code, so `$HOME` resolves correctly
- Single quotes around the path avoid nested double-quote escaping hell

**Why NOT double quotes around the path?**
- Double quotes like `\"$HOME\\.copilot\\...\"` require triple-escaping in YAML (`\\\"...\\\"`)`, which is fragile
- If the script contains single quotes internally (e.g., `'run_in_terminal'`), the double-quote wrapping can interact badly with how Copilot invokes the command

| Context | Recommended Pattern |
|---------|-------------------|
| JSON config, relative path | `powershell -ExecutionPolicy Bypass -File scripts\\my-hook.ps1` |
| JSON config, global path | `powershell -ExecutionPolicy Bypass -Command "& '$HOME\\.copilot\\hooks\\scripts\\my-hook.ps1'"` |
| YAML frontmatter, global path | `"powershell -ExecutionPolicy Bypass -Command \"& '$HOME\\.copilot\\hooks\\scripts\\my-hook.ps1'\""` |

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
| Using `-File` with `$HOME` variable paths | `-File` treats `$HOME` literally — use `-Command "& '...'"` instead |
| Marker file for "retry guard" hooks | Marker auto-bypass lets agent pass on 2nd attempt without real verification — always block, let the agent demonstrate compliance |
| Claude Code terminal tool is `Bash`, not `run_in_terminal` | Check for both: `$tool -notin @('Bash', 'run_in_terminal')` |
| `INPUT=$(cat)` hanging if stdin empty | Use `INPUT=$(cat 2>/dev/null || true)` |
| PreToolUse fields at JSON top-level | Wrap in `hookSpecificOutput` — VS Code ignores top-level PreToolUse fields |
| Claude hooks bleeding into VS Code Copilot sessions | `chat.useClaudeHooks: true` in VS Code imports ALL hooks from `~/.claude/settings.json` as global hooks — they fire for every agent, ignoring agent scoping. If hooks are already in agent frontmatter, set `chat.useClaudeHooks: false` to avoid duplication and unscoped blocking. **Tell the user** to check this setting if they report hooks firing from unexpected agents. |

## Claude Code vs Copilot — Key Differences for Hook Scripts

When creating hooks that work on both platforms, be aware of these differences:

| Aspect | VS Code Copilot | Claude Code |
|--------|----------------|-------------|
| Terminal tool name | `run_in_terminal` | `Bash` (also accepts `run_in_terminal`) |
| Stop hook enforcement | `hookSpecificOutput.decision: "block"` + `reason` — blocks the agent AND injects reason into agent context. Top-level `systemMessage` — rendered as warning in UI only (agent does NOT see it). **Never** put `systemMessage` inside `hookSpecificOutput` — it's not a valid field there. | `decision: "block"` — blocks the agent from stopping |
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
