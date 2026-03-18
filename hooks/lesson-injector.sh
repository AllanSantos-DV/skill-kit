#!/bin/bash
# UserPromptSubmit hook: inject relevant lessons learned into agent context
# Reads user prompt, matches keywords to tags, finds lessons, injects summaries.
# Requires jq for JSON parsing — exits cleanly if unavailable.

set -euo pipefail

# ---------------------------------------------------------------------------
# Require jq
# ---------------------------------------------------------------------------
if ! command -v jq &>/dev/null; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Read stdin (hook input JSON)
# ---------------------------------------------------------------------------
RAW_INPUT=$(cat 2>/dev/null || true)
if [ -z "$RAW_INPUT" ]; then
  exit 0
fi

HOOK_INPUT=$(echo "$RAW_INPUT" | jq -e '.' 2>/dev/null) || exit 0

# Extract user prompt text — try multiple known field paths
USER_PROMPT=$(echo "$HOOK_INPUT" | jq -r '
  .chatMessage //
  .user_message //
  .prompt //
  .data.chatMessage //
  .data.user_message //
  .data.message //
  empty' 2>/dev/null || true)

if [ -z "$USER_PROMPT" ]; then
  exit 0
fi

PROMPT_LOWER=$(echo "$USER_PROMPT" | tr '[:upper:]' '[:lower:]')

# ---------------------------------------------------------------------------
# Keyword matching — map prompt words to lesson tags
# ---------------------------------------------------------------------------
MATCHED_TAGS=""

add_tag() {
  local tag="$1"
  # Avoid duplicates
  case ",$MATCHED_TAGS," in
    *",$tag,"*) return ;;
  esac
  if [ -z "$MATCHED_TAGS" ]; then
    MATCHED_TAGS="$tag"
  else
    MATCHED_TAGS="$MATCHED_TAGS,$tag"
  fi
}

match_keywords() {
  local tag="$1"
  shift
  for kw in "$@"; do
    if echo "$PROMPT_LOWER" | grep -qiw "$kw"; then
      add_tag "$tag"
      return
    fi
  done
}

match_keywords "create"    "criar" "novo" "adicionar" "new" "add" "create"
match_keywords "modify"    "alterar" "mudar" "editar" "refatorar" "update" "edit" "modify" "refactor"
match_keywords "fix"       "corrigir" "fix" "bug" "erro" "error"
match_keywords "delete"    "deletar" "remover" "remove" "delete"
match_keywords "search"    "pesquisar" "buscar" "search" "find" "grep"
match_keywords "configure" "configurar" "config" "setup"
match_keywords "hooks"     "hook" "hooks"
match_keywords "agents"    "agent" "agente"
match_keywords "skills"    "skill" "skills"
match_keywords "git"       "git" "commit" "push" "branch" "merge"
match_keywords "testing"   "test" "teste" "testing"
match_keywords "regex"     "regex" "pattern"
match_keywords "shell"     "shell" "bash" "powershell" "ps1" "terminal"

if [ -z "$MATCHED_TAGS" ]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Find lessons directory
# ---------------------------------------------------------------------------
LESSONS_DIR="$HOME/.copilot/lessons"
if [ ! -d "$LESSONS_DIR" ]; then
  exit 0
fi

LESSON_FILES=$(find "$LESSONS_DIR" -maxdepth 1 -name 'L*.md' -type f 2>/dev/null | sort)
if [ -z "$LESSON_FILES" ]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Parse frontmatter and filter by tags
# ---------------------------------------------------------------------------
# Store candidates as lines: confidence|id|resumo
CANDIDATES_FILE=$(mktemp)
trap 'rm -f "$CANDIDATES_FILE"' EXIT

while IFS= read -r filepath; do
  [ -z "$filepath" ] && continue
  [ ! -f "$filepath" ] && continue

  content=$(cat "$filepath" 2>/dev/null) || continue

  # Check for frontmatter delimiters (first line must be ---)
  first_line=$(echo "$content" | head -1)
  case "$first_line" in
    ---*) ;;
    *) continue ;;
  esac

  # Extract frontmatter (between first and second ---)
  fm=$(echo "$content" | sed -n '2,/^---$/p' | sed '$d')
  if [ -z "$fm" ]; then
    continue
  fi

  # Extract id
  file_id=$(echo "$fm" | grep -E '^id:\s*' | sed 's/^id:\s*//' | tr -d '[:space:]' || true)
  if [ -z "$file_id" ]; then
    continue
  fi

  # Extract tags — format: tags: [tag1, tag2]
  tags_raw=$(echo "$fm" | grep -E '^tags:\s*\[' | sed 's/^tags:\s*\[//;s/\].*$//' | tr -d '[:space:]' || true)
  if [ -z "$tags_raw" ]; then
    continue
  fi

  # Extract confidence
  confidence=$(echo "$fm" | grep -E '^confidence:\s*' | sed 's/^confidence:\s*//' | tr -d '[:space:]' || true)
  if [ -z "$confidence" ]; then
    confidence="0.5"
  fi

  # Check tag intersection
  has_match=false
  IFS=',' read -ra FILE_TAGS <<< "$tags_raw"
  IFS=',' read -ra SEARCH_TAGS <<< "$MATCHED_TAGS"
  for ft in "${FILE_TAGS[@]}"; do
    for st in "${SEARCH_TAGS[@]}"; do
      if [ "$ft" = "$st" ]; then
        has_match=true
        break 2
      fi
    done
  done

  if [ "$has_match" = "false" ]; then
    continue
  fi

  # Extract resumo (first 2 non-empty lines after ## Resumo)
  resumo=$(echo "$content" | sed -n '/^## Resumo/,/^## /p' | sed '1d;$d' | grep -v '^[[:space:]]*$' | head -2 | tr '\n' ' ' | sed 's/[[:space:]]*$//')
  if [ -z "$resumo" ]; then
    continue
  fi

  echo "${confidence}|${file_id}|${resumo}" >> "$CANDIDATES_FILE"

done <<< "$LESSON_FILES"

if [ ! -s "$CANDIDATES_FILE" ]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Sort by confidence DESC, take top 5
# ---------------------------------------------------------------------------
TAG_LIST=$(echo "$MATCHED_TAGS" | tr ',' '\n' | sort | tr '\n' ',' | sed 's/,$//')

OUTPUT="Licoes aprendidas relevantes (tags: ${TAG_LIST}):"

TOP=$(sort -t'|' -k1 -rn "$CANDIDATES_FILE" | head -5)

while IFS='|' read -r conf lid lresumo; do
  [ -z "$lid" ] && continue
  OUTPUT="${OUTPUT}
- [${lid}] ${lresumo} (confidence: ${conf})"
done <<< "$TOP"

OUTPUT="${OUTPUT}
Para detalhes completos: read_file ~/.copilot/lessons/<id>-*.md"

# Enforce 500 char limit
if [ "${#OUTPUT}" -gt 500 ]; then
  OUTPUT="${OUTPUT:0:497}..."
fi

# Escape for JSON
MSG_JSON=$(printf '%s' "$OUTPUT" | jq -Rs '.')

cat <<ENDJSON
{
  "decision": "add",
  "content": ${MSG_JSON}
}
ENDJSON
