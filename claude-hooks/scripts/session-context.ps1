# SessionStart hook: inject project context
$branch = git branch --show-current 2>$null
if (-not $branch) { $branch = "unknown" }
$lastCommit = git log --oneline -1 2>$null
if (-not $lastCommit) { $lastCommit = "none" }
$status = git status --short 2>$null | Measure-Object -Line | Select-Object -ExpandProperty Lines
if (-not $status) { $status = 0 }

$context = @{
    hookSpecificOutput = @{
        hookEventName = "SessionStart"
        additionalContext = "Project context: branch=$branch | last_commit=$lastCommit | uncommitted_changes=$status"
    }
} | ConvertTo-Json -Depth 3

Write-Output $context
