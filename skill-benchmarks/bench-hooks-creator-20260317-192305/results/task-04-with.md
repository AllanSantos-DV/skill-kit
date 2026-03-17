# PreToolUse Hook — Conventional Commits Enforcer

## 1. Workspace Hook Config (`.github/hooks/conventional-commits.json`)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "bash .github/hooks/scripts/conventional-commits.sh",
        "windows": "powershell -ExecutionPolicy Bypass -File .github\\hooks\\scripts\\conventional-commits.ps1",
        "timeout": 10
      }
    ]
  }
}
```

## 2. PowerShell Script (`.github/hooks/scripts/conventional-commits.ps1`)

```powershell
# conventional-commits.ps1 — Validate conventional commits, confirm push/tag
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

# Filter: only act on terminal tool calls (both platforms)
$tool = $inputJson.tool_name
if ($tool -notin @('run_in_terminal', 'Bash')) {
    exit 0
}

$cmd = ''
if ($inputJson.tool_input.command) {
    $cmd = $inputJson.tool_input.command
}

if (-not $cmd) {
    exit 0
}

# Check if this is a git command
if ($cmd -notmatch '\bgit\s+(commit|push|tag)\b') {
    # Not a git commit/push/tag — allow (silent passthrough)
    exit 0
}

$gitAction = $Matches[1]

# === git push / git tag → ASK user confirmation ===
if ($gitAction -eq 'push' -or $gitAction -eq 'tag') {
    $output = @{
        hookSpecificOutput = @{
            permissionDecision = "ask"
            additionalContext = "git $gitAction requires user confirmation. This operation will affect the remote repository."
        }
    }
    $output | ConvertTo-Json -Depth 3 | Write-Output
    exit 0
}

# === git commit → validate conventional commit message ===
# Extract commit message from -m flag
$hasMessage = $false
$commitMsg = ''

# Handle -m "message" and -m 'message' and -m=message
if ($cmd -match '-m\s*=?\s*["\x27](.+?)["\x27]') {
    $hasMessage = $true
    $commitMsg = $Matches[1]
}
elseif ($cmd -match '-m\s+(\S+)') {
    # Unquoted message (single word)
    $hasMessage = $true
    $commitMsg = $Matches[1]
}

if (-not $hasMessage) {
    # No -m flag — might be opening editor. Deny — agent should provide inline message.
    $output = @{
        hookSpecificOutput = @{
            permissionDecision = "deny"
            additionalContext = "git commit must include -m flag with an inline message. Interactive editor commits are not supported in agent hooks. Use: git commit -m 'type(scope): description'"
        }
    }
    $output | ConvertTo-Json -Depth 3 | Write-Output
    exit 0
}

# Validate against conventional commit pattern
# type(optional-scope)optional-!: description
$conventionalPattern = '^(feat|fix|docs|chore|refactor|test|ci|build|perf|style)(\(.+\))?(!)?\:\s+.+'

if ($commitMsg -match $conventionalPattern) {
    # Valid conventional commit — allow
    $output = @{
        hookSpecificOutput = @{
            permissionDecision = "allow"
        }
    }
    $output | ConvertTo-Json -Depth 3 | Write-Output
    exit 0
}
else {
    # Invalid commit message — deny with explanation
    $output = @{
        hookSpecificOutput = @{
            permissionDecision = "deny"
            additionalContext = "Commit message does not follow conventional commits format. Expected: 'type(scope): description' where type is one of: feat, fix, docs, chore, refactor, test, ci, build, perf, style. Examples: 'feat(auth): add login endpoint', 'fix: resolve null pointer in parser', 'docs(readme): update installation steps'. Your message was: '$commitMsg'"
        }
    }
    $output | ConvertTo-Json -Depth 3 | Write-Output
    exit 0
}
```

## 3. Bash Script (`.github/hooks/scripts/conventional-commits.sh`)

```bash
#!/bin/bash
# conventional-commits.sh — Validate conventional commits, confirm push/tag

INPUT=$(cat 2>/dev/null || true)

