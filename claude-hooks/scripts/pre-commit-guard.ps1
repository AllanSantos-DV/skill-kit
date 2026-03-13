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
if ($input_json.tool_name -notin @('Bash', 'run_in_terminal')) {
    exit 0
}

# Extract the command being run
$cmd = $input_json.tool_input.command
if (-not $cmd) { exit 0 }

# Check if it's a git commit, push or tag (handles flags like git -C /path commit)
if ($cmd -notmatch 'git\s+(-[^\s]+\s+)*(commit|push|tag)') {
    exit 0
}

# Always block — agent must run tests and get user confirmation first
$result = @{
    permissionDecision = "deny"
    additionalContext = "BLOCKED: Before committing/pushing, you MUST: 1) Run the project tests and confirm they pass. 2) Ask the user for explicit permission to commit/push. Do NOT retry until BOTH conditions are met."
} | ConvertTo-Json -Depth 3

Write-Output $result
