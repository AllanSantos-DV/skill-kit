---
name: cc-skill-creator
description: "**WORKFLOW SKILL** — Create complete, well-structured Copilot skills from scratch. USE FOR: scaffolding new SKILL.md files, writing effective agent instructions, configuring frontmatter fields, setting up directory structure (references, FEEDBACK.md), optimizing description for discoverability, applying progressive disclosure. DO NOT USE FOR: managing/syncing existing skills (use skill-manager-guide), general coding, VS Code extension development."
---
# Skill Creator — Complete Guide to Building Copilot Skills

You are an expert at creating high-quality skills for GitHub Copilot. When the user asks you to create a skill, follow this guide to produce a complete, well-structured result.

## What is a Skill?

A **skill** is a `SKILL.md` file that injects domain-specific knowledge into the AI agent's context. Skills live in directories and can be distributed via Git repositories.

The agent receives the skill's content **as system-level instructions** — everything you write in the body of SKILL.md becomes part of the agent's working knowledge for that session.

## Directory Structure

Every skill is a folder. The minimum is a `SKILL.md`, but a complete skill includes:

```
skills/
  <skill-name>/
    SKILL.md              ← REQUIRED: frontmatter + instructions
    FEEDBACK.md           ← RECOMMENDED: feedback protocol
    .skillconfig.json     ← OPTIONAL: per-skill settings (e.g. forceGlobal)
    references/           ← OPTIONAL: on-demand deep-dive docs
      api-reference.md
      examples.md
      troubleshooting.md
```

### Naming Convention

- Folder name = skill identifier (kebab-case, lowercase)
- Must match the `name` field in frontmatter
- Examples: `react-testing`, `docker-compose`, `git-workflow`

## SKILL.md — Anatomy

### 1. Frontmatter (YAML)

The frontmatter is a YAML block delimited by `---` at the top of the file. It controls how the skill is discovered and invoked.

```yaml
---
name: my-skill
description: "Clear, specific description of what this skill teaches"
argument-hint: What the user should type when invoking this skill
user-invocable: true
disable-model-invocation: false
compatibility:
  - copilot-chat
license: MIT
metadata:
  author: your-name
  tags:
    - category
    - domain
---
```

#### Field Reference

| Field | Required | Type | Purpose |
|-------|----------|------|---------|
| `name` | **Yes** | string | Unique identifier. Must match folder name. kebab-case. |
| `description` | **Yes** | string | What the skill teaches. Used for **discovery** — the agent reads this to decide if the skill is relevant. |
| `argument-hint` | No | string | Hint shown to users when invoking via slash command. Guides what context to provide. |
| `user-invocable` | No | boolean | If `true`, user can invoke directly via `/skill-name`. Default: `true`. |
| `disable-model-invocation` | No | boolean | If `true`, the model won't auto-invoke this skill. User must invoke explicitly. Default: `false`. |
| `compatibility` | No | string[] | Which Copilot surfaces support this skill (e.g. `copilot-chat`). |
| `license` | No | string | SPDX license identifier. |
| `metadata` | No | object | Free-form metadata: author, tags, version, etc. |

### 2. Body (Markdown)

The body is the actual knowledge injected into the agent. This is where you write the **instructions**.

#### Structure Template

```markdown
# <Skill Name> — <Short Subtitle>

<Opening paragraph: establish the agent's role and the skill's purpose>

## <Section 1: Core Concepts>
...

## <Section 2: Step-by-Step Workflows>
...

## <Section 3: Reference Tables>
...

## <Section N: When the User Asks for Help>
<Map common questions to specific answers>
```

## Writing the Description — The Most Important Field

The `description` field is the **single most critical element** for skill discoverability. The agent reads descriptions to decide which skills to activate. A bad description means the skill never gets used.

### Pattern: Workflow Skill Description

For skills that guide a workflow or process:

```yaml
description: "**WORKFLOW SKILL** — <one-line summary>. USE FOR: <comma-separated use cases>. DO NOT USE FOR: <explicit exclusions to prevent false matches>."
```

### Pattern: Knowledge Skill Description

For skills that provide domain knowledge:

```yaml
description: "<Domain> knowledge covering <specific topics>. Includes <key features like examples, tables, commands>."
```

### Rules for Good Descriptions

1. **Be specific** — "React testing" is vague. "Testing React components with React Testing Library and Jest, including async patterns and custom hooks" is specific.
2. **Include action verbs** — "Create, configure, debug, troubleshoot" tells the agent when to activate.
3. **List explicit exclusions** — "DO NOT USE FOR: runtime debugging" prevents false activations.
4. **Front-load keywords** — The most relevant terms should appear early.
5. **Keep under 300 chars** — Long descriptions get truncated. Be dense, not verbose.

