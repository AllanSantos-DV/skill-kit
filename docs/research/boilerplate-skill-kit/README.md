# Boilerplate Analysis — skill-kit

> **Date**: 2026-04-27
> **Scope**: Full repository `skill-kit` — hooks/, skills/, agents/, tests/, neural-link/src/
> **Status**: Analysis only (read-only, no source changes)

---

## 1. Sumário Executivo

| Metric | Value |
|--------|-------|
| **Total patterns found** | 8 |
| **High severity** | 4 |
| **Medium severity** | 3 |
| **Low severity** | 1 |
| **Total duplicated LoC** | ~320 |
| **Estimated reduction** | ~200 LoC (62%) |
| **Files affected** | 20+ |

The skill-kit codebase has **8 distinct boilerplate patterns** spanning hooks (JS), agents (Markdown), and neural-link infrastructure. The most impactful patterns are concentrated in the `hooks/` directory, where 10 standalone JS files share nearly identical stdin-reading, JSON-parsing, transcript-parsing, and output-formatting code. The neural-link infrastructure has 3 patterns of code duplication (FNV-1a hash, sanitizer, config cascade).

---

## 2. Catálogo de Padrões

### Pattern 1: `stdin-json-reader`

**Description**: Every hook reads stdin as a stream, concatenates chunks, and parses JSON with a try/catch that exits on failure.

**Contagem**: 10 files, ~5-6 lines each = **~55 duplicated lines**

**Ocorrências (TODAS)**:
| File | Lines |
|------|-------|
| `hooks/pre-commit-guard.js` | 20-29 |
| `hooks/lesson-injector.js` | 9-13 |
| `hooks/verify-claims.js` | 7-12 |
| `hooks/context-confidence-check.js` | 8-17 |
| `hooks/output-format.js` | 5-13 |
| `hooks/skill-feedback.js` | 7-12 |
| `hooks/stop-checklist.js` | 5-12 |
| `hooks/subagent-audit.js` | 5-12 |
| `hooks/session-context.js` | 8-12 |
| `hooks/context-save.js` | 7-12 |

**Trecho representativo** (from `verify-claims.js`):
```javascript
let rawInput = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { rawInput += chunk; });
process.stdin.on('end', () => {
  let hookInput;
  try { hookInput = JSON.parse(rawInput); } catch (_) { process.exit(0); }
```

**Risco de manter**: A bug in stdin handling (e.g., encoding issue, large payload) must be fixed in 10 places. If a new hook is created, the pattern is copy-pasted again.

**Severidade**: **HIGH** (10 files)

---

### Pattern 2: `stop-hook-output`

**Description**: Stop hooks produce an identical JSON output structure with `decision`, `reason`, and nested `hookSpecificOutput` containing the same fields.

**Contagem**: 5 files, ~8-12 lines each = **~50 duplicated lines**

**Ocorrências (TODAS)**:
| File | Lines |
|------|-------|
| `hooks/verify-claims.js` | 118-133 |
| `hooks/context-confidence-check.js` | 80-100 |
| `hooks/output-format.js` | 16-26 |
| `hooks/skill-feedback.js` | 75-84 |
| `hooks/stop-checklist.js` | 16-26 |

**Trecho representativo** (from `stop-checklist.js`):
```javascript
const result = {
  decision: 'block',
  reason: 'Before finishing: ...',
  hookSpecificOutput: {
    hookEventName: 'Stop',
    decision: 'block',
    reason: 'Before finishing: ...'
  }
};
process.stdout.write(JSON.stringify(result) + '\n');
```

**Risco de manter**: If VS Code changes the expected Stop hook output format, 5 files need updating. The `reason` field is duplicated in two places within the same object — easy to get out of sync.

**Severidade**: **HIGH** (5 files)

---

### Pattern 3: `stop-hook-active-guard`

**Description**: Stop hooks check `stop_hook_active === true` to avoid re-entrant execution. The guard appears immediately after JSON parsing.

**Contagem**: 6 files, ~1-3 lines each = **~12 duplicated lines**

**Ocorrências (TODAS)**:
| File | Lines |
|------|-------|
| `hooks/verify-claims.js` | 13 |
| `hooks/context-confidence-check.js` | 15 |
| `hooks/output-format.js` | 11 |
| `hooks/skill-feedback.js` | 13 |
| `hooks/stop-checklist.js` | 10 |
| `hooks/context-save.js` | 15 |

**Trecho representativo**:
```javascript
if (inputJson.stop_hook_active === true) process.exit(0);
```

**Risco de manter**: Low risk alone, but combined with Pattern 1 it forms a "preamble block" that could be abstracted together.

