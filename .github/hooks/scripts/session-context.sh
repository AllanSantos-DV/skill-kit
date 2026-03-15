#!/bin/bash
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
LAST_COMMIT=$(git log --oneline -1 2>/dev/null || echo "none")
CHANGES=$(git status --short 2>/dev/null | wc -l | tr -d ' ')

# Use jq for safe JSON escaping if available, otherwise fallback
if command -v jq &>/dev/null; then
  jq -n --arg msg "Project context: branch=$BRANCH | last_commit=$LAST_COMMIT | uncommitted_changes=$CHANGES" '{ systemMessage: $msg }'
else
  cat <<EOF
{
  "systemMessage": "Project context: branch=$BRANCH | last_commit=$LAST_COMMIT | uncommitted_changes=$CHANGES"
}
EOF
fi
