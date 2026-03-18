# PreToolUse hook: guard git commit/push/tag (supports chained commands)
# - Splits chained commands by ; && || (respecting quoted strings)
# - commit: deny unless -m with conventional commit message; allow if valid
# - push/tag: ask user for confirmation
# - Most restrictive wins: deny > ask > allow
# - PS 5.1 compatible
try {
    $rawInput = @($input) -join "`n"
    if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
    if ($rawInput) {
        $input_json = $rawInput | ConvertFrom-Json
    }
} catch {
    exit 0
}

# Only intercept terminal commands
if ($input_json.tool_name -ne 'run_in_terminal' -and $input_json.tool_name -ne 'Bash') {
    exit 0
}

# Extract the command being run
$cmd = $input_json.tool_input.command
if (-not $cmd) { exit 0 }

# Split chained commands by ; && || (respecting quoted strings)
$subCommands = @()
$current = ''
$inSingle = $false
$inDouble = $false
for ($i = 0; $i -lt $cmd.Length; $i++) {
    $c = $cmd[$i]
    if ($c -eq "'" -and -not $inDouble) { $inSingle = -not $inSingle }
    elseif ($c -eq '"' -and -not $inSingle) { $inDouble = -not $inDouble }
    elseif (-not $inSingle -and -not $inDouble) {
        if ($c -eq ';') {
            $subCommands += $current.Trim()
            $current = ''
            continue
        }
        if ($c -eq '&' -and ($i + 1) -lt $cmd.Length -and $cmd[$i + 1] -eq '&') {
            $subCommands += $current.Trim()
            $current = ''
            $i++
            continue
        }
        if ($c -eq '|' -and ($i + 1) -lt $cmd.Length -and $cmd[$i + 1] -eq '|') {
            $subCommands += $current.Trim()
            $current = ''
            $i++
            continue
        }
    }
    $current += $c
}
if ($current.Trim()) { $subCommands += $current.Trim() }

# Evaluate each sub-command for git actions
$finalDecision = 'allow'
$contexts = @()
$hasGitCommand = $false

foreach ($sub in $subCommands) {
    if ($sub -notmatch 'git\s+(-[^\s]+\s+)*(commit|push|tag)') { continue }
    $hasGitCommand = $true
    $action = $Matches[2]

    if ($action -eq 'push') {
        $contexts += 'git push requires user confirmation'
        if ($finalDecision -ne 'deny') { $finalDecision = 'ask' }
        continue
    }

    if ($action -eq 'tag') {
        $contexts += 'git tag requires user confirmation'
        if ($finalDecision -ne 'deny') { $finalDecision = 'ask' }
        continue
    }

    # git commit — check for conventional commit message
    if ($sub -match '-a?m\s+["''](.+?)["'']' -or $sub -match '-a?m\s+(\S+)') {
        $commitMsg = $Matches[1]
        if ($commitMsg -match '(?i)^(feat|fix|docs|chore|refactor|test|ci|build|perf|style|revert)(\(.+\))?(!)?\:\s+.+') {
            # valid conventional commit — allow (don't override higher restriction)
        } else {
            $contexts += 'Commit message must follow conventional commits pattern (e.g. feat: add feature, fix(scope): description)'
            $finalDecision = 'deny'
        }
    } else {
        $contexts += 'Commit must include -m with a conventional commit message'
        $finalDecision = 'deny'
    }
}

# No git commands found — passthrough
if (-not $hasGitCommand) { exit 0 }

$result = @{
    hookSpecificOutput = @{
        permissionDecision = $finalDecision
    }
}
if ($contexts.Count -gt 0) {
    $result.hookSpecificOutput['additionalContext'] = ($contexts -join '; ')
}

$result | ConvertTo-Json -Depth 3
Write-Output ''