**Severidade**: **HIGH** (6 files, co-located with Pattern 1)

---

### Pattern 4: `transcript-reader-and-scope`

**Description**: Hooks that analyze transcripts share two sub-patterns:
1. Read `transcript_path`, check existence, load lines
2. Scope to last `user.message` by scanning backwards

**Contagem**: 4 files (reader), 3 files (scope) = **~40 duplicated lines**

**Ocorrências (TODAS)**:

Transcript reader:
| File | Lines |
|------|-------|
| `hooks/verify-claims.js` | 15-19 |
| `hooks/skill-feedback.js` | 14-19 |
| `hooks/context-save.js` | 17-21 |
| `hooks/context-confidence-check.js` | 20-24 |

Last-user-message scope:
| File | Lines |
|------|-------|
| `hooks/verify-claims.js` | 70-76 |
| `hooks/skill-feedback.js` | 22-28 |
| `hooks/context-save.js` | 23-29 |

**Trecho representativo** (from `skill-feedback.js`):
```javascript
const transcriptPath = hookInput.transcript_path;
if (!transcriptPath || !fs.existsSync(transcriptPath)) process.exit(0);
let lines;
try { lines = fs.readFileSync(transcriptPath, 'utf8').split('\n'); } catch (_) { process.exit(0); }
if (!lines || lines.length < 5) process.exit(0);

let startIdx = 0;
for (let i = lines.length - 1; i >= 0; i--) {
  if (lines[i].includes('"user.message"')) {
    startIdx = i;
    break;
  }
}
```

**Risco de manter**: The `lines.length < 5` threshold and `"user.message"` string are duplicated across files. If the transcript format changes, multiple hooks break.

**Severidade**: **MEDIUM** (4 files, co-located with other patterns)

---

### Pattern 5: `fnv1a-hash-duplication`

**Description**: The FNV-1a 32-bit hash function is implemented identically in 3 files within neural-link/src/. Comments note "duplicated to avoid circular dependency."

**Contagem**: 3 files, ~8 lines each = **~24 duplicated lines**

**Ocorrências (TODAS)**:
| File | Lines |
|------|-------|
| `neural-link/src/learning/features.js` | 142-149 |
| `neural-link/src/infra/config.js` | 21-28 |
| `neural-link/src/infra/snapshot.js` | 28-35 |

**Trecho representativo** (from `features.js`):
```javascript
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}
```

**Risco de manter**: A bug in the hash (e.g., handling non-ASCII) needs fixing in 3 places. The comment explicitly acknowledges the duplication.

**Severidade**: **MEDIUM** (3 files, well-documented intentional duplication)

---

### Pattern 6: `sensitive-data-sanitizer`

**Description**: Two files define identical `SENSITIVE_PATTERNS` arrays and recursive sanitization functions with the same logic.

**Contagem**: 2 files, ~30 lines each = **~60 duplicated lines**

**Ocorrências (TODAS)**:
| File | Lines |
|------|-------|
| `neural-link/src/index.js` | 11-41 (`sanitizeForDebug`) |
| `neural-link/src/pipeline/executor.js` | 100-130 (`sanitizeStdinForHandlers`) |

**Trecho representativo** (from `executor.js`):
```javascript
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i, /secret/i, /password/i,
  /token/i, /credential/i, /auth/i, /bearer/i
];

function sanitizeStdinForHandlers(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  const sanitized = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
    if (isSensitive && typeof value === 'string') {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeStdinForHandlers(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
```

**Risco de manter**: If a new sensitive pattern is added to one copy but not the other, data could leak in one path while being redacted in the other. **Security-critical**.

**Severidade**: **MEDIUM** (2 files, but security-critical)

---

### Pattern 7: `config-path-cascade`

**Description**: The config file resolution cascade (workspace → global → bundled) is duplicated between `config.js` and `snapshot.js`.

**Contagem**: 2 files, ~12 lines each = **~24 duplicated lines**

**Ocorrências (TODAS)**:
| File | Lines |
|------|-------|
| `neural-link/src/infra/config.js` | 88-96 |
| `neural-link/src/infra/snapshot.js` | 42-63 |

**Trecho representativo** (from `config.js`):
```javascript
const candidates = [
  join(normalizedCwd, '.neural-link.config.json'),
  join(homedir(), '.copilot', 'neural-link.config.json'),
  join(projectRoot, 'neural-link.config.json'),
];
```

**Risco de manter**: If a new config location is added (e.g., XDG config), both files need updating. The snapshot may silently diverge.

