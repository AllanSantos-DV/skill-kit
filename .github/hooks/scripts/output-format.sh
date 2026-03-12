#!/bin/bash
INPUT=$(cat)
ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')

if [ "$ACTIVE" = "true" ]; then
  exit 0
fi

cat <<EOF
{
  "hookSpecificOutput": {
    "systemMessage": "Verify your output follows the required format: Research Summary (researcher) or Validation Report (validator) with all mandatory sections."
  }
}
EOF
