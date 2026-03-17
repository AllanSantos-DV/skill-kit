#!/bin/bash
# Stop hook: capture skill feedback — only when skills with Feedback Protocol were used
# Requires jq for JSONL parsing. Falls back to static reminder without jq.

set -euo pipefail

# ---------------------------------------------------------------------------
# Fallback: if jq is not installed, emit a static reminder and exit.
# ---------------------------------------------------------------------------
if ! command -v jq &>/dev/null; then
  cat <<'FALLBACK'
{
  "decision": "block",
  "reason": "SKILL FEEDBACK CHECK: Could not detect which skills were used (jq not installed). If you used any skill with a Feedback Protocol and the user expressed dissatisfaction, follow the protocol to capture feedback. If the session went well, skip this.",
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "decision": "block",
    "reason": "SKILL FEEDBACK CHECK: Could not detect which skills were used (jq not installed). If you used any skill with a Feedback Protocol and the user expressed dissatisfaction, follow the protocol to capture feedback. If the session went well, skip this."
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

HOOK_INPUT=$(echo "$RAW_INPUT" | jq -e '.' 2>/dev/null) || exit 0

ACTIVE=$(echo "$HOOK_INPUT" | jq -r '.stop_hook_active // false')
if [ "$ACTIVE" = "true" ]; then
  exit 0
fi

TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty')
if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

LINE_COUNT=$(wc -l < "$TRANSCRIPT_PATH")
if [ "$LINE_COUNT" -lt 5 ]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Scope to last user.message in transcript
# ---------------------------------------------------------------------------
START_LINE=1
LAST_USER_MSG=$(grep -n '"user\.message"' "$TRANSCRIPT_PATH" | tail -1 | cut -d: -f1 || true)
if [ -n "$LAST_USER_MSG" ]; then
  START_LINE=$LAST_USER_MSG
fi

# ---------------------------------------------------------------------------
# Find SKILL.md reads in tool.execution_start events
# ---------------------------------------------------------------------------
SKILL_PATHS_FILE=$(mktemp)
trap 'rm -f "$SKILL_PATHS_FILE"' EXIT

tail -n +"$START_LINE" "$TRANSCRIPT_PATH" | while IFS= read -r line; do
  [ "${#line}" -lt 20 ] && continue
  case "$line" in
    *'"tool.execution_start"'*) ;;
    *) continue ;;
  esac

  evt=$(echo "$line" | jq -e '.' 2>/dev/null) || continue
  evt_type=$(echo "$evt" | jq -r '.type // empty')
  if [ "$evt_type" != "tool.execution_start" ]; then
    continue
  fi

  tool_name=$(echo "$evt" | jq -r '.data.toolName // empty')
  if [ "$tool_name" != "read_file" ]; then
    continue
  fi

  fp=$(echo "$evt" | jq -r '.data.arguments.filePath // empty')
  if [ -z "$fp" ]; then
    continue
  fi

  # Check path contains /skills/ or \skills\ and ends with SKILL.md
  if echo "$fp" | grep -qE '(/|\\)skills(/|\\)' && echo "$fp" | grep -qE 'SKILL\.md$'; then
    echo "$fp" >> "$SKILL_PATHS_FILE"
  fi
done

# Deduplicate paths
if [ ! -s "$SKILL_PATHS_FILE" ]; then
  exit 0
fi
UNIQUE_PATHS=$(sort -uf "$SKILL_PATHS_FILE")

# ---------------------------------------------------------------------------
# Check which skills have Feedback Protocol
# ---------------------------------------------------------------------------
FEEDBACK_SKILLS=""
while IFS= read -r sp; do
  [ -z "$sp" ] && continue
  if [ ! -f "$sp" ]; then
    continue
  fi
  if grep -qlE 'Feedback Protocol|FEEDBACK:START' "$sp" 2>/dev/null; then
    # Extract skill name from path: .../skills/skill-name/SKILL.md
    skill_name=$(echo "$sp" | sed -E 's|.*/skills/([^/]+)/SKILL\.md$|\1|; s|.*\\skills\\([^\\]+)\\SKILL\.md$|\1|')
    if [ -n "$skill_name" ] && [ "$skill_name" != "$sp" ]; then
      if [ -z "$FEEDBACK_SKILLS" ]; then
        FEEDBACK_SKILLS="$skill_name"
      else
        FEEDBACK_SKILLS="${FEEDBACK_SKILLS}
${skill_name}"
      fi
    fi
  fi
done <<< "$UNIQUE_PATHS"

if [ -z "$FEEDBACK_SKILLS" ]; then
  exit 0
fi

# ---------------------------------------------------------------------------
# Build message with detected skills
# ---------------------------------------------------------------------------
SKILL_LIST=""
while IFS= read -r s; do
  SKILL_LIST="${SKILL_LIST}  - ${s}\n"
done <<< "$FEEDBACK_SKILLS"

MSG="SKILL FEEDBACK CHECK: Skills with Feedback Protocol were used in this session:\n${SKILL_LIST}\nIf the user expressed dissatisfaction or corrections were needed:\n1. Ask the user what specifically didn't work well\n2. Follow the Feedback Protocol in the skill's SKILL.md to create a structured review\n3. Create the review directory if it doesn't exist\n\nIf the session went well and the user didn't complain, skip this entirely."

# Escape for JSON
MSG_JSON=$(printf '%b' "$MSG" | jq -Rs '.')

cat <<ENDJSON
{
  "decision": "block",
  "reason": ${MSG_JSON},
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "decision": "block",
    "reason": ${MSG_JSON}
  }
}
ENDJSON
