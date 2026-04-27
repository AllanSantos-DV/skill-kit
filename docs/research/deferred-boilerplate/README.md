# Deferred Boilerplate Items — Research

> Date: 2026-04-27 | Context: Post boilerplate-refactor parties 1 & 2 (5/5 patterns resolved)

---

## Parte A: Feedback-protocol-template compartilhado

### Como VS Code parseia .agent.md

The `.agent.md` format consists of **YAML frontmatter + Markdown body**. Based on official VS Code documentation (code.visualstudio.com/docs/copilot/customization/custom-agents, retrieved 2026-04-27):

- **No `extends:`, `include:`, or `$ref` mechanism exists** in the `.agent.md` spec
- Frontmatter fields are strictly defined: `name`, `description`, `tools`, `agents`, `model`, `hooks`, `handoffs`, etc.
- The body is plain Markdown — VS Code reads it as-is and injects it as the agent's system prompt
- There is no preprocessor, no template engine, no file inclusion directive
- Skills have a `references/` directory pattern (files in `skills/<name>/references/` are included when the skill is activated), but **agents have no analogous mechanism**

### Padrões existentes no skill-kit

1. **Skills use `references/` dirs**: e.g., `skills/agent-creator/references/`, `skills/contextacao/references/`, etc. Files placed there are automatically included by the Copilot skill loader. This is a skill-only feature.

2. **Agents are flat files**: The `agents/` directory contains only `.agent.md` files and a `guide.html`. No subdirectories, no shared templates, no build step.

3. **No build/sync pipeline**: The skill-kit has no build step that could process includes. `neural-link/` contains reference docs but is not a build system.

4. **FEEDBACK block sizes** (post party-2 dedup):
   - `implementor.agent.md`: 46 lines
   - `orchestrator.agent.md`: 54 lines
   - `researcher.agent.md`: 55 lines
   - `validator.agent.md`: 55 lines
   - Total duplication: ~155 LoC across 3 agents (orchestrator/researcher/validator are near-identical; implementor is shorter variant)

### Veredicto: NÃO VIÁVEL (with current VS Code capabilities)

VS Code Copilot Chat does not support any form of file inclusion, template inheritance, or shared content blocks in `.agent.md` files. The only options would be:

1. **Copy-on-build**: Create a build step that assembles `.agent.md` from fragments → adds tooling complexity, breaks the "static files, no build" convention of the repo
2. **External script sync**: A hook or script that copies template content into agents → fragile, hidden magic, hard to maintain
3. **Wait for VS Code**: If VS Code adds `include:` or `references/` for agents (like skills have), this becomes trivial

None of these options justify the complexity for ~55 LoC of duplication across 4 files.

### Proposta (if reconsidered)

If the team decides to proceed despite the above:

- **Path**: `agents/_shared/feedback-protocol-template.md`
- **Mechanism**: PowerShell build script (`scripts/assemble-agents.ps1`) that replaces `<!-- INCLUDE:feedback-protocol -->` markers with template content
- **Effort**: **M** (medium) — need build script + CI integration + developer docs
- **Risk**: Developers editing agents must remember to edit the template, not the assembled file

**Recommendation: ABANDON.** The duplication is low-impact (4 files, ~55 LoC each, rarely changed) and the cost of any workaround exceeds the benefit.

---

## Parte B: "Content identical" failures

### Localização do teste

- **Agents**: `tests/structural/test-agents-structure.ps1`, lines 391–401
- **Skills**: `tests/structural/test-skills-structure.ps1`, lines 255–265

### O que é comparado (análise PS1)

The test compares:

| Term | Path | Description |
|------|------|-------------|
| **workspace** | `<repo>/agents/<name>.agent.md` | The file in the git working tree (source of truth) |
| **installed** | `~/.copilot/agents/<name>.agent.md` | The file installed by VS Code Skill Manager extension |

The test reads both files with UTF-8 encoding, strips BOM if present, and does a string equality check (`$content -eq $installedContent`). If they differ, it reports `FAIL: Content identical (workspace == installed)`.

**The test expects them to be EQUAL.** A failure means the workspace copy has been modified but the Skill Manager hasn't synced the changes to `~/.copilot/`.

### Lista exata das 16 falhas

**4 Agents** (all of them):
1. `implementor.agent.md` (workspace: 6996 chars vs installed: 3598 chars)
2. `orchestrator.agent.md`
3. `researcher.agent.md`
4. `validator.agent.md`

**12 Skills:**
1. `agent-creator`
2. `contextacao`
3. `doc-to-markdown`
4. `error-learning`
5. `hooks-creator`
6. `markdown-to-document`
7. `safety-check`
8. `skill-benchmark`
9. `skill-creator`
10. `skill-manager-guide`
11. `task-intent`
12. `task-map`

**Pattern**: All 4 agents were modified by the boilerplate refactor parties (feedback dedup). The 12 skills include those modified in earlier sessions. These are all files where the workspace copy was edited but Skill Manager hasn't re-synced.

### Veredicto: SYNC ISSUE (not a bug)

This is **not a bug in the test** — the test correctly detects that workspace and installed copies have diverged. It's a **Skill Manager sync lag**: the extension periodically syncs from workspace to `~/.copilot/`, but doesn't do so instantly after git operations or external edits.

Evidence:
- Previous sessions consistently documented this as pre-existing (lessons `94093b30`, `65715669`, `8737441e`)
- The implementor agent shows 6996 chars (workspace) vs 3598 chars (installed) — the installed copy is the pre-refactor version
- The test pass/fail ratio has been stable across refactor commits (49/53 agents, 115/127 skills)

### Fix proposto

**Option 1 — Manual resync** (immediate):
```powershell
# Force Skill Manager to resync
# In VS Code: Cmd+Shift+P → "Skill Manager: Sync All"
# Or restart VS Code to trigger auto-sync
```

**Option 2 — Add resync to test runner** (optional enhancement):
Add a pre-test step that triggers sync, or change the test to WARN instead of FAIL for content-identical checks. This would prevent false-negative noise in CI.

**Option 3 — Accept as-is**: The failures are informational. They tell you "these files need syncing" which is actually useful after a refactor session.

---

## Recomendação final

| Item | Decision | Rationale |
|------|----------|-----------|
| **A: Feedback template** | **ABANDON** | VS Code has no include mechanism for `.agent.md`. Cost of workarounds exceeds benefit for ~55 LoC × 4 files. Revisit only if VS Code adds agent `references/` support. |
| **B: Content identical** | **ACCEPT + RESYNC** | Not a bug. Resync via Skill Manager after refactor sessions. Optionally downgrade test from FAIL to WARN. |
