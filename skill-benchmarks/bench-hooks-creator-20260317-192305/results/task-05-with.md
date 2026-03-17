# Transcript-Aware Stop Hook — Verify File References

## 1. Workspace Hook Config (`.github/hooks/verify-references.json`)

```json
{
  "hooks": {
    "Stop": [
      {
        "type": "command",
        "command": "bash .github/hooks/scripts/verify-references.sh",
        "windows": "powershell -ExecutionPolicy Bypass -File .github\\hooks\\scripts\\verify-references.ps1",
        "timeout": 30
      }
    ]
  }
}
```

> **Note on YAML context**: If this config were in YAML frontmatter instead of JSON, the filename `verify-references` would need special attention with `\v` — in YAML double-quoted strings, `\v` is a vertical tab escape. In JSON this is not an issue, but if you ever move this to an agent frontmatter `hooks:` section, remember to use `\\verify-references` in double-quoted YAML strings.

## 2. PowerShell Script (`.github/hooks/scripts/verify-references.ps1`)

```powershell
# verify-references.ps1 — Block stop if agent mentioned files it never accessed
# Compatible with PowerShell 5.1 (Windows PowerShell)

$rawInput = @($input) -join "`n"
if (-not $rawInput) {
    $rawInput = [Console]::In.ReadToEnd()
}

if (-not $rawInput) {
    exit 0
}

$inputJson = $rawInput | ConvertFrom-Json -ErrorAction SilentlyContinue
if (-not $inputJson) {
    exit 0
}

# Check for stop_hook_active to prevent infinite loop
if ($inputJson.stop_hook_active -eq $true) {
    exit 0
}

# Get transcript path
$transcriptPath = $inputJson.transcript_path
if (-not $transcriptPath -or -not (Test-Path $transcriptPath)) {
    exit 0
}

# Read transcript JSONL lines
$lines = Get-Content $transcriptPath -ErrorAction SilentlyContinue
if (-not $lines -or $lines.Count -eq 0) {
    exit 0
}

# === Scope to current interaction: find last user.message ===
$startIdx = 0
for ($i = $lines.Count - 1; $i -ge 0; $i--) {
    if ($lines[$i] -like '*"user.message"*') {
        $startIdx = $i
        break
    }
}

# === Collect accessed file paths from tool calls ===
$fileTools = @('read_file', 'grep_search', 'file_search', 'semantic_search', 'list_dir', 'vscode_listCodeUsages')
$accessedPaths = New-Object System.Collections.Generic.HashSet[string]

for ($i = $startIdx; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    if ($line -notlike '*"tool.execution_start"*') { continue }

    $evt = $null
    $evt = $line | ConvertFrom-Json -ErrorAction SilentlyContinue
    if (-not $evt) { continue }

    $toolName = $null
    if ($evt.data -and $evt.data.toolName) {
        $toolName = $evt.data.toolName
    }

    if ($toolName -notin $fileTools) { continue }

    # Extract file paths from tool arguments
    if ($evt.data.arguments) {
        $args = $evt.data.arguments

        if ($args.filePath) {
            [void]$accessedPaths.Add($args.filePath)
        }
        if ($args.path) {
            [void]$accessedPaths.Add($args.path)
        }
        if ($args.query -and $args.includePattern) {
            # grep_search with includePattern — note the pattern, not a specific file
            [void]$accessedPaths.Add($args.includePattern)
        }
    }
}

# === Helper: check if a mentioned path was accessed ===
function Test-Accessed {
    param([string]$mentionedPath)

    # Normalize separators
    $normalized = $mentionedPath -replace '\\', '/'

    foreach ($accessed in $accessedPaths) {
        $normalizedAccessed = $accessed -replace '\\', '/'
        # Exact match or suffix match (relative vs absolute)
        if ($normalizedAccessed -eq $normalized) { return $true }
        if ($normalizedAccessed.EndsWith($normalized)) { return $true }
        if ($normalized.EndsWith($normalizedAccessed)) { return $true }
    }
    return $false
}