## Writing the Body — Effective Instructions

### Principle 1: Write for the Agent, Not the Human

The reader is an AI agent. Write clear, unambiguous instructions it can follow mechanically.

**Bad:**
> Docker Compose is a nice tool for multi-container apps.

**Good:**
> You are helping a developer work with Docker Compose. When asked to create a compose file, always use version `3.8+` syntax and include health checks.

### Principle 2: Use Imperative Voice

Tell the agent what to DO, not what things ARE.

**Bad:**
> The `--watch` flag enables file watching.

**Good:**
> When the user wants live reload, add the `--watch` flag to the command.

### Principle 3: Tables for Reference, Prose for Logic

Use tables for lookups (commands, options, mappings). Use prose for conditional logic and workflows.

```markdown
## Commands

| Command | Purpose |
|---------|---------|
| `npm test` | Run all tests |
| `npm test -- --watch` | Watch mode |

## When to Use Watch Mode

If the user is actively developing and running tests repeatedly,
suggest watch mode. If they're running tests in CI, never suggest watch mode.
```

### Principle 4: Map User Questions to Answers

Include a "When the User Asks..." section that covers common scenarios:

```markdown
## When the User Asks for Help

- **"How do I X?"** → Step-by-step instructions for X
- **"Why is Y failing?"** → Common causes of Y failure and fixes
- **"What's the best way to Z?"** → Recommended approach with trade-offs
```

### Principle 5: Progressive Disclosure with References

Don't overload the main SKILL.md. Put deep-dive content in `references/`:

