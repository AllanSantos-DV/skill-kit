# SubagentStart hook: log routing decisions
$agent = "unknown"
try {
    $rawInput = @($input) -join "`n"
    if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
    if ($rawInput) {
        $input_json = $rawInput | ConvertFrom-Json
        if ($input_json.agent_type) { $agent = $input_json.agent_type }
    }
} catch {
    # Empty or invalid JSON — use default agent name
}
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Log to stderr (doesn't affect hook output)
Write-Host "[$timestamp] Subagent started: $agent" -ForegroundColor Cyan 2>&1 | Write-Error

# Return empty success
Write-Output "{}"
