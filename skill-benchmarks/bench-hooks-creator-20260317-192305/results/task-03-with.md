# SessionStart Hook — Inject Project Docs as Context

## 1. Agent Frontmatter (`reviewer.agent.md`)

```yaml
---
name: reviewer
description: Code reviewer agent with project context
hooks:
  SessionStart:
    - type: command
      command: "bash ~/.copilot/hooks/scripts/inject-project-docs.sh"
      windows: "powershell -NoProfile -ExecutionPolicy Bypass -Command \"& '$HOME\\.copilot\\hooks\\scripts\\inject-project-docs.ps1'\""
---
```

**Notes on the Windows command:**
- Uses `-Command "& '...'"` with `$HOME` — this is required because VS Code calls PowerShell directly (not via `cmd.exe`), so `%USERPROFILE%` is never expanded.
- `-File` cannot be used with `$HOME` — it treats `$HOME` as literal text.
- `-Command "& '...'"` correctly passes piped stdin to the script.

## 2. VS Code Setting Required

You must enable agent-scoped hooks in VS Code **User Settings** (global — set once, works for all workspaces):

```json
{
    "chat.useCustomAgentHooks": true
}
```

This setting only enables/disables the feature — it does NOT define any hooks. Without it, VS Code ignores the `hooks:` section in agent frontmatter.

## 3. PowerShell Script (`inject-project-docs.ps1`)

```powershell
# inject-project-docs.ps1 — Inject README.md and CONTRIBUTING.md into agent context
# Compatible with PowerShell 5.1 (Windows PowerShell)

$rawInput = @($input) -join "`n"
if (-not $rawInput) {
    $rawInput = [Console]::In.ReadToEnd()
}

if (-not $rawInput) {
    exit 0
}

$inputJson = $rawInput | ConvertFrom-Json -ErrorAction SilentlyContinue
if (-not $inputJson) {
    exit 0
}

# Get workspace directory from stdin (cwd field)
$workDir = $inputJson.cwd
if (-not $workDir) {
    $workDir = Get-Location
}

# Read project documentation files
$context = ""

$readmePath = Join-Path $workDir "README.md"
if (Test-Path $readmePath) {
    $readmeContent = Get-Content $readmePath -Raw -ErrorAction SilentlyContinue
    if ($readmeContent) {
        $context += "=== PROJECT README ===" + [Environment]::NewLine + $readmeContent + [Environment]::NewLine + [Environment]::NewLine
    }
}

$contributingPath = Join-Path $workDir "CONTRIBUTING.md"
if (Test-Path $contributingPath) {
    $contributingContent = Get-Content $contributingPath -Raw -ErrorAction SilentlyContinue
    if ($contributingContent) {
        $context += "=== CONTRIBUTING GUIDE ===" + [Environment]::NewLine + $contributingContent + [Environment]::NewLine
    }
}

if (-not $context) {
    # No docs found — silent passthrough
    exit 0
}

# Output with additionalContext inside hookSpecificOutput
# This is what the agent actually sees — NOT systemMessage (which is UI-only)
$output = @{
    hookSpecificOutput = @{
        additionalContext = $context
    }
}

$output | ConvertTo-Json -Depth 3 | Write-Output
exit 0
```

## 4. Bash Script (`inject-project-docs.sh`)

```bash
#!/bin/bash
# inject-project-docs.sh — Inject README.md and CONTRIBUTING.md into agent context

INPUT=$(cat 2>/dev/null || true)

if [ -z "$INPUT" ]; then
    exit 0
fi

# Extract cwd from stdin JSON
if command -v jq &>/dev/null; then
    WORK_DIR=$(echo "$INPUT" | jq -r '.cwd // ""')
else
    WORK_DIR=$(echo "$INPUT" | grep -o '"cwd"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
fi

if [ -z "$WORK_DIR" ]; then
    WORK_DIR=$(pwd)
fi

CONTEXT=""

# Read README.md
if [ -f "$WORK_DIR/README.md" ]; then
    README_CONTENT=$(cat "$WORK_DIR/README.md")
    CONTEXT="${CONTEXT}=== PROJECT README ===\n${README_CONTENT}\n\n"
fi

# Read CONTRIBUTING.md
if [ -f "$WORK_DIR/CONTRIBUTING.md" ]; then
    CONTRIBUTING_CONTENT=$(cat "$WORK_DIR/CONTRIBUTING.md")
    CONTEXT="${CONTEXT}=== CONTRIBUTING GUIDE ===\n${CONTRIBUTING_CONTENT}\n"
fi

if [ -z "$CONTEXT" ]; then
    exit 0
fi

# Output JSON — additionalContext inside hookSpecificOutput
# This is what reaches the agent's context
if command -v jq &>/dev/null; then
    jq -n --arg ctx "$CONTEXT" '{hookSpecificOutput: {additionalContext: $ctx}}'
else
    # Manual JSON construction — escape special characters
    ESCAPED_CONTEXT=$(echo "$CONTEXT" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | tr '\n' ' ')
    echo "{\"hookSpecificOutput\":{\"additionalContext\":\"${ESCAPED_CONTEXT}\"}}"
fi

exit 0
```

## Key Design Decisions

1. **`additionalContext` inside `hookSpecificOutput`**: This is the ONLY way to inject content into the agent's context via SessionStart. Using `systemMessage` would only show a UI banner — the agent would never see the documentation.

2. **`chat.useCustomAgentHooks: true`**: Must be enabled for agent-scoped hooks (defined in frontmatter) to work. Set it in User Settings (global) — once.

3. **`-Command` with `$HOME` on Windows**: The YAML `windows:` field uses `-Command "& '...'"` with `$HOME` (a PS automatic variable). `-File` can't resolve variable paths, and `%USERPROFILE%` isn't expanded by PowerShell (VS Code calls PS directly, not via cmd.exe).

4. **PS 5.1 compatible**: Uses `[Environment]::NewLine` instead of backtick-n in string concatenation. No ternary assignment, no null-coalescing operators.

5. **Graceful file handling**: Both scripts check if README.md and CONTRIBUTING.md exist before reading. If neither exists, silent passthrough (exit 0).

6. **`cwd` from stdin**: The hook receives the workspace directory via the `cwd` field in stdin JSON. Falls back to current directory if missing.