**Severidade**: **LOW** (2 files, same module boundary)

---

### Pattern 8: `agent-feedback-protocol`

**Description**: All 4 agents have nearly identical `FEEDBACK:START/END` blocks with the same structure: How Feedback Works, When to Capture, Review Format (JSON), Consolidation. The `orchestrator` and `researcher` agents even have **duplicated** "When to Log" + "Review Format" sections within themselves.

**Contagem**: 4 files, ~40-65 lines each = **~55 duplicated lines** (normalized to unique content)

**Ocorrências (TODAS)**:
| File | Lines |
|------|-------|
| `agents/implementor.agent.md` | 132-178 |
| `agents/orchestrator.agent.md` | 198-274 |
| `agents/researcher.agent.md` | 126-203 |
| `agents/validator.agent.md` | 109-186 |

**Note**: The `orchestrator.agent.md` (lines 198-274) and `researcher.agent.md` (lines 126-203) each contain **two** "Review Format" sections and **two** "Consolidation" sections — the second is an older duplicate that wasn't removed.

**Risco de manter**: If the feedback protocol changes (e.g., new JSON field), 4+ files need updating. The internal duplications in orchestrator/researcher may cause confusion about which format is canonical.

**Severidade**: **HIGH** (4 files, plus internal duplication bugs)

---

## 3. Propostas de Abstração

### Abstraction 1: `hooks/_lib/hook-io.js` — Hook I/O Helpers

**Covers patterns**: #1 (stdin-json-reader), #2 (stop-hook-output), #3 (stop-hook-active-guard), #4 (transcript-reader-and-scope)

**API proposta**:
```javascript
// hooks/_lib/hook-io.js
'use strict';
const fs = require('fs');

/**
 * Read stdin, parse JSON, call handler(parsedJson).
 * On parse failure: process.exit(0) (fail-open convention).
 * @param {function(object): void} handler
 */
function readStdinJson(handler) { ... }

/**
 * Guard for Stop hooks: exit if stop_hook_active === true.
 * Returns input unchanged if guard passes.
 * @param {object} input
 * @returns {object}
 */
function guardStopHookActive(input) { ... }

/**
 * Read transcript lines from hookInput.transcript_path.
 * Returns null if unavailable.
 * @param {object} hookInput
 * @param {object} [options]
 * @param {number} [options.minLines=5] - Minimum transcript lines
 * @returns {{ lines: string[], startIdx: number } | null}
 */
function readTranscript(hookInput, options) { ... }

/**
 * Build and write a Stop hook response to stdout.
 * @param {string} decision - 'block' | 'allow'
 * @param {string} reason
 */
function writeStopResponse(decision, reason) { ... }

/**
 * Write a generic hook response to stdout.
 * @param {object} result
 */
function writeResponse(result) { ... }

module.exports = { readStdinJson, guardStopHookActive, readTranscript, writeStopResponse, writeResponse };
```

**Localização sugerida**: `hooks/_lib/hook-io.js`

**Esforço de migração**: **S** (Small) — each hook is self-contained, migration is mechanical substitution

**Benefício mensurável**:
- ~160 LoC removed across 10 hooks
- Single place to fix stdin/encoding bugs
- Single place to update Stop hook output format
- New hook creation: 3 lines of setup instead of 15

**Riscos**:
- Tests for hooks may mock stdin directly — need to verify mocking approach still works
- `_lib/` directory name with underscore ensures hooks.json won't treat it as a hook
- Hooks run via `node hooks/xyz.js` — relative require to `./_lib/hook-io.js` must resolve correctly

**Compatibilidade**: Pure Node.js (fs, process), no external deps ✓

---

### Abstraction 2: `neural-link/src/infra/hash.js` — FNV-1a Utility

**Covers pattern**: #5 (fnv1a-hash-duplication)

**API proposta**:
```javascript
// neural-link/src/infra/hash.js
/**
 * FNV-1a 32-bit hash. Fast, good distribution, zero deps.
 * @param {string} str
 * @returns {number}
 */
export function fnv1a(str) { ... }
```

**Localização sugerida**: `neural-link/src/infra/hash.js`

**Esforço de migração**: **S** (Small) — add import in 3 files, delete local implementations

**Benefício mensurável**:
- ~16 LoC removed (2 copies × 8 lines)
- Single source of truth for hash algorithm
- Eliminates "duplicated to avoid circular dependency" comments

**Riscos**:
- The circular dependency comment needs to be verified — `hash.js` in `infra/` has no upstream deps, so all 3 consumers can safely import it
- Must verify feature.js export of `fnv1a` is only consumed internally (check test imports)

