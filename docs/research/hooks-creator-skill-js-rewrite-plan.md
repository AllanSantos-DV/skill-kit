# Research: hooks-creator Skill Rewrite — JS as Primary Pattern

**Date**: 2026-04-22
**Status**: Research complete, ready for implementation
**Scope**: Rewrite `skills/hooks-creator/SKILL.md`, `references/examples.md`, `references/platform-reference.md`

---

## 1. Current State Analysis

### SKILL.md (~779 lines)
The skill currently teaches **PS1+SH pairs** as the primary hook authoring pattern:
- All code examples use bash (`#!/bin/bash`, `INPUT=$(cat 2>/dev/null || true)`) and PowerShell (`$rawInput = @($input) -join "\`n"`)
- Configuration examples use `command` + `windows` dual-field pattern
- Multiple sections dedicated to Windows/PowerShell quoting, escaping, encoding issues
- Common Pitfalls table has 6+ PS1-specific entries (UTF-8 BOM, em-dash, PS 5.1 compat, `-File` vs `-Command`, `$HOME` variable)
- Advanced Patterns section uses PS1 for transcript-aware hooks
- Conditional Hook Logic section uses PS1 example

### references/examples.md (~468 lines)
- 6 complete hook examples, each with **both bash AND PowerShell** implementations
- JSON configs all use `command` + `windows` dual-field pattern
- No JS examples at all

### references/platform-reference.md (~170 lines)
- Cross-platform comparison tables (still valid)
- Code examples for input format differences use bash + PowerShell
- Tool name check patterns use bash + PowerShell

### Existing JS Hooks in `/hooks/` (8 files, all already migrated)
All hooks follow a consistent JS pattern:
```
#!/usr/bin/env node
'use strict';
// optional: const fs = require('fs'); const path = require('path');

let rawInput = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { rawInput += chunk; });
process.stdin.on('end', () => {
  let inputJson;
  try { inputJson = JSON.parse(rawInput); } catch (_) { process.exit(0); }
  // ... hook logic ...
  process.stdout.write(JSON.stringify(result) + '\n');
});
```

**hooks.json** already uses `node hooks/<name>.js` commands with no `windows` override needed.

| Hook File | Event | Complexity | Uses fs/path? | Lines |
|-----------|-------|-----------|---------------|-------|
| pre-commit-guard.js | PreToolUse | High (regex, chained cmd parsing) | No | 207 |
| verify-claims.js | Stop | High (transcript analysis) | Yes (fs, path) | 135 |
| lesson-injector.js | PreToolUse | Medium (file scanning, tag matching) | Yes (fs, path, os) | 144 |
| skill-feedback.js | Stop | Medium (transcript analysis) | Yes (fs, path) | 85 |
| context-confidence-check.js | Stop | Medium (transcript regex) | Yes (fs) | 101 |
| stop-checklist.js | Stop | Simple (static block) | No | 27 |
| output-format.js | Stop | Simple (static block) | No | 27 |
| subagent-audit.js | SubagentStart | Simple (logging) | No | 29 |

---

## 2. Files to Modify

| # | File | Action | Estimated Changes |
|---|------|--------|-------------------|
| 1 | `skills/hooks-creator/SKILL.md` | **Heavy edit** — rewrite all code examples, update 8+ sections | ~60% of file content changes |
| 2 | `skills/hooks-creator/references/examples.md` | **Full rewrite** — convert 6 examples from PS1+SH to JS | ~90% of file content changes |
| 3 | `skills/hooks-creator/references/platform-reference.md` | **Moderate edit** — update code examples, add JS recommendation | ~30% of file content changes |

No new files needed. No dependencies needed (JS hooks use only Node.js built-ins).

---

## 3. Section-by-Section Plan for SKILL.md

