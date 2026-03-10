---
threshold: 5
---

## Feedback Protocol — contextacao

### When to Log a Review

Log a review whenever you use the contextação skill and:
- The analysis framework missed an important axis or question
- A phase was unclear or produced shallow results
- The output template was insufficient for the scenario
- The triagem miscategorized complexity

### Review Format

Create a JSON file in `.vscode/skill-reviews/contextacao/`:

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
