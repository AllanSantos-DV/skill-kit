#!/bin/bash
# Test suite for hooks/pre-commit-guard.sh
# Run: bash tests/hooks/test-pre-commit-guard.sh
# Requires: jq (will skip all tests if not available)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_PATH="$SCRIPT_DIR/../../hooks/pre-commit-guard.sh"

PASSED=0
FAILED=0
TOTAL=0

# ---------------------------------------------------------------------------
# Dependency check
# ---------------------------------------------------------------------------
if ! command -v jq &>/dev/null; then
    echo "SKIP: jq is required for these tests but not found."
    exit 0
fi

if [ ! -f "$HOOK_PATH" ]; then
    echo "ERROR: Hook not found at $HOOK_PATH"
    exit 1
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

invoke_hook() {
    local tool_name="$1"
    local command="$2"
    # Escape double quotes and backslashes for valid JSON
    local escaped
    escaped=$(printf '%s' "$command" | sed 's/\\/\\\\/g; s/"/\\"/g')
    printf '{"tool_name":"%s","tool_input":{"command":"%s"}}' "$tool_name" "$escaped" \
        | bash "$HOOK_PATH" 2>/dev/null
}

get_decision() {
    local output="$1"
    if [ -z "$output" ]; then
        echo ""
        return
    fi
    echo "$output" | jq -r '.hookSpecificOutput.permissionDecision // empty' 2>/dev/null
}

get_context() {
    local output="$1"
    if [ -z "$output" ]; then
        echo ""
        return
    fi
    echo "$output" | jq -r '.hookSpecificOutput.additionalContext // empty' 2>/dev/null
}

pass() {
    echo "  ✓ PASS: $1"
    ((PASSED++))
    ((TOTAL++))
}

fail() {
    echo "  ✗ FAIL: $1"
    [ -n "${2:-}" ] && echo "    $2"
    ((FAILED++))
    ((TOTAL++))
}

assert_decision() {
    local output="$1"
    local expected="$2"
    local test_name="$3"
    local decision
    decision=$(get_decision "$output")
    if [ "$decision" = "$expected" ]; then
        pass "$test_name"
    else
        fail "$test_name" "Expected: '$expected', Got: '$decision'"
    fi
}

assert_no_output() {
    local output="$1"
    local test_name="$2"
    if [ -z "$output" ]; then
        pass "$test_name"
    else
        fail "$test_name" "Expected no output but got: '$output'"
    fi
}

assert_context_contains() {
    local output="$1"
    local substring="$2"
    local test_name="$3"
    local ctx
    ctx=$(get_context "$output")
    if echo "$ctx" | grep -qiF -- "$substring"; then
        pass "$test_name"
    else
        fail "$test_name" "Expected context to contain '$substring', got: '$ctx'"
    fi
}

# ===========================================================================
echo ""
echo "=== pre-commit-guard.sh Tests ==="
# ===========================================================================

# ---------------------------------------------------------------------------
echo ""
echo "--- Single commands ---"
# ---------------------------------------------------------------------------

# 1. Valid conventional commit (feat)
out=$(invoke_hook "run_in_terminal" 'git commit -m "feat: add feature"')
assert_decision "$out" "allow" '1. git commit -m "feat: add feature" -> allow'

# 2. Valid conventional commit with scope
out=$(invoke_hook "run_in_terminal" 'git commit -m "fix(scope): description"')
assert_decision "$out" "allow" '2. git commit -m "fix(scope): description" -> allow'

# 3. Invalid commit message
out=$(invoke_hook "run_in_terminal" 'git commit -m "bad message"')
assert_decision "$out" "deny" '3. git commit -m "bad message" -> deny'

# 4. Commit without -m
out=$(invoke_hook "run_in_terminal" "git commit")
assert_decision "$out" "deny" '4. git commit (no -m) -> deny'