### Sections to KEEP UNCHANGED (conceptual, still accurate)
- **Frontmatter** (lines 1-6) — keep, optionally update description to mention JS
- **What are Hooks?** (lines 12-15) — keep as-is
- **Platform Detection** (lines 18-27) — keep as-is
- **Lifecycle Events** (lines 29-48) — keep as-is
- **Configuration Locations** (lines 50-77) — mostly keep, update script path examples
- **Multiple Hooks Behavior** (lines 79-98) — keep as-is
- **Input/Output Contract** (lines 137-220) — keep structure, update PreToolUse JSON examples (already generic JSON, no code change needed)
- **Stop-Specific Output** (lines 221-246) — keep as-is (warnings are hard-won, no code examples)
- **Security Best Practices** (lines 394-403) — keep as-is
- **Feedback Protocol** (lines 743-779) — DO NOT MODIFY

### Sections to REWRITE

#### 3.1 Hook Configuration Format (lines 99-136)
**Current**: Shows `command` + `windows` dual-field, `-File` for PS1
**New**: Show single `command` field with `node hooks/my-hook.js`
- JSON config: `{ "type": "command", "command": "node hooks/my-hook.js", "timeout": 10 }`
- Agent frontmatter: `command: "node hooks/my-hook.js"`
- Remove `windows` field from primary examples
- Update field reference table: `windows` becomes "Legacy — not needed for JS hooks"
- Keep `windows` documented but as secondary/legacy

#### 3.2 Cross-Platform Scripts (lines 248-304)
**Current**: 55 lines dedicated to PS1 quoting, `-File` vs `-Command`, `$HOME` expansion, YAML escape trap
**New**: 
- PRIMARY: JS pattern (single file, cross-platform by default). Show the standard stdin-reading boilerplate.
- LEGACY note: PS1+SH pairs still work but are no longer recommended. Link to a collapsed section or brief mention.
- KEEP the YAML escape trap warning — it still applies to path strings in YAML regardless of language
- Remove detailed PS1 stdin reading patterns, quoting tables, `-File` vs `-Command` guidance

#### 3.3 VS Code Matcher Workaround (lines 306-336)
**Current**: Shows bash + PowerShell tool_name filtering patterns
**New**: Show JS pattern (already proven in `pre-commit-guard.js`):
```js
if (inputJson.tool_name !== 'run_in_terminal' && inputJson.tool_name !== 'Bash') {
  process.exit(0);
}
```

#### 3.4 Common Patterns table (lines 338-350)
Keep the table, just note examples are in JS now.

#### 3.5 Conditional Hook Logic (lines 352-392)
**Current**: Uses PowerShell pattern for git guard
**New**: Use JS pattern from `pre-commit-guard.js` (the actual hook in the repo). This is the richest example.

#### 3.6 Common Pitfalls table (lines 405-427)
**REMOVE** these PS1-specific entries:
- "PS 7-only syntax in hook scripts" (line 424)
- "UTF-8 BOM required for PS 5.1" (line 425)
- "Em-dash/en-dash in PS1 files" (line 426)
- "Using `-File` with `$HOME` variable paths" (line 416)
- "YAML `\v` escape in script paths" — KEEP but simplify (still relevant for YAML path strings)
- "`INPUT=$(cat)` hanging if stdin empty" — REMOVE (bash-specific)

**ADD** these JS-specific entries:
- "Forgetting `process.exit(0)` for no-op" — hook hangs if it doesn't write stdout or exit
- "Not consuming all stdin data" — must read to 'end' event before processing
- "Using `console.log` instead of `process.stdout.write`" — `console.log` adds newline, may cause double-newline issues
- "Forgetting `'use strict'`" — optional but recommended for catching bugs

**KEEP** these universal entries:
- Stop hook infinite loop / `stop_hook_active` check
- Hook returning non-JSON to stdout
- Assuming matchers work in VS Code
- Long-running hooks blocking the agent
- Agent-scoped hooks not working (useCustomAgentHooks)
- PreToolUse fields at JSON top-level
- Stop hook decision/reason placement for custom agents
- Claude hooks bleeding into VS Code
- Marker file anti-pattern
- Claude Code terminal tool name difference

