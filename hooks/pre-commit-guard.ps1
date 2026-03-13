# PreToolUse hook: block git commit/push/tag until tests pass and user confirms
try {
    $rawInput = @($input) -join "`n"
    if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
    if ($rawInput) {
        $input_json = $rawInput | ConvertFrom-Json
    }
} catch {
    exit 0
}

# Only intercept terminal commands
if ($input_json.tool_name -ne 'run_in_terminal') {
    exit 0
}

# Extract the command being run
$cmd = $input_json.tool_input.command
if (-not $cmd) { exit 0 }

# Check if it's a git commit, push or tag
if ($cmd -notmatch 'git\s+(commit|push|tag)') {
    exit 0
}

# Check for pass marker (user already confirmed)
$marker = Join-Path $HOME ".copilot\.commit-guard-pass"
if (Test-Path $marker) {
    Remove-Item $marker -Force
    exit 0
}

# Create marker for next attempt
$markerDir = Join-Path $HOME ".copilot"
if (-not (Test-Path $markerDir)) { New-Item -ItemType Directory -Path $markerDir -Force | Out-Null }
New-Item -ItemType File -Path $marker -Force | Out-Null

# Block the command
$result = @{
    permissionDecision = "deny"
    additionalContext = "BLOCKED: Before committing/pushing, you MUST: 1) Run tests and confirm they pass. 2) Ask the user for explicit permission to commit/push. Only retry after BOTH conditions are met."
} | ConvertTo-Json -Depth 3

Write-Output $result
