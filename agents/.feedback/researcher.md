---
threshold: 5
---

## Feedback Protocol — researcher

### When to Log

Log feedback when the researcher agent is used and:
- Research was too shallow and missed critical context
- Research was too broad, producing noise without actionable findings
- The agent made claims without citing sources or verifying facts
- Tool restrictions prevented gathering necessary information
- The structured output was unclear or missing key sections

### Review Format

Create a JSON file in `.vscode/skill-reviews/researcher/`:

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
- Is research depth calibrated to task complexity?
- Are sources being cited and facts verified?
- Is the output format useful for downstream agents?