# 5. git push
out=$(invoke_hook "run_in_terminal" "git push origin main")
assert_decision "$out" "ask" '5. git push origin main -> ask'

# 6. git tag
out=$(invoke_hook "run_in_terminal" "git tag v1.0.0")
assert_decision "$out" "ask" '6. git tag v1.0.0 -> ask'

# 7. Non-git command (npm)
out=$(invoke_hook "run_in_terminal" "npm install")
assert_no_output "$out" '7. npm install -> no output (exit 0)'

# 8. Non-git command (echo)
out=$(invoke_hook "run_in_terminal" 'echo "hello"')
assert_no_output "$out" '8. echo "hello" -> no output (exit 0)'

# ---------------------------------------------------------------------------
echo ""
echo "--- Chained commands ---"
# ---------------------------------------------------------------------------

# 9. Chain with push (ask wins over allow)
out=$(invoke_hook "run_in_terminal" 'git add .; git commit -m "feat: x"; git push')
assert_decision "$out" "ask" '9. git add + commit + push -> ask (push wins)'

# 10. Chain with bad commit + push (deny wins over ask)
out=$(invoke_hook "run_in_terminal" 'git commit -m "bad"; git push')
assert_decision "$out" "deny" '10. bad commit + push -> deny (deny wins)'

# 11. Chain with valid commit only (allow)
out=$(invoke_hook "run_in_terminal" 'git add . && git commit -m "docs: update"')
assert_decision "$out" "allow" '11. git add && valid commit -> allow'

# 12. Non-git + push (ask)
out=$(invoke_hook "run_in_terminal" "npm install && git push origin main")
assert_decision "$out" "ask" '12. npm install && git push -> ask'

# 13. Valid commit + tag (ask wins)
out=$(invoke_hook "run_in_terminal" 'git commit -m "feat: x" && git tag v1.0')
assert_decision "$out" "ask" '13. valid commit && git tag -> ask (tag wins)'

# ---------------------------------------------------------------------------
echo ""
echo "--- Edge cases ---"
# ---------------------------------------------------------------------------

# 14. echo "git push" — git inside echo's argument string
# Known limitation: the regex matches "git push" even inside echo's quotes.
out=$(invoke_hook "run_in_terminal" 'echo "git push"')
decision14=$(get_decision "$out")
if [ "$decision14" = "ask" ]; then
    pass '14. echo "git push" -> ask (known limitation: matches inside quotes)'
elif [ -z "$out" ]; then
    pass '14. echo "git push" -> no output (correctly ignored)'
else
    fail '14. echo "git push" -> unexpected' "Got: '$decision14'"
fi

# 15. git commit -am (combined add+message)
out=$(invoke_hook "run_in_terminal" 'git commit -am "feat: combined add"')
assert_decision "$out" "allow" '15. git commit -am "feat: combined add" -> allow'

# 16. Non-terminal tool
out=$(invoke_hook "other_tool" "git push origin main")
assert_no_output "$out" '16. tool_name=other_tool -> no output (exit 0)'

# 17. Empty command
out=$(invoke_hook "run_in_terminal" "")
assert_no_output "$out" '17. empty command -> no output (exit 0)'

# ---------------------------------------------------------------------------
echo ""
echo "--- Context message checks ---"
# ---------------------------------------------------------------------------

# 18. Deny includes conventional commits guidance
out=$(invoke_hook "run_in_terminal" 'git commit -m "bad message"')
assert_context_contains "$out" "conventional commits" '18. deny context mentions conventional commits'

# 19. Push context mentions confirmation
out=$(invoke_hook "run_in_terminal" "git push origin main")
assert_context_contains "$out" "confirmation" '19. push context mentions confirmation'

# 20. No -m context mentions include -m
out=$(invoke_hook "run_in_terminal" "git commit")
assert_context_contains "$out" "-m" '20. no-message context mentions -m'

# ---------------------------------------------------------------------------
echo ""
echo "--- New destructive command guards ---"
# ---------------------------------------------------------------------------

