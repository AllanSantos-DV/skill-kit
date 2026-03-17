# Stop hook: capture skill feedback from user validation
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

$message = @"
SKILL FEEDBACK CHECK: If you used any skill that contains a "Feedback Protocol" section in this session AND the user expressed dissatisfaction or corrections were needed:

1. Ask the user what specifically didn't work well (if they haven't already said)
2. Once the user confirms the issues, follow the Feedback Protocol described in the skill's instructions to create a structured review
3. Create the review directory if it doesn't exist

IMPORTANT: Do NOT generate feedback autonomously. Only capture feedback that the user explicitly validated. If the session went well and the user didn't complain, skip this entirely.
"@

$reminder = @{
    decision = "block"
    reason = $message
    hookSpecificOutput = @{
        hookEventName = "Stop"
        decision = "block"
        reason = $message
    }
} | ConvertTo-Json -Depth 3

Write-Output $reminder
