---
threshold: 5
---

## Feedback Protocol — markdown-to-document

### When to Log a Review

Log a review whenever you help a user generate documents and:
- A template injection failed or produced incorrect output
- The JSON intermediate schema was insufficient for the user's needs
- A runtime dependency (Java, LibreOffice) wasn't detected correctly
- The user's template format wasn't supported
- A new tool or approach should be added
- Default generation (no template) produced poor quality output
- A script failed for a specific edge case or platform

### Review Format

Create a JSON file in `.vscode/skill-reviews/markdown-to-document/`:

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

When 5 reviews accumulate, summarize into actionable improvements:
- Are template injection patterns working reliably?
- Are the JSON schemas covering real-world use cases?
- Are runtime dependencies being detected on all platforms?
- Are new template formats needed?
- Are the scripts handling edge cases correctly?
