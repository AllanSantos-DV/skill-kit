#!/bin/bash
# Stop hook: verify file references in assistant messages were tool-backed.
# Bash port of verify-claims.ps1 — requires jq for JSONL parsing.

set -euo pipefail

# ---------------------------------------------------------------------------
# Fallback: if jq is not installed, emit a static reminder and exit.
# ---------------------------------------------------------------------------
if ! command -v jq &>/dev/null; then
  cat <<'FALLBACK'
{
  "decision": "block",
  "reason": "VERIFICATION CHECK: Review every factual claim you made in this session. Was each one verified using tools (read_file, grep_search, run_in_terminal, semantic_search)? If any claim was assumed without tool verification — correct it now or explicitly mark it as unverified. Never present assumptions as facts.",
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "decision": "block",
    "reason": "VERIFICATION CHECK: Review every factual claim you made in this session. Was each one verified using tools (read_file, grep_search, run_in_terminal, semantic_search)? If any claim was assumed without tool verification — correct it now or explicitly mark it as unverified. Never present assumptions as facts."
  }
}
FALLBACK
  exit 0
fi

# ---------------------------------------------------------------------------
# Read stdin (hook input JSON)
# ---------------------------------------------------------------------------
RAW_INPUT=$(cat 2>/dev/null || true)
if [ -z "$RAW_INPUT" ]; then
  exit 0
fi

# Parse hook input — exit silently on invalid JSON
HOOK_INPUT=$(echo "$RAW_INPUT" | jq -e '.' 2>/dev/null) || exit 0

# If stop_hook_active is true, another hook is handling — exit
ACTIVE=$(echo "$HOOK_INPUT" | jq -r '.stop_hook_active // false')
if [ "$ACTIVE" = "true" ]; then
  exit 0
fi

# Extract transcript path
TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty')
if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

# Minimum transcript length check
LINE_COUNT=$(wc -l < "$TRANSCRIPT_PATH")
if [ "$LINE_COUNT" -lt 5 ]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Tool names that access files
# ---------------------------------------------------------------------------
FILE_TOOLS=(
  read_file create_file replace_string_in_file multi_replace_string_in_file
  list_dir create_directory vscode_listCodeUsages grep_search
  edit_notebook_file copilot_getNotebookSummary file_search semantic_search
  run_in_terminal
)

# Build a jq filter to check if a toolName is in the list
FILE_TOOLS_FILTER=$(printf '"%s",' "${FILE_TOOLS[@]}")
FILE_TOOLS_FILTER="[${FILE_TOOLS_FILTER%,}]"

# ---------------------------------------------------------------------------
# Scope to last user.message in transcript
# ---------------------------------------------------------------------------
START_LINE=1
LAST_USER_MSG=$(grep -n '"user\.message"' "$TRANSCRIPT_PATH" | tail -1 | cut -d: -f1 || true)
if [ -n "$LAST_USER_MSG" ]; then
  START_LINE=$LAST_USER_MSG
fi

# ---------------------------------------------------------------------------
# Temp files to persist state across pipe | while subshells
# ---------------------------------------------------------------------------
ACCESSED_FILE=$(mktemp)
MENTIONS_FILE=$(mktemp)
trap 'rm -f "$ACCESSED_FILE" "$MENTIONS_FILE"' EXIT