# 21. git clean -fd -> ask
out=$(invoke_hook "run_in_terminal" "git clean -fd")
assert_decision "$out" "ask" '21. git clean -fd -> ask'

# 22. git clean -fdx -> ask
out=$(invoke_hook "run_in_terminal" "git clean -fdx")
assert_decision "$out" "ask" '22. git clean -fdx -> ask'

# 23. git clean -xfd -> ask
out=$(invoke_hook "run_in_terminal" "git clean -xfd")
assert_decision "$out" "ask" '23. git clean -xfd -> ask'

# 24. git clean -fd context message
out=$(invoke_hook "run_in_terminal" "git clean -fd")
assert_context_contains "$out" "untracked files" '24. git clean context mentions untracked files'

# 25. git checkout -- . -> ask
out=$(invoke_hook "run_in_terminal" "git checkout -- .")
assert_decision "$out" "ask" '25. git checkout -- . -> ask'

# 26. git checkout -- src/file.ts -> ask
out=$(invoke_hook "run_in_terminal" "git checkout -- src/file.ts")
assert_decision "$out" "ask" '26. git checkout -- src/file.ts -> ask'

# 27. git checkout -- context message
out=$(invoke_hook "run_in_terminal" "git checkout -- .")
assert_context_contains "$out" "working tree changes" '27. git checkout -- context mentions working tree changes'

# 28. git branch -D feature -> ask
out=$(invoke_hook "run_in_terminal" "git branch -D feature-branch")
assert_decision "$out" "ask" '28. git branch -D feature-branch -> ask'

# 29. git branch -D context message
out=$(invoke_hook "run_in_terminal" "git branch -D feature-branch")
assert_context_contains "$out" "force-deletes" '29. git branch -D context mentions force-deletes'

# 30. git branch -d (lowercase) should NOT be caught — passthrough
out=$(invoke_hook "run_in_terminal" "git branch -d feature-branch")
assert_no_output "$out" '30. git branch -d (lowercase) -> no output (not force delete)'

# 31. git stash drop -> ask
out=$(invoke_hook "run_in_terminal" "git stash drop")
assert_decision "$out" "ask" '31. git stash drop -> ask'

# 32. git stash clear -> ask
out=$(invoke_hook "run_in_terminal" "git stash clear")
assert_decision "$out" "ask" '32. git stash clear -> ask'

# 33. git stash drop context message
out=$(invoke_hook "run_in_terminal" "git stash drop")
assert_context_contains "$out" "stashed changes" '33. git stash drop context mentions stashed changes'

# 34. git clean + git checkout -- chained (both ask)
out=$(invoke_hook "run_in_terminal" 'git clean -fd && git checkout -- .')
assert_decision "$out" "ask" '34. git clean + git checkout -- chained -> ask (both ask)'

# ---------------------------------------------------------------------------
echo ""
echo "--- Policy changes (deny -> ask) ---"
# ---------------------------------------------------------------------------

# 35. git reset --hard -> ask (was deny, recoverable via reflog)
out=$(invoke_hook "run_in_terminal" "git reset --hard")
assert_decision "$out" "ask" '35. git reset --hard -> ask'

# 36. git reset --hard context message
out=$(invoke_hook "run_in_terminal" "git reset --hard")
assert_context_contains "$out" "uncommitted changes" '36. git reset --hard context mentions uncommitted changes'

# 37. git push --force -> deny (stays deny)
out=$(invoke_hook "run_in_terminal" "git push --force origin main")
assert_decision "$out" "deny" '37. git push --force origin main -> deny'

# 38. git push --force context message
out=$(invoke_hook "run_in_terminal" "git push --force origin main")
assert_context_contains "$out" "remote history" '38. git push --force context mentions remote history'

# 39. git push --force-with-lease -> ask (new, distinguished from --force)
out=$(invoke_hook "run_in_terminal" "git push --force-with-lease origin main")
assert_decision "$out" "ask" '39. git push --force-with-lease origin main -> ask'

