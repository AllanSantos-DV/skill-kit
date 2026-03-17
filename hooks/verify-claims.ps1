# Stop hook: verify file references in assistant messages were tool-backed
$rawInput = @($input) -join "`n"
if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
if (-not $rawInput) { exit 0 }

try { $hookInput = $rawInput | ConvertFrom-Json } catch { exit 0 }
if ($hookInput.stop_hook_active -eq $true) { exit 0 }

$transcriptPath = $hookInput.transcript_path
if (-not $transcriptPath -or -not (Test-Path $transcriptPath)) { exit 0 }

$lines = Get-Content $transcriptPath -ErrorAction SilentlyContinue
if (-not $lines -or $lines.Count -lt 5) { exit 0 }

$accessedPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$unverified = [System.Collections.Generic.List[string]]::new()

$fileTools = @(
    'read_file','create_file','replace_string_in_file','multi_replace_string_in_file',
    'list_dir','create_directory','vscode_listCodeUsages','grep_search',
    'edit_notebook_file','copilot_getNotebookSummary','file_search','semantic_search',
    'run_in_terminal'
)

function Norm([string]$p) {
    if ($p) { $p.Replace('/', '\').TrimEnd('\').ToLower() } else { '' }
}

function Test-Accessed([string]$mention) {
    $nm = Norm $mention
    if (-not $nm -or $nm.Length -lt 6) { return $true }
    foreach ($ap in $script:accessedPaths) {
        $na = Norm $ap
        if ($na.EndsWith($nm) -or $nm.EndsWith($na)) { return $true }
    }
    return $false
}

function Add-ToolPaths($args_obj) {
    if ($args_obj.filePath) { [void]$script:accessedPaths.Add($args_obj.filePath) }
    if ($args_obj.path) { [void]$script:accessedPaths.Add($args_obj.path) }
    if ($args_obj.query) {
        # file_search query often contains paths
        if ($args_obj.query -match '[\\/]') {
            [void]$script:accessedPaths.Add($args_obj.query)
        }
    }
    if ($args_obj.includePattern -and $args_obj.includePattern -match '[\\/]') {
        [void]$script:accessedPaths.Add($args_obj.includePattern)
    }
    if ($args_obj.replacements) {
        foreach ($r in $args_obj.replacements) {
            if ($r.filePath) { [void]$script:accessedPaths.Add($r.filePath) }
        }
    }
    # run_in_terminal: extract paths from the command string
    if ($args_obj.command) {
        foreach ($m in $script:winPathRe.Matches($args_obj.command)) {
            [void]$script:accessedPaths.Add($m.Groups[1].Value)
        }
    }
}

$winPathRe = [regex]'(?i)([a-z]:\\(?:[\w\s._-]+\\)*[\w._-]+\.\w+)'
$relPathRe = [regex]'(?:^|[\s`"''()\[\]>/])((src|test|docs|dist|lib|utils|commands|services|providers|webview|hooks|skills|agents|resources|config)[\\/][\w._/-]+\.\w+)'

# Scope to current interaction: find last user.message
$startIdx = 0
for ($i = $lines.Count - 1; $i -ge 0; $i--) {
    if ($lines[$i] -like '*"user.message"*') {
        $startIdx = $i
        break
    }
}

for ($i = $startIdx; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    if (-not $line -or $line.Length -lt 20) { continue }
    if ($line -notlike '*"tool.execution_start"*' -and $line -notlike '*"assistant.message"*') { continue }

    try { $evt = $line | ConvertFrom-Json -ErrorAction Stop } catch { continue }

    if ($evt.type -eq 'tool.execution_start' -and $evt.data.toolName -in $fileTools) {
        Add-ToolPaths $evt.data.arguments
    }
    elseif ($evt.type -eq 'assistant.message') {
        # Register paths from tool requests in this message first
        if ($evt.data.toolRequests) {
            foreach ($req in $evt.data.toolRequests) {
                if ($req.name -in $fileTools -and $req.arguments) {
                    try {
                        $reqArgs = $req.arguments | ConvertFrom-Json -ErrorAction Stop
                        Add-ToolPaths $reqArgs
                    } catch {}
                }
            }
        }

        $content = $evt.data.content
        if (-not $content -or $content.Length -lt 10) { continue }

        # Extract file paths from content
        $mentioned = [System.Collections.Generic.List[string]]::new()
        foreach ($m in $winPathRe.Matches($content)) { $mentioned.Add($m.Groups[1].Value) }
        foreach ($m in $relPathRe.Matches($content)) { $mentioned.Add($m.Groups[1].Value) }

        foreach ($mp in $mentioned) {
            if (-not (Test-Accessed $mp)) {
                $unverified.Add($mp)
            }
        }
    }
}

if ($unverified.Count -gt 0) {
    $unique = $unverified | Select-Object -Unique | Select-Object -First 10
    $list = ($unique | ForEach-Object { "  - $_" }) -join "`n"
    $msg = "UNVERIFIED FILE REFERENCES — these paths were mentioned without prior tool verification:`n$list`nVerify with tools (read_file, grep_search, list_dir) or mark as assumed."
    @{
        decision = "block"
        reason = $msg
        hookSpecificOutput = @{
            hookEventName = "Stop"
            decision = "block"
            reason = $msg
        }
    } | ConvertTo-Json -Depth 3 | Write-Output
} else {
    exit 0
}