**Compatibilidade**: Pure ES module, no external deps ✓

---

### Abstraction 3: `neural-link/src/infra/sanitize.js` — Sensitive Data Sanitizer

**Covers pattern**: #6 (sensitive-data-sanitizer)

**API proposta**:
```javascript
// neural-link/src/infra/sanitize.js
export const SENSITIVE_PATTERNS = [ ... ];

/**
 * Recursively sanitize an object, redacting string values
 * whose keys match sensitive patterns.
 * @param {*} obj
 * @returns {*}
 */
export function sanitize(obj) { ... }
```

**Localização sugerida**: `neural-link/src/infra/sanitize.js`

**Esforço de migração**: **S** (Small) — 2 files to migrate

**Benefício mensurável**:
- ~30 LoC removed
- **Security**: single place to add/remove sensitive patterns
- Prevents divergence between debug and execution sanitizers

**Riscos**:
- Minimal — both implementations are identical
- Test coverage for sanitization may need to point to new module

**Compatibilidade**: Pure ES module ✓

---

### Abstraction 4: `neural-link/src/infra/config-paths.js` — Config Resolution

**Covers pattern**: #7 (config-path-cascade)

**API proposta**:
```javascript
// neural-link/src/infra/config-paths.js
/**
 * Return ordered list of candidate config file paths.
 * @returns {string[]}
 */
export function getConfigCandidates() { ... }

/**
 * Resolve the first existing config file.
 * @returns {{ path: string, raw: string } | null}
 */
export function resolveConfigFile() { ... }
```

**Localização sugerida**: `neural-link/src/infra/config-paths.js` (or merge into existing `paths.js`)

**Esforço de migração**: **S** (Small)

**Benefício mensurável**: ~12 LoC removed, single source of truth for config search order

**Riscos**: Low — localized change within infra/

**Compatibilidade**: Pure ES module ✓

---

### Abstraction 5: Deduplicate Agent Feedback Protocol

**Covers pattern**: #8 (agent-feedback-protocol)

**API proposta**: N/A — this is a markdown content pattern, not a code abstraction.

**Approach**: Create a shared reference file `agents/_shared/feedback-protocol-template.md` and include a link/reference in each agent. Alternatively, since agents are processed as individual files, consolidate by removing the duplicated "When to Log" and "Review Format" sections from `orchestrator.agent.md` and `researcher.agent.md`.

**Localização sugerida**: `agents/_shared/feedback-protocol-template.md`

**Esforço de migração**: **M** (Medium) — requires understanding how agent MD is parsed

**Benefício mensurável**: ~55 LoC of duplicated markdown removed; fix actual bugs (duplicate sections in orchestrator/researcher)

**Riscos**:
- VS Code agent format may not support includes — each `.agent.md` may need the full content
- Removing sections from orchestrator/researcher that are duplicated requires identifying the canonical version

**Compatibilidade**: Markdown only ✓

---

## 4. Priorização

| # | Padrão | Score (impacto × facilidade) | Recomendação |
|---|--------|------------------------------|--------------|
| 1 | `stdin-json-reader` + `stop-hook-output` + `stop-hook-active-guard` + `transcript-reader-and-scope` (→ `hook-io.js`) | **9** (10 files × easy) | **FAZER NA PARTY** |
| 2 | `fnv1a-hash-duplication` (→ `hash.js`) | **7** (3 files × trivial) | **FAZER NA PARTY** |
| 3 | `sensitive-data-sanitizer` (→ `sanitize.js`) | **6** (2 files × easy, security) | **DEPOIS** |
| 4 | `config-path-cascade` (→ `config-paths.js`) | **4** (2 files × easy) | **DEPOIS** |
| 5 | `agent-feedback-protocol` | **3** (4 files × medium, limited code) | **DEPOIS** (fix dup bugs now, defer template) |

**Rationale for top-2**:
1. **hook-io.js** consolidates 4 patterns across 10 files into a single utility — highest impact, mechanical migration
2. **hash.js** is the simplest win — exact same function in 3 files, zero ambiguity

---

## 5. Plano de Implementação para Top-2

### Top-1: `hooks/_lib/hook-io.js`

**Novo módulo**: `hooks/_lib/hook-io.js`

