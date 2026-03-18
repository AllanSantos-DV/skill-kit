# Test suite for hooks/lesson-injector.ps1
# PS 5.1 compatible — no ternary, no ??, no ?., no `u{}.
# Run: powershell -ExecutionPolicy Bypass -File tests/hooks/test-lesson-injector.ps1

$ErrorActionPreference = 'Stop'
$script:Passed = 0
$script:Failed = 0
$script:HookPath = (Resolve-Path "$PSScriptRoot\..\..\hooks\lesson-injector.ps1").Path

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Assert-Equal {
    param([string]$Actual, [string]$Expected, [string]$TestName)
    if ($Actual -eq $Expected) {
        Write-Host "  PASS: $TestName" -ForegroundColor Green
        $script:Passed++
    } else {
        Write-Host "  FAIL: $TestName" -ForegroundColor Red
        Write-Host "    Expected: '$Expected'" -ForegroundColor Yellow
        Write-Host "    Actual:   '$Actual'" -ForegroundColor Yellow
        $script:Failed++
    }
}

function Assert-Empty {
    param([string]$Actual, [string]$TestName)
    if ([string]::IsNullOrWhiteSpace($Actual)) {
        Write-Host "  PASS: $TestName" -ForegroundColor Green
        $script:Passed++
    } else {
        Write-Host "  FAIL: $TestName" -ForegroundColor Red
        Write-Host "    Expected empty but got: '$Actual'" -ForegroundColor Yellow
        $script:Failed++
    }
}

function Assert-Contains {
    param([string]$Actual, [string]$Substring, [string]$TestName)
    if ($Actual -and $Actual.Contains($Substring)) {
        Write-Host "  PASS: $TestName" -ForegroundColor Green
        $script:Passed++
    } else {
        Write-Host "  FAIL: $TestName" -ForegroundColor Red
        Write-Host "    Expected to contain: '$Substring'" -ForegroundColor Yellow
        Write-Host "    Actual: '$Actual'" -ForegroundColor Yellow
        $script:Failed++
    }
}

function Assert-NotContains {
    param([string]$Actual, [string]$Substring, [string]$TestName)
    if (-not $Actual -or -not $Actual.Contains($Substring)) {
        Write-Host "  PASS: $TestName" -ForegroundColor Green
        $script:Passed++
    } else {
        Write-Host "  FAIL: $TestName" -ForegroundColor Red
        Write-Host "    Expected NOT to contain: '$Substring'" -ForegroundColor Yellow
        Write-Host "    Actual: '$Actual'" -ForegroundColor Yellow
        $script:Failed++
    }
}

function Assert-ValidJson {
    param([string]$Actual, [string]$TestName)
    if ([string]::IsNullOrWhiteSpace($Actual)) {
        Write-Host "  FAIL: $TestName" -ForegroundColor Red
        Write-Host "    Expected valid JSON but got empty output" -ForegroundColor Yellow
        $script:Failed++
        return
    }
    try {
        $obj = $Actual | ConvertFrom-Json
        if ($obj.decision -eq 'add') {
            Write-Host "  PASS: $TestName" -ForegroundColor Green
            $script:Passed++
        } else {
            Write-Host "  FAIL: $TestName" -ForegroundColor Red
            Write-Host "    JSON parsed but decision='$($obj.decision)', expected 'add'" -ForegroundColor Yellow
            $script:Failed++
        }
    } catch {
        Write-Host "  FAIL: $TestName" -ForegroundColor Red
        Write-Host "    Not valid JSON: $Actual" -ForegroundColor Yellow
        $script:Failed++
    }
}

function Create-LessonFile {
    param(
        [string]$Dir,
        [string]$Id,
        [string[]]$Tags,
        [double]$Confidence,
        [string]$Resumo
    )
    if (-not (Test-Path $Dir)) {
        New-Item -ItemType Directory -Path $Dir -Force | Out-Null
    }
    $tagsStr = ($Tags | ForEach-Object { $_ }) -join ', '
    $content = @"
---
id: $Id
tags: [$tagsStr]
confidence: $Confidence
created: 2026-03-15
cause: test-fixture
---

# Lesson $Id

## Resumo
$Resumo

## Registro
- **O que aconteceu**: test fixture
- **Causa raiz**: test-fixture
"@
    $filePath = Join-Path $Dir "$Id-test.md"
    [System.IO.File]::WriteAllText($filePath, $content)
}

