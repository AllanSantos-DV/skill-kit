# Stop Hook — Verify File References in Transcript

## 1. Hook config (`.github/hooks/verify-references.json`)

```json
{
  "hooks": {
    "Stop": [
      {
        "type": "command",
        "command": "bash .github/hooks/scripts/verify-references.sh",
        "windows": "powershell -File .github\\hooks\\scripts\\verify-references.ps1"
      }
    ]
  }
}
```

## 2. PowerShell Script

```powershell
# verify-references.ps1 — Check if agent accessed all files it mentioned

$input_data = [Console]::In.ReadToEnd()
$json = $input_data | ConvertFrom-Json

$transcriptPath = $json.transcript_path

if (-not $transcriptPath -or -not (Test-Path $transcriptPath)) {
    exit 0
}

$content = Get-Content $transcriptPath -Raw

# Parse the JSONL transcript
$lines = Get-Content $transcriptPath

# Track accessed files
$accessedFiles = @()
$mentionedFiles = @()

foreach ($line in $lines) {
    $evt = $line | ConvertFrom-Json -ErrorAction SilentlyContinue
    if (-not $evt) { continue }

    # Collect files accessed via tools
    if ($evt.type -eq 'tool.execution_start') {
        $toolName = $evt.data.toolName
        if ($toolName -in @('read_file', 'grep_search', 'file_search')) {
            if ($evt.data.arguments.filePath) {
                $accessedFiles += $evt.data.arguments.filePath
            }
        }
    }

    # Collect file paths mentioned in assistant messages
    if ($evt.type -eq 'assistant.message' -and $evt.data.content) {
        $matches = [regex]::Matches($evt.data.content, '[a-zA-Z0-9_\-]+(/[a-zA-Z0-9_\-]+)+\.\w+')
        foreach ($m in $matches) {
            $mentionedFiles += $m.Value
        }
    }
}

# Find unverified references
$unverified = @()
foreach ($mentioned in ($mentionedFiles | Sort-Object -Unique)) {
    $found = $false
    foreach ($accessed in $accessedFiles) {
        if ($accessed -like "*$mentioned*" -or $mentioned -like "*$accessed*") {
            $found = $true
            break
        }
    }
    if (-not $found) {
        $unverified += $mentioned
    }
}

if ($unverified.Count -eq 0) {
    exit 0
}

$fileList = $unverified -join ", "

@{
    systemMessage = "Warning: You referenced these files without accessing them: $fileList. Please verify before finishing."
    continue = $false
    stopReason = "Unverified file references found"
} | ConvertTo-Json | Write-Output
```

## 3. Bash Script

```bash
#!/bin/bash
# verify-references.sh

INPUT=$(cat)

TRANSCRIPT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('transcript_path', ''))")

if [ -z "$TRANSCRIPT" ] || [ ! -f "$TRANSCRIPT" ]; then
    exit 0
fi

# Collect accessed files from tool calls
ACCESSED=$(grep '"tool.execution_start"' "$TRANSCRIPT" | \
    grep -E '"(read_file|grep_search|file_search)"' | \
    grep -oE '"filePath"\s*:\s*"[^"]*"' | \
    sed 's/.*"\([^"]*\)"/\1/' | sort -u)

# Collect mentioned paths from assistant messages
MENTIONED=$(grep '"assistant.message"' "$TRANSCRIPT" | \
    grep -oE '[a-zA-Z0-9_-]+(/[a-zA-Z0-9_-]+)+\.\w+' | sort -u)

# Find unverified
UNVERIFIED=""
for path in $MENTIONED; do
    if ! echo "$ACCESSED" | grep -qF "$path"; then
        UNVERIFIED="$UNVERIFIED $path"
    fi
done

if [ -z "$UNVERIFIED" ]; then
    exit 0
fi

cat <<EOF
{
    "systemMessage": "You mentioned files without accessing them: $UNVERIFIED. Please verify.",
    "continue": false,
    "stopReason": "Unverified file references"
}
EOF
```

## Notes

- Parses the JSONL transcript to find which files the agent accessed vs mentioned
- Blocks the session if unverified references are found
- Uses `systemMessage` to tell the agent which files need verification
