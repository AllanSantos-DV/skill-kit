#!/bin/bash
INPUT=$(cat)
AGENT=$(echo "$INPUT" | jq -r '.agentName // "unknown"')
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Subagent started: $AGENT" >&2
echo "{}"