# 40. git push --force-with-lease context message
out=$(invoke_hook "run_in_terminal" "git push --force-with-lease origin main")
assert_context_contains "$out" "confirmation" '40. git push --force-with-lease context mentions confirmation'

# 41. git clean -fd context mentions requires confirmation
out=$(invoke_hook "run_in_terminal" "git clean -fd")
assert_context_contains "$out" "requires confirmation" '41. git clean -fd context mentions requires confirmation'

# 42. Chain: git push --force + git push --force-with-lease -> deny wins
out=$(invoke_hook "run_in_terminal" 'git push --force-with-lease origin main && git push --force origin dev')
assert_decision "$out" "deny" '42. git push --force-with-lease + --force chained -> deny (deny wins)'

# ---------------------------------------------------------------------------
echo ""
echo "--- Conventional commit types ---"
# ---------------------------------------------------------------------------

# 43. docs prefix
out=$(invoke_hook "run_in_terminal" 'git commit -m "docs: update readme"')
assert_decision "$out" "allow" '43. git commit -m "docs: update readme" -> allow'

# 44. chore prefix
out=$(invoke_hook "run_in_terminal" 'git commit -m "chore: cleanup"')
assert_decision "$out" "allow" '44. git commit -m "chore: cleanup" -> allow'

# 45. refactor prefix
out=$(invoke_hook "run_in_terminal" 'git commit -m "refactor: extract method"')
assert_decision "$out" "allow" '45. git commit -m "refactor: extract method" -> allow'

# 46. test prefix
out=$(invoke_hook "run_in_terminal" 'git commit -m "test: add unit tests"')
assert_decision "$out" "allow" '46. git commit -m "test: add unit tests" -> allow'

# 47. ci prefix
out=$(invoke_hook "run_in_terminal" 'git commit -m "ci: fix pipeline"')
assert_decision "$out" "allow" '47. git commit -m "ci: fix pipeline" -> allow'

# 48. build prefix
out=$(invoke_hook "run_in_terminal" 'git commit -m "build: update deps"')
assert_decision "$out" "allow" '48. git commit -m "build: update deps" -> allow'

# 49. perf prefix
out=$(invoke_hook "run_in_terminal" 'git commit -m "perf: optimize query"')
assert_decision "$out" "allow" '49. git commit -m "perf: optimize query" -> allow'

# 50. style prefix
out=$(invoke_hook "run_in_terminal" 'git commit -m "style: formatting"')
assert_decision "$out" "allow" '50. git commit -m "style: formatting" -> allow'

# 51. revert prefix
out=$(invoke_hook "run_in_terminal" 'git commit -m "revert: undo feat"')
assert_decision "$out" "allow" '51. git commit -m "revert: undo feat" -> allow'

# 52. Breaking change with ! (feat!)
out=$(invoke_hook "run_in_terminal" 'git commit -m "feat!: breaking change"')
assert_decision "$out" "allow" '52. git commit -m "feat!: breaking change" -> allow'

# 53. Scope + breaking change (fix(auth)!)
out=$(invoke_hook "run_in_terminal" 'git commit -m "fix(auth)!: breaking fix"')
assert_decision "$out" "allow" '53. git commit -m "fix(auth)!: breaking fix" -> allow'

# ---------------------------------------------------------------------------
echo ""
echo "--- Git rebase ---"
# ---------------------------------------------------------------------------

# 54. git rebase main -> ask
out=$(invoke_hook "run_in_terminal" "git rebase main")
assert_decision "$out" "ask" '54. git rebase main -> ask'

# 55. git rebase -i HEAD~3 -> ask
out=$(invoke_hook "run_in_terminal" "git rebase -i HEAD~3")
assert_decision "$out" "ask" '55. git rebase -i HEAD~3 -> ask'

