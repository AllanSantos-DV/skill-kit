# SessionStart Hook — Inject Project Documentation

## 1. Agent Frontmatter

Add to `reviewer.agent.md`:

```yaml
---
name: reviewer
description: Code reviewer with project context
hooks:
  SessionStart:
    - type: command
      command: "bash ~/.copilot/hooks/scripts/inject-project-docs.sh"
      windows: "powershell -ExecutionPolicy Bypass -File ~\\.copilot\\hooks\\scripts\\inject-project-docs.ps1"
---
```

## 2. PowerShell Script (`inject-project-docs.ps1`)

```powershell
# inject-project-docs.ps1 — Read project docs and inject as context

$input_data = [Console]::In.ReadToEnd()
$json = $input_data | ConvertFrom-Json

$cwd = $json.cwd
if (-not $cwd) { $cwd = Get-Location }

$context = ""

$readme = Join-Path $cwd "README.md"
if (Test-Path $readme) {
    $context += "## README.md`n" + (Get-Content $readme -Raw) + "`n`n"
}

$contributing = Join-Path $cwd "CONTRIBUTING.md"
if (Test-Path $contributing) {
    $context += "## CONTRIBUTING.md`n" + (Get-Content $contributing -Raw) + "`n"
}

if ($context) {
    @{
        systemMessage = $context
    } | ConvertTo-Json | Write-Output
}
```

## 3. Bash Script (`inject-project-docs.sh`)

```bash
#!/bin/bash
# inject-project-docs.sh — Read project docs and inject as context

INPUT=$(cat)
CWD=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cwd', '.'))")

CONTEXT=""

if [ -f "$CWD/README.md" ]; then
    CONTEXT="${CONTEXT}## README.md\n$(cat "$CWD/README.md")\n\n"
fi

if [ -f "$CWD/CONTRIBUTING.md" ]; then
    CONTEXT="${CONTEXT}## CONTRIBUTING.md\n$(cat "$CWD/CONTRIBUTING.md")\n"
fi

if [ -n "$CONTEXT" ]; then
    cat <<EOF
{
    "systemMessage": "Project documentation:\n${CONTEXT}"
}
EOF
fi
```

## Notes

- The hook automatically reads README.md and CONTRIBUTING.md from the workspace
- Content is injected into the agent's context via `systemMessage`
- If neither file exists, the hook does nothing (exits silently)
