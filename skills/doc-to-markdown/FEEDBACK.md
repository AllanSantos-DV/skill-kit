---
threshold: 5
---

## Feedback Protocol — doc-to-markdown

### When to Log a Review

Log a review whenever you help a user convert documents and:
- markitdown produced poor output for a supported format
- A fallback tool was needed but not documented in the skill
- The format → tool mapping table was inaccurate or missing an entry
- The batch conversion script failed for a specific edge case
- A new version of markitdown added or changed format support
- The troubleshooting guide didn't cover an encountered issue

### Review Format

Create a JSON file in `.vscode/skill-reviews/doc-to-markdown/`:

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
improvement for the skill maintainer. Focus on:
- Are the tool recommendations still accurate?
- Has markitdown's format support changed?
- Are there new tools that should replace current fallbacks?
