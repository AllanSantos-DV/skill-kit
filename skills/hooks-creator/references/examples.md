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
INPUT=$(cat 2>/dev/null || true)
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
try {
    $rawInput = @($input) -join "`n"
    if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
    if ($rawInput) {
        $input_json = $rawInput | ConvertFrom-Json
    }
} catch {
    exit 0
}
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
INPUT=$(cat 2>/dev/null || true)
TOOL=$(echo "$INPUT" | grep -o '"tool_name"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')

# Only check terminal/command tools
if [[ "$TOOL" != "run_in_terminal" && "$TOOL" != "Bash" ]]; then
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
try {
    $rawInput = @($input) -join "`n"
    if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
    if ($rawInput) {
        $input_json = $rawInput | ConvertFrom-Json
    }
} catch {
    exit 0
}
$tool = $input_json.tool_name

# Only check terminal/command tools
if ($tool -notin @('run_in_terminal', 'Bash')) {
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
INPUT=$(cat 2>/dev/null || true)
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
try {
    $rawInput = @($input) -join "`n"
    if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
    if ($rawInput) {
        $input_json = $rawInput | ConvertFrom-Json
    }
} catch {
    exit 0
}

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
INPUT=$(cat 2>/dev/null || true)
AGENT=$(echo "$INPUT" | grep -o '"agentName"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
AGENT=${AGENT:-unknown}
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Log to stderr (doesn't affect hook output)
echo "[$TIMESTAMP] Subagent started: $AGENT" >&2
echo "{}"
```

### PowerShell Script

```powershell
try {
    $rawInput = @($input) -join "`n"
    if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
    if ($rawInput) {
        $input_json = $rawInput | ConvertFrom-Json
    }
} catch {
    exit 0
}
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
INPUT=$(cat 2>/dev/null || true)
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
try {
    $rawInput = @($input) -join "`n"
    if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
    if ($rawInput) {
        $input_json = $rawInput | ConvertFrom-Json
    }
} catch {
    exit 0
}

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
