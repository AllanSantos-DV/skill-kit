---
name: cc-hooks-creator
description: "**WORKFLOW SKILL** — Create and configure agent hooks for VS Code Copilot and Claude Code. USE FOR: creating hook scripts, configuring lifecycle hooks (SessionStart, PreToolUse, PostToolUse, Stop), adding hooks to agent frontmatter, cross-platform hook scripts, security best practices. DO NOT USE FOR: general coding, creating agents (use agent-creator), creating skills (use skill-creator)."
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
  - **Windows**: `powershell -ExecutionPolicy Bypass -Command "& \"$HOME\.copilot\hooks\scripts\<script>.ps1\""` — `$HOME` resolves at runtime
- This way, agents synced to any workspace always find their hook scripts. No per-workspace setup needed.
- **Workspace hooks** (`.github/hooks/*.json`) should keep scripts inside the project — they are project-specific by nature (e.g., injecting git context).

**`chat.useCustomAgentHooks` setting:**
- This setting **only enables/disables** the agent-scoped hooks feature — it does NOT create or define any hooks.
- Hooks are defined in `.github/hooks/*.json` (workspace) and `.agent.md` frontmatter (agent-scoped). The setting just controls whether VS Code reads the frontmatter hooks.
- Recommended: set it **once in User Settings (global)** so it applies to all workspaces automatically — avoids repeating it in every `.vscode/settings.json`.

**Precedence**: Agent-scoped hooks (frontmatter) run in addition to workspace hooks (`.github/hooks/`). They do NOT replace each other — both execute.

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

### PreToolUse-Specific Output

| Field | Type | Description |
|-------|------|-------------|
| `permissionDecision` | string | `"allow"`, `"deny"`, or `"ask"` |
| `updatedInput` | object | Modified tool arguments |
| `additionalContext` | string | Extra context for the agent |

## Cross-Platform Scripts

Always provide both `command` (Linux/macOS default) and `windows` override for portability:

```json
{
  "type": "command",
  "command": "bash ./hooks/my-hook.sh",
  "windows": "powershell -ExecutionPolicy Bypass -File hooks\\my-hook.ps1"
}
```

**Rules:**
- Bash scripts: always start with `#!/bin/bash`
- PowerShell scripts: read stdin with the pipeline-then-console fallback (see below)
- Bash scripts: use `INPUT=$(cat)` then `grep`/`sed` for JSON field extraction (do NOT depend on `jq` — it may not be installed)
- Always test both platforms when possible

## VS Code Matcher Workaround

**CRITICAL**: VS Code currently ignores matchers in hook configuration. To filter by tool name, you must filter **inside the script**.

### Bash

```bash
#!/bin/bash
INPUT=$(cat)
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

## Companion Skills

- For creating the agents that use hooks: use **agent-creator**
- For creating skills (which cannot define hooks): use **skill-creator**


---

## References

# Hook Examples — Complete Implementations

Ready-to-use hook examples with both bash and PowerShell versions.

---

## 1. Auto-Format with Prettier (PostToolUse)

Runs `prettier` on any file modified by a file-editing tool.

### JSON Config (`.github/hooks/format.json`)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "type": "command",
        "command": "bash .github/hooks/scripts/auto-format.sh",
        "windows": "powershell -ExecutionPolicy Bypass -File .github/hooks/scripts/auto-format.ps1",
        "timeout": 15
      }
    ]
  }
}
```

### Bash Script

```bash
#!/bin/bash
INPUT=$(cat)
TOOL=$(echo "$INPUT" | grep -o '"tool_name"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')

# Only run for file-editing tools
if [[ "$TOOL" != "replace_string_in_file" && "$TOOL" != "create_file" && "$TOOL" != "multi_replace_string_in_file" ]]; then
  exit 0
fi

# Extract file path from tool input
FILE=$(echo "$INPUT" | grep -o '"filePath"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
if [ -z "$FILE" ]; then
  FILE=$(echo "$INPUT" | grep -o '"file_path"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
fi

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  exit 0
fi

# Run prettier on the file
npx prettier --write "$FILE" 2>/dev/null

echo '{}'
```

