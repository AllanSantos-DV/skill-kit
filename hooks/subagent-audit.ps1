# SubagentStart hook: log routing decisions
$agent = "unknown"
try {
    $rawInput = @($input) -join "`n"
    if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
    if ($rawInput) {
        $input_json = $rawInput | ConvertFrom-Json
        if ($input_json.agentName) { $agent = $input_json.agentName }
    }
} catch {
    # Empty or invalid JSON — use default agent name
}
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Log to stderr (doesn't affect hook output)
[Console]::Error.WriteLine("[$timestamp] Subagent started: $agent")

# Return empty success
Write-Output "{}"
