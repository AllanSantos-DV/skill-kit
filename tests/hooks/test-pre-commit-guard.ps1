# Test suite for hooks/pre-commit-guard.ps1
# PS 5.1 compatible — no ternary, no ??, no ?., no `u{}.
# Run: powershell -ExecutionPolicy Bypass -File tests/hooks/test-pre-commit-guard.ps1

$ErrorActionPreference = 'Stop'
$script:Passed = 0
$script:Failed = 0
$script:Total  = 0
$script:HookPath = (Resolve-Path "$PSScriptRoot\..\..\hooks\pre-commit-guard.ps1").Path

$checkMark = [char]::ConvertFromUtf32(0x2713)
$crossMark = [char]::ConvertFromUtf32(0x2717)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Invoke-Hook {
    param(
        [string]$ToolName,
        [string]$Command
    )
    $json = @{
        tool_name  = $ToolName
        tool_input = @{ command = $Command }
    } | ConvertTo-Json -Depth 3

    $result = $json | powershell -NoProfile -ExecutionPolicy Bypass -File $script:HookPath 2>&1
    # Filter out non-string error records and join
    $output = ($result | Where-Object { $_ -is [string] }) -join "`n"
    return $output.Trim()
}

function Get-Decision {
    param([string]$Output)
    if ([string]::IsNullOrWhiteSpace($Output)) { return $null }
    try {
        $parsed = $Output | ConvertFrom-Json
        return $parsed.hookSpecificOutput.permissionDecision
    } catch {
        return $null
    }
}

function Get-Context {
    param([string]$Output)
    if ([string]::IsNullOrWhiteSpace($Output)) { return $null }
    try {
        $parsed = $Output | ConvertFrom-Json
        return $parsed.hookSpecificOutput.additionalContext
    } catch {
        return $null
    }
}

function Assert-Decision {
    param(
        [string]$Output,
        [string]$Expected,
        [string]$TestName
    )
    $script:Total++
    $decision = Get-Decision $Output
    if ($decision -eq $Expected) {
        Write-Host "  $checkMark PASS: $TestName" -ForegroundColor Green
        $script:Passed++
    } else {
        Write-Host "  $crossMark FAIL: $TestName" -ForegroundColor Red
        Write-Host "    Expected decision: '$Expected'" -ForegroundColor Yellow
        Write-Host "    Actual decision:   '$decision'" -ForegroundColor Yellow
        if ($Output) {
            Write-Host "    Raw output:        '$Output'" -ForegroundColor DarkGray
        }
        $script:Failed++
    }
}

function Assert-NoOutput {
    param(
        [string]$Output,
        [string]$TestName
    )
    $script:Total++
    if ([string]::IsNullOrWhiteSpace($Output)) {
        Write-Host "  $checkMark PASS: $TestName" -ForegroundColor Green
        $script:Passed++
    } else {
        Write-Host "  $crossMark FAIL: $TestName" -ForegroundColor Red
        Write-Host "    Expected no output but got: '$Output'" -ForegroundColor Yellow
        $script:Failed++
    }
}

function Assert-ContextContains {
    param(
        [string]$Output,
        [string]$Substring,
        [string]$TestName
    )
    $script:Total++
    $ctx = Get-Context $Output
    if ($ctx -and $ctx.Contains($Substring)) {
        Write-Host "  $checkMark PASS: $TestName" -ForegroundColor Green
        $script:Passed++
    } else {
        Write-Host "  $crossMark FAIL: $TestName" -ForegroundColor Red
        Write-Host "    Expected context to contain: '$Substring'" -ForegroundColor Yellow
        Write-Host "    Actual context: '$ctx'" -ForegroundColor Yellow
        $script:Failed++
    }
}

# ===========================================================================
Write-Host "`n=== pre-commit-guard.ps1 Tests ===" -ForegroundColor Cyan
# ===========================================================================

# ---------------------------------------------------------------------------
Write-Host "`n--- Single commands ---" -ForegroundColor White
# ---------------------------------------------------------------------------

# 1. Valid conventional commit (feat)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -m "feat: add feature"'
Assert-Decision $out 'allow' '1. git commit -m "feat: add feature" -> allow'

# 2. Valid conventional commit with scope
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -m "fix(scope): description"'
Assert-Decision $out 'allow' '2. git commit -m "fix(scope): description" -> allow'

# 3. Invalid commit message
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -m "bad message"'
Assert-Decision $out 'deny' '3. git commit -m "bad message" -> deny'

# 4. Commit without -m
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit'
Assert-Decision $out 'deny' '4. git commit (no -m) -> deny'

