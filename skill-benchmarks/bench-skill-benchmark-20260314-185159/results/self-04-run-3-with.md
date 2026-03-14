# Complete Evaluation Rubric — Git Workflow Management

## Purpose

This rubric evaluates whether an agent produces high-quality Git workflow guidance across 4 dimensions. It targets the specific teachings of a Git workflow skill covering: conventional commits, branch naming, PR review checklists, rebase vs. merge, and merge conflict handling.

Each criterion is written as a **specific evaluable statement** — a yes/no determination, not a subjective quality judgment.

---

## Correctness

*Does the output contain technically accurate Git workflow guidance?*

| ID | Criterion | What to look for |
|----|-----------|-----------------|
| C-1 | Conventional commit types are from the standard spec | `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert` — no invented types |
| C-2 | Commit format includes optional scope and required colon-space | `type(scope): description` or `type: description` — not `type - description` or `type: [scope] desc` |
| C-3 | Branch names use valid characters (lowercase, hyphens, forward slashes) | No spaces, no uppercase, no special characters except `-` and `/` |
| C-4 | Rebase advice correctly limits rebase to unpushed or personal branches | Explicitly states: "do not rebase commits that exist on shared/remote branches unless you own the branch" |
| C-5 | Merge conflict resolution preserves semantic intent from both branches | Not just "pick ours" or "pick theirs" — explains examining both sides and creating a merged result |

---

## Completeness

*Are all 5 skill topics covered with sufficient depth?*

| ID | Criterion | Minimum requirement |
|----|-----------|-------------------|
| CO-1 | Conventional commits | Format spec, ≥ 3 type examples, breaking change syntax (either `!` or footer), multi-line body format |
| CO-2 | Branch naming conventions | Naming pattern with prefix/description, list of valid prefixes, ticket reference integration, branch lifecycle guidance |
| CO-3 | PR review checklists | ≥ 5 checkable items, covering: code quality, test coverage, documentation updates, security considerations, style compliance |
| CO-4 | Rebase vs. merge | When to use each with explicit conditions, pros/cons table or comparison, interactive rebase usage, squash-merge mention |
| CO-5 | Merge conflict handling | How conflicts arise, step-by-step resolution, CLI commands (`git mergetool`, `git add`, `git rebase --continue`), prevention tips |

---

## Pattern Adherence

*Does the output follow consistent, structured conventions?*

| ID | Criterion | How to evaluate |
|----|-----------|----------------|
| P-1 | All commit examples use the same format throughout | No mixing of conventional commits with "Update readme" or "WIP" style messages |
| P-2 | Branch naming follows a uniform hierarchical pattern | Every example branch uses `type/description` or `type/ticket-description` — not ad hoc names |
| P-3 | Rebase/merge selection is a decision tree, not a vague guideline | "IF [condition] THEN rebase, ELSE merge" — with at least 3 conditions enumerated |
| P-4 | PR checklist is organized by category with clear grouping | Items grouped (e.g., "Code", "Tests", "Docs", "Security") — not a random flat list |
| P-5 | Conflict resolution is a sequential protocol | Numbered or ordered steps from detection through verification, not just tips |

---

## Edge Cases

*Does the output handle risky, unusual, or easily-missed scenarios?*

| ID | Criterion | Specific scenario |
|----|-----------|-------------------|
| E-1 | Force-push safety | Recommends `--force-with-lease` over `--force`, explains why (prevents overwriting others' changes), limits force-push to personal branches |
| E-2 | Rebase on long-diverged branches | Addresses repeated conflict resolution during rebase of multiple commits, mentions `--abort` escape hatch and when to fall back to merge |
| E-3 | Cherry-pick partial conflicts | How to handle conflicts when cherry-picking a commit whose context differs between branches |
| E-4 | Lock file / generated file conflicts | Advises regenerating `package-lock.json`/`yarn.lock` instead of manual resolution, mentions `.gitattributes` `merge=union` or `merge=ours` strategies |
| E-5 | Amending pushed commits | Warns against `git commit --amend` + force-push on shared branches, explains the downstream impact on collaborators |
| E-6 | Conventional commit breaking changes | Handles the `!` in `feat!: migration` AND the `BREAKING CHANGE:` footer, plus how tools (semantic-release) consume these |

---

## Scoring Calibration

| Score | Definition |
|:-----:|-----------|
| **1.0** | All criteria in the dimension are clearly and fully addressed |
| **0.75** | All but one criterion met, or all met with minor imprecision |
| **0.50** | Roughly half the criteria fully met, rest partially or missing |
| **0.25** | 1–2 criteria partially addressed, rest missing |
| **0.0** | Dimension not addressed at all or completely incorrect |

**Scoring protocol:** Score Variant A completely across all 4 dimensions, then score Variant B. Do not compare between variants until both are scored independently.
