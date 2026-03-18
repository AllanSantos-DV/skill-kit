#!/bin/bash
# Test suite for hooks/lesson-injector.sh
# Run: bash tests/hooks/test-lesson-injector.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_PATH="$SCRIPT_DIR/../../hooks/lesson-injector.sh"

PASSED=0
FAILED=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

assert_empty() {
    local actual="$1"
    local test_name="$2"
    if [ -z "$actual" ]; then
        echo "  PASS: $test_name"
        ((PASSED++))
    else
        echo "  FAIL: $test_name"
        echo "    Expected empty but got: '$actual'"
        ((FAILED++))
    fi
}

assert_contains() {
    local actual="$1"
    local substring="$2"
    local test_name="$3"
    if echo "$actual" | grep -qF "$substring"; then
        echo "  PASS: $test_name"
        ((PASSED++))
    else
        echo "  FAIL: $test_name"
        echo "    Expected to contain: '$substring'"
        echo "    Actual: '$actual'"
        ((FAILED++))
    fi
}

assert_not_contains() {
    local actual="$1"
    local substring="$2"
    local test_name="$3"
    if [ -z "$actual" ] || ! echo "$actual" | grep -qF "$substring"; then
        echo "  PASS: $test_name"
        ((PASSED++))
    else
        echo "  FAIL: $test_name"
        echo "    Expected NOT to contain: '$substring'"
        echo "    Actual: '$actual'"
        ((FAILED++))
    fi
}

assert_valid_json() {
    local actual="$1"
    local test_name="$2"
    if [ -z "$actual" ]; then
        echo "  FAIL: $test_name"
        echo "    Expected valid JSON but got empty output"
        ((FAILED++))
        return
    fi
    local decision
    decision=$(echo "$actual" | jq -r '.decision' 2>/dev/null)
    if [ "$decision" = "add" ]; then
        echo "  PASS: $test_name"
        ((PASSED++))
    else
        echo "  FAIL: $test_name"
        echo "    JSON parsed but decision='$decision', expected 'add'"
        ((FAILED++))
    fi
}

create_lesson() {
    local dir="$1"
    local id="$2"
    local tags="$3"      # comma-separated: "create, hooks"
    local confidence="$4"
    local resumo="$5"

    mkdir -p "$dir"
    cat > "$dir/${id}-test.md" <<LESSON_EOF
---
id: ${id}
tags: [${tags}]
confidence: ${confidence}
created: 2026-03-15
cause: test-fixture
---

# Lesson ${id}

## Resumo
${resumo}

## Registro
- **O que aconteceu**: test fixture
- **Causa raiz**: test-fixture
LESSON_EOF
}

run_hook() {
    local input_json="$1"
    local temp_home
    temp_home=$(mktemp -d)

    # If there are more args, they describe setup
    # Usage: run_hook "$json"
    # Caller sets up lessons in $TEMP_HOME before calling, or uses setup helpers
    # We export TEMP_HOME for the caller to use before invoking run_hook_exec
    echo "$temp_home"
}

# Combined setup + run: run_hook_with_lessons <json> <setup_function>
# setup_function receives the lessons dir as $1
run_hook_exec() {
    local input_json="$1"
    local temp_home="$2"

    local result
    result=$(printf '%s' "$input_json" | HOME="$temp_home" bash "$HOOK_PATH" 2>/dev/null) || true
    # Clean up
    rm -rf "$temp_home"
    echo "$result"
}

# ---------------------------------------------------------------------------
# Pre-flight check
# ---------------------------------------------------------------------------
if ! command -v jq &>/dev/null; then
    echo "SKIP: jq not found — required for lesson-injector.sh tests"
    exit 0
fi

if [ ! -f "$HOOK_PATH" ]; then
    echo "ERROR: Hook not found at $HOOK_PATH"
    exit 1
fi

echo ""
echo "=== lesson-injector.sh test suite ==="
echo ""

# TEST 1: Empty stdin
echo "TEST 1: Empty stdin -> no output"
TEMP_HOME=$(mktemp -d)
out=$(printf '' | HOME="$TEMP_HOME" bash "$HOOK_PATH" 2>/dev/null) || true
rm -rf "$TEMP_HOME"
assert_empty "$out" "Empty stdin produces no output"

