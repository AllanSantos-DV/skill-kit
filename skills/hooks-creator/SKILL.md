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
- PowerShell scripts: use `$input | ConvertFrom-Json` for stdin
- Bash scripts: use `INPUT=$(cat)` then pipe to `jq` for JSON parsing
- Always test both platforms when possible

## VS Code Matcher Workaround

**CRITICAL**: VS Code currently ignores matchers in hook configuration. To filter by tool name, you must filter **inside the script**.

### Bash

```bash
#!/bin/bash
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
# Only run for file edits
if [[ "$TOOL" != "replace_string_in_file" && "$TOOL" != "create_file" && "$TOOL" != "multi_replace_string_in_file" ]]; then
  exit 0
fi
# ... actual hook logic
```

### PowerShell

```powershell
$input_json = $input | ConvertFrom-Json
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

## Companion Skills

- For creating the agents that use hooks: use **agent-creator**
- For creating skills (which cannot define hooks): use **skill-creator**
