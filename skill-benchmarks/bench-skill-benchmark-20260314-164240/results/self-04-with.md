# Evaluation Rubric: Git Workflow Management Skill

This rubric evaluates whether an agent correctly applies Git workflow management best practices across 4 dimensions, targeted at the 5 topics the skill teaches.

---

## Dimension: correctness

Evaluates whether the agent's guidance is technically accurate for each Git workflow topic.

| Topic | Criterion |
|-------|-----------|
| Conventional Commits | Uses the correct format: `<type>(<scope>): <description>` with valid types (feat, fix, docs, style, refactor, test, chore); body wrapped at 72 chars; breaking changes flagged with `BREAKING CHANGE:` footer or `!` after type |
| Branch Naming | Branch names follow the pattern `<type>/<ticket-id>-<short-description>` (e.g., `feature/PROJ-123-add-auth`); uses lowercase with hyphens; avoids spaces and special characters |
| PR Review Checklist | Checklist items are actionable and relevant: code compiles, tests pass, no unresolved TODOs, documentation updated, breaking changes documented, security implications considered |
| Rebase vs. Merge | Correctly distinguishes when to rebase (local feature branches, cleaning history before merge) vs. merge (shared branches, preserving merge history); warns against rebasing published/shared branches |
| Merge Conflicts | Resolution steps are technically accurate: identifies conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`), explains how to resolve in-file, stage resolved files, and complete the merge/rebase with `git rebase --continue` or `git merge --continue` |

---

## Dimension: completeness

Evaluates whether all 5 skill topics are addressed with sufficient depth.

| Topic | Criterion |
|-------|-----------|
| Conventional Commits | Covers types (feat, fix, etc.), scope (optional), description rules, body format, footer conventions, and when to use breaking change notation |
| Branch Naming | Includes naming convention, prefix types (feature/, bugfix/, hotfix/, release/), ticket ID integration, deletion after merge |
| PR Review Checklist | Addresses code quality, test coverage, documentation, security review, performance implications, and backward compatibility checks |
| Rebase vs. Merge | Explains both strategies with pros/cons, when each is appropriate, interactive rebase (`git rebase -i`) for squashing, and team agreement considerations |
| Merge Conflicts | Covers prevention (frequent pulls/rebases), identification, resolution process, tools (`git mergetool`), and post-resolution verification |

---

## Dimension: pattern_adherence

Evaluates whether the agent follows the specific patterns and conventions the skill prescribes rather than ad-hoc alternatives.

| Pattern | Criterion |
|---------|-----------|
| Commit Message Structure | Follows strict conventional commit format — not free-form messages like "fixed bug" or "updated stuff" |
| Branch Lifecycle | Prescribes the full lifecycle: create from up-to-date main → develop → PR → review → squash/rebase → merge → delete branch |
| Review Process | Uses a structured checklist format (not prose), with checkable items that map to CI gates where possible |
| History Strategy | Applies the skill's decision rule for rebase vs. merge (e.g., "rebase for local cleanup, merge for shared integration") rather than defaulting to one strategy always |
| Conflict Workflow | Follows the prescribed resolution sequence: fetch → attempt merge/rebase → resolve conflicts → verify → stage → complete — not ad-hoc approaches |

---

## Dimension: edge_cases

Evaluates whether the agent handles tricky or advanced scenarios the skill warns about.

| Edge Case | Criterion |
|-----------|-----------|
| Force-Push Safety | Warns against `git push --force` on shared branches; recommends `--force-with-lease` for personal branches after rebase; explains the data loss risk |
| Rebase Conflicts in Long-Lived Branches | Addresses the cascading conflict problem when rebasing branches with many commits; recommends interactive rebase with squash to reduce conflict surface |
| Partial Cherry-Picks | Handles scenarios where only some commits from a branch are needed; explains `git cherry-pick` with `-x` flag for traceability; warns about duplicate commits if the source branch is later merged |
| Merge Conflict in CI/CD | Addresses conflicts that appear in CI but not locally (different base branch state); recommends pulling latest main before final merge |
| Breaking Change Across Multiple PRs | Handles coordination when a breaking change spans multiple PRs: feature flags, backward-compatible intermediate steps, or coordinated merge ordering |
| Orphaned Branches | Addresses cleanup: detecting stale branches (`git branch --merged`), automated cleanup policies, protecting long-lived branches |
