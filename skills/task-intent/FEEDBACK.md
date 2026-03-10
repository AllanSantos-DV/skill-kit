---
threshold: 5
---

## Feedback Protocol — task-intent

### When to Log

Log feedback when the task-intent skill is applied and:
- The Success Condition questions (WHY/WHAT FOR/FOR WHOM) revealed a misunderstanding that would have led to wrong implementation
- The planning step caught a missing dependency or wrong sequence
- The skill added friction without adding value (over-analysis on a simple task)
- The agent still rushed to implementation despite the skill being active
- A question to the user was too generic or missed the actual gap

### Review Format

Create a JSON file in `.vscode/skill-reviews/task-intent/`:

```json
{
  "date": "YYYY-MM-DD",
  "author": "dev-name",
  "type": "improvement | correction | friction",
  "impact": "high | medium | low",
  "observation": "What happened",
  "suggestion": "What should change in the skill"
}
```

### Consolidation

When 5 reviews accumulate, summarize patterns into actionable improvements:
- Which question (WHY/WHAT FOR/FOR WHOM) is most often the one that catches real issues?
- Is the skill activating too aggressively on simple tasks?
- Are the planning/reasoning triggers clear enough?