# TEST 2: Invalid JSON
echo "TEST 2: Invalid JSON -> no output"
TEMP_HOME=$(mktemp -d)
out=$(printf 'not json at all' | HOME="$TEMP_HOME" bash "$HOOK_PATH" 2>/dev/null) || true
rm -rf "$TEMP_HOME"
assert_empty "$out" "Invalid JSON produces no output"

# TEST 3: JSON without prompt field
echo "TEST 3: JSON without prompt field -> no output"
TEMP_HOME=$(mktemp -d)
out=$(printf '{"someOtherField": "value"}' | HOME="$TEMP_HOME" bash "$HOOK_PATH" 2>/dev/null) || true
rm -rf "$TEMP_HOME"
assert_empty "$out" "JSON without prompt field produces no output"

# TEST 4: chatMessage field extracted
echo "TEST 4: chatMessage field extracted"
TEMP_HOME=$(mktemp -d)
LESSONS_DIR="$TEMP_HOME/.copilot/lessons"
create_lesson "$LESSONS_DIR" "L001" "create, hooks" "0.7" "Verificar se o artefato ja existe antes de criar um novo."
out=$(run_hook_exec '{"chatMessage": "criar um novo hook"}' "$TEMP_HOME")
assert_valid_json "$out" "chatMessage returns valid JSON"
assert_contains "$out" "L001" "chatMessage output contains L001"

# TEST 5: user_message fallback
echo "TEST 5: user_message fallback field"
TEMP_HOME=$(mktemp -d)
LESSONS_DIR="$TEMP_HOME/.copilot/lessons"
create_lesson "$LESSONS_DIR" "L001" "create, hooks" "0.7" "Verificar se o artefato ja existe antes de criar um novo."
out=$(run_hook_exec '{"user_message": "criar um novo hook"}' "$TEMP_HOME")
assert_valid_json "$out" "user_message returns valid JSON"
assert_contains "$out" "L001" "user_message output contains L001"

# TEST 6: prompt fallback
echo "TEST 6: prompt fallback field"
TEMP_HOME=$(mktemp -d)
LESSONS_DIR="$TEMP_HOME/.copilot/lessons"
create_lesson "$LESSONS_DIR" "L001" "create, hooks" "0.7" "Verificar se o artefato ja existe antes de criar um novo."
out=$(run_hook_exec '{"prompt": "criar um novo hook"}' "$TEMP_HOME")
assert_valid_json "$out" "prompt returns valid JSON"
assert_contains "$out" "L001" "prompt output contains L001"

# TEST 7: data.chatMessage nested fallback
echo "TEST 7: data.chatMessage nested fallback"
TEMP_HOME=$(mktemp -d)
LESSONS_DIR="$TEMP_HOME/.copilot/lessons"
create_lesson "$LESSONS_DIR" "L001" "create, hooks" "0.7" "Verificar se o artefato ja existe antes de criar um novo."
out=$(run_hook_exec '{"data": {"chatMessage": "criar um novo hook"}}' "$TEMP_HOME")
assert_valid_json "$out" "data.chatMessage returns valid JSON"
assert_contains "$out" "L001" "data.chatMessage output contains L001"

# TEST 8: Prompt with no matching keywords
echo "TEST 8: Prompt with no matching keywords -> no output"
TEMP_HOME=$(mktemp -d)
LESSONS_DIR="$TEMP_HOME/.copilot/lessons"
create_lesson "$LESSONS_DIR" "L001" "create, hooks" "0.7" "Verificar se o artefato ja existe antes de criar um novo."
out=$(run_hook_exec '{"chatMessage": "ola, como vai?"}' "$TEMP_HOME")
assert_empty "$out" "No matching keywords produces no output"

# TEST 9: No lessons directory
echo "TEST 9: No lessons directory -> no output"
TEMP_HOME=$(mktemp -d)
out=$(run_hook_exec '{"chatMessage": "criar um hook"}' "$TEMP_HOME")
assert_empty "$out" "No lessons directory produces no output"

# TEST 10: Empty lessons directory
echo "TEST 10: Empty lessons directory -> no output"
TEMP_HOME=$(mktemp -d)
mkdir -p "$TEMP_HOME/.copilot/lessons"
out=$(run_hook_exec '{"chatMessage": "criar um hook"}' "$TEMP_HOME")
assert_empty "$out" "Empty lessons directory produces no output"

