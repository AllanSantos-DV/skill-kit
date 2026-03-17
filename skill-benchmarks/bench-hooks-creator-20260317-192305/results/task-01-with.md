# Stop Hook — Require Tests Before Finishing (Custom Agent)

## 1. YAML Frontmatter for `.agent.md`

```yaml
---
name: my-agent
description: Agent that requires tests before completing
hooks:
  Stop:
    - type: command
      command: "bash ~/.copilot/hooks/scripts/stop-require-tests.sh"
      windows: "powershell -NoProfile -ExecutionPolicy Bypass -Command \"& '$HOME\\.copilot\\hooks\\scripts\\stop-require-tests.ps1'\""
---
```

**Notes:**
- The `windows:` field uses `-Command "& '...'"` with `$HOME` — this is required because `-File` treats `$HOME` as literal text and cannot resolve the path. `$HOME` is a PowerShell automatic variable that resolves at runtime.
- `%USERPROFILE%` would NOT work here — VS Code calls PowerShell directly, not via `cmd.exe`, so `%USERPROFILE%` is never expanded.
- You must enable `chat.useCustomAgentHooks: true` in VS Code **User Settings** (global) for agent-scoped hooks to work.

## 2. PowerShell Script (`stop-require-tests.ps1`)

```powershell
# stop-require-tests.ps1 — Block agent from stopping if no tests were run
# Compatible with PowerShell 5.1 (Windows PowerShell)

$rawInput = @($input) -join "`n"
if (-not $rawInput) {
    $rawInput = [Console]::In.ReadToEnd()
}

if (-not $rawInput) {
    # No input — allow stop (silent passthrough)
    exit 0
}

$inputJson = $rawInput | ConvertFrom-Json -ErrorAction SilentlyContinue
if (-not $inputJson) {
    exit 0
}

# Check for stop_hook_active flag to prevent infinite loop
if ($inputJson.stop_hook_active -eq $true) {
    exit 0
}

# Get transcript path
$transcriptPath = $inputJson.transcript_path
if (-not $transcriptPath -or -not (Test-Path $transcriptPath)) {
    # No transcript available — cannot verify, allow stop
    exit 0
}

# Read transcript JSONL
$lines = Get-Content $transcriptPath -ErrorAction SilentlyContinue
if (-not $lines -or $lines.Count -eq 0) {
    exit 0
}

# Scope to current interaction — find last user.message
$startIdx = 0
for ($i = $lines.Count - 1; $i -ge 0; $i--) {
    if ($lines[$i] -like '*"user.message"*') {
        $startIdx = $i
        break
    }
}

# Look for test execution in tool calls
$testsRun = $false
for ($i = $startIdx; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    if ($line -notlike '*"tool.execution_start"*') { continue }

    $evt = $null
    $evt = $line | ConvertFrom-Json -ErrorAction SilentlyContinue
    if (-not $evt) { continue }

    $toolName = $evt.data.toolName
    if ($toolName -eq 'run_in_terminal' -or $toolName -eq 'Bash') {
        $cmd = ''
        if ($evt.data.arguments.command) {
            $cmd = $evt.data.arguments.command
        }
        # Check if the command looks like a test execution
        if ($cmd -match '(npm\s+test|npx\s+jest|pytest|python\s+-m\s+(unittest|pytest)|dotnet\s+test|mvn\s+test|gradle\s+test|go\s+test|cargo\s+test|vitest|mocha|pnpm\s+test|yarn\s+test)') {
            $testsRun = $true
            break
        }
    }
}

if ($testsRun) {
    # Tests were run — allow stop
    exit 0
}

# Tests NOT run — block the agent
# CRITICAL: For custom agent Stop hooks, VS Code treats them as SubagentStop.
# decision/reason MUST be at top-level (SubagentStop format).
# Best practice: output at BOTH levels for compatibility.
$output = @{
    decision = "block"
    reason = "You have not run any tests during this session. Please run the project's test suite before finishing. Use the appropriate test command (e.g., npm test, pytest, etc.) and verify the results."
    hookSpecificOutput = @{
        hookEventName = "Stop"
        decision = "block"
        reason = "You have not run any tests during this session. Please run the project's test suite before finishing. Use the appropriate test command (e.g., npm test, pytest, etc.) and verify the results."
    }
}

$output | ConvertTo-Json -Depth 3 | Write-Output
exit 0
```

## 3. Bash Script (`stop-require-tests.sh`)

```bash
#!/bin/bash
# stop-require-tests.sh — Block agent from stopping if no tests were run

INPUT=$(cat 2>/dev/null || true)

if [ -z "$INPUT" ]; then
    exit 0
fi

# Check for stop_hook_active flag
STOP_ACTIVE=$(echo "$INPUT" | grep -o '"stop_hook_active"\s*:\s*true' || true)
if [ -n "$STOP_ACTIVE" ]; then
    exit 0
fi

# Get transcript path
if command -v jq &>/dev/null; then
    TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""')
else
    TRANSCRIPT_PATH=$(echo "$INPUT" | grep -o '"transcript_path"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/' || true)
fi

if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
    exit 0
fi

# Scope to current interaction — find last user.message
START_LINE=1
LAST_USER_MSG=$(grep -n '"user\.message"' "$TRANSCRIPT_PATH" | tail -1 | cut -d: -f1 || true)
if [ -n "$LAST_USER_MSG" ]; then
    START_LINE=$LAST_USER_MSG
fi

# Search for test commands in tool executions
TESTS_RUN=false
tail -n +"$START_LINE" "$TRANSCRIPT_PATH" | while IFS= read -r line; do
    if echo "$line" | grep -q '"tool.execution_start"'; then
        if echo "$line" | grep -qE '(npm\s+test|npx\s+jest|pytest|python\s+-m\s+(unittest|pytest)|dotnet\s+test|mvn\s+test|gradle\s+test|go\s+test|cargo\s+test|vitest|mocha|pnpm\s+test|yarn\s+test)'; then
            TESTS_RUN=true
            break
        fi
    fi
done

if [ "$TESTS_RUN" = "true" ]; then
    exit 0
fi

# Block — output at both top-level and hookSpecificOutput
cat <<'EOF'
{
  "decision": "block",
  "reason": "You have not run any tests during this session. Please run the project's test suite before finishing.",
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "decision": "block",
    "reason": "You have not run any tests during this session. Please run the project's test suite before finishing."
  }
}
EOF
exit 0
```

## Key Design Decisions

1. **Dual-level output**: `decision`/`reason` at both top-level AND inside `hookSpecificOutput` — required because VS Code treats custom agent Stop hooks as SubagentStop, which reads top-level fields.
2. **No `systemMessage`**: `systemMessage` is UI-only — the agent never sees it. Using `decision: "block"` with `reason` is the correct way to inject instructions into the agent's context.
3. **`-Command` with `$HOME`**: The Windows command uses `-Command "& '...'"` because `-File` cannot resolve `$HOME` (it treats it as literal text).
4. **PS 5.1 compatibility**: No ternary assignments, no `??` operator, no `` `u{} `` Unicode escapes.
5. **Infinite loop guard**: Checks `stop_hook_active` flag — without this, the hook blocks → agent retries → hook blocks again forever.
6. **Transcript scoping**: Only analyzes events from the last `user.message` to avoid false positives from earlier interactions.
