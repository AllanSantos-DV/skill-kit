#!/bin/bash
# PreToolUse hook: guard destructive commands (supports chained commands)
# - Splits chained commands by ; && || (respecting quoted strings)
# - git commit: deny unless -m with conventional commit message
# - git push/tag: ask user for confirmation
# - git push --force-with-lease: ask (confirmation)
# - git push --force: deny (destructive)
# - git reset --hard: ask (recoverable via reflog)
# - git rebase: ask (history rewrite)
# - git clean -f*: ask (routine cleanup)
# - git checkout -- <path>: ask (discards working tree changes)
# - git branch -D: ask (force-deletes branch)
# - git stash drop/clear: ask (loses stashed changes)
# - Destructive filesystem commands (rm -rf, etc.): deny
# - Most restrictive wins: deny > ask > allow
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

# Split chained commands by ; && || (respecting quoted strings)
split_commands() {
  local input="$1"
  local len=${#input}
  local current=""
  local in_single=false
  local in_double=false
  local i=0
  SUB_COMMANDS=()

  while [ $i -lt $len ]; do
    local c="${input:$i:1}"
    if [ "$c" = "'" ] && [ "$in_double" = false ]; then
      if [ "$in_single" = true ]; then in_single=false; else in_single=true; fi
      current="${current}${c}"
    elif [ "$c" = '"' ] && [ "$in_single" = false ]; then
      if [ "$in_double" = true ]; then in_double=false; else in_double=true; fi
      current="${current}${c}"
    elif [ "$in_single" = false ] && [ "$in_double" = false ]; then
      if [ "$c" = ";" ]; then
        local trimmed
        trimmed=$(echo "$current" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        [ -n "$trimmed" ] && SUB_COMMANDS+=("$trimmed")
        current=""
      elif [ "$c" = "&" ] && [ "${input:$((i+1)):1}" = "&" ]; then
        local trimmed
        trimmed=$(echo "$current" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        [ -n "$trimmed" ] && SUB_COMMANDS+=("$trimmed")
        current=""
        i=$((i + 1))
      elif [ "$c" = "|" ] && [ "${input:$((i+1)):1}" = "|" ]; then
        local trimmed
        trimmed=$(echo "$current" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        [ -n "$trimmed" ] && SUB_COMMANDS+=("$trimmed")
        current=""
        i=$((i + 1))
      else
        current="${current}${c}"
      fi
    else
      current="${current}${c}"
    fi
    i=$((i + 1))
  done

  local trimmed
  trimmed=$(echo "$current" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  [ -n "$trimmed" ] && SUB_COMMANDS+=("$trimmed")
}

# Evaluate a single sub-command; sets eval_decision and eval_context
evaluate_git_command() {
  local sub="$1"
  eval_decision=""
  eval_context=""

  # --- Destructive filesystem commands ---
  if echo "$sub" | grep -qP '\brm\s+.*-[rR]|\brm\s+-[fFrR]{2}|\brmdir\s+/[sS]|\bdel\s+/[sS]|\bformat\s+[a-zA-Z]:|\bmkfs\b'; then
    eval_decision="deny"
    eval_context="Destructive filesystem command requires confirmation: $sub"
    return 0
  fi

  # --- Git reset --hard ---
  if echo "$sub" | grep -qP 'git\s+(-[^ ]+\s+)*reset\s+--hard'; then
    eval_decision="ask"
    eval_context="git reset --hard discards uncommitted changes — requires confirmation"
    return 0
  fi

  # --- Git push --force-with-lease (safer variant — ask) ---
  if echo "$sub" | grep -qP 'git\s+(-[^ ]+\s+)*push\s+.*--force-with-lease'; then
    eval_decision="ask"
    eval_context="git push --force-with-lease requires confirmation"
    return 0
  fi

  # --- Git push --force (destructive — deny) ---
  if echo "$sub" | grep -qP 'git\s+(-[^ ]+\s+)*push\s+.*--force'; then
    eval_decision="deny"
    eval_context="git push --force rewrites remote history"
    return 0
  fi

  # --- Git rebase ---
  if echo "$sub" | grep -qP 'git\s+(-[^ ]+\s+)*rebase\b'; then
    eval_decision="ask"
    eval_context="git rebase rewrites history — requires confirmation"
    return 0
  fi

  # --- Git clean -f (routine cleanup — ask) ---
  if echo "$sub" | grep -qP 'git\s+(-[^ ]+\s+)*clean\s+.*-[a-zA-Z]*f'; then
    eval_decision="ask"
    eval_context="git clean removes untracked files — requires confirmation"
    return 0
  fi

  # --- Git checkout -- (discard working tree changes) ---
  if echo "$sub" | grep -qP 'git\s+(-[^ ]+\s+)*checkout\s+.*--\s'; then
    eval_decision="ask"
    eval_context="git checkout -- discards working tree changes — requires confirmation"
    return 0
  fi

  # --- Git branch -D (force delete) ---
  if echo "$sub" | grep -qP 'git\s+(-[^ ]+\s+)*branch\s+.*-D'; then
    eval_decision="ask"
    eval_context="git branch -D force-deletes a branch — requires confirmation"
    return 0
  fi

  # --- Git stash drop / clear ---
  if echo "$sub" | grep -qP 'git\s+(-[^ ]+\s+)*stash\s+(drop|clear)\b'; then
    eval_decision="ask"
    eval_context="git stash drop/clear loses stashed changes — requires confirmation"
    return 0
  fi

  # Check if this sub-command contains git commit/push/tag
  if ! echo "$sub" | grep -qP 'git\s+(-[^ ]+\s+)*(commit|push|tag)\b'; then
    return 1  # not a command we care about
  fi

  local action
  action=$(echo "$sub" | grep -oP 'git\s+(-[^ ]+\s+)*\K(commit|push|tag)')

  if [ "$action" = "push" ]; then
    eval_decision="ask"
    eval_context="git push requires user confirmation"
    return 0
  fi

  if [ "$action" = "tag" ]; then
    eval_decision="ask"
    eval_context="git tag requires user confirmation"
    return 0
  fi

  # git commit — check for conventional commit message
  local commit_msg=""
  commit_msg=$(echo "$sub" | grep -oP -- '-a?m\s+["\x27]?\K(.+?)(?=["\x27](\s|$)|$)')

  if [ -z "$commit_msg" ]; then
    eval_decision="deny"
    eval_context="Commit must include -m with a conventional commit message"
    return 0
  fi

  if echo "$commit_msg" | grep -qiP '^(feat|fix|docs|chore|refactor|test|ci|build|perf|style|revert)(\(.+\))?(!)?\:\s+.+'; then
    eval_decision="allow"
    return 0
  else
    eval_decision="deny"
    eval_context="Commit message must follow conventional commits pattern (e.g. feat: add feature, fix(scope): description)"
    return 0
  fi
}

# Split and evaluate
split_commands "$CMD"

FINAL_DECISION="allow"
CONTEXTS=""
HAS_GIT=false

for sub in "${SUB_COMMANDS[@]}"; do
  if evaluate_git_command "$sub"; then
    HAS_GIT=true

    # Accumulate context
    if [ -n "$eval_context" ]; then
      if [ -n "$CONTEXTS" ]; then
        CONTEXTS="${CONTEXTS}; ${eval_context}"
      else
        CONTEXTS="$eval_context"
      fi
    fi

    # Most restrictive wins: deny > ask > allow
    if [ "$eval_decision" = "deny" ]; then
      FINAL_DECISION="deny"
    elif [ "$eval_decision" = "ask" ] && [ "$FINAL_DECISION" != "deny" ]; then
      FINAL_DECISION="ask"
    fi
  fi
done

# No git commands found — passthrough
if [ "$HAS_GIT" = false ]; then
  exit 0
fi

# Build output JSON
if [ -n "$CONTEXTS" ]; then
  if command -v jq &>/dev/null; then
    jq -n --arg decision "$FINAL_DECISION" --arg ctx "$CONTEXTS" \
      '{"hookSpecificOutput":{"permissionDecision":$decision,"additionalContext":$ctx}}'
  else
    # Manual JSON — escape quotes in context
    ESCAPED_CTX=$(echo "$CONTEXTS" | sed 's/"/\\"/g')
    cat <<EOJSON
{
  "hookSpecificOutput": {
    "permissionDecision": "${FINAL_DECISION}",
    "additionalContext": "${ESCAPED_CTX}"
  }
}
EOJSON
  fi
else
  if command -v jq &>/dev/null; then
    jq -n --arg decision "$FINAL_DECISION" \
      '{"hookSpecificOutput":{"permissionDecision":$decision}}'
  else
    cat <<EOJSON
{
  "hookSpecificOutput": {
    "permissionDecision": "${FINAL_DECISION}"
  }
}
EOJSON
  fi
fi
