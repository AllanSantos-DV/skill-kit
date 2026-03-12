# SubagentStart hook: log routing decisions
$input_json = $input | ConvertFrom-Json
$agent = $input_json.agentName
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Log to stderr (doesn't affect hook output)
Write-Host "[$timestamp] Subagent started: $agent" -ForegroundColor Cyan 2>&1 | Write-Error

# Return empty success
Write-Output "{}"
