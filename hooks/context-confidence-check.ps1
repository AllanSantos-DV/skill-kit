# Stop hook: validate that contextação Phase 2 confidence table has tool
# evidence for every 🟡/🔴 axis, and cross-check listed tools against
# the session transcript.
#
# WHY: The contextação skill requires a "Tools used" column in the Phase 2
# confidence table. For uncertain axes (🟡/🔴), the agent must declare
# which tools were used to research. This hook validates that:
#   1. Every 🟡/🔴 axis has a non-empty "Tools used" cell
#   2. Every tool listed in that cell actually appears as a tool call
#      in the session transcript
#
# Accepted tools: read_file, grep_search, semantic_search,
#   fetch_webpage, run_in_terminal, file_search, list_dir
#
# Output:
#   - BLOCK if 🟡/🔴 axis has empty/missing Tools used column
#   - BLOCK if a listed tool was not found in the transcript
#   - PASS  if all 🟡/🔴 axes have verified tools, or no 🟡/🔴 axes exist

# --- Read stdin (same pattern as other hooks) ---
try {
    $rawInput = @($input) -join "`n"
    if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
    if ($rawInput) {
        $input_json = $rawInput | ConvertFrom-Json
        if ($input_json.stop_hook_active -eq $true) {
            exit 0
        }
    }
} catch {
    exit 0
}

# --- Get transcript path ---
$transcriptPath = $null
try {
    $transcriptPath = $input_json.transcript_path
} catch {}

if (-not $transcriptPath -or -not (Test-Path $transcriptPath)) {
    exit 0
}

# --- Read transcript content ---
$transcript = ""
try {
    $transcript = Get-Content -Raw -Path $transcriptPath -ErrorAction Stop
} catch {
    exit 0
}

if (-not $transcript) {
    exit 0
}

# --- Detect Phase 2 confidence table with Tools used column ---
# Look for the table header pattern
if ($transcript -notmatch '\|\s*Axis\s*\|\s*Confidence\s*\|\s*Justification\s*\|\s*Tools\s*used\s*\|') {
    exit 0
}

# --- Parse confidence table rows ---
# Match rows: | AxisName | emoji | justification | tools |
$rowPattern = '\|\s*([^|]+?)\s*\|\s*(\x{1F7E2}|\x{1F7E1}|\x{1F534})\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|'
$rows = [regex]::Matches($transcript, $rowPattern)

if ($rows.Count -eq 0) {
    exit 0
}

$violations = @()

foreach ($row in $rows) {
    $axisName   = $row.Groups[1].Value.Trim()
    $emoji      = $row.Groups[2].Value.Trim()
    $toolsCell  = $row.Groups[4].Value.Trim()

    # Skip 🟢 axes — no tool evidence required
    if ($emoji -eq "`u{1F7E2}") {
        continue
    }

    $emojiLabel = if ($emoji -eq "`u{1F7E1}") { "🟡" } else { "🔴" }

    # Check if tools column is empty or just a dash
    if (-not $toolsCell -or $toolsCell -match '^\s*$' -or $toolsCell -match '^\s*[\-\x{2014}]\s*$') {
        $violations += @{
            type = "empty"
            axis = $axisName
            emoji = $emojiLabel
        }
        continue
    }

    # Extract tool names from the cell: tool_name("...") or tool_name('...')
    $toolMatches = [regex]::Matches($toolsCell, '(\w+)\s*\(')
    if ($toolMatches.Count -eq 0) {
        $violations += @{
            type = "empty"
            axis = $axisName
            emoji = $emojiLabel
        }
        continue
    }

    foreach ($toolMatch in $toolMatches) {
        $toolName = $toolMatch.Groups[1].Value
        # Cross-check: does this tool name appear elsewhere in the transcript?
        if ($transcript -notmatch [regex]::Escape($toolName)) {
            $violations += @{
                type = "notfound"
                axis = $axisName
                emoji = $emojiLabel
                tool = $toolName
            }
        }
    }
}

# --- Output ---
if ($violations.Count -eq 0) {
    exit 0
}

# Build block reason from first violation
$first = $violations[0]
if ($first.type -eq "empty") {
    $reason = "Axis '$($first.axis)' classified as $($first.emoji) but no tools listed in the Tools used column. Active Research Gate requires declaring which tools were used."
} else {
    $reason = "Axis '$($first.axis)' lists tool '$($first.tool)' but no matching tool call was found in the session transcript. The tool evidence must match actual tool usage."
}

# Append additional violations if any
if ($violations.Count -gt 1) {
    $reason += " (+ $($violations.Count - 1) more violation(s))"
}

$result = @{
    hookSpecificOutput = @{
        decision = "block"
        reason = $reason
    }
} | ConvertTo-Json -Depth 3
Write-Output $result