# 56. git rebase --interactive main -> ask
out=$(invoke_hook "run_in_terminal" "git rebase --interactive main")
assert_decision "$out" "ask" '56. git rebase --interactive main -> ask'

# 57. git rebase context mentions history
out=$(invoke_hook "run_in_terminal" "git rebase main")
assert_context_contains "$out" "history" '57. git rebase context mentions history'

# ---------------------------------------------------------------------------
echo ""
echo "--- Filesystem destructive commands ---"
# ---------------------------------------------------------------------------

# 58. rm -rf -> deny
out=$(invoke_hook "run_in_terminal" "rm -rf /tmp/build")
assert_decision "$out" "deny" '58. rm -rf /tmp/build -> deny'

# 59. rm -r -> deny
out=$(invoke_hook "run_in_terminal" "rm -r ./dist")
assert_decision "$out" "deny" '59. rm -r ./dist -> deny'

# 60. rm -fR (capital R) -> deny
out=$(invoke_hook "run_in_terminal" "rm -fR ./node_modules")
assert_decision "$out" "deny" '60. rm -fR ./node_modules -> deny'

# 61. rm -rf context mentions Destructive
out=$(invoke_hook "run_in_terminal" "rm -rf /tmp/build")
assert_context_contains "$out" "Destructive" '61. rm -rf context mentions Destructive'

# ---------------------------------------------------------------------------
echo ""
echo "--- Bash tool_name ---"
# ---------------------------------------------------------------------------

# 62. Bash + git push -> ask
out=$(invoke_hook "Bash" "git push origin main")
assert_decision "$out" "ask" '62. Bash + git push origin main -> ask'

# 63. Bash + valid commit -> allow
out=$(invoke_hook "Bash" 'git commit -m "feat: x"')
assert_decision "$out" "allow" '63. Bash + git commit -m "feat: x" -> allow'

# 64. Bash + bad commit -> deny
out=$(invoke_hook "Bash" 'git commit -m "bad"')
assert_decision "$out" "deny" '64. Bash + git commit -m "bad" -> deny'

# ---------------------------------------------------------------------------
echo ""
echo "--- Safe variants (passthrough) ---"
# ---------------------------------------------------------------------------

# 65. git reset --soft HEAD~1 -> no output
out=$(invoke_hook "run_in_terminal" "git reset --soft HEAD~1")
assert_no_output "$out" '65. git reset --soft HEAD~1 -> no output'

# 66. git reset --mixed HEAD~1 -> no output
out=$(invoke_hook "run_in_terminal" "git reset --mixed HEAD~1")
assert_no_output "$out" '66. git reset --mixed HEAD~1 -> no output'

# 67. git reset HEAD file.txt -> no output (unstaging)
out=$(invoke_hook "run_in_terminal" "git reset HEAD file.txt")
assert_no_output "$out" '67. git reset HEAD file.txt -> no output'

# 68. git clean -n -> no output (dry-run)
out=$(invoke_hook "run_in_terminal" "git clean -n")
assert_no_output "$out" '68. git clean -n -> no output (dry-run)'

# 69. git clean --dry-run -> no output
out=$(invoke_hook "run_in_terminal" "git clean --dry-run")
assert_no_output "$out" '69. git clean --dry-run -> no output'

# 70. git stash -> no output
out=$(invoke_hook "run_in_terminal" "git stash")
assert_no_output "$out" '70. git stash -> no output'

# 71. git stash list -> no output
out=$(invoke_hook "run_in_terminal" "git stash list")
assert_no_output "$out" '71. git stash list -> no output'

# 72. git stash pop -> no output
out=$(invoke_hook "run_in_terminal" "git stash pop")
assert_no_output "$out" '72. git stash pop -> no output'

# 73. git stash apply -> no output
out=$(invoke_hook "run_in_terminal" "git stash apply")
assert_no_output "$out" '73. git stash apply -> no output'