### PowerShell Script

```powershell
$rawInput = @($input) -join "`n"
if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
$input_json = $rawInput | ConvertFrom-Json
$tool = $input_json.tool_name

# Only run for file-editing tools
if ($tool -notin @('replace_string_in_file', 'create_file', 'multi_replace_string_in_file')) {
    exit 0
}

# Extract file path from tool input
$file = $input_json.tool_input.filePath
if (-not $file) { $file = $input_json.tool_input.file_path }

if (-not $file -or -not (Test-Path $file)) {
    exit 0
}

# Run prettier on the file
npx prettier --write $file 2>$null

Write-Output '{}'
```

### What it does

After every file edit, checks if the tool was a file-editing tool, extracts the file path, and runs `prettier --write` on it. Returns empty JSON on success. Non-matching tools exit immediately with code 0 (no-op).

---

## 2. Project Context Injection (SessionStart)

Injects git branch, last commit, and uncommitted change count into the agent's context at session start.

### JSON Config (`.github/hooks/session.json`)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "bash .github/hooks/scripts/session-context.sh",
        "windows": "powershell -ExecutionPolicy Bypass -File .github/hooks/scripts/session-context.ps1",
        "timeout": 10
      }
    ]
  }
}
```

### Bash Script

```bash
#!/bin/bash
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
LAST_COMMIT=$(git log --oneline -1 2>/dev/null || echo "none")
CHANGES=$(git status --short 2>/dev/null | wc -l | tr -d ' ')

cat <<EOF
{
  "hookSpecificOutput": {
    "additionalContext": "Project context: branch=$BRANCH | last_commit=$LAST_COMMIT | uncommitted_changes=$CHANGES"
  }
}
EOF
```

### PowerShell Script

```powershell
$branch = git branch --show-current 2>$null
$lastCommit = git log --oneline -1 2>$null
$status = git status --short 2>$null | Measure-Object -Line | Select-Object -ExpandProperty Lines

$context = @{
    hookSpecificOutput = @{
        additionalContext = "Project context: branch=$branch | last_commit=$lastCommit | uncommitted_changes=$status"
    }
} | ConvertTo-Json -Depth 3

Write-Output $context
```

### What it does

Runs at the start of every session. Gathers git state (current branch, last commit, number of uncommitted changes) and injects it as `additionalContext` so the agent knows the project state without needing to run git commands.

---

## 3. Block Dangerous Commands (PreToolUse)

Prevents the agent from running dangerous terminal commands like `rm -rf`, `DROP TABLE`, `git push --force`.

### JSON Config (`.github/hooks/safety.json`)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "bash .github/hooks/scripts/block-dangerous.sh",
        "windows": "powershell -ExecutionPolicy Bypass -File .github/hooks/scripts/block-dangerous.ps1",
        "timeout": 5
      }
    ]
  }
}
```

### Bash Script

```bash
#!/bin/bash
INPUT=$(cat)
TOOL=$(echo "$INPUT" | grep -o '"tool_name"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')

# Only check terminal/command tools
if [[ "$TOOL" != "run_in_terminal" && "$TOOL" != "run_command" ]]; then
  exit 0
fi

COMMAND=$(echo "$INPUT" | grep -o '"command"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')

