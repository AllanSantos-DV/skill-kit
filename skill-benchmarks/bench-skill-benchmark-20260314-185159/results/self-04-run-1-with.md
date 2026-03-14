# Evaluation Rubric: Git Workflow Management Skill

This rubric is designed for A/B benchmark evaluation of a skill that teaches: conventional commits, branch naming conventions, PR review checklists, rebase vs. merge strategy, and handling merge conflicts.

Each criterion is a **specific, evaluable statement** — not a vague quality judgment. A scorer should be able to read a code/text output and definitively determine whether each criterion is met.

---

## Dimension 1: Correctness

**What it measures:** Are the Git workflow practices technically correct and sound?

| # | Criterion |
|---|-----------|
| C1 | Conventional commits follow the specification: `type(scope): description` where `type` is one of `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `test`, `perf`, `ci`, `build`, `revert` |
| C2 | Branch naming convention uses a consistent format with valid delimiters (e.g., `feature/TICKET-123-short-description` or `fix/login-timeout`) — no spaces, no uppercase in branch names |
| C3 | Rebase vs. merge advice is contextually correct: rebase for linear history on feature branches, merge (or merge commit) for integrating long-lived branches. Does NOT recommend rebasing public/shared branches |
| C4 | Merge conflict resolution preserves both sides' intent — doesn't blindly accept "ours" or "theirs" without examining the conflict content |
| C5 | PR review checklist items are actionable and verifiable (not just "code looks good" — should include specific checks like "tests pass", "no console.log left", "types are correct") |

---

## Dimension 2: Completeness

**What it measures:** Does the output cover all 5 topics the skill teaches?

| # | Criterion |
|---|-----------|
| CO1 | **Conventional commits**: Explains the format, provides at least 3 examples covering different types (feat, fix, and at least one other), and mentions breaking change notation (`!` or `BREAKING CHANGE:` footer) |
| CO2 | **Branch naming**: Defines a convention with structure (prefix/description), lists valid prefixes, explains how to include ticket/issue references, and mentions branch lifecycle (when to delete) |
| CO3 | **PR review checklists**: Provides a concrete checklist with at least 5 items covering code quality, tests, documentation, security, and style. Items should be yes/no checkable |
| CO4 | **Rebase vs. merge**: Covers when to use each, explains the trade-offs (linear history vs. merge context), addresses `--force-push` implications, and mentions interactive rebase for commit cleanup |
| CO5 | **Merge conflicts**: Explains how conflicts arise, provides step-by-step resolution workflow, covers at least the command-line resolution approach, mentions tools for visual resolution |

---

## Dimension 3: Pattern Adherence

**What it measures:** Does the output follow established Git workflow patterns and conventions?

| # | Criterion |
|---|-----------|
| P1 | Commit message format is consistent throughout — all examples follow the same convention, not a mix of styles (e.g., mixing conventional commits with free-form messages) |
| P2 | Branch naming follows a hierarchical pattern that encodes context: type, scope/ticket, and description — not just arbitrary names |
| P3 | The PR checklist follows a progressive pattern: pre-review self-checks → reviewer checks → post-merge checks. Not just a flat list |
| P4 | Rebase/merge strategy decision tree is explicit: "IF feature branch AND not shared, THEN rebase. IF integration branch OR long-lived, THEN merge." Not just "it depends" |
| P5 | Conflict resolution follows the three-way merge mental model: understand base, ours, theirs — then decide. Not just "pick one" |

---

## Dimension 4: Edge Cases

**What it measures:** Does the output handle unusual or risky Git workflow scenarios?

| # | Criterion |
|---|-----------|
| E1 | **Force-push safety**: Addresses the risk of `git push --force` after rebase on a shared branch. Recommends `--force-with-lease` as a safer alternative and explains when force-push is acceptable (personal feature branch only) |
| E2 | **Rebase conflicts in long chains**: Addresses what happens when rebasing a branch with many commits onto a diverged base — each commit may conflict independently. Mentions `git rebase --abort` as an escape hatch |
| E3 | **Partial cherry-picks and conflict resolution**: Covers the scenario where cherry-picking a commit creates a conflict because the surrounding code has diverged. Explains that cherry-pick conflicts are resolved the same way as merge conflicts |
| E4 | **Conventional commit edge cases**: Handles multi-line commit bodies, breaking changes (both `!` shorthand and `BREAKING CHANGE:` footer), commits that span multiple scopes, and reverts of reverts |
| E5 | **Merge conflict in generated files**: Addresses conflicts in `package-lock.json`, `yarn.lock`, or auto-generated code. Recommends regenerating rather than manually resolving, and explains how to configure `.gitattributes` for merge strategy |

---

## Scoring Guide

For each dimension, apply the criteria above and score 0.0–1.0:

| Score | Rule |
|-------|------|
| **1.0** | All criteria in the dimension are fully met |
| **0.75** | Most criteria met, one minor gap |
| **0.50** | Half the criteria met, or all partially addressed |
| **0.25** | One or two criteria barely addressed |
| **0.0** | No criteria met for this dimension |

Score both "with skill" and "without skill" outputs before comparing. Record scores and justifications for each dimension independently.
