#!/bin/bash
INPUT=$(cat 2>/dev/null || true)

# Extract tool_name
TOOL=$(echo "$INPUT" | grep -o '"tool_name"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')

# Only intercept terminal commands
if [ "$TOOL" != "Bash" ] && [ "$TOOL" != "run_in_terminal" ]; then
  exit 0
fi

# Extract the command being run
CMD=$(echo "$INPUT" | grep -o '"command"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')

# Check if it's a git commit, push or tag
if ! echo "$CMD" | grep -qE 'git\s+(commit|push|tag)'; then
  exit 0
fi

# Check for pass marker (user already confirmed)
MARKER="$HOME/.claude/.commit-guard-pass"
if [ -f "$MARKER" ]; then
  rm -f "$MARKER"
  exit 0
fi

# Create marker for next attempt
mkdir -p "$HOME/.claude"
touch "$MARKER"

# Block the command
cat <<'EOF'
{
  "permissionDecision": "deny",
  "additionalContext": "BLOCKED: Before committing/pushing, you MUST: 1) Run tests and confirm they pass. 2) Ask the user for explicit permission to commit/push. Only retry after BOTH conditions are met."
}
EOF