# 5. git push
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git push origin main'
Assert-Decision $out 'ask' '5. git push origin main -> ask'

# 6. git tag
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git tag v1.0.0'
Assert-Decision $out 'ask' '6. git tag v1.0.0 -> ask'

# 7. Non-git command (npm)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'npm install'
Assert-NoOutput $out '7. npm install -> no output (exit 0)'

# 8. Non-git command (echo)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'echo "hello"'
Assert-NoOutput $out '8. echo "hello" -> no output (exit 0)'

# ---------------------------------------------------------------------------
Write-Host "`n--- Chained commands ---" -ForegroundColor White
# ---------------------------------------------------------------------------

# 9. Chain with push (ask wins over allow)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git add .; git commit -m "feat: x"; git push'
Assert-Decision $out 'ask' '9. git add + commit + push -> ask (push wins)'

# 10. Chain with bad commit + push (deny wins over ask)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -m "bad"; git push'
Assert-Decision $out 'deny' '10. bad commit + push -> deny (deny wins)'

# 11. Chain with valid commit only (allow)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git add . && git commit -m "docs: update"'
Assert-Decision $out 'allow' '11. git add && valid commit -> allow'

# 12. Non-git + push (ask)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'npm install && git push origin main'
Assert-Decision $out 'ask' '12. npm install && git push -> ask'

# 13. Valid commit + tag (ask wins)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -m "feat: x" && git tag v1.0'
Assert-Decision $out 'ask' '13. valid commit && git tag -> ask (tag wins)'

# ---------------------------------------------------------------------------
Write-Host "`n--- Edge cases ---" -ForegroundColor White
# ---------------------------------------------------------------------------

# 14. echo "git push" — git inside echo's argument string
# Known limitation: the regex matches "git push" even inside echo's quotes.
# This test documents actual behavior.
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'echo "git push"'
$decision14 = Get-Decision $out
if ($decision14 -eq 'ask') {
    $script:Total++
    Write-Host "  $checkMark PASS: 14. echo ""git push"" -> ask (known limitation: matches inside quotes)" -ForegroundColor Green
    $script:Passed++
} elseif ([string]::IsNullOrWhiteSpace($out)) {
    $script:Total++
    Write-Host "  $checkMark PASS: 14. echo ""git push"" -> no output (correctly ignored)" -ForegroundColor Green
    $script:Passed++
} else {
    $script:Total++
    Write-Host "  $crossMark FAIL: 14. echo ""git push"" -> unexpected: '$decision14'" -ForegroundColor Red
    $script:Failed++
}

# 15. git commit -am (combined add+message)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -am "feat: combined add"'
Assert-Decision $out 'allow' '15. git commit -am "feat: combined add" -> allow'

# 16. Non-terminal tool
$out = Invoke-Hook -ToolName 'other_tool' -Command 'git push origin main'
Assert-NoOutput $out '16. tool_name=other_tool -> no output (exit 0)'

# 17. Empty command
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command ''
Assert-NoOutput $out '17. empty command -> no output (exit 0)'

# ---------------------------------------------------------------------------
Write-Host "`n--- Context message checks ---" -ForegroundColor White
# ---------------------------------------------------------------------------

# 18. Deny includes conventional commits guidance
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -m "bad message"'
Assert-ContextContains $out 'conventional commits' '18. deny context mentions conventional commits'

# 19. Push context mentions confirmation
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git push origin main'
Assert-ContextContains $out 'confirmation' '19. push context mentions confirmation'

# 20. No -m context mentions include -m
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit'
Assert-ContextContains $out '-m' '20. no-message context mentions -m'

# ---------------------------------------------------------------------------
Write-Host "`n--- New destructive command guards ---" -ForegroundColor White
# ---------------------------------------------------------------------------

# 21. git clean -fd -> ask
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git clean -fd'
Assert-Decision $out 'ask' '21. git clean -fd -> ask'

# 22. git clean -fdx -> ask
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git clean -fdx'
Assert-Decision $out 'ask' '22. git clean -fdx -> ask'

# 23. git clean -xfd -> ask
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git clean -xfd'
Assert-Decision $out 'ask' '23. git clean -xfd -> ask'

# 24. git clean -fd context message
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git clean -fd'
Assert-ContextContains $out 'untracked files' '24. git clean context mentions untracked files'

# 25. git checkout -- . -> ask
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git checkout -- .'
Assert-Decision $out 'ask' '25. git checkout -- . -> ask'

# 26. git checkout -- src/file.ts -> ask
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git checkout -- src/file.ts'
Assert-Decision $out 'ask' '26. git checkout -- src/file.ts -> ask'

