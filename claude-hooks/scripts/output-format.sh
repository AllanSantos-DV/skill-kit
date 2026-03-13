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
    "systemMessage": "Verify your output follows the required format: Research Summary (researcher) or Validation Report (validator) with all mandatory sections."
  }
}
EOF