**UPDATE**:
- "Forgetting `windows:` override" → "Legacy: If using PS1+SH pairs, always provide `windows:` override. JS hooks don't need this."
- "Hook script not executable on Linux" → still relevant for .js files (need `chmod +x` or use `node` prefix)

#### 3.7 Claude Code vs Copilot table (lines 428-449)
**Current**: Tool name check in bash + PS1
**New**: 
- Add row: "Primary script format" → JS (both platforms)
- Update tool name check pattern to JS
- Remove bash/PS1 code examples, replace with JS

#### 3.8 Neural Link Integration (lines 451-548)
**Current**: References `.ps1` and `.sh` scripts
**New**: 
- Update directory structure to show `.js` files
- Update companion file naming example
- Keep the JSON schema and weight guidelines (unchanged)

#### 3.9 Distribution via Skill Manager (lines 549-589)
**Current**: "syncs .sh and .ps1", repo structure shows `.sh`/`.ps1` pairs
**New**:
- "syncs .js files"
- Repo structure shows `.js` files
- "Cross-platform — single .js file works everywhere (Node.js required)"
- Remove mention of "both `.sh` and `.ps1` variants are synced"

#### 3.10 Advanced Patterns (lines 591-736)
**Current**: Server-side example in PowerShell. Transcript-aware hooks in PS1 + bash.
**New**:
- Server-side: rewrite thin client in JS (use `http`/`https` built-in module or `child_process` to call curl)
- Transcript-aware hooks: rewrite in JS, using real examples from `verify-claims.js` and `skill-feedback.js`
- Policy Engine: update conceptual (no code change needed)
- Compiled Blackbox: keep as-is (conceptual)

#### 3.11 Global vs Workspace Scripts (lines 64-70)
**Current**: References bash `~` expansion and PowerShell `%USERPROFILE%` expansion
**New**: 
- JS: `node ~/.copilot/hooks/scripts/my-hook.js` — path resolution handled by Node.js/shell
- Simpler than PS1 — no `-File` vs `-Command` distinction

---

## 4. Plan for references/examples.md

Convert all 6 examples from PS1+SH pairs to single JS implementations:

| # | Example | Event | Key JS patterns to demonstrate |
|---|---------|-------|-------------------------------|
| 1 | Auto-Format with Prettier | PostToolUse | tool_name filtering, child_process.execSync for npx |
| 2 | Project Context Injection | SessionStart | child_process.execSync for git commands, additionalContext output |
| 3 | Block Dangerous Commands | PreToolUse | Regex patterns, permissionDecision deny/ask |
| 4 | Task Completion Reminder | Stop | stop_hook_active guard, decision: "block" at both levels |
| 5 | Subagent Routing Audit | SubagentStart | stderr logging, empty JSON passthrough |
| 6 | Output Format Enforcement | Stop | stop_hook_active guard, simple block pattern |

Each example:
- JSON config: single `command` field, no `windows` override
- Single JS script (replace dual bash+PS1 sections)
- "What it does" explanation (keep)

---

## 5. Plan for references/platform-reference.md

| Section | Change |
|---------|--------|
| Lifecycle Events table | Keep as-is |
| Hook Types table | Keep as-is |
| Input Format Differences | Replace bash/PS1 code with JS equivalents |
| Tool Name Differences | Replace bash code with JS |
| Matcher Support | Keep as-is |
| Async Hooks | Keep as-is |
| Configuration Locations | Keep as-is |
| Output Format | Keep as-is |
| Quick Decision Guide | Add note: "All platforms: prefer JS hooks for single-file cross-platform support" |

---

## 6. Dependencies

- **None**. JS hooks use only Node.js built-ins (fs, path, os, child_process).
- Node.js is assumed available (VS Code bundles it, Claude Code environments have it).

---

