# PreToolUse Hook — Block Dangerous Commands & Confirm Git Operations

## 1. Workspace Hook Config (`.github/hooks/security.json`)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "bash .github/hooks/scripts/security-guard.sh",
        "windows": "powershell -ExecutionPolicy Bypass -File .github\\hooks\\scripts\\security-guard.ps1",
        "timeout": 10
      }
    ]
  }
}
```

## 2. PowerShell Script (`.github/hooks/scripts/security-guard.ps1`)

```powershell
# security-guard.ps1 — Block dangerous commands, ask for git push/tag
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

# Filter: only act on terminal tool calls
$tool = $inputJson.tool_name
if ($tool -notin @('run_in_terminal', 'Bash')) {
    exit 0
}

# Extract the command being executed
$cmd = ''
if ($inputJson.tool_input.command) {
    $cmd = $inputJson.tool_input.command
}

if (-not $cmd) {
    exit 0
}

# === DENY: Dangerous patterns ===
$dangerousPatterns = @(
    'rm\s+-rf\s+/',
    'rm\s+-rf\s+\*',
    'rm\s+-rf\s+~',
    'DROP\s+TABLE',
    'DROP\s+DATABASE',
    'TRUNCATE\s+TABLE',
    'DELETE\s+FROM\s+\S+\s*;?\s*$',
    'git\s+push\s+--force',
    'git\s+push\s+-f\b',
    'mkfs\.',
    'dd\s+if=.*of=/dev/',
    ':\(\)\s*\{\s*:\|:&\s*\};:'
)

foreach ($pattern in $dangerousPatterns) {
    if ($cmd -match $pattern) {
        $output = @{
            hookSpecificOutput = @{
                permissionDecision = "deny"
                additionalContext = "BLOCKED: This command matches a dangerous pattern ('$pattern'). The command '$cmd' has been denied for safety. Please use a safer alternative or ask the user for explicit permission."
            }
        }
        $output | ConvertTo-Json -Depth 3 | Write-Output
        exit 0
    }
}

# === ASK: git push and git tag (non-force) ===
if ($cmd -match '\bgit\s+(push|tag)\b') {
    $gitAction = $Matches[1]
    $output = @{
        hookSpecificOutput = @{
            permissionDecision = "ask"
            additionalContext = "git $gitAction requires user confirmation. The command '$cmd' will modify shared resources."
        }
    }
    $output | ConvertTo-Json -Depth 3 | Write-Output
    exit 0
}

# === ALLOW: Everything else (implicit — just exit 0) ===
exit 0
```

## 3. Bash Script (`.github/hooks/scripts/security-guard.sh`)

```bash
#!/bin/bash
# security-guard.sh — Block dangerous commands, ask for git push/tag

INPUT=$(cat 2>/dev/null || true)

if [ -z "$INPUT" ]; then
    exit 0
fi

# Extract tool_name
if command -v jq &>/dev/null; then
    TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
else
    TOOL=$(echo "$INPUT" | grep -o '"tool_name"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
    CMD=$(echo "$INPUT" | grep -o '"command"\s*:\s*"[^"]*"' | head -1 | sed 's/.*:.*"\([^"]*\)"/\1/')
fi

# Only act on terminal tool calls (both VS Code and Claude Code)
if [ "$TOOL" != "run_in_terminal" ] && [ "$TOOL" != "Bash" ]; then
    exit 0
fi

if [ -z "$CMD" ]; then
    exit 0
fi

# === DENY: Dangerous patterns ===
DANGEROUS_PATTERNS=(
    'rm\s+-rf\s+/'
    'rm\s+-rf\s+\*'
    'rm\s+-rf\s+~'
    'DROP\s+TABLE'
    'DROP\s+DATABASE'
    'TRUNCATE\s+TABLE'
    'git\s+push\s+--force'
    'git\s+push\s+-f\b'
    'mkfs\.'
    'dd\s+if=.*of=/dev/'
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
    if echo "$CMD" | grep -qiE "$pattern"; then
        cat <<DENY_EOF
{
  "hookSpecificOutput": {
    "permissionDecision": "deny",
    "additionalContext": "BLOCKED: Command matches dangerous pattern. The command has been denied for safety. Use a safer alternative."
  }
}
DENY_EOF
        exit 0
    fi
done

# === ASK: git push and git tag ===
if echo "$CMD" | grep -qE '\bgit\s+(push|tag)\b'; then
    cat <<ASK_EOF
{
  "hookSpecificOutput": {
    "permissionDecision": "ask",
    "additionalContext": "This git operation will modify shared resources and requires user confirmation."
  }
}
ASK_EOF
    exit 0
fi

# === ALLOW: Everything else ===
exit 0
```

## Key Design Decisions

1. **PreToolUse fields inside `hookSpecificOutput`**: This is CRITICAL. Placing `permissionDecision` or `additionalContext` at the JSON top-level causes VS Code to silently ignore them — the tool call proceeds as if no hook existed.

2. **Tool name filtering inside script**: VS Code currently ignores matchers in hook configuration. The script must check `tool_name` directly and filter for `run_in_terminal` AND `Bash` (for Claude Code compatibility).

3. **Decision tree in single script**: Using one script with branching logic (deny → ask → allow) instead of multiple hooks. Multiple hooks aggregate with "most restrictive wins" logic, which means you can't implement priority/fallback — any `deny` overrides all `allow`/`ask`.

4. **PS 5.1 compatible**: No ternary assignment (`$var = if (...)`), no null-coalescing (`??`), no Unicode escapes (`` `u{} ``). Standard `if/else` blocks and `-match` operator throughout.

5. **Graceful stdin handling**: PowerShell uses pipeline-then-console fallback (`@($input)` then `[Console]::In.ReadToEnd()`). Bash uses `cat 2>/dev/null || true` to avoid hanging on empty stdin.

6. **`git push --force` in deny, `git push` in ask**: Force-push is always dangerous and denied. Regular push just needs confirmation.
