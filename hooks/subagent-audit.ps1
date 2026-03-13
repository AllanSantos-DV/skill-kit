# SubagentStart hook: log routing decisions
$rawInput = @($input) -join "`n"
if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
$input_json = $rawInput | ConvertFrom-Json
$agent = $input_json.agentName
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Log to stderr (doesn't affect hook output)
Write-Host "[$timestamp] Subagent started: $agent" -ForegroundColor Cyan 2>&1 | Write-Error

# Return empty success
Write-Output "{}"
