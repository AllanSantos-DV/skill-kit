---
threshold: 5
---

## Feedback Protocol — implementor

### When to Log

Log feedback when the implementor agent is used and:
- The agent started coding before confirming intent (WHY/WHAT FOR/FOR WHOM)
- A key decision was made without stating WHY
- An external fact was assumed without verification
- The task map was missing or incomplete for a non-trivial task
- The agent over-engineered or under-planned relative to task complexity

### Review Format

Create a JSON file in `.vscode/skill-reviews/implementor/`:

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
- Is the agent verifying external facts before building on them?
- Is the planning-to-implementation ratio appropriate?
- Are task maps being produced for non-trivial work?
