# Structural tests for skill directories
# PS 5.1 compatible — no ternary, no ??, no ?., no `u{}.
# Run: powershell -ExecutionPolicy Bypass -File tests/structural/test-skills-structure.ps1

$ErrorActionPreference = 'Continue'
$script:Passed = 0
$script:Failed = 0
$script:Skipped = 0

$WorkspaceSkills = Join-Path $PSScriptRoot '..\..\skills'
$InstalledSkills = Join-Path $env:USERPROFILE '.copilot\skills'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Pass {
    param([string]$TestName)
    $checkmark = [char]::ConvertFromUtf32(0x2713)
    Write-Host "  $checkmark PASS: $TestName" -ForegroundColor Green
    $script:Passed++
}

function Fail {
    param([string]$TestName, [string]$Detail)
    $cross = [char]::ConvertFromUtf32(0x2717)
    Write-Host "  $cross FAIL: $TestName" -ForegroundColor Red
    if ($Detail) {
        Write-Host "    $Detail" -ForegroundColor Yellow
    }
    $script:Failed++
}

function Skip {
    param([string]$TestName, [string]$Detail)
    $skipMark = [char]::ConvertFromUtf32(0x2298)
    Write-Host "  $skipMark SKIP: $TestName" -ForegroundColor DarkYellow
    if ($Detail) {
        Write-Host "    $Detail" -ForegroundColor DarkYellow
    }
    $script:Skipped++
}

function Get-Frontmatter {
    param([string]$Content)
    $lines = $Content -split "`n"
    $inBlock = $false
    $fmLines = @()
    foreach ($line in $lines) {
        $trimmed = $line.TrimEnd("`r")
        if ($trimmed -eq '---') {
            if ($inBlock) { break }
            $inBlock = $true
            continue
        }
        if ($inBlock) {
            $fmLines += $trimmed
        }
    }
    return ($fmLines -join "`n")
}

