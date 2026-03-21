# PreToolUse hook: guard destructive commands (supports chained commands)
# - Splits chained commands by ; && || (respecting quoted strings)
# - git commit: deny unless -m with conventional commit message
# - git push/tag: ask user for confirmation
# - git push --force-with-lease: ask (confirmation)
# - git push --force: deny (destructive)
# - git reset --hard: ask (recoverable via reflog)
# - git rebase: ask (history rewrite)
# - git clean -f*: ask (routine cleanup)
# - git checkout -- <path>: ask (discards working tree changes)
# - git branch -D: ask (force-deletes branch)
# - git stash drop/clear: ask (loses stashed changes)
# - Remove-Item -Recurse -Force: deny (PS equivalent of rm -rf)
# - Destructive filesystem commands (rm -rf, etc.): deny
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
    # --- Destructive filesystem commands ---
    if ($sub -match '\brm\s+.*-[rR]' -or $sub -match '\brm\s+-[fF][rR]' -or $sub -match '\brm\s+-[rR][fF]' -or
        $sub -match '\brmdir\s+/[sS]' -or $sub -match '\bdel\s+/[sS]' -or
        $sub -match '\bformat\s+[a-zA-Z]:' -or $sub -match '\bmkfs\b') {
        $hasGitCommand = $true
        $contexts += "Destructive filesystem command requires confirmation: $sub"
        $finalDecision = 'deny'
        continue
    }

    # --- Git destructive commands ---
    # git reset --hard
    if ($sub -match 'git\s+(-[^\s]+\s+)*reset\s+--hard') {
        $hasGitCommand = $true
        $contexts += 'git reset --hard discards uncommitted changes — requires confirmation'
        if ($finalDecision -ne 'deny') { $finalDecision = 'ask' }
        continue
    }

    # git push --force-with-lease (safer variant — ask)
    if ($sub -match 'git\s+(-[^\s]+\s+)*push\s+.*--force-with-lease') {
        $hasGitCommand = $true
        $contexts += 'git push --force-with-lease requires confirmation'
        if ($finalDecision -ne 'deny') { $finalDecision = 'ask' }
        continue
    }

    # git push --force (destructive — deny)
    if ($sub -match 'git\s+(-[^\s]+\s+)*push\s+.*--force') {
        $hasGitCommand = $true
        $contexts += 'git push --force rewrites remote history — denied'
        $finalDecision = 'deny'
        continue
    }

    # git rebase (interactive or not)
    if ($sub -match 'git\s+(-[^\s]+\s+)*rebase\b') {
        $hasGitCommand = $true
        $contexts += 'git rebase rewrites history — requires confirmation'
        if ($finalDecision -ne 'deny') { $finalDecision = 'ask' }
        continue
    }

    # git clean with -f flag (routine cleanup — ask)
    if ($sub -match 'git\s+(-[^\s]+\s+)*clean\s+.*-[a-zA-Z]*f') {
        $hasGitCommand = $true
        $contexts += 'git clean removes untracked files — requires confirmation'
        if ($finalDecision -ne 'deny') { $finalDecision = 'ask' }
        continue
    }

    # git checkout -- (discards working tree changes)
    if ($sub -match 'git\s+(-[^\s]+\s+)*checkout\s+.*--\s') {
        $hasGitCommand = $true
        $contexts += 'git checkout -- discards working tree changes — requires confirmation'
        if ($finalDecision -ne 'deny') { $finalDecision = 'ask' }
        continue
    }

    # git branch -D (force delete)
    if ($sub -cmatch 'git\s+(-[^\s]+\s+)*branch\s+.*-D') {
        $hasGitCommand = $true
        $contexts += 'git branch -D force-deletes a branch — requires confirmation'
        if ($finalDecision -ne 'deny') { $finalDecision = 'ask' }
        continue
    }

    # git stash drop / git stash clear
    if ($sub -match 'git\s+(-[^\s]+\s+)*stash\s+(drop|clear)\b') {
        $hasGitCommand = $true
        $contexts += 'git stash drop/clear loses stashed changes — requires confirmation'
        if ($finalDecision -ne 'deny') { $finalDecision = 'ask' }
        continue
    }

    # Remove-Item -Recurse -Force (PowerShell equivalent of rm -rf)
    if ($sub -match '\b(Remove-Item|ri|del|erase|rd|rmdir)\b.*-Recurse.*-Force|\b(Remove-Item|ri|del|erase|rd|rmdir)\b.*-Force.*-Recurse') {
        $hasGitCommand = $true
        $contexts += 'Remove-Item -Recurse -Force is destructive — denied'
        $finalDecision = 'deny'
        continue
    }

    if ($sub -notmatch 'git\s+(-[^\s]+\s+)*(commit|push|tag)\b') { continue }
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
    $contextText = ($contexts -join '; ')
    $result.hookSpecificOutput['additionalContext'] = $contextText
    $result.hookSpecificOutput['permissionDecisionReason'] = $contextText
}

$result | ConvertTo-Json -Depth 3
Write-Output ''
