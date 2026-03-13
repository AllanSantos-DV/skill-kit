#!/bin/bash
INPUT=$(cat)
ACTIVE=$(echo "$INPUT" | grep -o '"stop_hook_active"\s*:\s*true' | head -1)
ACTIVE=${ACTIVE:+true}

if [ "$ACTIVE" = "true" ]; then
  exit 0
fi

cat <<EOF
{
  "hookSpecificOutput": {
    "systemMessage": "Before finishing: 1) Did you run tests? 2) Did you produce a task map (if decisions were made)? 3) Is the quality checklist satisfied?"
  }
}
EOF
