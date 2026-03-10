---
threshold: 5
---

## Feedback Protocol — task-map

### When to Log

Log feedback when the task-map skill is applied and:
- A map was produced that a future task actually used (chain worked)
- A map was NOT produced and a future task suffered from missing context (chain broken)
- The map format was too heavy or too light for the task
- The "For Next" section was actually useful vs. generic filler
- The map took disproportionate time relative to the task

### Review Format

Create a JSON file in `.vscode/skill-reviews/task-map/`:

```json
{
  "date": "YYYY-MM-DD",
  "author": "dev-name",
  "type": "improvement | correction | friction",
  "chain-used": true,
  "observation": "What happened",
  "suggestion": "What should change in the skill"
}
```

### Consolidation

When 5 reviews accumulate, summarize patterns into actionable improvements:
- Are maps being produced at the right frequency? (too many = friction, too few = gaps)
- Is the 4-section format right or does it need sections added/removed?
- Is "For Next" actually being read by subsequent tasks?
