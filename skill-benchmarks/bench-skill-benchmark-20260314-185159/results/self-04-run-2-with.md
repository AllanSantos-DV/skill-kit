# Rubric: Git Workflow Management

Designed for controlled A/B evaluation. Each criterion below maps to specific knowledge the Git workflow skill teaches, making it possible to detect whether the skill was injected based on output quality.

---

## Correctness

Evaluates whether the Git practices described are technically accurate and won't lead to data loss or workflow problems.

**Criteria:**

1. **Conventional commit format accuracy**: Commit examples use `type(scope): description` format, type values are from the standard set (feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert), and scope is optional but contextually meaningful
2. **Branch naming validity**: Branch names are lowercase, use hyphens or slashes as delimiters (no spaces or special characters), and include a type prefix that maps to the work type (feature/, bugfix/, hotfix/, release/)
3. **Rebase correctness**: Rebase is recommended only for local/unshared branches. Explicitly warns against rebasing commits that have been pushed to shared branches. Mentions that rebase rewrites commit hashes
4. **Merge conflict resolution accuracy**: Conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) are explained correctly. Resolution produces working code that incorporates both changes' intent
5. **PR checklist validity**: Each checklist item corresponds to a real, verifiable check (not opinions or subjective qualities)

---

## Completeness

Evaluates coverage of all 5 skill topics.

**Criteria:**

1. **Conventional commits covered**: Format, types, scopes, examples, breaking change notation — at least 3 different commit type examples
2. **Branch naming covered**: Convention structure, valid prefixes, ticket/issue linking pattern, lifecycle (creation through deletion)
3. **PR review checklist covered**: At least 6 actionable items spanning code quality, tests, docs, security, and the approval process
4. **Rebase vs. merge covered**: When to use each, pros/cons, interactive rebase for commit cleanup, squash considerations
5. **Merge conflict resolution covered**: Why conflicts happen, step-by-step resolution, tools (CLI and visual), prevention strategies

---

## Pattern Adherence

Evaluates structural consistency and adherence to workflow conventions.

**Criteria:**

1. **Commit convention consistency**: All commit examples follow the same format — no mixing conventional commits with free-text
2. **Branch prefix taxonomy**: A clear, hierarchical naming scheme (type/scope-description) applied consistently across all examples
3. **Workflow decision tree**: Rebase/merge choice presented as a deterministic decision tree, not "it depends"
4. **Checklist format**: PR checklist uses checkable items (checkbox format), grouped by category, with clear pass/fail criteria
5. **Conflict resolution protocol**: A repeatable, step-by-step process (fetch → identify → resolve → verify → commit) rather than ad-hoc instructions

---

## Edge Cases

Evaluates handling of risky, unusual, or easily-overlooked scenarios.

**Criteria:**

1. **Force-push safety**: Discusses `--force-with-lease` vs `--force`, when force-push is acceptable (personal branch, post-rebase), and the risk of overwriting teammates' work
2. **Rebase on diverged branches**: Addresses what happens when rebasing onto a base that has diverged significantly — repeated conflict resolution, `--abort` option, and when to abandon rebase
3. **Cherry-pick conflicts**: Explains partial cherry-pick scenarios where context differs between branches, and how to resolve resulting conflicts
4. **Generated file conflicts**: Mentions that lock files (package-lock.json, yarn.lock, poetry.lock) and auto-generated files should be regenerated rather than manually merged. References `.gitattributes` merge strategies
5. **Commit amend safety**: Addresses `git commit --amend` on already-pushed commits and its interaction with shared branches. Warns about rewriting public history
6. **Multi-scope commits**: Handles cases where a single change spans multiple conventional commit scopes — recommends splitting or using a broader scope

---

## Scoring Protocol

For each dimension, count how many criteria are fully met:

| Met criteria | Score |
|:---:|:---:|
| All | 1.0 |
| All but one | 0.75 |
| Half | 0.50 |
| 1–2 | 0.25 |
| None | 0.0 |

Score both variants (with-skill and without-skill) for each dimension before comparing. Avoid anchoring bias by scoring the first output fully before reading the second.
