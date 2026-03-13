#!/bin/bash
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
LAST_COMMIT=$(git log --oneline -1 2>/dev/null || echo "none")
CHANGES=$(git status --short 2>/dev/null | wc -l | tr -d ' ')

cat <<EOF
{
  "hookSpecificOutput": {
    "additionalContext": "Project context: branch=$BRANCH | last_commit=$LAST_COMMIT | uncommitted_changes=$CHANGES"
  }
}
EOF