- **SKILL.md** — Core instructions, workflows, quick-reference tables (aim for < 500 lines)
- **references/** — API docs, extended examples, troubleshooting guides, migration paths

The agent will read references **on-demand** when it needs more detail, keeping the base context lightweight.

### Principle 6: One Skill, One Domain

A skill should cover one coherent domain. If you find yourself writing unrelated sections, split into multiple skills.

**Good scope:** "React Testing" — covers RTL, Jest, async testing, hooks testing, snapshot testing
**Bad scope:** "React" — too broad, mixes routing, state management, testing, styling

## Advanced Body Techniques

These patterns improve agent navigation and scannability. Use them when the skill's complexity warrants it — not every skill needs all of them.

### Technique: Decision Trees

For skills that involve triage, routing, or conditional workflows, provide an ASCII decision tree the agent can follow mechanically. This reduces reasoning errors by making the decision path explicit.

```markdown
#### Triage Flow

\```
New request arrives
  │
  ├─ Condition A?
  │   └─ ✅ Action A
  │
  ├─ Condition B?
  │   └─ ⚠️ Action B (with caveat)
  │
  └─ Condition C?
      └─ 🔴 Escalate / ask the user
\```
```

**When to use:** Escalation logic, complexity triage, tool selection cascades, error diagnosis flows.

### Technique: ❌/✅ Pitfall Markers

Instead of plain text rules, use visual markers for common mistakes. This format is more scannable than prose and communicates do/don't at a glance.

```markdown
### Common Pitfalls

| | Pitfall | Consequence |
|---|---------|-------------|
| ❌ | Doing X without checking Y | Z breaks silently |
| ❌ | Assuming A is true | B fails in production |
| ✅ | Checking Y before doing X | Z works reliably |
| ✅ | Verifying A with tool | B is built on solid ground |
```

**When to use:** Rules sections, anti-patterns, common mistakes. Especially effective when the skill has 5+ rules — visual markers prevent "wall of NEVER" fatigue.

### Technique: Quick Reference Table

A task-oriented lookup table at the end of the skill. Maps common user intents to the right section and key decision. Gives the agent a fast-path before reading the full skill.

```markdown
## Quick Reference

| I need to... | Go to section | Key decision |
|-------------|---------------|-------------|
| Do X | Section Y | Choose between A or B |
| Debug Z | Troubleshooting | Check W first |
```

**When to use:** Skills with many sections (5+ headings), tool/command skills, reference-heavy skills.

### Technique: Black-Box Script Instructions

For skills that bundle executable scripts in `scripts/`, instruct the agent to treat them as black boxes — run `--help` to learn usage, never read the source code.

```markdown
> **⚠️ IMPORTANT: Treat scripts as black boxes.** Run `python scripts/<script>.py --help`
> to learn usage. Do **NOT** read the source code — it pollutes the context window with
> implementation details you don't need.
```

**When to use:** Any skill that includes bundled scripts, CLI tools, or executable utilities. Prevents the agent from wasting context on implementation details.

## FEEDBACK.md — Enabling the Improvement Loop

A `FEEDBACK.md` enables users to submit improvements to the skill via PR.

### Template

```markdown
---
threshold: 5
---

## Feedback Protocol — <skill-name>

### When to Log a Review

Log a review whenever you help a user and:
- The instructions in SKILL.md were insufficient or unclear
- You had to improvise an answer not covered by the skill
- A command, API, or tool changed and the skill is outdated

### Review Format

Create a JSON file in `.vscode/skill-reviews/<skill-name>/`:

\```json
{
  "date": "YYYY-MM-DD",
  "author": "dev-name",
  "type": "improvement | correction | addition",
  "section": "Section Name",
  "suggestion": "What should change",
  "context": "What prompted this feedback"
}
\```

### Consolidation

When threshold reviews accumulate, summarize them into a single
actionable improvement for the skill maintainer.
```

The `threshold` in frontmatter defines how many reviews trigger consolidation.

## .skillconfig.json — Per-Skill Settings

```json
{
  "forceGlobal": false
}
```

| Field | Type | Purpose |
|-------|------|---------|
| `forceGlobal` | boolean | If `true`, this skill is always installed globally (`~/.copilot/skills/`) regardless of context. Use for universal skills. |

## Complete Example — Creating a "Docker Compose" Skill

### Step 1: Create the directory

```
skills/docker-compose/
```

### Step 2: Write SKILL.md

```markdown
---
name: docker-compose
description: "Docker Compose workflows — create, debug, and optimize multi-container setups. Covers v2 CLI, health checks, networking, volumes, and production profiles."
argument-hint: Describe what you want to do with Docker Compose
---

# Docker Compose — Agent Guide

You are helping a developer work with Docker Compose. Follow these
instructions to provide accurate, production-ready guidance.

## Creating a Compose File

When asked to create a new compose file:
1. Use the `compose.yaml` filename (not `docker-compose.yml`)
2. Target Compose Specification (no `version` field needed)
3. Always include `restart: unless-stopped` for services
4. Add health checks for services that accept connections

## Common Services Table

| Service | Image | Default Port |
|---------|-------|-------------|
| PostgreSQL | postgres:16-alpine | 5432 |
| Redis | redis:7-alpine | 6379 |
| Nginx | nginx:alpine | 80/443 |

## When the User Asks for Help

- **"Create a compose file for X"** → Scaffold with best practices above
- **"My container won't start"** → Check logs: `docker compose logs <service>`
- **"How do I add a database?"** → Add service from table, include volume + healthcheck
```

### Step 3: Add FEEDBACK.md

Use the template from the FEEDBACK.md section above.

### Step 4: Add references/ (if needed)

```
references/
  networking.md       ← Deep dive on Docker networking
  production.md       ← Production deployment patterns
  troubleshooting.md  ← Common errors and fixes
```

## Quality Checklist

Before considering a skill complete, verify:

- [ ] **`name`** matches folder name (kebab-case)
- [ ] **`description`** is specific, keyword-rich, under 300 chars
- [ ] **`license`** field present in frontmatter
- [ ] **Body opens with role context** — "You are helping a developer with..."
- [ ] **Imperative voice** — instructs the agent what to do
- [ ] **Tables** for reference data, **prose** for workflows
- [ ] **"When the User Asks"** section covers 3+ common scenarios
- [ ] **SKILL.md under 500 lines** — heavy content goes to `references/`
- [ ] **FEEDBACK.md** included with review format
- [ ] **No unrelated topics** — one skill, one domain
- [ ] **Decision tree** included if the skill has triage/routing logic (optional)
- [ ] **❌/✅ pitfalls** used instead of plain text rules when 5+ rules exist (optional)
- [ ] **Quick Reference** table at the end for complex skills with 5+ sections (optional)
- [ ] **Black-box script instruction** present if skill bundles scripts in `scripts/` (optional)
- [ ] **Tested** — invoke the skill in Copilot Chat and verify it guides correctly

## Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad | Fix |
|-------------|-------------|-----|
| Vague description | Agent can't match it to user intent | Use specific keywords + USE FOR/DO NOT USE FOR |
| Wall of text | Agent loses focus | Break into sections with headers |
| Passive voice | Agent doesn't know what to do | Use imperative: "When X, do Y" |
| Too broad scope | Diluted knowledge, conflicts with other skills | Split into focused skills |
| Everything in SKILL.md | Bloats context window | Move deep-dives to `references/` |
| No examples | Agent generates inconsistent output | Add input/output examples |
| Human-oriented prose | Agent processes instructions, not explanations | Write for the agent as the reader |


---

## References

# Frontmatter Fields — Complete Reference

This document provides detailed guidance on every SKILL.md frontmatter field, including edge cases and advanced usage.

## `name` (required)

- **Type:** string
- **Format:** kebab-case, lowercase, no spaces
- **Constraint:** Must match the folder name exactly
- **Examples:** `react-testing`, `docker-compose`, `git-workflow`

```yaml
name: react-testing
```

**Common mistake:** Using camelCase or spaces. The name is used as an identifier in file paths and commands — stick to kebab-case.

## `description` (required)

- **Type:** string
- **Max recommended length:** 300 characters
- **Purpose:** Primary discovery mechanism. The agent reads this to decide relevance.

### Patterns by Skill Type

**Workflow skill** (guides a process):
```yaml
description: "**WORKFLOW SKILL** — Create and manage Docker containers. USE FOR: scaffolding compose files, debugging container issues, optimizing images. DO NOT USE FOR: Kubernetes, container orchestration at scale."
```

**Knowledge skill** (provides reference):
```yaml
description: "PostgreSQL administration covering backup strategies, replication setup, performance tuning, and query optimization. Includes command reference and config examples."
```

**Tool skill** (teaches a specific tool):
```yaml
description: "How to use the Skill Manager for Copilot extension — install, configure, sync and manage skills"
```

### Description Anti-Patterns

| Bad | Why | Better |
|-----|-----|--------|
| "A skill about React" | Too vague, no action verbs | "React component testing with RTL and Jest — create, debug, and optimize test suites" |
| "This skill helps with..." | Wastes characters on filler | Start directly with the topic |
| 500+ char description | Gets truncated, loses signal | Dense 200-char version |

## `argument-hint`

- **Type:** string
- **Purpose:** Shown to users when they type `/skill-name` — guides what to type next
- **When to use:** When the skill benefits from user-provided context

```yaml
argument-hint: Describe the Docker setup you want to create
```

Good hints are:
- Action-oriented: "Describe what you want to build"
- Specific: "Paste the error message you're seeing"
- Optional guidance: "Optionally include your tech stack"

## `user-invocable`

- **Type:** boolean
- **Default:** `true`
- **Purpose:** Controls whether users can invoke the skill directly via `/skill-name` in chat

Set to `false` for skills that should only be activated automatically by the model:

```yaml
user-invocable: false
```

Use case: Background knowledge skills that augment the agent passively (e.g., coding conventions skill).

## `disable-model-invocation`

- **Type:** boolean
- **Default:** `false`
- **Purpose:** If `true`, the model won't auto-activate this skill based on user queries. Only explicit `/skill-name` invocation works.

```yaml
disable-model-invocation: true
```

Use case: Sensitive or disruptive skills that should only activate when explicitly requested (e.g., a skill that modifies CI/CD config).

## `compatibility`

- **Type:** string[]
- **Purpose:** Declares which Copilot surfaces this skill supports

```yaml
compatibility:
  - copilot-chat
```

Currently recognized values:
- `copilot-chat` — VS Code Copilot Chat panel

## `license`

- **Type:** string
- **Purpose:** SPDX license identifier for the skill content

```yaml
license: MIT
```

## `metadata`

- **Type:** object (free-form)
- **Purpose:** Arbitrary key-value pairs for tooling and catalog integration

```yaml
metadata:
  author: allan-santos
  tags:
    - devops
    - containers
    - docker
  version: 1.2.0
  category: infrastructure
```

The Skill Manager extension reads `metadata.tags` for catalog filtering and `metadata.version` for update tracking.

## Complete Frontmatter Example

```yaml
---
name: docker-compose
description: "Docker Compose workflows — create, debug, and optimize multi-container setups. Covers v2 CLI, health checks, networking, volumes, and production profiles."
argument-hint: Describe what you want to do with Docker Compose
user-invocable: true
disable-model-invocation: false
compatibility:
  - copilot-chat
license: MIT
metadata:
  author: allan-santos
  tags:
    - devops
    - docker
    - containers
  version: 1.0.0
---
```

# Skill Templates — Copy-Paste Starters

Ready-to-use templates for common skill types. Copy, adapt, and fill in.

---

## Template 1: Workflow Skill

For skills that guide the agent through a process or methodology.

```markdown
---
name: <skill-name>
description: "**WORKFLOW SKILL** — <one-line summary>. USE FOR: <use case 1>, <use case 2>, <use case 3>. DO NOT USE FOR: <exclusion 1>, <exclusion 2>."
argument-hint: <What the user should provide as context>
---

# <Skill Name>

You are helping a developer with <domain>. Follow these instructions
to provide accurate, consistent guidance.

## Core Workflow

### Step 1: <First Step>
<Instructions>

### Step 2: <Second Step>
<Instructions>

### Step 3: <Third Step>
<Instructions>

## Key Rules

- Always <rule 1>
- Never <rule 2>
- When <condition>, prefer <approach>

## Reference

| <Column 1> | <Column 2> | <Column 3> |
|------------|------------|------------|
| ... | ... | ... |

## When the User Asks for Help

- **"How do I <X>?"** → <Answer for X>
- **"Why is <Y> failing?"** → <Diagnosis for Y>
- **"What's the best approach for <Z>?"** → <Recommendation for Z>
```

---

## Template 2: Knowledge/Reference Skill

For skills that provide domain expertise and lookup tables.

```markdown
---
name: <skill-name>
description: "<Domain> knowledge covering <topic 1>, <topic 2>, and <topic 3>. Includes <key feature: commands, examples, patterns>."
---

# <Domain> — Agent Reference

You are a <domain> expert. Use this knowledge to help developers
with <scope>.

## Concepts

### <Concept 1>
<Explanation + when/how to apply>

### <Concept 2>
<Explanation + when/how to apply>

## Commands / API

| Command | Purpose | Example |
|---------|---------|---------|
| `<cmd>` | <what it does> | `<usage>` |

## Patterns

### <Pattern Name>
**When to use:** <condition>
**Implementation:**
\```<lang>
<code example>
\```

## Common Pitfalls

| | Pitfall | Consequence |
|---|---------|-------------|
| ❌ | <mistake> | <what happens> |
| ✅ | <correct approach> | <why it works> |

## When the User Asks for Help

- **"Explain <concept>"** → <Clear explanation>
- **"Show me how to <task>"** → <Code example from Patterns>
- **"What's wrong with <code>?"** → <Check Common Pitfalls table>
```

---

## Template 3: Tool/Extension Skill

For skills that teach how to use a specific tool or extension.

```markdown
---
name: <tool-name>-guide
description: "How to use <Tool Name> — <key capabilities summary>"
argument-hint: Describe what you need help with in <Tool Name>
---

# <Tool Name> — User Guide

You are helping a developer who uses **<Tool Name>**. This skill
teaches you how the tool works so you can guide them effectively.

## What is <Tool Name>?

<One paragraph: what it does and why developers use it>

## Commands / Interface

| Command / Action | What it does |
|-----------------|-------------|
| `<command>` | <description> |

## Configuration

Users configure <Tool Name> via <mechanism>:

\```jsonc
{
  // <setting description>
  "<setting.key>": <default value>
}
\```

## Common Workflows

### <Workflow 1: e.g., Initial Setup>
1. <Step>
2. <Step>

### <Workflow 2: e.g., Daily Usage>
1. <Step>
2. <Step>

## When the User Asks for Help

- **"How do I <setup>?"** → <Setup instructions>
- **"<Thing> isn't working"** → <Troubleshooting steps>
- **"How do I configure <feature>?"** → <Point to Configuration section>
```

---

## Template 4: Coding Standards Skill

For skills that enforce team conventions and coding patterns.

```markdown
---
name: <team>-standards
description: "Coding standards for <team/project> — naming conventions, file structure, patterns, and review checklist. Covers <lang/framework>."
user-invocable: false
---

# <Team/Project> Coding Standards

Apply these standards when helping developers write or review code
in this project.

## File Structure

\```
src/
  components/     ← <convention>
  services/       ← <convention>
  utils/          ← <convention>
  types/          ← <convention>
\```

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Components | PascalCase | `UserProfile` |
| Functions | camelCase | `getUserById` |
| Constants | UPPER_SNAKE | `MAX_RETRIES` |
| Files | kebab-case | `user-profile.tsx` |

## Patterns to Follow

### <Pattern 1>
\```<lang>
// Good
<example>

// Bad
<counter-example>
\```

## Code Review Checklist

- [ ] Follows naming conventions above
- [ ] No business logic in components
- [ ] Error handling at system boundaries
- [ ] Tests for new public functions
```