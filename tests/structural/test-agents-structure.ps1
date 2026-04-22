# Structural tests for agent .agent.md files
# PS 5.1 compatible — no ternary, no ??, no ?., no `u{}.
# Run: powershell -ExecutionPolicy Bypass -File tests/structural/test-agents-structure.ps1

$ErrorActionPreference = 'Continue'
$script:Passed = 0
$script:Failed = 0
$script:Skipped = 0

$WorkspaceAgents = Join-Path $PSScriptRoot '..\..\agents'
$InstalledAgents = Join-Path $env:USERPROFILE '.copilot\agents'
$WorkspaceSkills = Join-Path $PSScriptRoot '..\..\skills'

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
    # Find block between first --- and second ---
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

function Has-FmSection {
    param([string]$Frontmatter, [string]$Section)
    foreach ($line in ($Frontmatter -split "`n")) {
        if ($line -match "^${Section}:") {
            return $true
        }
    }
    return $false
}

function Extract-HookScripts {
    # Extract script paths from command: lines in frontmatter
    # Supports both legacy bash/powershell format and new node format
    param([string]$Frontmatter)
    $scripts = @()
    foreach ($line in ($Frontmatter -split "`n")) {
        $trimmed = $line.Trim()
        # Match command: "node hooks/X.js" or similar
        if ($trimmed -match '^command:\s*"?(.+)"?\s*$') {
            $cmd = $Matches[1].Trim('"')
            # Node.js hook: node hooks/X.js
            if ($cmd -match '^node\s+(.+\.js)$') {
                $scripts += @{ Type = 'node'; Path = $Matches[1].Trim() }
            }
            # Legacy: bash ~/.copilot/hooks/scripts/X.sh
            elseif ($cmd -match '(?:bash|sh)\s+(.+)$') {
                $scripts += @{ Type = 'bash'; Path = $Matches[1].Trim() }
            }
        }
        # Legacy: Match windows: "powershell ... '...\script.ps1'"
        if ($trimmed -match '^windows:\s*"?(.+)"?\s*$') {
            $cmd = $Matches[1].Trim('"')
            if ($cmd -match "'([^']+\.ps1)'") {
                $scripts += @{ Type = 'windows'; Path = $Matches[1].Trim() }
            }
        }
    }
    return $scripts
}

function Extract-YamlList {
    # Extract items from a YAML list section (  - item)
    param([string]$Frontmatter, [string]$Section)
    $items = @()
    $inSection = $false
    foreach ($line in ($Frontmatter -split "`n")) {
        if ($line -match "^${Section}:") {
            $inSection = $true
            continue
        }
        if ($inSection) {
            # End of section: line that starts a new top-level key
            if ($line -match '^\S' -and $line -notmatch '^\s*-') {
                break
            }
            if ($line -match '^\s+-\s+(.+)$') {
                $items += $Matches[1].Trim()
            }
        }
    }
    return $items
}

function Extract-HandoffAgents {
    # Extract agent: values from handoffs section
    param([string]$Frontmatter)
    $agents = @()
    $inHandoffs = $false
    foreach ($line in ($Frontmatter -split "`n")) {
        if ($line -match '^handoffs:') {
            $inHandoffs = $true
            continue
        }
        if ($inHandoffs) {
            if ($line -match '^\S' -and $line -notmatch '^\s') {
                break
            }
            if ($line -match '^\s+agent:\s*(.+)$') {
                $agents += $Matches[1].Trim()
            }
        }
    }
    return $agents
}

function Normalize-SkillName {
    param([string]$Name)
    $normalized = $Name.ToLower()
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
    # Find skills mentioned in body as **skill-name** skill pattern
    param([string]$Body)
    $mentions = @()
    $pattern = '\*\*([a-zA-ZÀ-ÿ0-9_-]+)\*\*\s+skill'
    $matches = [regex]::Matches($Body, $pattern, 'IgnoreCase')
    foreach ($m in $matches) {
        $name = $m.Groups[1].Value
        if ($mentions -notcontains $name) {
            $mentions += $name
        }
    }
    return $mentions
}

