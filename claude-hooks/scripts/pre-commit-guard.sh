#!/bin/bash
INPUT=$(cat 2>/dev/null || true)

# Parse tool_name using jq, fallback to grep
if command -v jq &>/dev/null; then
  TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
else
  TOOL=$(echo "$INPUT" | grep -o '"tool_name"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
fi

# Only intercept terminal commands (Claude Code uses 'Bash', Copilot uses 'run_in_terminal')
if [ "$TOOL" != "Bash" ] && [ "$TOOL" != "run_in_terminal" ]; then
  exit 0
fi

# Parse command using jq, fallback to grep
if command -v jq &>/dev/null; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
else
  CMD=$(echo "$INPUT" | grep -o '"command"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
fi

# Check if it's a git commit, push or tag (handles flags like git -C /path commit)
if ! echo "$CMD" | grep -qE 'git\s+(-[^ ]+\s+)*(commit|push|tag)'; then
  exit 0
fi

# Always block — agent must run tests and get user confirmation first
cat <<'EOF'
{
  "permissionDecision": "deny",
  "additionalContext": "BLOCKED: Before committing/pushing, you MUST: 1) Run the project tests and confirm they pass. 2) Ask the user for explicit permission to commit/push. Do NOT retry until BOTH conditions are met."
}
EOF