# TEST 11: PT-BR keyword 'editar' -> tag 'modify' matched
echo "TEST 11: PT-BR keyword 'editar' -> tag 'modify' matched"
TEMP_HOME=$(mktemp -d)
LESSONS_DIR="$TEMP_HOME/.copilot/lessons"
create_lesson "$LESSONS_DIR" "L001" "modify, file-operations" "0.7" "Sempre fazer backup antes de modificar."
create_lesson "$LESSONS_DIR" "L002" "create, hooks" "0.7" "Verificar existencia antes de criar."
out=$(run_hook_exec '{"chatMessage": "editar o arquivo de config"}' "$TEMP_HOME")
assert_contains "$out" "L001" "PT-BR 'editar' matches modify tag -> L001 present"
assert_not_contains "$out" "L002" "PT-BR 'editar' does not match create tag -> L002 absent"

# TEST 12: EN keyword 'fix' -> tag 'fix' matched
echo "TEST 12: EN keyword 'fix' -> tag 'fix' matched"
TEMP_HOME=$(mktemp -d)
LESSONS_DIR="$TEMP_HOME/.copilot/lessons"
create_lesson "$LESSONS_DIR" "L001" "fix, regex" "0.7" "Sempre testar regex isoladamente."
create_lesson "$LESSONS_DIR" "L002" "create, hooks" "0.7" "Verificar existencia antes de criar."
out=$(run_hook_exec '{"chatMessage": "fix the bug in the parser"}' "$TEMP_HOME")
assert_contains "$out" "L001" "EN 'fix' matches fix tag -> L001 present"
assert_not_contains "$out" "L002" "EN 'fix' does not match create tag -> L002 absent"

# TEST 13: Multiple keywords -> multiple tags matched
echo "TEST 13: Multiple keywords -> multiple tags matched"
TEMP_HOME=$(mktemp -d)
LESSONS_DIR="$TEMP_HOME/.copilot/lessons"
create_lesson "$LESSONS_DIR" "L001" "create, hooks" "0.7" "Verificar existencia antes de criar."
create_lesson "$LESSONS_DIR" "L002" "fix, testing" "0.7" "Rodar testes antes de publicar."
create_lesson "$LESSONS_DIR" "L003" "modify, git" "0.7" "Fazer commit atomico."
out=$(run_hook_exec '{"chatMessage": "criar um novo hook e corrigir o test"}' "$TEMP_HOME")
assert_contains "$out" "L001" "Multiple keywords -> L001 (create,hooks) present"
assert_contains "$out" "L002" "Multiple keywords -> L002 (fix,testing) present"
assert_not_contains "$out" "L003" "Multiple keywords -> L003 (modify,git) absent"

# TEST 14: Confidence ordering — top 5 DESC
echo "TEST 14: Confidence ordering - top 5 DESC"
TEMP_HOME=$(mktemp -d)
LESSONS_DIR="$TEMP_HOME/.copilot/lessons"
create_lesson "$LESSONS_DIR" "L001" "modify, file-operations" "0.5" "Lesson com confidence baixa."
create_lesson "$LESSONS_DIR" "L002" "modify, git" "0.9" "Lesson com confidence alta."
create_lesson "$LESSONS_DIR" "L003" "modify, regex" "0.7" "Lesson com confidence media."
create_lesson "$LESSONS_DIR" "L004" "modify, api" "0.8" "Lesson com confidence media-alta."
create_lesson "$LESSONS_DIR" "L005" "modify, shell" "0.6" "Lesson com confidence media-baixa."
create_lesson "$LESSONS_DIR" "L006" "modify, testing" "0.95" "Lesson com confidence mais alta."
out=$(run_hook_exec '{"chatMessage": "editar arquivos"}' "$TEMP_HOME")
assert_contains "$out" "L006" "Top 5 -> L006 (0.95) present"
assert_contains "$out" "L002" "Top 5 -> L002 (0.9) present"
assert_contains "$out" "L004" "Top 5 -> L004 (0.8) present"
assert_contains "$out" "L003" "Top 5 -> L003 (0.7) present"
assert_contains "$out" "L005" "Top 5 -> L005 (0.6) present"
assert_not_contains "$out" "L001" "Top 5 -> L001 (0.5) excluded"

