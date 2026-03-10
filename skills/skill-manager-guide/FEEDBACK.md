---
threshold: 5
---

## Feedback Protocol — skill-manager-guide

### When to Log a Review

Log a review whenever you help a user with the Skill Manager extension and:
- The instructions in SKILL.md were insufficient or unclear
- You had to improvise an answer not covered by the skill
- A command or config option changed and the skill is outdated

### Review Format

Create a JSON file in `.vscode/skill-reviews/skill-manager-guide/`:

```json
{
  "date": "2026-03-10",
  "author": "dev-name",
  "type": "improvement",
  "section": "Configuration",
  "suggestion": "Add documentation for the new `skillManager.autoSyncOnOpen` setting",
  "context": "User asked about auto-sync on workspace open, not covered in skill"
}
```

### Consolidation

When **5 or more reviews** accumulate:
1. Read all review files
2. Update SKILL.md with the improvements
3. Bump the version (patch for fixes, minor for new content)
4. Push via `Skills: Push Feedback`
