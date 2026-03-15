#!/bin/bash
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
INPUT=$(cat 2>/dev/null || true)
if [ -n "$INPUT" ]; then
  if command -v jq &>/dev/null; then
    ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
  else
    ACTIVE=$(echo "$INPUT" | grep -o '"stop_hook_active"\s*:\s*true' | head -1)
    ACTIVE=${ACTIVE:+true}
  fi
  if [ "$ACTIVE" = "true" ]; then
    exit 0
  fi
else
  exit 0
fi

# --- Get transcript path ---
TRANSCRIPT_PATH=""
if command -v jq &>/dev/null; then
  TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')
else
  TRANSCRIPT_PATH=$(echo "$INPUT" | grep -oP '"transcript_path"\s*:\s*"\K[^"]+' | head -1)
fi

if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
  exit 0
fi

# --- Read transcript content ---
TRANSCRIPT=$(cat "$TRANSCRIPT_PATH" 2>/dev/null || true)
if [ -z "$TRANSCRIPT" ]; then
  exit 0
fi

# --- Detect Phase 2 confidence table with Tools used column ---
if ! echo "$TRANSCRIPT" | grep -qP '\|\s*Axis\s*\|\s*Confidence\s*\|\s*Justification\s*\|\s*Tools\s*used\s*\|'; then
  exit 0
fi

# --- Parse confidence table rows ---
# Extract rows with emoji confidence markers (🟢 🟡 🔴) and 4 pipe-delimited columns
# Using perl for reliable Unicode handling
VIOLATIONS=""
VIOLATION_COUNT=0

while IFS= read -r line; do
  # Match table rows: | AxisName | emoji | justification | tools |
  if echo "$line" | grep -qP '\|\s*[^|]+\s*\|\s*(🟢|🟡|🔴)\s*\|'; then
    # Extract fields using perl for Unicode safety
    AXIS=$(echo "$line" | perl -ne 'if (/\|\s*([^|]+?)\s*\|\s*(?:🟢|🟡|🔴)\s*\|/) { print $1 }')
    EMOJI=$(echo "$line" | perl -ne 'if (/\|\s*[^|]+?\s*\|\s*(🟢|🟡|🔴)\s*\|/) { print $1 }')
    # Get the 4th column (Tools used)
    TOOLS_CELL=$(echo "$line" | perl -ne '@cols = split /\|/; if (scalar @cols >= 5) { $t = $cols[4]; $t =~ s/^\s+|\s+$//g; print $t }')

    # Skip 🟢 axes
    if [ "$EMOJI" = "🟢" ]; then
      continue
    fi

    # Check if tools column is empty or just a dash
    if [ -z "$TOOLS_CELL" ] || echo "$TOOLS_CELL" | grep -qP '^\s*[-—]?\s*$'; then
      if [ -z "$VIOLATIONS" ]; then
        VIOLATIONS="empty|${AXIS}|${EMOJI}"
      else
        VIOLATION_COUNT=$((VIOLATION_COUNT + 1))
      fi
      continue
    fi

    # Extract tool names: word followed by (
    TOOL_NAMES=$(echo "$TOOLS_CELL" | grep -oP '\w+(?=\s*\()' || true)

    if [ -z "$TOOL_NAMES" ]; then
      if [ -z "$VIOLATIONS" ]; then
        VIOLATIONS="empty|${AXIS}|${EMOJI}"
      else
        VIOLATION_COUNT=$((VIOLATION_COUNT + 1))
      fi
      continue
    fi

    # Cross-check each tool against transcript
    for TOOL in $TOOL_NAMES; do
      if ! echo "$TRANSCRIPT" | grep -qF "$TOOL"; then
        if [ -z "$VIOLATIONS" ]; then
          VIOLATIONS="notfound|${AXIS}|${EMOJI}|${TOOL}"
        else
          VIOLATION_COUNT=$((VIOLATION_COUNT + 1))
        fi
      fi
    done
  fi
done <<< "$TRANSCRIPT"

# --- Output ---
if [ -z "$VIOLATIONS" ]; then
  exit 0
fi

# Parse first violation
V_TYPE=$(echo "$VIOLATIONS" | cut -d'|' -f1)
V_AXIS=$(echo "$VIOLATIONS" | cut -d'|' -f2)
V_EMOJI=$(echo "$VIOLATIONS" | cut -d'|' -f3)
V_TOOL=$(echo "$VIOLATIONS" | cut -d'|' -f4)

if [ "$V_TYPE" = "empty" ]; then
  REASON="Axis '${V_AXIS}' classified as ${V_EMOJI} but no tools listed in the Tools used column. Active Research Gate requires declaring which tools were used."
else
  REASON="Axis '${V_AXIS}' lists tool '${V_TOOL}' but no matching tool call was found in the session transcript. The tool evidence must match actual tool usage."
fi

if [ "$VIOLATION_COUNT" -gt 0 ]; then
  REASON="${REASON} (+ ${VIOLATION_COUNT} more violation(s))"
fi

cat <<EOF
{
  "hookSpecificOutput": {
    "decision": "block",
    "reason": "${REASON}"
  }
}
EOF
