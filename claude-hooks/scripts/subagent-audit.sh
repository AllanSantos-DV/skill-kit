#!/bin/bash
INPUT=$(cat 2>/dev/null || true)
AGENT="unknown"
if [ -n "$INPUT" ]; then
  # Try jq first, fall back to grep
  if command -v jq &>/dev/null; then
    AGENT=$(echo "$INPUT" | jq -r '.agent_type // "unknown"')
  else
    AGENT=$(echo "$INPUT" | grep -oP '"agent_type"\s*:\s*"\K[^"]+' || echo "unknown")
  fi
fi
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Subagent started: $AGENT" >&2
echo "{}"
