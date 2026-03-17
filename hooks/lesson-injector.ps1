# UserPromptSubmit hook: inject relevant lessons learned into agent context
# Reads user prompt, matches keywords to tags, finds lessons, injects summaries.
# PS 5.1 compatible — no ternary, no ??, no `u{}.
$rawInput = @($input) -join "`n"
if (-not $rawInput) { $rawInput = [Console]::In.ReadToEnd() }
if (-not $rawInput) { exit 0 }

try { $hookInput = $rawInput | ConvertFrom-Json } catch { exit 0 }

# Extract user prompt text from the hook input
$userPrompt = $null
if ($hookInput.PSObject.Properties['chatMessage']) {
    $userPrompt = $hookInput.chatMessage
}
if (-not $userPrompt -and $hookInput.PSObject.Properties['user_message']) {
    $userPrompt = $hookInput.user_message
}
if (-not $userPrompt -and $hookInput.PSObject.Properties['prompt']) {
    $userPrompt = $hookInput.prompt
}
if (-not $userPrompt -and $hookInput.PSObject.Properties['data']) {
    $d = $hookInput.data
    if ($d.PSObject.Properties['chatMessage']) { $userPrompt = $d.chatMessage }
    if (-not $userPrompt -and $d.PSObject.Properties['user_message']) { $userPrompt = $d.user_message }
    if (-not $userPrompt -and $d.PSObject.Properties['message']) { $userPrompt = $d.message }
}
if (-not $userPrompt) { exit 0 }

$promptLower = $userPrompt.ToLower()

# ---------------------------------------------------------------------------
# Keyword matching — map prompt words to lesson tags
# ---------------------------------------------------------------------------
$tagMap = @{
    'create'    = @('criar','novo','adicionar','new','add','create')
    'modify'    = @('alterar','mudar','editar','refatorar','update','edit','modify','refactor')
    'fix'       = @('corrigir','fix','bug','erro','error')
    'delete'    = @('deletar','remover','remove','delete')
    'search'    = @('pesquisar','buscar','search','find','grep')
    'configure' = @('configurar','config','setup')
    'hooks'     = @('hook','hooks')
    'agents'    = @('agent','agente')
    'skills'    = @('skill','skills')
    'git'       = @('git','commit','push','branch','merge')
    'testing'   = @('test','teste','testing')
    'regex'     = @('regex','pattern')
    'shell'     = @('shell','bash','powershell','ps1','terminal')
}

$matchedTags = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

foreach ($tag in $tagMap.Keys) {
    foreach ($kw in $tagMap[$tag]) {
        if ($promptLower -match ('\b' + [regex]::Escape($kw) + '\b')) {
            [void]$matchedTags.Add($tag)
            break
        }
    }
}

if ($matchedTags.Count -eq 0) { exit 0 }

# ---------------------------------------------------------------------------
# Find lessons directory
# ---------------------------------------------------------------------------
$lessonsDir = Join-Path $env:USERPROFILE '.copilot\lessons'
if (-not (Test-Path $lessonsDir)) { exit 0 }

$lessonFiles = Get-ChildItem -Path $lessonsDir -Filter 'L*.md' -File -ErrorAction SilentlyContinue
if (-not $lessonFiles -or $lessonFiles.Count -eq 0) { exit 0 }

# ---------------------------------------------------------------------------
# Parse frontmatter and filter by tags
# ---------------------------------------------------------------------------
$candidates = [System.Collections.Generic.List[PSObject]]::new()

foreach ($f in $lessonFiles) {
    $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }

    # Check for frontmatter delimiters
    if ($content -notmatch '(?ms)\A---\s*\r?\n(.+?)\r?\n---') { continue }
    $fm = $Matches[1]

    # Extract id
    $id = ''
    if ($fm -match '(?m)^id:\s*(.+)$') { $id = $Matches[1].Trim() }

    # Extract tags — supports [tag1, tag2] format
    $fileTags = @()
    if ($fm -match '(?m)^tags:\s*\[([^\]]*)\]') {
        $fileTags = $Matches[1] -split '\s*,\s*' | ForEach-Object { $_.Trim() }
    }
    if ($fileTags.Count -eq 0) { continue }

    # Extract confidence
    $confidence = 0.5
    if ($fm -match '(?m)^confidence:\s*([\d.]+)') {
        $confidence = [double]$Matches[1]
    }

    # Check tag intersection
    $hasMatch = $false
    foreach ($ft in $fileTags) {
        if ($matchedTags.Contains($ft)) { $hasMatch = $true; break }
    }
    if (-not $hasMatch) { continue }

    # Extract resumo (first 2 lines after ## Resumo)
    $resumo = ''
    if ($content -match '(?ms)## Resumo\s*\r?\n(.+?)(\r?\n## |\z)') {
        $lines = ($Matches[1].Trim() -split '\r?\n' | Where-Object { $_.Trim() -ne '' }) | Select-Object -First 2
        $resumo = ($lines -join ' ').Trim()
    }
    if (-not $resumo) { continue }

    $candidates.Add([PSCustomObject]@{
        Id         = $id
        Confidence = $confidence
        Resumo     = $resumo
        Tags       = $fileTags
    })
}

if ($candidates.Count -eq 0) { exit 0 }

# ---------------------------------------------------------------------------
# Sort by confidence DESC, take top 5
# ---------------------------------------------------------------------------
$top = $candidates | Sort-Object -Property Confidence -Descending | Select-Object -First 5

$tagList = ($matchedTags | Sort-Object) -join ', '
$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("Licoes aprendidas relevantes (tags: $tagList):")

foreach ($lesson in $top) {
    $entry = "- [$($lesson.Id)] $($lesson.Resumo) (confidence: $($lesson.Confidence))"
    $lines.Add($entry)
}
$lines.Add("Para detalhes completos: read_file ~/.copilot/lessons/<id>-*.md")

$msg = $lines -join [Environment]::NewLine

# Enforce 500 char limit
if ($msg.Length -gt 500) {
    $msg = $msg.Substring(0, 497) + '...'
}

@{
    decision = "add"
    content  = $msg
} | ConvertTo-Json -Depth 3 | Write-Output
