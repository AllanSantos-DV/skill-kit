---
name: cc-hooks-creator
description: "**WORKFLOW SKILL** — Create and configure hooks for Claude Code. USE FOR: creating hook scripts, configuring lifecycle hooks (SessionStart, PreToolUse, PostToolUse, Stop, SubagentStart/Stop), hook types (command, http, prompt, agent), cross-platform hook scripts, security best practices. DO NOT USE FOR: general coding."
---
# Hooks Creator — Claude Code Lifecycle Hooks Guide

You are an expert at creating and configuring lifecycle hooks for Claude Code. When the user asks you to create a hook, follow this guide to produce a complete, cross-platform, well-structured hook configuration.

## What are Hooks?

Hooks are **deterministic actions** executed at specific lifecycle events during a Claude Code session. Unlike instructions (which are non-deterministic — the agent may or may not follow them), hooks **guarantee execution**. They run as real processes (or LLM evaluations), receive structured JSON input, and return structured JSON output. Use hooks when you need certainty: enforcement, logging, validation, or context injection that must happen every time.

## Lifecycle Events

Claude Code supports 20 lifecycle events:

| Event | Trigger | Matchers |
|-------|---------|:--------:|
| `SessionStart` | Session begins (startup, resume, clear, compact) | source |
| `SessionEnd` | Session closes | — |
| `UserPromptSubmit` | User sends a message | — |
| `PreToolUse` | Before a tool invocation | tool name |
| `PostToolUse` | After a tool completes successfully | tool name |
| `PostToolUseFailure` | After a tool fails | tool name |
| `PermissionRequest` | Tool needs user permission | tool name |
| `PreCompact` | Before context compaction | — |
| `Stop` | Agent turn ends | — |
| `SubagentStart` | Subagent spawned | agent type |
| `SubagentStop` | Subagent completes | agent type |
| `Notification` | Status notification emitted | — |
| `TaskCompleted` | Background task finishes | — |
| `TeammateIdle` | Teammate agent becomes idle | — |
| `InstructionsLoaded` | Instructions file loaded | — |
| `ConfigChange` | Settings file changed | — |
| `WorktreeCreate` | Git worktree created | — |
| `WorktreeRemove` | Git worktree removed | — |

Most commonly used: `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, `SubagentStart`.

## Configuration Locations

| Location | Scope | Precedence |
|----------|-------|------------|
| `~/.claude/settings.json` | User — all projects | Lowest |
| `.claude/settings.json` | Project — single repo (committed) | ↑ |
| `.claude/settings.local.json` | Local — project, gitignored | ↑ |
| Managed policy settings | Organization-wide | Highest |
| Plugin `hooks/hooks.json` | When plugin is enabled | Plugin scope |
| Skill/agent frontmatter `hooks:` | While component is active | Component scope |

## Hook Types

Claude Code supports 4 hook types:

### `command` — Shell Command

Runs a shell command. Receives JSON on stdin, returns JSON on stdout.

```json
{
  "type": "command",
  "command": "bash $CLAUDE_PROJECT_DIR/.claude/hooks/format.sh",
  "timeout": 15
}
```

| Field | Required | Description |
|-------|:--------:|-------------|
| `type` | ✅ | `"command"` |
| `command` | ✅ | Shell command to execute |
| `timeout` | — | Max seconds before kill (default: 60) |
| `async` | — | If `true`, fire-and-forget (no output captured) |
| `statusMessage` | — | Message shown while hook runs |
| `once` | — | If `true`, runs only once per session |

### `http` — HTTP POST

Sends JSON body to a URL.

```json
{
  "type": "http",
  "url": "https://hooks.example.com/audit",
  "headers": { "Authorization": "Bearer ${API_TOKEN}" },
  "timeout": 10
}
```

| Field | Required | Description |
|-------|:--------:|-------------|
| `type` | ✅ | `"http"` |
| `url` | ✅ | Endpoint URL |
| `headers` | — | HTTP headers (supports `${ENV_VAR}` expansion) |
| `allowedEnvVars` | — | Env vars the hook may access |
| `timeout` | — | Max seconds |

### `prompt` — Single-Turn LLM Evaluation

Evaluates a prompt and returns `{ok: true/false, reason: "..."}`. Good for semantic checks.

```json
{
  "type": "prompt",
  "prompt": "Does this edit preserve backward compatibility? Respond ok=true if yes.",
  "model": "claude-sonnet-4-20250514",
  "timeout": 30
}
```

### `agent` — Subagent Verification

Spawns a subagent with read-only tools (`Read`, `Grep`, `Glob`) for thorough verification.

```json
{
  "type": "agent",
  "prompt": "Verify the changed files follow project coding standards. Check imports, naming, and test coverage.",
  "model": "claude-sonnet-4-20250514",
  "timeout": 120
}
```

## Matcher Patterns

Matchers restrict a hook to specific triggers using **regex**. Only certain events support matchers.

| Event | Matcher field | Example patterns |
|-------|--------------|-----------------|
| `PreToolUse` / `PostToolUse` / `PostToolUseFailure` / `PermissionRequest` | `tool_name` | `Bash`, `Edit\|Write`, `mcp__.*`, `Read` |
| `SessionStart` | source | `startup`, `resume`, `clear\|compact` |
| `SubagentStart` / `SubagentStop` | agent type | `codegen`, `review` |

Events without matcher support (`UserPromptSubmit`, `Stop`, `PreCompact`, etc.) fire for every occurrence — filter inside your script if needed.

### Example with matcher

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash $CLAUDE_PROJECT_DIR/.claude/hooks/block-dangerous.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

## Hook Configuration Format

### In `settings.json` (project or user)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/format.sh",
            "timeout": 15
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/session-context.sh",
            "timeout": 10,
            "once": true
          }
        ]
      }
    ]
  }
}
```

