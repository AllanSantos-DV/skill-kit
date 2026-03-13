#!/bin/bash
INPUT=$(cat 2>/dev/null || true)
if [ -n "$INPUT" ]; then
  ACTIVE=$(echo "$INPUT" | grep -o '"stop_hook_active"\s*:\s*true' | head -1)
  ACTIVE=${ACTIVE:+true}
  if [ "$ACTIVE" = "true" ]; then
    exit 0
  fi
fi

cat <<EOF
{
  "decision": "block",
  "reason": "Verify your output follows the required format: Research Summary (researcher) or Validation Report (validator) with all mandatory sections."
}
EOF