# === Extract file paths mentioned in assistant.message content ===
$unverifiedPaths = New-Object System.Collections.Generic.List[string]
$relPathRegex = '[a-zA-Z0-9_\-\.]+(?:[/\\][a-zA-Z0-9_\-\.]+)+\.[a-zA-Z0-9]+'

for ($i = $startIdx; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    if ($line -notlike '*"assistant.message"*') { continue }

    $evt = $null
    $evt = $line | ConvertFrom-Json -ErrorAction SilentlyContinue
    if (-not $evt) { continue }

    $content = ''
    if ($evt.data -and $evt.data.content) {
        $content = $evt.data.content
    }

    if (-not $content) { continue }

    # Find all file path patterns in the content
    $mentions = [regex]::Matches($content, $relPathRegex)
    foreach ($m in $mentions) {
        $mentioned = $m.Value
        # Skip common false positives
        if ($mentioned -match '\.(png|jpg|jpeg|gif|svg|ico|woff|ttf|eot)$') { continue }
        if ($mentioned -match '^https?://') { continue }

        if (-not (Test-Accessed $mentioned)) {
            [void]$unverifiedPaths.Add($mentioned)
        }
    }
}

# === Decision ===
if ($unverifiedPaths.Count -eq 0) {
    # All referenced files were accessed — allow stop
    exit 0
}

# Deduplicate
$uniqueUnverified = $unverifiedPaths | Sort-Object -Unique

$pathList = ($uniqueUnverified | ForEach-Object { "  - $_" }) -join [Environment]::NewLine
$reason = "You mentioned the following file paths in your response but never accessed them via read_file, grep_search, or file_search. Please verify these references before finishing:" + [Environment]::NewLine + $pathList

# Block with dual-level output (workspace Stop hook — hookSpecificOutput is primary,
# but include top-level too for future-proofing if config moves to agent frontmatter)
$output = @{
    decision = "block"
    reason = $reason
    hookSpecificOutput = @{
        hookEventName = "Stop"
        decision = "block"
        reason = $reason
    }
}

$output | ConvertTo-Json -Depth 3 | Write-Output
exit 0
```

## 3. Bash Script (`.github/hooks/scripts/verify-references.sh`)

```bash
#!/bin/bash
# verify-references.sh — Block stop if agent mentioned files it never accessed

INPUT=$(cat 2>/dev/null || true)

if [ -z "$INPUT" ]; then
    exit 0
fi

# Check stop_hook_active
if echo "$INPUT" | grep -q '"stop_hook_active"\s*:\s*true'; then
    exit 0
fi

# Require jq for reliable JSONL parsing
if ! command -v jq &>/dev/null; then
    # Without jq, JSONL parsing is too fragile — exit silently
    exit 0
fi

TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""')

if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
    exit 0
fi

# Scope to current interaction — find last user.message line number
START_LINE=1
LAST_USER_MSG=$(grep -n '"user\.message"' "$TRANSCRIPT_PATH" | tail -1 | cut -d: -f1 || true)
if [ -n "$LAST_USER_MSG" ]; then
    START_LINE=$LAST_USER_MSG
fi

# Collect accessed file paths from tool.execution_start events
ACCESSED_PATHS=$(mktemp)
FILE_TOOLS="read_file|grep_search|file_search|semantic_search|list_dir|vscode_listCodeUsages"

tail -n +"$START_LINE" "$TRANSCRIPT_PATH" | while IFS= read -r line; do
    if echo "$line" | grep -q '"tool.execution_start"'; then
        TOOL_NAME=$(echo "$line" | jq -r '.data.toolName // ""' 2>/dev/null)
        if echo "$TOOL_NAME" | grep -qE "^($FILE_TOOLS)$"; then
            FILE_PATH=$(echo "$line" | jq -r '.data.arguments.filePath // .data.arguments.path // ""' 2>/dev/null)
            if [ -n "$FILE_PATH" ]; then
                echo "$FILE_PATH" >> "$ACCESSED_PATHS"
            fi
        fi
    fi
done

