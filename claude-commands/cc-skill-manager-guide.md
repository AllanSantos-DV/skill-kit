---
name: cc-skill-manager-guide
description: "Guide to the Skill Manager for Copilot extension. USE FOR: adding/removing skill repos, syncing skills, pushing feedback, configuring sync intervals, troubleshooting sync issues, understanding skill format. DO NOT USE FOR: creating new skills (use skill-creator), creating agents (use agent-creator)."
---
# Skill Manager for Copilot — User Guide

You are helping a developer who uses the **Skill Manager for Copilot** VS Code extension. This skill teaches you how the extension works so you can guide them effectively.

## What is a Skill?

A **skill** is a Markdown file (`SKILL.md`) that gives you (the AI agent) domain-specific knowledge. Skills are organized in Git repositories and synced to the developer's local workspace via this extension.

## Extension Commands

| Command | What it does |
|---------|-------------|
| `Skills: Add Repository` | Adds a Git repo URL as a skill source |
| `Skills: Add Official Repository` | Adds the curated official skill repo |
| `Skills: Remove Repository` | Removes a previously added repo |
| `Skills: Pull All` | Syncs all skills from all configured repos |
| `Skills: Pull Repo` | Syncs skills from a specific repo |
| `Skills: Push Feedback` | Sends local feedback to the repo via branch + PR |
| `Skills: Status` | Shows sync status of all skills |
| `Skills: Enable Skill` | Re-enables a disabled skill |
| `Skills: Disable Skill` | Disables a skill without deleting it |
| `Skills: Browse Catalog` | Opens the skill catalog in the browser |

## How Sync Works

1. The extension clones configured repos to a local cache.
2. On `Pull`, it copies skills from `<repo>/skills/<name>/` to the workspace's `.github/skills/` directory.
3. Each synced skill gets a `.manifest.json` tracking its origin and hash.
4. If the local copy hasn't been edited, it auto-updates on next pull.
5. If the local copy was edited, the conflict strategy kicks in (configurable).

## Configuration

Users configure the extension in VS Code settings (`skillManager.*`):

```jsonc
{
  // List of skill repositories
  "skillManager.repos": [
    { "name": "Official", "url": "https://github.com/AllanSantos-DV/skill-kit.git", "priority": 1 },
    { "name": "Team", "url": "https://github.com/my-org/team-skills.git", "priority": 2 }
  ],

  // Auto-sync interval in minutes (0 = disabled)
  "skillManager.syncIntervalMinutes": 30,

  // What to do when same skill exists in multiple repos
  // "highest-priority" | "ask" | "keep-local"
  "skillManager.conflictStrategy": "highest-priority",

  // What to do when local skill was edited and repo has update
  // "keep-local" | "overwrite" | "ask"
  "skillManager.localEditStrategy": "ask"
}
```

## Skill Structure

Every skill lives in a folder under `skills/` in the repo:

```
skills/
  my-skill/
    SKILL.md            ← Required: the skill content (you read this)
    FEEDBACK.md         ← Optional: feedback protocol for this skill
    references/         ← Optional: extra docs loaded on-demand
      api-reference.md
      examples.md
```

### SKILL.md Frontmatter

```yaml
---
name: my-skill
description: What this skill teaches
---
```

Supported attributes: `name`, `description`, `argument-hint`, `compatibility`, `disable-model-invocation`, `license`, `metadata`, `user-invocable`.

### Version Convention

- **Patch** (1.0.0 → 1.0.1): typos, clarifications
- **Minor** (1.0.1 → 1.1.0): new scenarios, improvements
- **Major** (1.1.0 → 2.0.0): fundamental rewrites

## Feedback Flow

If a skill has `FEEDBACK.md`, users can submit improvements:

1. Developer writes feedback in the local skill directory
2. `Skills: Push Feedback` creates a branch and pushes
3. A PR is created on the skill repo for the maintainer to review

## Sidebar & Status

- The **Skill Manager** sidebar shows all skills grouped by repo
- Icons indicate state: ✓ synced, ↑ local-only, ⊘ disabled
- The status bar shows overall sync state: synced, divergent, error, or syncing

## When the User Asks for Help

- **"How do I add a skill repo?"** → `Ctrl+Shift+P` → `Skills: Add Repository` → paste the Git URL
- **"My skills aren't updating"** → Run `Skills: Pull All`, check status bar for errors
- **"How do I disable a skill?"** → Right-click the skill in sidebar → `Disable Skill`
- **"How do I create my own skill?"** → Create a folder under `skills/` with a `SKILL.md` containing frontmatter + content
- **"How do I submit improvements?"** → Edit the local skill, then `Skills: Push Feedback`


---

## References

# Creating Your Own Skill

For a complete, in-depth guide on creating skills — including frontmatter reference, body best practices, templates, and quality checklist — use the **skill-creator** skill:

```
/skill-creator Describe the domain or topic the new skill should cover
```

## Quick Start

```bash
# Inside your skills repo
mkdir -p skills/my-skill
```

Create `skills/my-skill/SKILL.md`:

```markdown
---
name: my-skill
description: What this skill teaches
---

# My Skill

Instructions and knowledge for the AI agent...
```

## Publish

Push your repo to GitHub (public or private) and share the URL. Users add it via:

```
Ctrl+Shift+P → Skills: Add Repository → paste URL
```

# Troubleshooting — Skill Manager for Copilot

## Common Issues

### Skills not appearing in sidebar
- Run `Skills: Pull All` from the command palette
- Check that at least one repo is configured in `skillManager.repos`
- Verify the repo has the correct structure: `skills/<name>/SKILL.md`

### "Clone failed" error when adding a repo
- Check the URL is correct (HTTPS or SSH)
- For private repos, ensure Git credentials are configured
- Try cloning manually: `git clone <url>` to verify access

### Skills not updating on pull
- If you edited the local copy, the extension preserves your changes (depends on `localEditStrategy`)
- Set `"skillManager.localEditStrategy": "overwrite"` to always accept repo updates
- Or set to `"ask"` to be prompted each time

### Push Feedback fails
- The repo may not allow push from your account
- Ensure you have write access or fork the repo first
- Check network connectivity — the status bar shows connection errors

### Disabled skill won't re-enable
- Right-click the skill in sidebar → `Enable Skill`
- Or manually rename `SKILL.md.disabled` back to `SKILL.md`

### Status bar shows "error"
- Usually a network issue during sync
- Run `Skills: Status` for details
- Run `Skills: Pull All` to retry

## Reset Extension State

If things are completely broken:

1. Delete the cache: remove the `.skill-manager-cache/` folder in the VS Code global storage
2. Delete local skills: remove `.github/skills/` from your workspace
3. Restart VS Code
4. Re-add your repos and pull again