# jq snippet: extract file paths from a tool-arguments object (one per line)
# shellcheck disable=SC2016
EXTRACT_PATHS_JQ='
  . as $a |
  ([$a.filePath  // empty] +
   [$a.path      // empty] +
   (if ($a.query          // "" | test("/")) then [$a.query]          else [] end) +
   (if ($a.includePattern // "" | test("/")) then [$a.includePattern] else [] end) +
   [($a.replacements // [])[].filePath // empty]
  )[] | select(length > 0)
'

# ---------------------------------------------------------------------------
# Pass 1: Collect all tool-accessed paths
# ---------------------------------------------------------------------------
tail -n +"$START_LINE" "$TRANSCRIPT_PATH" | while IFS= read -r line; do
  [ "${#line}" -lt 20 ] && continue
  case "$line" in
    *'"tool.execution_start"'*) ;;
    *'"assistant.message"'*) ;;
    *) continue ;;
  esac

  evt=$(echo "$line" | jq -e '.' 2>/dev/null) || continue
  evt_type=$(echo "$evt" | jq -r '.type // empty')

  if [ "$evt_type" = "tool.execution_start" ]; then
    tool_name=$(echo "$evt" | jq -r '.data.toolName // empty')
    is_ft=$(echo "$tool_name" | jq -R --argjson t "$FILE_TOOLS_FILTER" '. as $n | $t | any(. == $n)' 2>/dev/null)
    if [ "$is_ft" = "true" ]; then
      echo "$evt" | jq -r ".data.arguments | $EXTRACT_PATHS_JQ" 2>/dev/null >> "$ACCESSED_FILE" || true
      # command field: extract absolute Linux paths via grep (jq lacks \w support)
      echo "$evt" | jq -r '.data.arguments.command // empty' 2>/dev/null \
        | grep -oP '/(?:home|usr|var|opt|tmp|etc)(?:/[\w._-]+)+\.\w+' >> "$ACCESSED_FILE" 2>/dev/null || true
    fi

  elif [ "$evt_type" = "assistant.message" ]; then
    # Extract paths from toolRequests
    echo "$evt" | jq -r --argjson t "$FILE_TOOLS_FILTER" "
      .data.toolRequests // [] | .[] |
      select(.name as \$n | \$t | any(. == \$n)) |
      (.arguments | if type == \"string\" then (fromjson? // {}) else (. // {}) end) |
      $EXTRACT_PATHS_JQ
    " 2>/dev/null >> "$ACCESSED_FILE" || true
    # command fields inside toolRequests
    echo "$evt" | jq -r --argjson t "$FILE_TOOLS_FILTER" '
      .data.toolRequests // [] | .[] |
      select(.name as $n | $t | any(. == $n)) |
      (.arguments | if type == "string" then (fromjson? // {}) else (. // {}) end) |
      .command // empty
    ' 2>/dev/null \
      | grep -oP '/(?:home|usr|var|opt|tmp|etc)(?:/[\w._-]+)+\.\w+' >> "$ACCESSED_FILE" 2>/dev/null || true
  fi
done

# Load accessed paths into array
if [ -f "$ACCESSED_FILE" ]; then
  mapfile -t ACCESSED_PATHS < <(sort -u "$ACCESSED_FILE")
fi

# ---------------------------------------------------------------------------
# Pass 2: Find mentioned paths in assistant content, check against accessed
# ---------------------------------------------------------------------------
tail -n +"$START_LINE" "$TRANSCRIPT_PATH" | while IFS= read -r line; do
  [ "${#line}" -lt 20 ] && continue
  case "$line" in
    *'"assistant.message"'*) ;;
    *) continue ;;
  esac

  content=$(echo "$line" | jq -r '.data.content // empty' 2>/dev/null)
  [ -z "$content" ] || [ "${#content}" -lt 10 ] && continue

  # Extract absolute Linux paths and relative project paths from content
  echo "$content" | grep -oP '/(?:home|usr|var|opt|tmp|etc)(?:/[\w._-]+)+\.\w+' 2>/dev/null || true
  echo "$content" | grep -oP '(?:^|[\s`"'"'"'()\[\]>/])((?:src|test|docs|dist|lib|utils|commands|services|providers|webview|hooks|skills|agents|resources|config)/[\w._/-]+\.\w+)' 2>/dev/null | sed 's/^[[:space:]`"'"'"'()\[>\\/]*//' || true
done | sort -u > "$MENTIONS_FILE"

# ---------------------------------------------------------------------------
# Compare: find mentioned paths not in accessed set (endsWith matching)
# ---------------------------------------------------------------------------
FINAL_UNVERIFIED=()
while IFS= read -r mention; do
  [ -z "$mention" ] && continue
  mention_norm=$(echo "$mention" | sed 's#/\+#/#g; s#/$##')
  [ "${#mention_norm}" -lt 6 ] && continue

  found=0
  for ap in "${ACCESSED_PATHS[@]}"; do
    ap_norm=$(echo "$ap" | sed 's#/\+#/#g; s#/$##')
    # endsWith matching in both directions
    if [[ "$ap_norm" == *"$mention_norm" ]] || [[ "$mention_norm" == *"$ap_norm" ]]; then
      found=1
      break
    fi
  done

  if [ "$found" -eq 0 ]; then
    FINAL_UNVERIFIED+=("$mention")
  fi
done < "$MENTIONS_FILE"

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
if [ "${#FINAL_UNVERIFIED[@]}" -gt 0 ]; then
  # Limit to first 10
  MAX=10
  LIST=""
  count=0
  for uv in "${FINAL_UNVERIFIED[@]}"; do
    LIST="${LIST}  - ${uv}\n"
    count=$((count + 1))
    [ "$count" -ge "$MAX" ] && break
  done

  MSG="UNVERIFIED FILE REFERENCES — these paths were mentioned without prior tool verification:\n${LIST}Verify with tools (read_file, grep_search, list_dir) or mark as assumed."

  # Output dual-level JSON using jq for proper escaping
  jq -n --arg msg "$MSG" '{
    decision: "block",
    reason: $msg,
    hookSpecificOutput: {
      hookEventName: "Stop",
      decision: "block",
      reason: $msg
    }
  }'
else
  exit 0
fi
