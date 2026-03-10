---
threshold: 5
---

## Feedback Protocol — skill-creator

### When to Log a Review

Log a review whenever you help a user create a skill and:
- The instructions in SKILL.md were insufficient or unclear
- A frontmatter field or convention changed and the skill is outdated
- You had to improvise guidance not covered by the skill
- The user's resulting skill had issues traceable to missing instructions

### Review Format

Create a JSON file in `.vscode/skill-reviews/skill-creator/`:

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
