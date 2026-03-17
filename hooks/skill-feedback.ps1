# Stop hook: capture skill feedback — only when skills with Feedback Protocol were used
$rawInput = @($input) -join "`n"
if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
if (-not $rawInput) { exit 0 }

try { $hookInput = $rawInput | ConvertFrom-Json } catch { exit 0 }
if ($hookInput.stop_hook_active -eq $true) { exit 0 }

$transcriptPath = $hookInput.transcript_path
if (-not $transcriptPath -or -not (Test-Path $transcriptPath)) { exit 0 }

$lines = Get-Content $transcriptPath -ErrorAction SilentlyContinue
if (-not $lines -or $lines.Count -lt 5) { exit 0 }

# Scope to current interaction: find last user.message
$startIdx = 0
for ($i = $lines.Count - 1; $i -ge 0; $i--) {
    if ($lines[$i] -like '*"user.message"*') {
        $startIdx = $i
        break
    }
}

# Find SKILL.md reads in tool.execution_start events
$skillPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

for ($i = $startIdx; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    if (-not $line -or $line.Length -lt 20) { continue }
    if ($line -notlike '*"tool.execution_start"*') { continue }

    try { $evt = $line | ConvertFrom-Json -ErrorAction Stop } catch { continue }

    if ($evt.type -eq 'tool.execution_start' -and $evt.data.toolName -eq 'read_file') {
        $fp = $evt.data.arguments.filePath
        if ($fp -and $fp -match '[\\/]skills[\\/]' -and $fp -match 'SKILL\.md$') {
            [void]$skillPaths.Add($fp)
        }
    }
}

if ($skillPaths.Count -eq 0) { exit 0 }

# Check which skills have Feedback Protocol
$feedbackSkills = [System.Collections.Generic.List[string]]::new()

foreach ($sp in $skillPaths) {
    if (Test-Path $sp) {
        $content = Get-Content $sp -Raw -ErrorAction SilentlyContinue
        if ($content -and ($content -match 'Feedback Protocol' -or $content -match 'FEEDBACK:START')) {
            # Extract skill name from path: .../skills/skill-name/SKILL.md
            if ($sp -match '[\\/]skills[\\/]([^\\/]+)[\\/]SKILL\.md') {
                $feedbackSkills.Add($Matches[1])
            }
        }
    }
}

if ($feedbackSkills.Count -eq 0) { exit 0 }

# Build message with detected skills
$skillList = ($feedbackSkills | ForEach-Object { "  - $_" }) -join [Environment]::NewLine
$message = "SKILL FEEDBACK CHECK: Skills with Feedback Protocol were used in this session:" + [Environment]::NewLine + $skillList + [Environment]::NewLine + [Environment]::NewLine + "If the user expressed dissatisfaction or corrections were needed:" + [Environment]::NewLine + "1. Ask the user what specifically didn't work well" + [Environment]::NewLine + "2. Follow the Feedback Protocol in the skill's SKILL.md to create a structured review" + [Environment]::NewLine + "3. Create the review directory if it doesn't exist" + [Environment]::NewLine + [Environment]::NewLine + "If the session went well and the user didn't complain, skip this entirely."

@{
    decision = "block"
    reason = $message
    hookSpecificOutput = @{
        hookEventName = "Stop"
        decision = "block"
        reason = $message
    }
} | ConvertTo-Json -Depth 3 | Write-Output
