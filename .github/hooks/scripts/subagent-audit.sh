#!/bin/bash
INPUT=$(cat)
AGENT=$(echo "$INPUT" | grep -o '"agentName"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
AGENT=${AGENT:-unknown}
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Subagent started: $AGENT" >&2
echo "{}"
