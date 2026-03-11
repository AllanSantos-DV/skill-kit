---
threshold: 5
---

## Feedback Protocol — validator

### When to Log

Log feedback when the validator agent is used and:
- Validation missed a real issue that was caught later
- Validation flagged a false positive that wasted time
- The agent couldn't verify a claim due to tool restrictions
- The validation checklist was incomplete for the scenario
- The agent approved work that didn't meet the stated success criteria

### Review Format

Create a JSON file in `.vscode/skill-reviews/validator/`:

```json
{
  "date": "YYYY-MM-DD",
  "author": "dev-name",
  "type": "improvement | correction | friction",
  "impact": "high | medium | low",
  "observation": "What happened",
  "suggestion": "What should change in the agent"
}
```

### Consolidation

When 5 reviews accumulate, summarize patterns into actionable improvements:
- Is the validation catching real issues without false positives?
- Are tool restrictions limiting verification ability?
- Is the pass/fail criteria clear and measurable?