# 27. git checkout -- context message
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git checkout -- .'
Assert-ContextContains $out 'working tree changes' '27. git checkout -- context mentions working tree changes'

# 28. git branch -D feature -> ask
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git branch -D feature-branch'
Assert-Decision $out 'ask' '28. git branch -D feature-branch -> ask'

# 29. git branch -D context message
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git branch -D feature-branch'
Assert-ContextContains $out 'force-deletes' '29. git branch -D context mentions force-deletes'

# 30. git branch -d (lowercase) should NOT be caught — passthrough
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git branch -d feature-branch'
Assert-NoOutput $out '30. git branch -d (lowercase) -> no output (not force delete)'

# 31. git stash drop -> ask
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git stash drop'
Assert-Decision $out 'ask' '31. git stash drop -> ask'

# 32. git stash clear -> ask
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git stash clear'
Assert-Decision $out 'ask' '32. git stash clear -> ask'

# 33. git stash drop context message
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git stash drop'
Assert-ContextContains $out 'stashed changes' '33. git stash drop context mentions stashed changes'

# 34. Remove-Item -Recurse -Force -> deny
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'Remove-Item -Recurse -Force C:\temp'
Assert-Decision $out 'deny' '34. Remove-Item -Recurse -Force -> deny'

# 35. Remove-Item -Force -Recurse (reversed flags) -> deny
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'Remove-Item -Force -Recurse C:\temp'
Assert-Decision $out 'deny' '35. Remove-Item -Force -Recurse (reversed) -> deny'

# 36. Remove-Item -Recurse -Force context message
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'Remove-Item -Recurse -Force C:\temp'
Assert-ContextContains $out 'destructive' '36. Remove-Item context mentions destructive'

# 37. git clean + git checkout -- chained (both ask)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git clean -fd && git checkout -- .'
Assert-Decision $out 'ask' '37. git clean + git checkout -- chained -> ask (both ask)'

# ---------------------------------------------------------------------------
Write-Host "`n--- Policy changes (deny -> ask) ---" -ForegroundColor White
# ---------------------------------------------------------------------------

# 38. git reset --hard -> ask (was deny, recoverable via reflog)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git reset --hard'
Assert-Decision $out 'ask' '38. git reset --hard -> ask'

# 39. git reset --hard context message
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git reset --hard'
Assert-ContextContains $out 'uncommitted changes' '39. git reset --hard context mentions uncommitted changes'

# 40. git push --force -> deny (stays deny)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git push --force origin main'
Assert-Decision $out 'deny' '40. git push --force origin main -> deny'

# 41. git push --force context message
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git push --force origin main'
Assert-ContextContains $out 'remote history' '41. git push --force context mentions remote history'

# 42. git push --force-with-lease -> ask (new, distinguished from --force)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git push --force-with-lease origin main'
Assert-Decision $out 'ask' '42. git push --force-with-lease origin main -> ask'

# 43. git push --force-with-lease context message
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git push --force-with-lease origin main'
Assert-ContextContains $out 'confirmation' '43. git push --force-with-lease context mentions confirmation'

# 44. git clean -fd context mentions requires confirmation
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git clean -fd'
Assert-ContextContains $out 'requires confirmation' '44. git clean -fd context mentions requires confirmation'

# 45. Chain: git push --force + git push --force-with-lease -> deny wins
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git push --force-with-lease origin main && git push --force origin dev'
Assert-Decision $out 'deny' '45. git push --force-with-lease + --force chained -> deny (deny wins)'

# ---------------------------------------------------------------------------
Write-Host "`n--- Conventional commit types ---" -ForegroundColor White
# ---------------------------------------------------------------------------

# 46. docs prefix
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -m "docs: update readme"'
Assert-Decision $out 'allow' '46. git commit -m "docs: update readme" -> allow'

# 47. chore prefix
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -m "chore: cleanup"'
Assert-Decision $out 'allow' '47. git commit -m "chore: cleanup" -> allow'

# 48. refactor prefix
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -m "refactor: extract method"'
Assert-Decision $out 'allow' '48. git commit -m "refactor: extract method" -> allow'

# 49. test prefix
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -m "test: add unit tests"'
Assert-Decision $out 'allow' '49. git commit -m "test: add unit tests" -> allow'

# 50. ci prefix
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -m "ci: fix pipeline"'
Assert-Decision $out 'allow' '50. git commit -m "ci: fix pipeline" -> allow'

# 51. build prefix
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -m "build: update deps"'
Assert-Decision $out 'allow' '51. git commit -m "build: update deps" -> allow'

