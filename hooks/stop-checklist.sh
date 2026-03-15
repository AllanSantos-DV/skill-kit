#!/bin/bash
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
fi

cat <<EOF
{
  "systemMessage": "Before finishing: 1) Did you run tests? 2) Did you produce a task map (if decisions were made)? 3) Is the quality checklist satisfied?"
}
EOF