### In skill/agent frontmatter (YAML)

```yaml
hooks:
  Stop:
    - type: command
      command: "bash .claude/hooks/stop-checklist.sh"
      timeout: 10
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "bash .claude/hooks/block-dangerous.sh"
          timeout: 5
```

## Input/Output Contract

Hooks receive JSON via **stdin** and return JSON via **stdout**.

### Input Fields

| Field | Type | Present in |
|-------|------|-----------|
| `session_id` | string | All events |
| `hook_event_name` | string | All events |
| `cwd` | string | All events |
| `permission_mode` | string | All events |
| `transcript_path` | string | All events |
| `tool_name` | string | Tool events only |
| `tool_input` | object | Tool events only |
| `tool_use_id` | string | Tool events only |

### Exit Codes

| Code | Meaning | Behavior |
|------|---------|----------|
| `0` | Success | stdout parsed as JSON |
| `2` | Blocking error | stderr content → agent feedback |
| Other | Warning | Non-blocking, hook output ignored |

### Key Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `continue` | bool | Whether the agent should proceed |
| `stopReason` | string | Why the hook stopped execution |
| `systemMessage` | string | Message injected into agent context |

### PreToolUse-Specific Output

| Field | Type | Description |
|-------|------|-------------|
| `permissionDecision` | string | `"allow"`, `"deny"`, or `"ask"` |
| `updatedInput` | object | Modified tool arguments |
| `additionalContext` | string | Extra context for the agent |

## Cross-Platform Scripts

Always provide both bash and PowerShell when using `command` hooks. Use platform-appropriate paths:

- **Script paths**: `$CLAUDE_PROJECT_DIR/.claude/hooks/` (project) or `${CLAUDE_PLUGIN_ROOT}/hooks/` (plugin)
- **Bash**: `INPUT=$(cat)` then `grep`/`sed` for JSON (do NOT depend on `jq`)
- **PowerShell**: read stdin with pipeline-then-console fallback

### Bash template

```bash
#!/bin/bash
INPUT=$(cat)
TOOL=$(echo "$INPUT" | grep -o '"tool_name"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
EVENT=$(echo "$INPUT" | grep -o '"hook_event_name"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
# ... hook logic
echo '{}'
```

### PowerShell template

```powershell
$rawInput = @($input) -join "`n"
if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
$data = $rawInput | ConvertFrom-Json
$tool = $data.tool_name
$event = $data.hook_event_name
# ... hook logic
Write-Output '{}'
```

**Rules:**
- Bash: start with `#!/bin/bash`, use `chmod +x`
- PowerShell: use the pipeline-then-console stdin pattern shown above
- Never depend on `jq` in bash — parse with `grep`/`sed`
- Test both platforms when possible

## Common Patterns

| Pattern | Event | Hook Type | Purpose |
|---------|-------|-----------|---------|
| Auto-format after edit | `PostToolUse` (matcher: `Edit\|Write`) | command | Run prettier/eslint after file changes |
| Project context injection | `SessionStart` | command (once) | Feed git state to agent at start |
| Block dangerous commands | `PreToolUse` (matcher: `Bash`) | command | Prevent `rm -rf`, `DROP TABLE`, etc. |
| Semantic code review | `PostToolUse` (matcher: `Edit`) | agent | Verify edits follow project standards |
| Task completion check | `Stop` | prompt | Ask if task map was produced |
| Subagent audit | `SubagentStart` | command (async) | Log subagent invocations |
| Output format enforcement | `Stop` | command | Ensure required output structure |
| Webhook notification | `TaskCompleted` | http | Notify external system on completion |

## Security Best Practices

| ❌ Don't | ✅ Do |
|----------|-------|
| Hardcode secrets in hook scripts | Use environment variables / `allowedEnvVars` |
| Trust `tool_input` without validation | Sanitize and quote all inputs |
| Run hooks from untrusted repos without review | Audit hook scripts before use |
| Use `async: true` for security-critical hooks | Use synchronous hooks for enforcement (exit 2 blocks) |

Hook scripts run with **the user's permissions**. A malicious hook in a cloned repo could exfiltrate data or run arbitrary commands. Always review `.claude/settings.json` hooks from external sources.

## Common Pitfalls

| ❌ Pitfall | ✅ Fix |
|-----------|--------|
| Stop hook infinite loop (hook prevents stop → retry → repeat) | Check `stop_hook_active` flag and exit 0 if true |
| Hook returning non-JSON to stdout | Return valid JSON or nothing (exit 0) |
| Hook script not executable on Linux | Run `chmod +x` on bash scripts |
| Long-running hooks blocking the agent | Set appropriate `timeout` or use `async: true` for non-blocking |
| Using `jq` in bash hooks | Parse JSON with `grep`/`sed` — `jq` may not be installed |
| Forgetting `once: true` on SessionStart hooks | Add `once` to avoid re-running on resume/compact |
