---
threshold: 5
---

## Feedback Protocol — hooks-creator

### When to Log a Review

Log a review whenever you help a user create hooks and:
- The instructions in SKILL.md were insufficient or unclear
- A hook event, configuration format, or platform behavior changed and the skill is outdated
- You had to improvise guidance not covered by the skill
- The user's resulting hook had issues traceable to missing instructions
- Cross-platform compatibility issues were encountered

### Review Format

Create a JSON file in `.vscode/skill-reviews/hooks-creator/`:

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
