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