# 52. perf prefix
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -m "perf: optimize query"'
Assert-Decision $out 'allow' '52. git commit -m "perf: optimize query" -> allow'

# 53. style prefix
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -m "style: formatting"'
Assert-Decision $out 'allow' '53. git commit -m "style: formatting" -> allow'

# 54. revert prefix
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -m "revert: undo feat"'
Assert-Decision $out 'allow' '54. git commit -m "revert: undo feat" -> allow'

# 55. Breaking change with ! (feat!)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -m "feat!: breaking change"'
Assert-Decision $out 'allow' '55. git commit -m "feat!: breaking change" -> allow'

# 56. Scope + breaking change (fix(auth)!)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -m "fix(auth)!: breaking fix"'
Assert-Decision $out 'allow' '56. git commit -m "fix(auth)!: breaking fix" -> allow'

# ---------------------------------------------------------------------------
Write-Host "`n--- Git rebase ---" -ForegroundColor White
# ---------------------------------------------------------------------------

# 57. git rebase main -> ask
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git rebase main'
Assert-Decision $out 'ask' '57. git rebase main -> ask'

# 58. git rebase -i HEAD~3 -> ask
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git rebase -i HEAD~3'
Assert-Decision $out 'ask' '58. git rebase -i HEAD~3 -> ask'

# 59. git rebase --interactive main -> ask
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git rebase --interactive main'
Assert-Decision $out 'ask' '59. git rebase --interactive main -> ask'

# 60. git rebase context mentions history
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git rebase main'
Assert-ContextContains $out 'history' '60. git rebase context mentions history'

# ---------------------------------------------------------------------------
Write-Host "`n--- Filesystem destructive commands ---" -ForegroundColor White
# ---------------------------------------------------------------------------

# 61. rm -rf -> deny
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'rm -rf /tmp/build'
Assert-Decision $out 'deny' '61. rm -rf /tmp/build -> deny'

# 62. rm -r -> deny
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'rm -r ./dist'
Assert-Decision $out 'deny' '62. rm -r ./dist -> deny'

# 63. rm -fR (capital R) -> deny
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'rm -fR ./node_modules'
Assert-Decision $out 'deny' '63. rm -fR ./node_modules -> deny'

# 64. rm -rf context mentions Destructive
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'rm -rf /tmp/build'
Assert-ContextContains $out 'Destructive' '64. rm -rf context mentions Destructive'

# 65. rmdir /s /q (PS1 only) -> deny
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'rmdir /s /q C:\temp'
Assert-Decision $out 'deny' '65. rmdir /s /q C:\temp -> deny'

# 66. del /s (PS1 only) -> deny
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'del /s C:\temp'
Assert-Decision $out 'deny' '66. del /s C:\temp -> deny'

# ---------------------------------------------------------------------------
Write-Host "`n--- Bash tool_name ---" -ForegroundColor White
# ---------------------------------------------------------------------------

# 67. Bash + git push -> ask
$out = Invoke-Hook -ToolName 'Bash' -Command 'git push origin main'
Assert-Decision $out 'ask' '67. Bash + git push origin main -> ask'

# 68. Bash + valid commit -> allow
$out = Invoke-Hook -ToolName 'Bash' -Command 'git commit -m "feat: x"'
Assert-Decision $out 'allow' '68. Bash + git commit -m "feat: x" -> allow'

# 69. Bash + bad commit -> deny
$out = Invoke-Hook -ToolName 'Bash' -Command 'git commit -m "bad"'
Assert-Decision $out 'deny' '69. Bash + git commit -m "bad" -> deny'

# ---------------------------------------------------------------------------
Write-Host "`n--- Safe variants (passthrough) ---" -ForegroundColor White
# ---------------------------------------------------------------------------

# 70. git reset --soft HEAD~1 -> no output
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git reset --soft HEAD~1'
Assert-NoOutput $out '70. git reset --soft HEAD~1 -> no output'

# 71. git reset --mixed HEAD~1 -> no output
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git reset --mixed HEAD~1'
Assert-NoOutput $out '71. git reset --mixed HEAD~1 -> no output'

# 72. git reset HEAD file.txt -> no output (unstaging)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git reset HEAD file.txt'
Assert-NoOutput $out '72. git reset HEAD file.txt -> no output'

# 73. git clean -n -> no output (dry-run)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git clean -n'
Assert-NoOutput $out '73. git clean -n -> no output (dry-run)'

# 74. git clean --dry-run -> no output
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git clean --dry-run'
Assert-NoOutput $out '74. git clean --dry-run -> no output'