## 7. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Users on systems without Node.js | Low | Node.js is bundled with VS Code; Claude Code environments always have it. Document as prerequisite. |
| Breaking backward compat for PS1+SH users | Medium | Keep PS1+SH mentioned as "legacy" pattern, don't delete all references. Users with existing PS1 hooks won't be affected — the skill just stops *teaching* PS1 as primary. |
| Loss of hard-won PS1 knowledge | Medium | Move critical PS1 pitfalls to a collapsed "Legacy: PowerShell/Bash hooks" section rather than deleting entirely. Keep YAML escape trap. |
| Skill becomes too long if legacy section added | Low | The JS examples are shorter than PS1+SH pairs (single file vs dual files). Net line count should decrease. |
| Neural Link companion file naming | Low | Update from `.ps1`/`.sh` to `.js` naming convention. Schema is language-agnostic. |

---

## 8. Implementation Order

### Step 1: SKILL.md — Core sections (highest impact)
1. Hook Configuration Format (lines 99-136) — change primary examples to JS
2. Cross-Platform Scripts (lines 248-304) — rewrite with JS as primary
3. VS Code Matcher Workaround (lines 306-336) — replace with JS pattern
4. Common Pitfalls table (lines 405-427) — remove PS1 entries, add JS entries

### Step 2: SKILL.md — Code example sections
5. Conditional Hook Logic (lines 352-392) — replace PS1 with JS from pre-commit-guard.js
6. Claude Code vs Copilot table (lines 428-449) — update to JS
7. Configuration Locations (lines 64-70) — update global path examples

### Step 3: SKILL.md — Advanced sections
8. Advanced Patterns (lines 591-736) — rewrite transcript-aware and server-side examples in JS
9. Neural Link Integration (lines 451-548) — update file references
10. Distribution via Skill Manager (lines 549-589) — update to JS

### Step 4: references/examples.md — Full rewrite
11. Convert all 6 examples to JS

### Step 5: references/platform-reference.md — Moderate edit
12. Update code examples to JS, add JS recommendation

### Step 6: Final validation
13. Review for consistency (no stray PS1/SH references in primary patterns)
14. Verify line count is reasonable (~700-800 lines for SKILL.md)
15. Commit with conventional commit message

---

## 9. Template: Standard JS Hook Boilerplate

Based on analysis of all 8 existing hooks, the canonical pattern is:

```js
#!/usr/bin/env node
// <event> hook: <one-line description>
'use strict';
// const fs = require('fs');     // only if needed
// const path = require('path'); // only if needed

let rawInput = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { rawInput += chunk; });
process.stdin.on('end', () => {
  let inputJson;
  try { inputJson = JSON.parse(rawInput); } catch (_) { process.exit(0); }

  // For Stop hooks: prevent infinite loop
  // if (inputJson.stop_hook_active === true) process.exit(0);

  // Tool name filtering (PreToolUse/PostToolUse):
  // if (inputJson.tool_name !== 'run_in_terminal' && inputJson.tool_name !== 'Bash') {
  //   process.exit(0);
  // }

  // ... hook logic ...

  // No-op: process.exit(0);
  // Output: process.stdout.write(JSON.stringify(result) + '\n');
});
```

Key conventions from existing hooks:
- `process.exit(0)` for no-op (not writing `{}` to stdout)
- `process.stdout.write(JSON.stringify(result) + '\n')` for output (not `console.log`)
- `'use strict'` always present
- Error handling: `try/catch` around JSON.parse with `process.exit(0)` on failure
- No external dependencies — only `fs`, `path`, `os`, `child_process` from Node.js

---

## 10. Key Metrics

| Metric | Before | After (estimated) |
|--------|--------|-------------------|
| SKILL.md lines | ~779 | ~700-750 (shorter: single JS vs dual PS1+SH) |
| examples.md lines | ~468 | ~300-350 (single script per example vs 3 sections) |
| platform-reference.md lines | ~170 | ~160-170 (minor changes) |
| PS1-specific pitfalls | 6 | 0 (moved to legacy note) |
| JS-specific pitfalls | 0 | 3-4 (new) |
| Code examples using PS1+SH | ~25 | 0-2 (legacy mentions only) |
| Code examples using JS | 0 | ~20+ |