# Dangerous patterns
DANGEROUS_PATTERNS=(
  "rm -rf /"
  "rm -rf ~"
  "DROP TABLE"
  "DROP DATABASE"
  "git push --force"
  "git reset --hard"
  ":(){ :|:& };:"
  "mkfs"
  "> /dev/sda"
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qi "$pattern"; then
    cat <<EOF
{
  "hookSpecificOutput": {
    "permissionDecision": "deny",
    "additionalContext": "BLOCKED: Command matched dangerous pattern '$pattern'. This command was prevented by the safety hook."
  }
}
EOF
    exit 0
  fi
done

echo '{}'
```

### PowerShell Script

```powershell
$rawInput = @($input) -join "`n"
if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
$input_json = $rawInput | ConvertFrom-Json
$tool = $input_json.tool_name

# Only check terminal/command tools
if ($tool -notin @('run_in_terminal', 'run_command')) {
    exit 0
}

$command = $input_json.tool_input.command

$dangerousPatterns = @(
    'rm -rf /',
    'rm -rf ~',
    'DROP TABLE',
    'DROP DATABASE',
    'git push --force',
    'git reset --hard',
    'mkfs',
    '> /dev/sda'
)

foreach ($pattern in $dangerousPatterns) {
    if ($command -match [regex]::Escape($pattern)) {
        $result = @{
            hookSpecificOutput = @{
                permissionDecision = "deny"
                additionalContext = "BLOCKED: Command matched dangerous pattern '$pattern'. This command was prevented by the safety hook."
            }
        } | ConvertTo-Json -Depth 3
        Write-Output $result
        exit 0
    }
}

Write-Output '{}'
```

### What it does

Intercepts every terminal command before execution, checks against a list of dangerous patterns (destructive file ops, database drops, force pushes), and denies execution if a match is found. Non-terminal tools pass through immediately.

---

## 4. Task Completion Reminder (Stop)

Reminds the implementor agent to check its quality checklist before finishing.

### Agent Frontmatter

```yaml
hooks:
  Stop:
    - type: command
      command: "bash .github/hooks/scripts/stop-checklist.sh"
      windows: "powershell -ExecutionPolicy Bypass -File .github/hooks/scripts/stop-checklist.ps1"
      timeout: 10
```

### Bash Script

```bash
#!/bin/bash
INPUT=$(cat)
ACTIVE=$(echo "$INPUT" | grep -o '"stop_hook_active"\s*:\s*true' | head -1)
ACTIVE=${ACTIVE:+true}

# Prevent infinite loop
if [ "$ACTIVE" = "true" ]; then
  exit 0
fi

cat <<EOF
{
  "hookSpecificOutput": {
    "systemMessage": "Before finishing: 1) Did you run tests? 2) Did you produce a task map (if decisions were made)? 3) Is the quality checklist satisfied?"
  }
}
EOF
```

### PowerShell Script

```powershell
$rawInput = @($input) -join "`n"
if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
$input_json = $rawInput | ConvertFrom-Json

# Prevent infinite loop
if ($input_json.stop_hook_active -eq $true) {
    exit 0
}

$reminder = @{
    hookSpecificOutput = @{
        systemMessage = "Before finishing: 1) Did you run tests? 2) Did you produce a task map (if decisions were made)? 3) Is the quality checklist satisfied?"
    }
} | ConvertTo-Json -Depth 3

Write-Output $reminder
```

### What it does

Fires when the agent session ends. Injects a `systemMessage` reminding the agent to verify its quality checklist. The `stop_hook_active` guard prevents infinite loops where the hook's message causes another stop attempt.

---

## 5. Subagent Routing Audit (SubagentStart)

Logs which subagent was invoked and when, useful for debugging orchestration patterns.

### Agent Frontmatter (on orchestrator)

```yaml
hooks:
  SubagentStart:
    - type: command
      command: "bash .github/hooks/scripts/subagent-audit.sh"
      windows: "powershell -ExecutionPolicy Bypass -File .github/hooks/scripts/subagent-audit.ps1"
      timeout: 5
```

### Bash Script

```bash
#!/bin/bash
INPUT=$(cat)
AGENT=$(echo "$INPUT" | grep -o '"agentName"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
AGENT=${AGENT:-unknown}
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Log to stderr (doesn't affect hook output)
echo "[$TIMESTAMP] Subagent started: $AGENT" >&2
echo "{}"
```

### PowerShell Script

```powershell
$rawInput = @($input) -join "`n"
if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
$input_json = $rawInput | ConvertFrom-Json
$agent = $input_json.agentName
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Log to stderr (doesn't affect hook output)
Write-Host "[$timestamp] Subagent started: $agent" -ForegroundColor Cyan 2>&1 | Write-Error

# Return empty success
Write-Output "{}"
```

### What it does

Fires whenever the orchestrator spawns a subagent. Logs the agent name and timestamp to stderr (which appears in debug output but doesn't interfere with the JSON contract). Returns empty JSON to allow the subagent to proceed normally.

---

## 6. Output Format Enforcement (Stop)

Reminds research/validation agents to follow their required output format.

### Agent Frontmatter (on researcher/validator)

```yaml
hooks:
  Stop:
    - type: command
      command: "bash .github/hooks/scripts/output-format.sh"
      windows: "powershell -ExecutionPolicy Bypass -File .github/hooks/scripts/output-format.ps1"
      timeout: 10
```

### Bash Script

```bash
#!/bin/bash
INPUT=$(cat)
ACTIVE=$(echo "$INPUT" | grep -o '"stop_hook_active"\s*:\s*true' | head -1)
ACTIVE=${ACTIVE:+true}

if [ "$ACTIVE" = "true" ]; then
  exit 0
fi

cat <<EOF
{
  "hookSpecificOutput": {
    "systemMessage": "Verify your output follows the required format: Research Summary (researcher) or Validation Report (validator) with all mandatory sections."
  }
}
EOF
```

### PowerShell Script

```powershell
$rawInput = @($input) -join "`n"
if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
$input_json = $rawInput | ConvertFrom-Json

if ($input_json.stop_hook_active -eq $true) {
    exit 0
}

$reminder = @{
    hookSpecificOutput = @{
        systemMessage = "Verify your output follows the required format: Research Summary (researcher) or Validation Report (validator) with all mandatory sections."
    }
} | ConvertTo-Json -Depth 3

Write-Output $reminder
```

### What it does

Fires when a researcher or validator session ends. Injects a reminder to verify the output follows the structured format (Research Summary or Validation Report). Guards against infinite loops with the `stop_hook_active` check.

# Platform Reference — VS Code Copilot vs Claude Code

Complete comparison of hook capabilities between platforms.

---

## Lifecycle Events

| # | Event | VS Code Copilot | Claude Code | Description |
|---|-------|:---------------:|:-----------:|-------------|
| 1 | SessionStart | ✅ | ✅ | First prompt of a new session |
| 2 | UserPromptSubmit | ✅ | ✅ | User sends a message |
| 3 | PreToolUse | ✅ | ✅ | Before any tool invocation |
| 4 | PostToolUse | ✅ | ✅ | After tool completes successfully |
| 5 | PreCompact | ✅ | ✅ | Before context compaction |
| 6 | SubagentStart | ✅ | ✅ | Subagent spawned |
| 7 | SubagentStop | ✅ | ✅ | Subagent completes |
| 8 | Stop | ✅ | ✅ | Session ends |
| 9 | PermissionRequest | ❌ | ✅ | Tool needs user permission |
| 10 | PostToolUseFailure | ❌ | ✅ | Tool execution failed |
| 11 | Notification | ❌ | ✅ | Status notification sent |
| 12 | TaskCompleted | ❌ | ✅ | Task finishes |
| 13 | PreCompact | ❌ | ✅ | Before memory compaction |
| 14 | PostCompact | ❌ | ✅ | After memory compaction |
| 15 | ToolError | ❌ | ✅ | Tool throws an error |
| 16 | PreRetry | ❌ | ✅ | Before retrying failed operation |
| 17 | ContextWindowOverflow | ❌ | ✅ | Context exceeds limit |
| 18 | RateLimitHit | ❌ | ✅ | API rate limit reached |
| 19 | CacheHit | ❌ | ✅ | Prompt cache hit |
| 20 | CacheMiss | ❌ | ✅ | Prompt cache miss |

---

## Hook Types

| Type | VS Code Copilot | Claude Code | Description |
|------|:---------------:|:-----------:|-------------|
| `command` | ✅ | ✅ | Shell command execution |
| `http` | ❌ | ✅ | HTTP webhook call |
| `prompt` | ❌ | ✅ | Template-based prompt injection |
| `agent` | ❌ | ✅ | Delegate to another agent |

**VS Code limitation**: Only `command` type hooks are supported. For HTTP webhooks, wrap the HTTP call in a shell script.

---

## Input Format Differences

| Aspect | VS Code Copilot | Claude Code |
|--------|----------------|-------------|
| Casing | camelCase | snake_case |
| Tool name field | `tool_name` | `tool_name` |
| Tool input field | `tool_input` | `tool_input` |
| Session ID | `sessionId` | `session_id` |
| Event name | `hookEventName` | `hook_event_name` |
| Working directory | `cwd` | `cwd` |

**Recommendation**: When writing cross-platform scripts, check for both casing patterns:

```bash
SESSION=$(echo "$INPUT" | grep -o '"sessionId"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
if [ -z "$SESSION" ]; then
  SESSION=$(echo "$INPUT" | grep -o '"session_id"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
fi
```

```powershell
$session = $input_json.sessionId
if (-not $session) { $session = $input_json.session_id }
```

---

## Tool Name Differences

Some tools have different names across platforms:

| Purpose | VS Code Copilot | Claude Code |
|---------|----------------|-------------|
| Edit file | `replace_string_in_file` | `edit_file` |
| Create file | `create_file` | `write_file` |
| Run command | `run_in_terminal` | `bash` / `execute` |
| Read file | `read_file` | `read_file` |
| Search | `grep_search` | `grep` |

**Recommendation**: When filtering by tool name, include both platform variants:

```bash
if [[ "$TOOL" == "replace_string_in_file" || "$TOOL" == "edit_file" ]]; then
  # Handle file edit
fi
```

---

## Matcher Support

| Feature | VS Code Copilot | Claude Code |
|---------|:---------------:|:-----------:|
| Tool name matcher | ❌ (ignored) | ✅ |
| File pattern matcher | ❌ (ignored) | ✅ |
| Event matcher | ✅ (by config key) | ✅ |

**VS Code workaround**: Since matchers are ignored, filter `tool_name` inside the hook script. See the "VS Code Matcher Workaround" section in SKILL.md.

---

## Async Hooks

| Feature | VS Code Copilot | Claude Code |
|---------|:---------------:|:-----------:|
| Async execution | ❌ | ✅ |
| Parallel hooks | ❌ | ✅ |
| Fire-and-forget | ❌ | ✅ |
| Timeout configurable | ✅ | ✅ |

VS Code hooks are **synchronous** — the agent waits for the hook to complete before proceeding. Keep hooks fast (under 10-15 seconds). Claude Code supports async hooks that run in parallel without blocking the agent.

---

## Configuration Locations

| Location | Platform | Scope | Precedence |
|----------|----------|-------|------------|
| `.github/hooks/*.json` | VS Code | Workspace (team-shared) | Base |
| `.agent.md` frontmatter `hooks:` | VS Code | Agent-specific | Additive |
| `.claude/settings.json` | Claude Code + VS Code | Workspace | Base |
| `~/.claude/settings.json` | Claude Code + VS Code | User global | Fallback |
| `.vscode/settings.json` `chat.useCustomAgentHooks` | VS Code | Enable agent hooks | Required for frontmatter hooks |

**Note**: The VS Code setting `chat.useCustomAgentHooks: true` must be enabled for agent frontmatter hooks to work. Workspace hooks (`.github/hooks/`) work by default.

---

## Output Format

Both platforms expect the same JSON output structure from hooks:

```json
{
  "continue": true,
  "hookSpecificOutput": {
    "systemMessage": "Message injected into context",
    "additionalContext": "Extra context for the agent",
    "permissionDecision": "allow"
  }
}
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `continue` | No | `true` | Whether the agent should proceed |
| `stopReason` | No | — | Reason for stopping (if `continue: false`) |
| `systemMessage` | No | — | Message injected into agent context |
| `hookSpecificOutput` | No | — | Event-specific structured output |

---

## Quick Decision Guide

| Scenario | Recommendation |
|----------|---------------|
| VS Code only | Use `.github/hooks/*.json` + agent frontmatter |
| Claude Code only | Use `.claude/settings.json` with full event/type support |
| Both platforms | Use `.claude/settings.json` (read by both) with `command` type only |
| Team hooks | `.github/hooks/` (checked into git) |
| Personal hooks | `~/.claude/settings.json` (user global) |
| Agent-specific behavior | Agent frontmatter `hooks:` field |