function Get-FmField {
    param([string]$Frontmatter, [string]$Field)
    foreach ($line in ($Frontmatter -split "`n")) {
        if ($line -match "^${Field}:\s*`"?(.+?)`"?\s*$") {
            return $Matches[1]
        }
    }
    return $null
}

function Normalize-SkillName {
    # Normalize accented characters to ASCII for directory matching
    param([string]$Name)
    $normalized = $Name.ToLower()
    # Common accent mappings for Portuguese
    $normalized = $normalized -replace '[àáâãä]', 'a'
    $normalized = $normalized -replace '[èéêë]', 'e'
    $normalized = $normalized -replace '[ìíîï]', 'i'
    $normalized = $normalized -replace '[òóôõö]', 'o'
    $normalized = $normalized -replace '[ùúûü]', 'u'
    $normalized = $normalized -replace '[ç]', 'c'
    $normalized = $normalized -replace '[ñ]', 'n'
    return $normalized
}

function Extract-SkillMentions {
    # Find skills mentioned in body as **skill-name** skill (with "skill" word nearby)
    param([string]$Body, [string[]]$AllSkillNames)
    $mentions = @()

    # Strategy 1: **name** skill pattern (explicit skill reference)
    # Only include if the name looks like a skill (has hyphen) or matches a known skill
    $pattern1 = '\*\*([a-zA-ZÀ-ÿ0-9_-]+)\*\*\s+skill'
    $matches1 = [regex]::Matches($Body, $pattern1, 'IgnoreCase')
    foreach ($m in $matches1) {
        $name = $m.Groups[1].Value
        $normalized = Normalize-SkillName -Name $name
        $isKnown = $AllSkillNames -contains $normalized
        $hasHyphen = $name -match '-'
        if (($isKnown -or $hasHyphen) -and $mentions -notcontains $name) {
            $mentions += $name
        }
    }

    # Strategy 2: **name** that matches a known skill name (with accent normalization)
    $pattern2 = '\*\*([a-zA-ZÀ-ÿ0-9_-]+)\*\*'
    $matches2 = [regex]::Matches($Body, $pattern2)
    foreach ($m in $matches2) {
        $name = $m.Groups[1].Value
        $normalized = Normalize-SkillName -Name $name
        $isKnown = $false
        foreach ($sk in $AllSkillNames) {
            if ($sk -eq $normalized) {
                $isKnown = $true
                break
            }
        }
        if ($isKnown -and $mentions -notcontains $name) {
            $mentions += $name
        }
    }

    return $mentions
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

Write-Host "`n=== Skill Structure Tests ===" -ForegroundColor Cyan
Write-Host "Workspace: $WorkspaceSkills"
Write-Host "Installed: $InstalledSkills"
Write-Host ""

# Collect all skill directories (those containing SKILL.md)
$skillDirs = Get-ChildItem -Path $WorkspaceSkills -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'SKILL.md') }

if (-not $skillDirs -or $skillDirs.Count -eq 0) {
    Write-Host "No skill directories with SKILL.md found." -ForegroundColor Yellow
    exit 0
}

# Build a set of all valid skill names for cross-reference checks
$allSkillNames = @()
foreach ($dir in $skillDirs) {
    $allSkillNames += $dir.Name
}

foreach ($dir in $skillDirs) {
    $skillName = $dir.Name
    $skillFile = Join-Path $dir.FullName 'SKILL.md'

    Write-Host "--- Skill: $skillName ---" -ForegroundColor Cyan

    $content = [System.IO.File]::ReadAllText($skillFile, [System.Text.Encoding]::UTF8)
    # Strip BOM if present
    if ($content.Length -gt 0 -and [int]$content[0] -eq 0xFEFF) {
        $content = $content.Substring(1)
    }

    $frontmatter = Get-Frontmatter -Content $content
    $fmName = Get-FmField -Frontmatter $frontmatter -Field 'name'
    $fmDesc = Get-FmField -Frontmatter $frontmatter -Field 'description'

    # --- Frontmatter tests ---

    # 1. Starts with ---
    $firstLine = ($content -split "`n")[0].TrimEnd("`r")
    if ($firstLine -eq '---') {
        Pass "Starts with ---"
    } else {
        Fail "Starts with ---" "First line: '$firstLine'"
    }

    # 2. name: present
    if ($fmName) {
        Pass "name: present"
    } else {
        Fail "name: present" "Field 'name' not found in frontmatter"
    }

    # 3. description: present
    if ($fmDesc) {
        Pass "description: present"
    } else {
        Fail "description: present" "Field 'description' not found in frontmatter"
    }

    # 4. name matches directory name
    if ($fmName -and $fmName -eq $skillName) {
        Pass "name matches directory ('$fmName')"
    } else {
        Fail "name matches directory" "name='$fmName', directory='$skillName'"
    }

    # 5. Description contains USE FOR: and DO NOT USE FOR: (workflow skill pattern)
    #    Note: not all skills follow this pattern — report as warning-style fail
    if ($fmDesc) {
        $hasUseFor = $fmDesc -match 'USE FOR:'
        $hasDoNotUseFor = $fmDesc -match 'DO NOT USE FOR:'
        if ($hasUseFor -and $hasDoNotUseFor) {
            Pass "description has USE FOR: and DO NOT USE FOR:"
        } else {
            $missing = @()
            if (-not $hasUseFor) { $missing += 'USE FOR:' }
            if (-not $hasDoNotUseFor) { $missing += 'DO NOT USE FOR:' }
            Fail "description has USE FOR: and DO NOT USE FOR:" "Missing: $($missing -join ', ')"
        }
    }

    # --- Structure tests ---

    # 6. SKILL.md has more than 50 lines (not a stub)
    $lineCount = ($content -split "`n").Count
    if ($lineCount -gt 50) {
        Pass "SKILL.md has >50 lines ($lineCount)"
    } else {
        Fail "SKILL.md has >50 lines" "Only $lineCount lines — possible stub"
    }

    # 7. FEEDBACK.md exists OR inline feedback protocol (FEEDBACK:START in SKILL.md)
    $feedbackFile = Join-Path $dir.FullName 'FEEDBACK.md'
    $hasFeedbackFile = Test-Path $feedbackFile
    $hasInlineFeedback = $content -match 'FEEDBACK:START'
    if ($hasFeedbackFile -or $hasInlineFeedback) {
        if ($hasFeedbackFile -and $hasInlineFeedback) {
            Pass "Feedback: FEEDBACK.md + inline FEEDBACK:START"
        } elseif ($hasFeedbackFile) {
            Pass "Feedback: FEEDBACK.md exists"
        } else {
            Pass "Feedback: inline FEEDBACK:START present"
        }
    } else {
        Fail "Feedback mechanism" "Neither FEEDBACK.md nor FEEDBACK:START found"
    }

    # --- Sync tests ---
    $installedDirExists = Test-Path $InstalledSkills

    # 8. Skill exists in installed dir
    $installedDir = Join-Path $InstalledSkills $skillName
    $installedFile = Join-Path $installedDir 'SKILL.md'
    if (-not $installedDirExists) {
        Skip "Installed copy exists" "Installed dir not found — skip sync"
    } elseif (Test-Path $installedFile) {
        Pass "Installed copy exists"
    } else {
        Fail "Installed copy exists" "Expected: $installedFile"
    }

    # 9. SKILL.md identical between workspace and installed
    if ($installedDirExists -and (Test-Path $installedFile)) {
        $installedContent = [System.IO.File]::ReadAllText($installedFile, [System.Text.Encoding]::UTF8)
        if ($installedContent.Length -gt 0 -and [int]$installedContent[0] -eq 0xFEFF) {
            $installedContent = $installedContent.Substring(1)
        }
        if ($content -eq $installedContent) {
            Pass "Content identical (workspace == installed)"
        } else {
            Fail "Content identical (workspace == installed)" "Files differ"
        }
    }

    # --- Companion skill references ---

    # 10. Skills mentioned by bold name must exist in skills/
    # Get body after frontmatter
    $bodyStart = $content.IndexOf("---", 3)
    $body = ''
    if ($bodyStart -ge 0) {
        $nextNewline = $content.IndexOf("`n", $bodyStart)
        if ($nextNewline -ge 0) {
            $body = $content.Substring($nextNewline + 1)
        }
    }

    $mentions = Extract-SkillMentions -Body $body -AllSkillNames $allSkillNames
    foreach ($ref in $mentions) {
        $normalized = Normalize-SkillName -Name $ref
        if ($allSkillNames -contains $normalized) {
            Pass "Referenced skill exists: $ref"
        } else {
            Fail "Referenced skill exists: $ref" "Not found in $WorkspaceSkills"
        }
    }

    Write-Host ""
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
$total = $script:Passed + $script:Failed + $script:Skipped
Write-Host "=== Results ===" -ForegroundColor Cyan
Write-Host "Total: $total | Passed: $script:Passed | Failed: $script:Failed | Skipped: $script:Skipped" -ForegroundColor $(if ($script:Failed -gt 0) { "Red" } else { "Green" })
Write-Host ""

if ($script:Failed -gt 0) { exit 1 }
exit 0
