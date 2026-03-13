#!/bin/bash
INPUT=$(cat 2>/dev/null || true)
AGENT="unknown"
if [ -n "$INPUT" ]; then
  if command -v jq &>/dev/null; then
    AGENT=$(echo "$INPUT" | jq -r '.agentName // "unknown"')
  else
    AGENT=$(echo "$INPUT" | grep -o '"agentName"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
    AGENT=${AGENT:-unknown}
  fi
fi
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Subagent started: $AGENT" >&2
echo "{}"
