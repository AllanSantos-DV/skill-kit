# SubagentStart hook: log routing decisions
try {
    $rawInput = @($input) -join "`n"
    if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
    if ($rawInput) {
        $input_json = $rawInput | ConvertFrom-Json
        $agent = $input_json.agentName
    }
} catch {
    # Empty or invalid JSON — use default
}
if (-not $agent) { $agent = "unknown" }
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Log to stderr (doesn't affect hook output)
[Console]::Error.WriteLine("[$timestamp] Subagent started: $agent")

# Return empty success
Write-Output "{}"
