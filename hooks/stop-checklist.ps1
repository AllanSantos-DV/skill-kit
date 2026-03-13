# Stop hook: remind implementor of checklist
try {
    $rawInput = @($input) -join "`n"
    if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
    if ($rawInput) {
        $input_json = $rawInput | ConvertFrom-Json
        # Prevent infinite loop
        if ($input_json.stop_hook_active -eq $true) {
            exit 0
        }
    }
} catch {
    # Empty or invalid JSON — continue to output reminder
}

$reminder = @{
    hookSpecificOutput = @{
        systemMessage = "Before finishing: 1) Did you run tests? 2) Did you produce a task map (if decisions were made)? 3) Is the quality checklist satisfied?"
    }
} | ConvertTo-Json -Depth 3

Write-Output $reminder