function Run-Hook {
    param(
        [string]$InputJson,
        [switch]$NoLessonsDir,
        [switch]$EmptyLessonsDir,
        [scriptblock]$SetupLessons
    )
    $originalProfile = $env:USERPROFILE
    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("lesson-test-" + [guid]::NewGuid().ToString('N').Substring(0,8))
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    try {
        $env:USERPROFILE = $tempDir

        if (-not $NoLessonsDir) {
            $lessonsDir = Join-Path $tempDir '.copilot\lessons'
            if ($EmptyLessonsDir -or $SetupLessons) {
                New-Item -ItemType Directory -Path $lessonsDir -Force | Out-Null
            }
            if ($SetupLessons) {
                & $SetupLessons $lessonsDir
            }
        }

        # Run the hook in a subprocess with USERPROFILE overridden.
        # Write input to temp file, then pipe it into the hook from within the subprocess.
        $inputFile = Join-Path $tempDir 'hook-input.txt'
        [System.IO.File]::WriteAllText($inputFile, $InputJson)
        $escapedTempDir = $tempDir -replace "'","''"
        $escapedHook = $script:HookPath -replace "'","''"
        $escapedInputFile = $inputFile -replace "'","''"
        $result = powershell -NoProfile -ExecutionPolicy Bypass -Command "`$env:USERPROFILE = '$escapedTempDir'; Get-Content -Raw '$escapedInputFile' | powershell -NoProfile -ExecutionPolicy Bypass -File '$escapedHook'"
        if ($result -is [array]) {
            $result = $result -join [Environment]::NewLine
        }
        return $result
    } finally {
        $env:USERPROFILE = $originalProfile
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

Write-Host "`n=== lesson-injector.ps1 test suite ===" -ForegroundColor Cyan
Write-Host ""

# TEST 1: Empty stdin
Write-Host "TEST 1: Empty stdin -> no output"
$out = Run-Hook -InputJson ""
Assert-Empty $out "Empty stdin produces no output"

# TEST 2: Invalid JSON
Write-Host "TEST 2: Invalid JSON -> no output"
$out = Run-Hook -InputJson "not json at all"
Assert-Empty $out "Invalid JSON produces no output"

# TEST 3: JSON without prompt field
Write-Host "TEST 3: JSON without prompt field -> no output"
$out = Run-Hook -InputJson '{"someOtherField": "value"}'
Assert-Empty $out "JSON without prompt field produces no output"

# TEST 4: chatMessage field extracted
Write-Host "TEST 4: chatMessage field extracted"
$out = Run-Hook -InputJson '{"chatMessage": "criar um novo hook"}' -SetupLessons {
    param($dir)
    Create-LessonFile -Dir $dir -Id "L001" -Tags @("create","hooks") -Confidence 0.7 -Resumo "Verificar se o artefato ja existe antes de criar um novo."
}
Assert-ValidJson $out "chatMessage returns valid JSON"
Assert-Contains $out "L001" "chatMessage output contains L001"

# TEST 5: user_message fallback
Write-Host "TEST 5: user_message fallback field"
$out = Run-Hook -InputJson '{"user_message": "criar um novo hook"}' -SetupLessons {
    param($dir)
    Create-LessonFile -Dir $dir -Id "L001" -Tags @("create","hooks") -Confidence 0.7 -Resumo "Verificar se o artefato ja existe antes de criar um novo."
}
Assert-ValidJson $out "user_message returns valid JSON"
Assert-Contains $out "L001" "user_message output contains L001"

# TEST 6: prompt fallback
Write-Host "TEST 6: prompt fallback field"
$out = Run-Hook -InputJson '{"prompt": "criar um novo hook"}' -SetupLessons {
    param($dir)
    Create-LessonFile -Dir $dir -Id "L001" -Tags @("create","hooks") -Confidence 0.7 -Resumo "Verificar se o artefato ja existe antes de criar um novo."
}
Assert-ValidJson $out "prompt returns valid JSON"
Assert-Contains $out "L001" "prompt output contains L001"

# TEST 7: data.chatMessage nested fallback
Write-Host "TEST 7: data.chatMessage nested fallback"
$out = Run-Hook -InputJson '{"data": {"chatMessage": "criar um novo hook"}}' -SetupLessons {
    param($dir)
    Create-LessonFile -Dir $dir -Id "L001" -Tags @("create","hooks") -Confidence 0.7 -Resumo "Verificar se o artefato ja existe antes de criar um novo."
}
Assert-ValidJson $out "data.chatMessage returns valid JSON"
Assert-Contains $out "L001" "data.chatMessage output contains L001"

# TEST 8: Prompt with no matching keywords
Write-Host "TEST 8: Prompt with no matching keywords -> no output"
$out = Run-Hook -InputJson '{"chatMessage": "ola, como vai?"}' -SetupLessons {
    param($dir)
    Create-LessonFile -Dir $dir -Id "L001" -Tags @("create","hooks") -Confidence 0.7 -Resumo "Verificar se o artefato ja existe antes de criar um novo."
}
Assert-Empty $out "No matching keywords produces no output"

# TEST 9: No lessons directory
Write-Host "TEST 9: No lessons directory -> no output"
$out = Run-Hook -InputJson '{"chatMessage": "criar um hook"}' -NoLessonsDir
Assert-Empty $out "No lessons directory produces no output"

# TEST 10: Empty lessons directory
Write-Host "TEST 10: Empty lessons directory -> no output"
$out = Run-Hook -InputJson '{"chatMessage": "criar um hook"}' -EmptyLessonsDir
Assert-Empty $out "Empty lessons directory produces no output"

# TEST 11: PT-BR keyword 'editar' -> tag 'modify' matched
Write-Host "TEST 11: PT-BR keyword 'editar' -> tag 'modify' matched"
$out = Run-Hook -InputJson '{"chatMessage": "editar o arquivo de config"}' -SetupLessons {
    param($dir)
    Create-LessonFile -Dir $dir -Id "L001" -Tags @("modify","file-operations") -Confidence 0.7 -Resumo "Sempre fazer backup antes de modificar."
    Create-LessonFile -Dir $dir -Id "L002" -Tags @("create","hooks") -Confidence 0.7 -Resumo "Verificar existencia antes de criar."
}
Assert-Contains $out "L001" "PT-BR 'editar' matches modify tag -> L001 present"
Assert-NotContains $out "L002" "PT-BR 'editar' does not match create tag -> L002 absent"

# TEST 12: EN keyword 'fix' -> tag 'fix' matched
Write-Host "TEST 12: EN keyword 'fix' -> tag 'fix' matched"
$out = Run-Hook -InputJson '{"chatMessage": "fix the bug in the parser"}' -SetupLessons {
    param($dir)
    Create-LessonFile -Dir $dir -Id "L001" -Tags @("fix","regex") -Confidence 0.7 -Resumo "Sempre testar regex isoladamente."
    Create-LessonFile -Dir $dir -Id "L002" -Tags @("create","hooks") -Confidence 0.7 -Resumo "Verificar existencia antes de criar."
}
Assert-Contains $out "L001" "EN 'fix' matches fix tag -> L001 present"
Assert-NotContains $out "L002" "EN 'fix' does not match create tag -> L002 absent"

# TEST 13: Multiple keywords -> multiple tags matched
Write-Host "TEST 13: Multiple keywords -> multiple tags matched"
$out = Run-Hook -InputJson '{"chatMessage": "criar um novo hook e corrigir o test"}' -SetupLessons {
    param($dir)
    Create-LessonFile -Dir $dir -Id "L001" -Tags @("create","hooks") -Confidence 0.7 -Resumo "Verificar existencia antes de criar."
    Create-LessonFile -Dir $dir -Id "L002" -Tags @("fix","testing") -Confidence 0.7 -Resumo "Rodar testes antes de publicar."
    Create-LessonFile -Dir $dir -Id "L003" -Tags @("modify","git") -Confidence 0.7 -Resumo "Fazer commit atomico."
}
Assert-Contains $out "L001" "Multiple keywords -> L001 (create,hooks) present"
Assert-Contains $out "L002" "Multiple keywords -> L002 (fix,testing) present"
Assert-NotContains $out "L003" "Multiple keywords -> L003 (modify,git) absent"

# TEST 14: Confidence ordering — top 5 DESC
Write-Host "TEST 14: Confidence ordering - top 5 DESC"
$out = Run-Hook -InputJson '{"chatMessage": "editar arquivos"}' -SetupLessons {
    param($dir)
    Create-LessonFile -Dir $dir -Id "L001" -Tags @("modify","file-operations") -Confidence 0.5 -Resumo "Lesson com confidence baixa."
    Create-LessonFile -Dir $dir -Id "L002" -Tags @("modify","git") -Confidence 0.9 -Resumo "Lesson com confidence alta."
    Create-LessonFile -Dir $dir -Id "L003" -Tags @("modify","regex") -Confidence 0.7 -Resumo "Lesson com confidence media."
    Create-LessonFile -Dir $dir -Id "L004" -Tags @("modify","api") -Confidence 0.8 -Resumo "Lesson com confidence media-alta."
    Create-LessonFile -Dir $dir -Id "L005" -Tags @("modify","shell") -Confidence 0.6 -Resumo "Lesson com confidence media-baixa."
    Create-LessonFile -Dir $dir -Id "L006" -Tags @("modify","testing") -Confidence 0.95 -Resumo "Lesson com confidence mais alta."
}
Assert-Contains $out "L006" "Top 5 -> L006 (0.95) present"
Assert-Contains $out "L002" "Top 5 -> L002 (0.9) present"
Assert-Contains $out "L004" "Top 5 -> L004 (0.8) present"
Assert-Contains $out "L003" "Top 5 -> L003 (0.7) present"
Assert-Contains $out "L005" "Top 5 -> L005 (0.6) present"
Assert-NotContains $out "L001" "Top 5 -> L001 (0.5) excluded"

# Verify ordering: L006 before L002 before L004 before L003 before L005
$i6 = $out.IndexOf('L006')
$i2 = $out.IndexOf('L002')
$i4 = $out.IndexOf('L004')
$i3 = $out.IndexOf('L003')
$i5 = $out.IndexOf('L005')
$ordered = ($i6 -lt $i2) -and ($i2 -lt $i4) -and ($i4 -lt $i3) -and ($i3 -lt $i5)
if ($ordered) {
    Write-Host "  PASS: Confidence order is L006 > L002 > L004 > L003 > L005" -ForegroundColor Green
    $script:Passed++
} else {
    Write-Host "  FAIL: Confidence order incorrect" -ForegroundColor Red
    Write-Host "    Positions: L006=$i6, L002=$i2, L004=$i4, L003=$i3, L005=$i5" -ForegroundColor Yellow
    $script:Failed++
}

# TEST 15: No tag overlap -> no output
Write-Host "TEST 15: No tag overlap -> no output"
$out = Run-Hook -InputJson '{"chatMessage": "pesquisar documentos"}' -SetupLessons {
    param($dir)
    Create-LessonFile -Dir $dir -Id "L001" -Tags @("create","hooks") -Confidence 0.7 -Resumo "Verificar existencia antes de criar."
}
Assert-Empty $out "No tag overlap produces no output"

# TEST 16: Lesson with missing frontmatter -> skipped
Write-Host "TEST 16: Lesson with missing frontmatter -> skipped"
$out = Run-Hook -InputJson '{"chatMessage": "criar algo"}' -SetupLessons {
    param($dir)
    Create-LessonFile -Dir $dir -Id "L001" -Tags @("create") -Confidence 0.7 -Resumo "Verificar existencia antes de criar."
    # Create a file without frontmatter
    $noFmPath = Join-Path $dir "L002-nofm.md"
    [System.IO.File]::WriteAllText($noFmPath, "# No frontmatter here`nJust plain content.")
}
Assert-Contains $out "L001" "Valid lesson L001 present"
Assert-NotContains $out "L002" "No-frontmatter lesson L002 skipped"

# TEST 17: Lesson with missing tags -> skipped
Write-Host "TEST 17: Lesson with missing tags -> skipped"
$out = Run-Hook -InputJson '{"chatMessage": "criar algo"}' -SetupLessons {
    param($dir)
    Create-LessonFile -Dir $dir -Id "L001" -Tags @("create") -Confidence 0.7 -Resumo "Verificar existencia antes de criar."
    # Create a file with frontmatter but no tags field
    $noTagsPath = Join-Path $dir "L002-notags.md"
    $noTagsContent = @"
---
id: L002
confidence: 0.8
created: 2026-03-15
---

# Lesson without tags

## Resumo
Esta licao nao tem campo tags no frontmatter.
"@
    [System.IO.File]::WriteAllText($noTagsPath, $noTagsContent)
}
Assert-Contains $out "L001" "Valid lesson L001 present"
Assert-NotContains $out "L002" "No-tags lesson L002 skipped"

# TEST 18: 500 char limit enforced
Write-Host "TEST 18: 500 char limit enforced"
$out = Run-Hook -InputJson '{"chatMessage": "editar algo"}' -SetupLessons {
    param($dir)
    $lr = "A" * 150
    for ($i = 1; $i -le 6; $i++) {
        $id = "L{0:D3}" -f $i
        Create-LessonFile -Dir $dir -Id $id -Tags @("modify") -Confidence (0.9 - ($i * 0.05)) -Resumo $lr
    }
}
# The hook enforces 500 char limit on the content field, not the full JSON
$contentLen = 0
try {
    $parsed = $out | ConvertFrom-Json
    $contentLen = $parsed.content.Length
} catch {
    $contentLen = $out.Length
}
if ($contentLen -le 500) {
    Write-Host "  PASS: Content length ($contentLen) <= 500" -ForegroundColor Green
    $script:Passed++
} else {
    Write-Host "  FAIL: Content length ($contentLen) > 500" -ForegroundColor Red
    $script:Failed++
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "=== Results ===" -ForegroundColor Cyan
Write-Host "  Passed: $script:Passed" -ForegroundColor Green
Write-Host "  Failed: $script:Failed" -ForegroundColor $(if ($script:Failed -gt 0) { "Red" } else { "Green" })
Write-Host ""

if ($script:Failed -gt 0) { exit 1 }
exit 0
