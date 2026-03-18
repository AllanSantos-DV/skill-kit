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