# Extract mentioned file paths from assistant.message content
MENTIONED_PATHS=$(mktemp)
UNVERIFIED_PATHS=$(mktemp)

tail -n +"$START_LINE" "$TRANSCRIPT_PATH" | while IFS= read -r line; do
    if echo "$line" | grep -q '"assistant.message"'; then
        CONTENT=$(echo "$line" | jq -r '.data.content // ""' 2>/dev/null)
        if [ -n "$CONTENT" ]; then
            # Extract file-like paths (e.g., src/utils/helpers.ts)
            echo "$CONTENT" | grep -oE '[a-zA-Z0-9_.-]+(/[a-zA-Z0-9_.-]+)+\.[a-zA-Z0-9]+' >> "$MENTIONED_PATHS"
        fi
    fi
done

# Compare: find unverified paths
if [ -s "$MENTIONED_PATHS" ]; then
    while IFS= read -r mentioned; do
        # Skip images and URLs
        if echo "$mentioned" | grep -qE '\.(png|jpg|jpeg|gif|svg|ico)$'; then continue; fi

        # Check if any accessed path contains this mentioned path
        FOUND=false
        if [ -s "$ACCESSED_PATHS" ]; then
            NORMALIZED=$(echo "$mentioned" | tr '\\' '/')
            if grep -qF "$NORMALIZED" "$ACCESSED_PATHS" 2>/dev/null; then
                FOUND=true
            fi
        fi

        if [ "$FOUND" = "false" ]; then
            echo "$mentioned" >> "$UNVERIFIED_PATHS"
        fi
    done < "$MENTIONED_PATHS"
fi

# Clean up and decide
if [ ! -s "$UNVERIFIED_PATHS" ]; then
    rm -f "$ACCESSED_PATHS" "$MENTIONED_PATHS" "$UNVERIFIED_PATHS"
    exit 0
fi

# Build unverified list
UNVERIFIED_LIST=$(sort -u "$UNVERIFIED_PATHS" | sed 's/^/  - /' | tr '\n' '\n')

rm -f "$ACCESSED_PATHS" "$MENTIONED_PATHS" "$UNVERIFIED_PATHS"

# Block with reason — dual-level output
REASON="You mentioned file paths that were never accessed via read_file, grep_search, or file_search. Please verify these references before finishing:\n${UNVERIFIED_LIST}"

jq -n --arg reason "$REASON" '{
  decision: "block",
  reason: $reason,
  hookSpecificOutput: {
    hookEventName: "Stop",
    decision: "block",
    reason: $reason
  }
}'

exit 0
```

## Key Design Decisions

1. **Transcript scoping to current interaction**: Uses the last `user.message` boundary to avoid "sticky" false positives from earlier interactions. Without this, old turns would trigger the hook repeatedly.

2. **Dual-level Stop output**: `decision`/`reason` at both top-level AND inside `hookSpecificOutput`. This workspace hook uses `hookSpecificOutput` primarily, but including top-level ensures compatibility if the config is moved to agent frontmatter (where VS Code treats Stop as SubagentStop).

3. **No `systemMessage`**: The agent needs to act on the block — `systemMessage` is UI-only and would not reach the agent. Using `decision: "block"` + `reason` properly injects the instruction.

4. **YAML escape note**: The JSON config filename contains `verify-references` with a `v`. If this were in YAML double-quoted strings, `\v` would be a vertical tab escape. The note warns about this for future migration.

5. **Bash requires jq**: JSONL parsing without jq is too fragile for this use case. The bash script exits silently if jq is unavailable rather than producing false positives.

6. **PS 5.1 compatible**: No ternary assignment, no null-coalescing, no PS7+ syntax. Uses `[Environment]::NewLine`, `New-Object System.Collections.Generic.HashSet`, and standard `if/else` blocks.

7. **Infinite loop guard**: Checks `stop_hook_active` flag to prevent the hook from repeatedly blocking after it has already blocked once.

8. **Path normalization**: Compares paths with normalized separators (`/` vs `\`) to handle cross-platform path differences in the transcript.