if [ -z "$INPUT" ]; then
    exit 0
fi

# Extract fields
if command -v jq &>/dev/null; then
    TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
    CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
else
    TOOL=$(echo "$INPUT" | grep -o '"tool_name"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
    CMD=$(echo "$INPUT" | grep -o '"command"\s*:\s*"[^"]*"' | head -1 | sed 's/.*:.*"\([^"]*\)"/\1/')
fi

# Filter: only terminal tool calls (both platforms)
if [ "$TOOL" != "run_in_terminal" ] && [ "$TOOL" != "Bash" ]; then
    exit 0
fi

if [ -z "$CMD" ]; then
    exit 0
fi

# Check if git commit/push/tag
if ! echo "$CMD" | grep -qE '\bgit\s+(commit|push|tag)\b'; then
    exit 0
fi

# Determine git action
GIT_ACTION=$(echo "$CMD" | grep -oE '\bgit\s+(commit|push|tag)\b' | awk '{print $2}')

# === git push / git tag → ASK ===
if [ "$GIT_ACTION" = "push" ] || [ "$GIT_ACTION" = "tag" ]; then
    cat <<EOF
{
  "hookSpecificOutput": {
    "permissionDecision": "ask",
    "additionalContext": "git $GIT_ACTION requires user confirmation. This operation will affect the remote repository."
  }
}
EOF
    exit 0
fi

# === git commit → validate conventional commits ===
# Extract commit message from -m flag
COMMIT_MSG=""
if echo "$CMD" | grep -qE -- '-m\s*[=]?\s*"'; then
    COMMIT_MSG=$(echo "$CMD" | sed -n 's/.*-m[= ]*"\([^"]*\)".*/\1/p')
elif echo "$CMD" | grep -qE -- "-m\s*[=]?\s*'"; then
    COMMIT_MSG=$(echo "$CMD" | sed -n "s/.*-m[= ]*'\([^']*\)'.*/\1/p")
fi

if [ -z "$COMMIT_MSG" ]; then
    cat <<EOF
{
  "hookSpecificOutput": {
    "permissionDecision": "deny",
    "additionalContext": "git commit must include -m flag with an inline message. Use: git commit -m 'type(scope): description'"
  }
}
EOF
    exit 0
fi

# Validate conventional commit pattern
PATTERN='^(feat|fix|docs|chore|refactor|test|ci|build|perf|style)(\(.+\))?(!)?\: .+'

if echo "$COMMIT_MSG" | grep -qE "$PATTERN"; then
    cat <<EOF
{
  "hookSpecificOutput": {
    "permissionDecision": "allow"
  }
}
EOF
else
    cat <<EOF
{
  "hookSpecificOutput": {
    "permissionDecision": "deny",
    "additionalContext": "Commit message does not follow conventional commits format. Expected: 'type(scope): description'. Types: feat, fix, docs, chore, refactor, test, ci, build, perf, style. Your message: '$COMMIT_MSG'"
  }
}
EOF
fi

exit 0
```

## Key Design Decisions

1. **All PreToolUse fields inside `hookSpecificOutput`**: `permissionDecision` and `additionalContext` MUST be wrapped — VS Code silently ignores them at the JSON top-level.

2. **Single script with decision tree**: Commit validation, push confirmation, and tag confirmation are all in one script. Multiple hooks would aggregate with "most restrictive wins" and couldn't implement the allow/deny/ask priority logic needed here.

3. **Tool name filtering inside script**: VS Code ignores matchers. Script checks for both `run_in_terminal` (VS Code) and `Bash` (Claude Code).

4. **PS 5.1 compatible**: Uses `if/elseif/else` blocks, never ternary assignment. No `??` or `?.` operators. String escaping with `[char]` helpers where needed.

5. **Bash jq fallback**: Uses jq for JSON parsing when available, falls back to grep/sed for environments without jq.

6. **No -m flag → deny**: If the agent tries `git commit` without `-m`, the hook denies because interactive editors can't work in hook context.
