# PreToolUse Hook — Conventional Commit Enforcement

## 1. Hook Configuration (`.github/hooks/conventional-commits.json`)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "bash .github/hooks/scripts/conventional-commits.sh",
        "windows": "powershell -File .github\\hooks\\scripts\\conventional-commits.ps1",
        "matchers": ["run_in_terminal"]
      }
    ]
  }
}
```

## 2. PowerShell Script

```powershell
# conventional-commits.ps1

$input_data = [Console]::In.ReadToEnd()
$json = $input_data | ConvertFrom-Json

$cmd = $json.tool_input.command

# Only process git commands
if ($cmd -notmatch 'git (commit|push|tag)') {
    exit 0
}

$action = $Matches[1]

# git push/tag — ask for confirmation
if ($action -eq 'push' -or $action -eq 'tag') {
    $result = @{
        permissionDecision = "ask"
        additionalContext = "git $action needs user approval"
    }
    $result | ConvertTo-Json | Write-Output
    exit 0
}

# git commit — validate message
$msg = ""
if ($cmd -match '-m\s+"([^"]+)"') {
    $msg = $Matches[1]
} elseif ($cmd -match "-m\s+'([^']+)'") {
    $msg = $Matches[1]
}

if (-not $msg) {
    $result = @{
        permissionDecision = "deny"
        additionalContext = "Please provide a commit message with -m flag"
    }
    $result | ConvertTo-Json | Write-Output
    exit 0
}

# Check conventional commit format
$pattern = '^(feat|fix|docs|chore|refactor|test|ci|build|perf|style)(\(.*\))?: .+'
if ($msg -match $pattern) {
    $result = @{ permissionDecision = "allow" }
} else {
    $result = @{
        permissionDecision = "deny"
        additionalContext = "Message '$msg' doesn't match conventional commits. Use format: type(scope): description"
    }
}

$result | ConvertTo-Json | Write-Output
```

## 3. Bash Script

```bash
#!/bin/bash
# conventional-commits.sh

INPUT=$(cat)
CMD=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))")

if ! echo "$CMD" | grep -qE 'git (commit|push|tag)'; then
    exit 0
fi

ACTION=$(echo "$CMD" | grep -oE 'git (commit|push|tag)' | awk '{print $2}')

if [ "$ACTION" = "push" ] || [ "$ACTION" = "tag" ]; then
    echo '{"permissionDecision": "ask", "additionalContext": "git '"$ACTION"' needs user approval"}'
    exit 0
fi

# Extract commit message
MSG=$(echo "$CMD" | sed -n 's/.*-m ["\x27]\(.*\)["\x27].*/\1/p')

if [ -z "$MSG" ]; then
    echo '{"permissionDecision": "deny", "additionalContext": "Provide a commit message with -m"}'
    exit 0
fi

PATTERN='^(feat|fix|docs|chore|refactor|test|ci|build|perf|style)(\(.*\))?: .+'
if echo "$MSG" | grep -qE "$PATTERN"; then
    echo '{"permissionDecision": "allow"}'
else
    echo '{"permissionDecision": "deny", "additionalContext": "Invalid conventional commit format"}'
fi
```

## How it works

1. When the agent tries to use a tool, the hook checks if it's a git command
2. For `git push` or `git tag`, it asks the user for confirmation
3. For `git commit`, it extracts the commit message and validates against the conventional commit pattern
4. Valid messages are allowed, invalid ones are denied with an explanation