# 74. git add . -> no output
out=$(invoke_hook "run_in_terminal" "git add .")
assert_no_output "$out" '74. git add . -> no output'

# 75. git status -> no output
out=$(invoke_hook "run_in_terminal" "git status")
assert_no_output "$out" '75. git status -> no output'

# 76. git log -> no output
out=$(invoke_hook "run_in_terminal" "git log")
assert_no_output "$out" '76. git log -> no output'

# 77. git diff -> no output
out=$(invoke_hook "run_in_terminal" "git diff")
assert_no_output "$out" '77. git diff -> no output'

# ---------------------------------------------------------------------------
echo ""
echo "--- Chain splitting with || operator ---"
# ---------------------------------------------------------------------------

# 78. git push || echo -> ask (push detected through ||)
out=$(invoke_hook "run_in_terminal" 'git push origin main || echo "failed"')
assert_decision "$out" "ask" '78. git push origin main || echo "failed" -> ask'

# 79. bad commit || git push -> deny (deny wins)
out=$(invoke_hook "run_in_terminal" 'git commit -m "bad" || git push')
assert_decision "$out" "deny" '79. git commit -m "bad" || git push -> deny'

# ---------------------------------------------------------------------------
echo ""
echo "--- Git push variants ---"
# ---------------------------------------------------------------------------

# 80. git push (bare, no remote) -> ask
out=$(invoke_hook "run_in_terminal" "git push")
assert_decision "$out" "ask" '80. git push (bare) -> ask'

# 81. git push -u origin feature -> ask
out=$(invoke_hook "run_in_terminal" "git push -u origin feature")
assert_decision "$out" "ask" '81. git push -u origin feature -> ask'

# 82. git push --tags -> ask
out=$(invoke_hook "run_in_terminal" "git push --tags")
assert_decision "$out" "ask" '82. git push --tags -> ask'

# ---------------------------------------------------------------------------
echo ""
echo "--- Git tag variants ---"
# ---------------------------------------------------------------------------

# 83. git tag -a (annotated) -> ask
out=$(invoke_hook "run_in_terminal" 'git tag -a v1.0 -m "release"')
assert_decision "$out" "ask" '83. git tag -a v1.0 -m "release" -> ask'

# 84. git tag -d (delete) -> ask
out=$(invoke_hook "run_in_terminal" "git tag -d v1.0")
assert_decision "$out" "ask" '84. git tag -d v1.0 -> ask'

# ---------------------------------------------------------------------------
echo ""
echo "--- Context accumulation ---"
# ---------------------------------------------------------------------------

# 85-87. Chain push + bad commit: deny, context has both "confirmation" and "conventional"
out=$(invoke_hook "run_in_terminal" 'git push origin main; git commit -m "bad"')
assert_decision "$out" "deny" '85. push + bad commit chained with ; -> deny'
assert_context_contains "$out" "confirmation" '86. accumulated context contains confirmation (from push)'
assert_context_contains "$out" "conventional" '87. accumulated context contains conventional (from commit)'

# ---------------------------------------------------------------------------
echo ""
echo "--- git reset --hard with ref ---"
# ---------------------------------------------------------------------------

# 88. git reset --hard HEAD~1 -> ask
out=$(invoke_hook "run_in_terminal" "git reset --hard HEAD~1")
assert_decision "$out" "ask" '88. git reset --hard HEAD~1 -> ask'

# 89. git reset --hard origin/main -> ask
out=$(invoke_hook "run_in_terminal" "git reset --hard origin/main")
assert_decision "$out" "ask" '89. git reset --hard origin/main -> ask'

# ===========================================================================
# Summary
# ===========================================================================
echo ""
echo "=== Summary ==="
echo "Total: $TOTAL | Passed: $PASSED | Failed: $FAILED"

if [ "$FAILED" -gt 0 ]; then
    echo "SOME TESTS FAILED"
    exit 1
else
    echo "ALL TESTS PASSED"
    exit 0
fi
