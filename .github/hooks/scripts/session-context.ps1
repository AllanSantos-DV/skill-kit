# SessionStart hook: inject project context
$branch = git branch --show-current 2>$null
$lastCommit = git log --oneline -1 2>$null
$status = git status --short 2>$null | Measure-Object -Line | Select-Object -ExpandProperty Lines

$context = @{
    systemMessage = "Project context: branch=$branch | last_commit=$lastCommit | uncommitted_changes=$status"
} | ConvertTo-Json -Depth 3

Write-Output $context