# 75. git stash -> no output
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git stash'
Assert-NoOutput $out '75. git stash -> no output'

# 76. git stash list -> no output
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git stash list'
Assert-NoOutput $out '76. git stash list -> no output'

# 77. git stash pop -> no output
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git stash pop'
Assert-NoOutput $out '77. git stash pop -> no output'

# 78. git stash apply -> no output
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git stash apply'
Assert-NoOutput $out '78. git stash apply -> no output'

# 79. Remove-Item without -Recurse -Force -> no output (PS1 only)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'Remove-Item C:\temp'
Assert-NoOutput $out '79. Remove-Item C:\temp -> no output'

# 80. Remove-Item -Recurse only -> no output (PS1 only)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'Remove-Item -Recurse C:\temp'
Assert-NoOutput $out '80. Remove-Item -Recurse C:\temp -> no output'

# 81. Remove-Item -Force only -> no output (PS1 only)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'Remove-Item -Force C:\temp'
Assert-NoOutput $out '81. Remove-Item -Force C:\temp -> no output'

# 82. git add . -> no output
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git add .'
Assert-NoOutput $out '82. git add . -> no output'

# 83. git status -> no output
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git status'
Assert-NoOutput $out '83. git status -> no output'

# 84. git log -> no output
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git log'
Assert-NoOutput $out '84. git log -> no output'

# 85. git diff -> no output
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git diff'
Assert-NoOutput $out '85. git diff -> no output'

# ---------------------------------------------------------------------------
Write-Host "`n--- Chain splitting with || operator ---" -ForegroundColor White
# ---------------------------------------------------------------------------

# 86. git push || echo -> ask (push detected through ||)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git push origin main || echo "failed"'
Assert-Decision $out 'ask' '86. git push origin main || echo "failed" -> ask'

# 87. bad commit || git push -> deny (deny wins)
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git commit -m "bad" || git push'
Assert-Decision $out 'deny' '87. git commit -m "bad" || git push -> deny'

# ---------------------------------------------------------------------------
Write-Host "`n--- Git push variants ---" -ForegroundColor White
# ---------------------------------------------------------------------------

# 88. git push (bare, no remote) -> ask
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git push'
Assert-Decision $out 'ask' '88. git push (bare) -> ask'

# 89. git push -u origin feature -> ask
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git push -u origin feature'
Assert-Decision $out 'ask' '89. git push -u origin feature -> ask'

# 90. git push --tags -> ask
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git push --tags'
Assert-Decision $out 'ask' '90. git push --tags -> ask'

# ---------------------------------------------------------------------------
Write-Host "`n--- Git tag variants ---" -ForegroundColor White
# ---------------------------------------------------------------------------

# 91. git tag -a (annotated) -> ask
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git tag -a v1.0 -m "release"'
Assert-Decision $out 'ask' '91. git tag -a v1.0 -m "release" -> ask'

# 92. git tag -d (delete) -> ask
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git tag -d v1.0'
Assert-Decision $out 'ask' '92. git tag -d v1.0 -> ask'

# ---------------------------------------------------------------------------
Write-Host "`n--- Context accumulation ---" -ForegroundColor White
# ---------------------------------------------------------------------------

# 93-95. Chain push + bad commit: deny, context has both "confirmation" and "conventional"
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git push origin main; git commit -m "bad"'
Assert-Decision $out 'deny' '93. push + bad commit chained with ; -> deny'
Assert-ContextContains $out 'confirmation' '94. accumulated context contains confirmation (from push)'
Assert-ContextContains $out 'conventional' '95. accumulated context contains conventional (from commit)'

# ---------------------------------------------------------------------------
Write-Host "`n--- git reset --hard with ref ---" -ForegroundColor White
# ---------------------------------------------------------------------------

# 96. git reset --hard HEAD~1 -> ask
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git reset --hard HEAD~1'
Assert-Decision $out 'ask' '96. git reset --hard HEAD~1 -> ask'

# 97. git reset --hard origin/main -> ask
$out = Invoke-Hook -ToolName 'run_in_terminal' -Command 'git reset --hard origin/main'
Assert-Decision $out 'ask' '97. git reset --hard origin/main -> ask'

# ===========================================================================
# Summary
# ===========================================================================
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "Total: $script:Total | Passed: $script:Passed | Failed: $script:Failed"

if ($script:Failed -gt 0) {
    Write-Host "SOME TESTS FAILED" -ForegroundColor Red
    exit 1
} else {
    Write-Host "ALL TESTS PASSED" -ForegroundColor Green
    exit 0
}
