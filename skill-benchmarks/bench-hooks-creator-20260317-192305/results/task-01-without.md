# Stop Hook — Require Tests Before Finishing

## 1. Agent Frontmatter Configuration

Add this hooks section to your `.agent.md` file:

```yaml
---
name: my-agent
hooks:
  Stop:
    - type: command
      command: "bash ~/.copilot/hooks/scripts/stop-require-tests.sh"
      windows: "powershell -ExecutionPolicy Bypass -File %USERPROFILE%\\.copilot\\hooks\\scripts\\stop-require-tests.ps1"
---
```

## 2. PowerShell Script (`stop-require-tests.ps1`)

```powershell
# stop-require-tests.ps1 — Block agent if no tests were run

$input_data = [Console]::In.ReadToEnd()
$json = $input_data | ConvertFrom-Json

# Get transcript path
$transcriptPath = $json.transcript_path

if (-not $transcriptPath -or -not (Test-Path $transcriptPath)) {
    exit 0
}

# Read transcript
$content = Get-Content $transcriptPath -Raw

# Check if any test commands were run
$testPatterns = @('npm test', 'pytest', 'jest', 'mocha', 'dotnet test', 'go test')
$testsFound = $false

foreach ($pattern in $testPatterns) {
    if ($content -match [regex]::Escape($pattern)) {
        $testsFound = $true
        break
    }
}

if (-not $testsFound) {
    # Block the agent from stopping
    $result = @{
        systemMessage = "You must run tests before finishing. Please execute the test suite."
        continue = $false
        stopReason = "Tests not run"
    }
    $result | ConvertTo-Json | Write-Output
} else {
    exit 0
}
```

## 3. Bash Script (`stop-require-tests.sh`)

```bash
#!/bin/bash
# stop-require-tests.sh — Block agent if no tests were run

INPUT=$(cat)
TRANSCRIPT_PATH=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('transcript_path',''))")

if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
    exit 0
fi

# Check if any test commands appear in the transcript
if grep -qE '(npm test|pytest|jest|mocha|go test|dotnet test)' "$TRANSCRIPT_PATH"; then
    exit 0
fi

# Block the agent
cat <<EOF
{
    "systemMessage": "You must run tests before finishing. Please execute the test suite.",
    "continue": false,
    "stopReason": "Tests were not run during this session"
}
EOF
```

## Notes

- The hook reads the transcript file and scans for test-related commands
- If no tests are found, it blocks the agent with a message asking to run tests
- The `systemMessage` field communicates the requirement to the agent
