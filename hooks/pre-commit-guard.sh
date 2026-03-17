#!/bin/bash
# PreToolUse hook: guard git commit/push/tag
# - commit: deny unless -m with conventional commit message; allow if valid
# - push/tag: ask user for confirmation
# - other commands: passthrough
INPUT=$(cat 2>/dev/null || true)

# Parse tool_name using jq, fallback to grep
if command -v jq &>/dev/null; then
  TOOL=$(echo "$INPUT" | jq -r '.tool_name // ""')
else
  TOOL=$(echo "$INPUT" | grep -o '"tool_name"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
fi

# Only intercept terminal commands
if [ "$TOOL" != "run_in_terminal" ] && [ "$TOOL" != "Bash" ]; then
  exit 0
fi

# Parse command using jq, fallback to grep
if command -v jq &>/dev/null; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // ""')
else
  CMD=$(echo "$INPUT" | grep -o '"command"\s*:\s*"[^"]*"' | sed 's/.*:.*"\([^"]*\)"/\1/')
fi

# Check if it's a git commit, push or tag (handles flags like git -C /path commit)
if ! echo "$CMD" | grep -qP 'git\s+(-[^ ]+\s+)*(commit|push|tag)'; then
  exit 0
fi

# Extract git action (commit, push, or tag)
GIT_ACTION=$(echo "$CMD" | grep -oP 'git\s+(-[^ ]+\s+)*\K(commit|push|tag)')

if [ "$GIT_ACTION" = "push" ]; then
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "permissionDecision": "ask",
    "additionalContext": "git push requires user confirmation"
  }
}
EOF
  exit 0
fi

if [ "$GIT_ACTION" = "tag" ]; then
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "permissionDecision": "ask",
    "additionalContext": "git tag requires user confirmation"
  }
}
EOF
  exit 0
fi

# git commit — check for conventional commit message
# Support both -m and -am (combined add+message flag)
COMMIT_MSG=""
COMMIT_MSG=$(echo "$CMD" | grep -oP -- '-a?m\s+["\x27]?\K(.+?)(?=["\x27](\s|$)|$)')

if [ -z "$COMMIT_MSG" ]; then
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "permissionDecision": "deny",
    "additionalContext": "Commit must include -m with a conventional commit message"
  }
}
EOF
  exit 0
fi

# Validate conventional commit pattern (case-insensitive per spec rule 15; includes revert)
if echo "$COMMIT_MSG" | grep -qiP '^(feat|fix|docs|chore|refactor|test|ci|build|perf|style|revert)(\(.+\))?(!)?\:\s+.+'; then
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "permissionDecision": "allow"
  }
}
EOF
else
  cat <<'EOF'
{
  "hookSpecificOutput": {
    "permissionDecision": "deny",
    "additionalContext": "Commit message must follow conventional commits pattern (e.g. feat: add feature, fix(scope): description)"
  }
}
EOF
fi
