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

cat <<'EOF'
{
  "decision": "block",
  "reason": "SKILL FEEDBACK CHECK: If you used any skill that contains a Feedback Protocol section in this session AND the user expressed dissatisfaction or corrections were needed: 1) Ask the user what specifically didn't work well (if they haven't already said) 2) Once the user confirms the issues, follow the Feedback Protocol described in the skill's instructions to create a structured review 3) Create the review directory if it doesn't exist. IMPORTANT: Do NOT generate feedback autonomously. Only capture feedback that the user explicitly validated. If the session went well and the user didn't complain, skip this entirely.",
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "decision": "block",
    "reason": "SKILL FEEDBACK CHECK: If you used any skill that contains a Feedback Protocol section in this session AND the user expressed dissatisfaction or corrections were needed: 1) Ask the user what specifically didn't work well (if they haven't already said) 2) Once the user confirms the issues, follow the Feedback Protocol described in the skill's instructions to create a structured review 3) Create the review directory if it doesn't exist. IMPORTANT: Do NOT generate feedback autonomously. Only capture feedback that the user explicitly validated. If the session went well and the user didn't complain, skip this entirely."
  }
}
EOF
