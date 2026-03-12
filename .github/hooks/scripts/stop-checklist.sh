#!/bin/bash
INPUT=$(cat)
ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')

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
