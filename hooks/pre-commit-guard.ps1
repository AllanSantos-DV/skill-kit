# PreToolUse hook: guard git commit/push/tag
# - commit: deny unless -m with conventional commit message; allow if valid
# - push/tag: ask user for confirmation
# - other commands: passthrough
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

# Check if it's a git commit, push or tag (handles flags like git -C /path commit)
if ($cmd -notmatch 'git\s+(-[^\s]+\s+)*(commit|push|tag)') {
    exit 0
}

$gitAction = $Matches[2]

if ($gitAction -eq 'push') {
    $result = @{
        hookSpecificOutput = @{
            permissionDecision = "ask"
            additionalContext = "git push requires user confirmation"
        }
    } | ConvertTo-Json -Depth 3
    Write-Output $result
    exit 0
}

if ($gitAction -eq 'tag') {
    $result = @{
        hookSpecificOutput = @{
            permissionDecision = "ask"
            additionalContext = "git tag requires user confirmation"
        }
    } | ConvertTo-Json -Depth 3
    Write-Output $result
    exit 0
}

# git commit — check for conventional commit message
# Support both -m and -am (combined add+message flag)
if ($cmd -match '-a?m\s+["''](.+?)["'']' -or $cmd -match '-a?m\s+(\S+)') {
    $commitMsg = $Matches[1]
    # Case-insensitive per spec rule 15; includes revert type per FAQ
    if ($commitMsg -match '(?i)^(feat|fix|docs|chore|refactor|test|ci|build|perf|style|revert)(\(.+\))?(!)?\:\s+.+') {
        $result = @{
            hookSpecificOutput = @{
                permissionDecision = "allow"
            }
        } | ConvertTo-Json -Depth 3
        Write-Output $result
        exit 0
    } else {
        $result = @{
            hookSpecificOutput = @{
                permissionDecision = "deny"
                additionalContext = "Commit message must follow conventional commits pattern (e.g. feat: add feature, fix(scope): description)"
            }
        } | ConvertTo-Json -Depth 3
        Write-Output $result
        exit 0
    }
}

# No -m flag
$result = @{
    hookSpecificOutput = @{
        permissionDecision = "deny"
        additionalContext = "Commit must include -m with a conventional commit message"
    }
} | ConvertTo-Json -Depth 3
Write-Output $result