**Arquivos a migrar** (em ordem):
1. `hooks/stop-checklist.js` (simplest Stop hook — 27 lines)
2. `hooks/output-format.js` (simple Stop hook — 27 lines)
3. `hooks/subagent-audit.js` (simple, non-Stop — 30 lines)
4. `hooks/context-confidence-check.js` (Stop + transcript)
5. `hooks/verify-claims.js` (Stop + transcript + scope)
6. `hooks/skill-feedback.js` (Stop + transcript + scope)
7. `hooks/context-save.js` (PreCompact + transcript + scope)
8. `hooks/session-context.js` (SessionStart, uses different output format)
9. `hooks/lesson-injector.js` (UserPromptSubmit, uses `decision: 'add'`)
10. `hooks/pre-commit-guard.js` (PreToolUse, complex — migrate last)

**Ordem de migração**: Start with simplest hooks (stop-checklist, output-format) to validate the abstraction, then progress to more complex ones.

**Comando de teste**:
```powershell
# Before: verify existing tests pass
pwsh tests/structural/test-agents-structure.ps1

# For each hook: manual test with echo + pipe
echo '{"stop_hook_active":false}' | node hooks/stop-checklist.js
echo '{"tool_name":"run_in_terminal","tool_input":{"command":"git commit -m \"feat: test\""}}' | node hooks/pre-commit-guard.js

# After: re-run structural tests
pwsh tests/structural/test-agents-structure.ps1
```

**Commit message**:
```
refactor: extract hooks/_lib/hook-io.js shared I/O utilities

Consolidates stdin JSON reading, stop-hook-active guard,
transcript reading with user-message scoping, and Stop hook
output formatting into a shared module.

Migrates all 10 hooks to use the shared library.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

**CHANGELOG entry** (under `### Changed`):
```
- Hooks: extracted shared I/O utilities to `hooks/_lib/hook-io.js`, reducing duplication across 10 hooks (~160 LoC)
```

---

### Top-2: `neural-link/src/infra/hash.js`

**Novo módulo**: `neural-link/src/infra/hash.js`

**Arquivos a migrar** (em ordem):
1. `neural-link/src/infra/hash.js` — create module (export `fnv1a`)
2. `neural-link/src/learning/features.js` — replace local `fnv1a`, update export
3. `neural-link/src/infra/config.js` — replace local `fnv1aHash`
4. `neural-link/src/infra/snapshot.js` — replace local `fnv1a`

**Ordem de migração**: Create hash.js first, then migrate all 3 consumers in a single pass (no interdependencies).

**Comando de teste**:
```powershell
# Run neural-link tests (if they exist)
cd neural-link && npm test

# Verify explain command still works
node neural-link/src/cli.js stats

# Verify module loads without error
node -e "import('./neural-link/src/infra/hash.js').then(m => console.log(m.fnv1a('test')))"
```

**Commit message**:
```
refactor: deduplicate FNV-1a hash into neural-link/src/infra/hash.js

Extracts the FNV-1a hash function from features.js, config.js, and
snapshot.js into a shared module. Eliminates "duplicated to avoid
circular dependency" workarounds.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

**CHANGELOG entry** (under `### Changed`):
```
- Neural Link: deduplicated FNV-1a hash into `src/infra/hash.js` (was duplicated in 3 files)
```

---

## 6. O que NÃO Mexer

| Pattern | Why it's intentional |
|---------|---------------------|
| **SKILL.md frontmatter structure** (`---`, `name:`, `description:`) | Convention defined by Copilot/Claude Code skill format. Each skill MUST be self-contained. Not boilerplate — it's a protocol. |
| **FEEDBACK:START/END in agents** (content, not structure) | While the wrapping structure is duplicated (Pattern #8), the actual "When to Capture" criteria differ per agent. Only the structural boilerplate (JSON format, consolidation section) is duplicable. |
| **`'use strict'` + shebang in hooks** | Convention for standalone Node.js scripts. Every hook MUST be independently executable — this is the contract, not duplication. |
| **`process.exit(0)` for fail-open** | Intentional design: hooks must fail silently. Each early-exit is a specific guard clause with different conditions. The `process.exit(0)` itself is not the duplication — the surrounding patterns are. |
| **`hook_event_name` field extraction** (`stdinJson.event ?? stdinJson.hook_event_name ?? stdinJson.hookEventName`) | Appears in `sensor.js` and `executor.js` — these are different layers with different purposes (one normalizes, one routes). Not true duplication. |
| **Test fixture files** (`.pptx`, `.xlsx`, `.json` in `tests/`) | Binary/data files — not code duplication. |
| **Structural test scripts** (`test-agents-structure.ps1`, `test-skills-structure.ps1`) | Different domains (agents vs skills), intentionally separate even if structure is similar. |
| **`loadConfig()` calls across neural-link modules** | Each module calling `loadConfig()` is correct — the config is cached after first load. This is proper API usage, not duplication. |
