#!/bin/bash
INPUT=$(cat 2>/dev/null || true)
if [ -n "$INPUT" ]; then
  ACTIVE=$(echo "$INPUT" | grep -o '"stop_hook_active"\s*:\s*true' | head -1)
  ACTIVE=${ACTIVE:+true}
  if [ "$ACTIVE" = "true" ]; then
    exit 0
  fi
fi

cat <<'EOF'
{
  "hookSpecificOutput": {
    "systemMessage": "VERIFICATION CHECK: Review every factual claim you made in this session. Was each one verified using tools (read_file, grep_search, run_in_terminal, semantic_search)? If any claim was assumed without tool verification — correct it now or explicitly mark it as unverified. Never present assumptions as facts."
  }
}
EOF
