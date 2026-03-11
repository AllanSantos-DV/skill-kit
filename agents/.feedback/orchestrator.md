---
threshold: 5
---

## Feedback Protocol — orchestrator

### When to Log

Log feedback when the orchestrator agent is used and:
- A handoff to the wrong sub-agent caused wasted work
- The orchestrator failed to detect when research was needed before implementation
- Task decomposition missed a dependency or sequencing issue
- The orchestrator added unnecessary overhead for a simple task

### Review Format

Create a JSON file in `.vscode/skill-reviews/orchestrator/`:

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
- Are handoff decisions accurate?
- Is the orchestrator scaling effort to task complexity?
- Are sub-agent results being validated before proceeding?
