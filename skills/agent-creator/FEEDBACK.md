---
threshold: 5
---

## Feedback Protocol — agent-creator

### When to Log a Review

Log a review whenever you help a user create an agent and:
- The instructions in SKILL.md were insufficient or unclear
- A frontmatter field, tool set, or convention changed and the skill is outdated
- You had to improvise guidance not covered by the skill
- The user's resulting agent had issues traceable to missing instructions

### Review Format

Create a JSON file in `.vscode/skill-reviews/agent-creator/`:

```json
{
  "date": "YYYY-MM-DD",
  "author": "dev-name",
  "type": "improvement | correction | addition",
  "section": "Section Name",
  "suggestion": "What should change",
  "context": "What prompted this feedback"
}
```

### Consolidation

When 5 reviews accumulate, summarize them into a single actionable
improvement for the skill maintainer.
