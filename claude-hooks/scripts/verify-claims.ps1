# Stop hook: verify all factual claims were tool-checked
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
    # Empty or invalid JSON — continue
}

$result = @{
    decision = "block"
    reason = "VERIFICATION CHECK: Review every factual claim you made in this session. Was each one verified using tools (read_file, grep_search, run_in_terminal, semantic_search)? If any claim was assumed without tool verification — correct it now or explicitly mark it as unverified. Never present assumptions as facts."
} | ConvertTo-Json -Depth 2

Write-Output $result
