# Stop hook for researcher/validator: remind output format
try {
    $rawInput = @($input) -join "`n"
    if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
    if ($rawInput) {
        $input_json = $rawInput | ConvertFrom-Json
        if ($input_json.stop_hook_active -eq $true) {
            exit 0
        }
    }
} catch {
    # Empty or invalid JSON — continue to output reminder
}

$reminder = @{
    decision = "block"
    reason = "Verify your output follows the required format: Research Summary (researcher) or Validation Report (validator) with all mandatory sections."
    hookSpecificOutput = @{
        hookEventName = "Stop"
        decision = "block"
        reason = "Verify your output follows the required format: Research Summary (researcher) or Validation Report (validator) with all mandatory sections."
    }
} | ConvertTo-Json -Depth 3

Write-Output $reminder
