# PreToolUse Hook — Block Dangerous Commands

## 1. Hook Configuration (`.github/hooks/security.json`)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "bash .github/hooks/scripts/security-guard.sh",
        "windows": "powershell -File .github\\hooks\\scripts\\security-guard.ps1"
      }
    ]
  }
}
```

## 2. PowerShell Script (`.github/hooks/scripts/security-guard.ps1`)

```powershell
# security-guard.ps1 — Block dangerous commands

$input_data = [Console]::In.ReadToEnd()
$json = $input_data | ConvertFrom-Json

$tool = $json.tool_name
$cmd = $json.tool_input.command

# Only process terminal commands
if ($tool -ne 'run_in_terminal') {
    exit 0
}

# Dangerous command patterns
$dangerous = @(
    'rm -rf /',
    'DROP TABLE',
    'DROP DATABASE',
    'git push --force',
    'git push -f',
    'mkfs'
)

foreach ($d in $dangerous) {
    if ($cmd -like "*$d*") {
        @{
            permissionDecision = "deny"
            additionalContext = "Dangerous command blocked: $d detected in '$cmd'"
        } | ConvertTo-Json | Write-Output
        exit 0
    }
}

# Ask for confirmation on git push/tag
if ($cmd -match 'git\s+(push|tag)') {
    @{
        permissionDecision = "ask"
        additionalContext = "Git push/tag requires user confirmation"
    } | ConvertTo-Json | Write-Output
    exit 0
}

# Allow everything else
@{
    permissionDecision = "allow"
} | ConvertTo-Json | Write-Output
```

## 3. Bash Script (`.github/hooks/scripts/security-guard.sh`)

```bash
#!/bin/bash
# security-guard.sh — Block dangerous commands

INPUT=$(cat)

TOOL=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))")
CMD=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))")

if [ "$TOOL" != "run_in_terminal" ]; then
    exit 0
fi

# Check for dangerous patterns
DANGEROUS_PATTERNS="rm -rf /|DROP TABLE|DROP DATABASE|git push --force|git push -f|mkfs"

if echo "$CMD" | grep -qiE "$DANGEROUS_PATTERNS"; then
    cat <<EOF
{
    "permissionDecision": "deny",
    "additionalContext": "Dangerous command blocked for safety"
}
EOF
    exit 0
fi

# Ask for git push/tag
if echo "$CMD" | grep -qE 'git (push|tag)'; then
    cat <<EOF
{
    "permissionDecision": "ask",
    "additionalContext": "Git operation requires user confirmation"
}
EOF
    exit 0
fi

# Allow
echo '{"permissionDecision": "allow"}'
```

## Usage

Place the files in your project:
```
.github/
  hooks/
    security.json
    scripts/
      security-guard.ps1
      security-guard.sh
```

The hook will automatically run before any tool invocation and block dangerous commands or request confirmation for git operations.