# Verify ordering: extract content field and check line positions within it
content_text=$(echo "$out" | jq -r '.content' 2>/dev/null)
pos_l006=$(echo "$content_text" | grep -n 'L006' | head -1 | cut -d: -f1)
pos_l002=$(echo "$content_text" | grep -n 'L002' | head -1 | cut -d: -f1)
pos_l004=$(echo "$content_text" | grep -n 'L004' | head -1 | cut -d: -f1)
pos_l003=$(echo "$content_text" | grep -n 'L003' | head -1 | cut -d: -f1)
pos_l005=$(echo "$content_text" | grep -n 'L005' | head -1 | cut -d: -f1)
if [ -n "$pos_l006" ] && [ -n "$pos_l002" ] && [ -n "$pos_l004" ] && [ -n "$pos_l003" ] && [ -n "$pos_l005" ] && \
   [ "$pos_l006" -lt "$pos_l002" ] && [ "$pos_l002" -lt "$pos_l004" ] && [ "$pos_l004" -lt "$pos_l003" ] && [ "$pos_l003" -lt "$pos_l005" ]; then
    echo "  PASS: Confidence order is L006 > L002 > L004 > L003 > L005"
    ((PASSED++))
else
    echo "  FAIL: Confidence order incorrect"
    echo "    Positions: L006=$pos_l006, L002=$pos_l002, L004=$pos_l004, L003=$pos_l003, L005=$pos_l005"
    ((FAILED++))
fi

# TEST 15: No tag overlap -> no output
echo "TEST 15: No tag overlap -> no output"
TEMP_HOME=$(mktemp -d)
LESSONS_DIR="$TEMP_HOME/.copilot/lessons"
create_lesson "$LESSONS_DIR" "L001" "create, hooks" "0.7" "Verificar existencia antes de criar."
out=$(run_hook_exec '{"chatMessage": "pesquisar documentos"}' "$TEMP_HOME")
assert_empty "$out" "No tag overlap produces no output"

# TEST 16: Lesson with missing frontmatter -> skipped
echo "TEST 16: Lesson with missing frontmatter -> skipped"
TEMP_HOME=$(mktemp -d)
LESSONS_DIR="$TEMP_HOME/.copilot/lessons"
create_lesson "$LESSONS_DIR" "L001" "create" "0.7" "Verificar existencia antes de criar."
# Create a file without frontmatter
cat > "$LESSONS_DIR/L002-nofm.md" <<'NOFM'
# No frontmatter here
Just plain content.
NOFM
out=$(run_hook_exec '{"chatMessage": "criar algo"}' "$TEMP_HOME")
assert_contains "$out" "L001" "Valid lesson L001 present"
assert_not_contains "$out" "L002" "No-frontmatter lesson L002 skipped"

# TEST 17: Lesson with missing tags -> skipped
echo "TEST 17: Lesson with missing tags -> skipped"
TEMP_HOME=$(mktemp -d)
LESSONS_DIR="$TEMP_HOME/.copilot/lessons"
create_lesson "$LESSONS_DIR" "L001" "create" "0.7" "Verificar existencia antes de criar."
# Create a file with frontmatter but no tags field
cat > "$LESSONS_DIR/L002-notags.md" <<'NOTAGS'
---
id: L002
confidence: 0.8
created: 2026-03-15
---

# Lesson without tags

## Resumo
Esta licao nao tem campo tags no frontmatter.
NOTAGS
out=$(run_hook_exec '{"chatMessage": "criar algo"}' "$TEMP_HOME")
assert_contains "$out" "L001" "Valid lesson L001 present"
assert_not_contains "$out" "L002" "No-tags lesson L002 skipped"

# TEST 18: 500 char limit enforced
echo "TEST 18: 500 char limit enforced"
TEMP_HOME=$(mktemp -d)
LESSONS_DIR="$TEMP_HOME/.copilot/lessons"
LONG_RESUMO=$(printf 'A%.0s' $(seq 1 150))
for i in 1 2 3 4 5 6; do
    id=$(printf "L%03d" "$i")
    conf=$(echo "0.9 - ($i * 0.05)" | bc)
    create_lesson "$LESSONS_DIR" "$id" "modify" "$conf" "$LONG_RESUMO"
done
out=$(run_hook_exec '{"chatMessage": "editar algo"}' "$TEMP_HOME")
# The hook enforces 500 char limit on the content field, not the full JSON
content_len=$(echo "$out" | jq -r '.content' 2>/dev/null | wc -c)
if [ "$content_len" -le 501 ]; then  # wc -c counts trailing newline
    echo "  PASS: Content length ($content_len) <= 500"
    ((PASSED++))
else
    echo "  FAIL: Content length ($content_len) > 500"
    ((FAILED++))
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Results ==="
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"
echo ""

if [ "$FAILED" -gt 0 ]; then
    exit 1
fi
exit 0