function Resolve-WindowsHookPath {
    # Resolve $HOME in hook paths to actual path
    param([string]$HookPath)
    $resolved = $HookPath -replace '\$HOME', $env:USERPROFILE
    $resolved = $resolved -replace '\$env:USERPROFILE', $env:USERPROFILE
    # Handle escaped backslashes from YAML
    $resolved = $resolved -replace '\\\\', '\'
    return $resolved
}

function Resolve-BashHookPath {
    # Resolve ~ in bash hook paths
    param([string]$HookPath)
    $resolved = $HookPath -replace '^~/', ($env:USERPROFILE.Replace('\', '/') + '/')
    # Convert to Windows path
    $resolved = $resolved.Replace('/', '\')
    return $resolved
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

Write-Host "`n=== Agent Structure Tests ===" -ForegroundColor Cyan
Write-Host "Workspace: $WorkspaceAgents"
Write-Host "Installed: $InstalledAgents"
Write-Host ""

$agentFiles = Get-ChildItem -Path $WorkspaceAgents -Filter '*.agent.md' -File -ErrorAction SilentlyContinue
if (-not $agentFiles -or $agentFiles.Count -eq 0) {
    Write-Host "No .agent.md files found in workspace." -ForegroundColor Yellow
    exit 0
}

foreach ($file in $agentFiles) {
    $agentName = $file.Name -replace '\.agent\.md$', ''
    Write-Host "--- Agent: $agentName ($($file.Name)) ---" -ForegroundColor Cyan

    $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
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

    # 4. name matches filename
    if ($fmName -and $fmName -eq $agentName) {
        Pass "name matches filename ('$fmName')"
    } else {
        Fail "name matches filename" "name='$fmName', filename='$agentName'"
    }

    # 5. Description < 300 chars
    if ($fmDesc) {
        $descLen = $fmDesc.Length
        if ($descLen -lt 300) {
            Pass "description < 300 chars ($descLen)"
        } else {
            Fail "description < 300 chars" "Length: $descLen"
        }
    }

    # --- Hook tests (bug workaround) ---
    # Note: PreToolUse hooks may be in hooks/hooks.json (global) instead of frontmatter
    $hasHooks = Has-FmSection -Frontmatter $frontmatter -Section 'hooks'
    $hasPreToolUse = Has-FmSection -Frontmatter $frontmatter -Section '  PreToolUse'
    # Also check indented form
    if (-not $hasPreToolUse) {
        foreach ($line in ($frontmatter -split "`n")) {
            if ($line -match '^\s*PreToolUse:') {
                $hasPreToolUse = $true
                break
            }
        }
    }

    # 6. If has hooks:, check for PreToolUse: (crash workaround) — or global hooks.json
    $hooksJsonPath = Join-Path $PSScriptRoot '..\..\hooks\hooks.json'
    $hasGlobalPreToolUse = $false
    if (Test-Path $hooksJsonPath) {
        $hooksJsonContent = Get-Content $hooksJsonPath -Raw -ErrorAction SilentlyContinue
        if ($hooksJsonContent -match '"PreToolUse"') { $hasGlobalPreToolUse = $true }
    }
    if ($hasHooks) {
        if ($hasPreToolUse -or $hasGlobalPreToolUse) {
            Pass "PreToolUse: present (frontmatter or hooks.json)"
        } else {
            Fail "PreToolUse: present (frontmatter or hooks.json)" "hooks: present but PreToolUse: missing everywhere — will crash as subagent"
        }
    }

    # 7. Hook scripts exist
    if ($hasHooks) {
        $hookScripts = Extract-HookScripts -Frontmatter $frontmatter
        foreach ($hs in $hookScripts) {
            if ($hs.Type -eq 'node') {
                # Node.js hook: resolve relative to workspace root
                $resolved = Join-Path (Join-Path $PSScriptRoot '..\..') $hs.Path
                if (Test-Path $resolved) {
                    Pass "Hook script exists: $($hs.Path)"
                } else {
                    Fail "Hook script exists: $($hs.Path)" "Resolved to: $resolved (not found)"
                }
            } elseif ($hs.Type -eq 'bash') {
                # On Windows, shell scripts are not applicable — skip instead of fail
                $onWindows = $false
                if ($null -ne (Get-Variable -Name 'IsWindows' -ErrorAction SilentlyContinue)) {
                    $onWindows = $IsWindows
                } elseif ($env:OS -eq 'Windows_NT') {
                    $onWindows = $true
                }
                if ($onWindows) {
                    Skip "Hook script (shell): $($hs.Path)" "Windows - shell scripts not applicable"
                } else {
                    $resolved = Resolve-BashHookPath -HookPath $hs.Path
                    $parentDir = Split-Path $resolved -Parent
                    if (-not (Test-Path $parentDir)) {
                        Skip "Hook script exists: $($hs.Path)" "Installed hooks dir not found — skip"
                    } elseif (Test-Path $resolved) {
                        Pass "Hook script exists: $($hs.Path)"
                    } else {
                        Fail "Hook script exists: $($hs.Path)" "Resolved to: $resolved (not found)"
                    }
                }
            } elseif ($hs.Type -eq 'windows') {
                $resolved = Resolve-WindowsHookPath -HookPath $hs.Path
                $parentDir = Split-Path $resolved -Parent
                if (-not (Test-Path $parentDir)) {
                    Skip "Hook script exists: $($hs.Path)" "Installed hooks dir not found — skip"
                } elseif (Test-Path $resolved) {
                    Pass "Hook script exists: $($hs.Path)"
                } else {
                    Fail "Hook script exists: $($hs.Path)" "Resolved to: $resolved (not found)"
                }
            }
        }
    }

    # --- Reference tests ---

    # 8. agents: list — each must exist as .agent.md
    $agentsList = Extract-YamlList -Frontmatter $frontmatter -Section 'agents'
    foreach ($ref in $agentsList) {
        $refFile = Join-Path $WorkspaceAgents "$ref.agent.md"
        if (Test-Path $refFile) {
            Pass "Referenced agent exists: $ref"
        } else {
            Fail "Referenced agent exists: $ref" "Expected: $refFile"
        }
    }

    # 9. handoffs agent: targets must exist
    $handoffAgents = Extract-HandoffAgents -Frontmatter $frontmatter
    foreach ($ref in $handoffAgents) {
        $refFile = Join-Path $WorkspaceAgents "$ref.agent.md"
        if (Test-Path $refFile) {
            Pass "Handoff agent exists: $ref"
        } else {
            Fail "Handoff agent exists: $ref" "Expected: $refFile"
        }
    }

    # --- Sync tests ---
    $installedDirExists = Test-Path $InstalledAgents

    # 10. Workspace file exists in installed dir
    $installedFile = Join-Path $InstalledAgents $file.Name
    if (-not $installedDirExists) {
        Skip "Installed copy exists" "Installed dir not found — skip sync"
    } elseif (Test-Path $installedFile) {
        Pass "Installed copy exists"
    } else {
        Fail "Installed copy exists" "Expected: $installedFile"
    }

    # 11. Content identical
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

    # --- Skill references in body ---

    # Get body (everything after second ---)
    $bodyStart = $content.IndexOf("---", 3)
    $body = ''
    if ($bodyStart -ge 0) {
        $nextNewline = $content.IndexOf("`n", $bodyStart)
        if ($nextNewline -ge 0) {
            $body = $content.Substring($nextNewline + 1)
        }
    }

    # 12. Skills mentioned as **name** skill must exist
    $skillMentions = Extract-SkillMentions -Body $body
    foreach ($sk in $skillMentions) {
        $normalized = Normalize-SkillName -Name $sk
        $skillDir = Join-Path $WorkspaceSkills $normalized
        $skillFile = Join-Path $skillDir 'SKILL.md'
        if (Test-Path $skillFile) {
            Pass "Referenced skill exists: $sk"
        } else {
            Fail "Referenced skill exists: $sk" "Expected: $skillFile"
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
