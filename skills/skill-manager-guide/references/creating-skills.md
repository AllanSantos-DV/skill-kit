# Creating Your Own Skill

A skill is a folder containing a `SKILL.md` file that teaches an AI agent domain-specific knowledge.

## Quick Start

```bash
# Inside your skills repo
mkdir -p skills/my-skill
```

Create `skills/my-skill/SKILL.md`:

```markdown
---
name: my-skill
version: 1.0.0
description: What this skill teaches
author: your-name
---

# My Skill

Instructions and knowledge for the AI agent...
```

## Best Practices

1. **Be specific** — Write instructions the agent can follow, not vague descriptions
2. **Use examples** — Show input/output pairs, code samples, command sequences
3. **Structure with headers** — The agent scans headers to find relevant sections
4. **Keep it focused** — One skill = one domain. Don't mix unrelated topics
5. **Use references/** — Put large docs in `references/` so they're loaded on-demand, not always

## Optional Files

| File | Purpose |
|------|---------|
| `FEEDBACK.md` | Enables the feedback loop — lets devs submit improvements |
| `references/*.md` | Extra documentation loaded only when needed |

## Version Your Skill

Use semantic versioning in the frontmatter:

- Fix a typo → bump patch: `1.0.0` → `1.0.1`
- Add new section → bump minor: `1.0.1` → `1.1.0`
- Rewrite everything → bump major: `1.1.0` → `2.0.0`

## Publish

Push your repo to GitHub (public or private) and share the URL. Users add it via:

```
Ctrl+Shift+P → Skills: Add Repository → paste URL
```
