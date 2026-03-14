# Benchmark Interpretation: api-error-handling

## Summary: Moderate Impact, Mixed Signals

| Metric | Value | Assessment |
|--------|-------|------------|
| Average delta | +0.18 | Moderate — above 0.1 threshold but below 0.3 |
| Win rate | 60% | Below the 70% benchmark for a "good" skill |
| Strongest dim | pattern_adherence (+0.45) | Strong impact (> 0.3 threshold) |
| Weakest dim | edge_cases (-0.10) | ⚠️ Negative impact — red flag |

## Dimension Breakdown

### ✅ Pattern Adherence (+0.45) — Strong Impact

The skill's most effective dimension. With +0.45, this is well into the "strong impact" range (> 0.3). The skill excels at establishing consistent error handling patterns. Agents follow structured approaches to error propagation, typing, and response formatting.

Absolute scores: **with = 0.80**, **without = 0.35**. The 0.35 without-skill score confirms that error handling patterns are genuinely hard for unguided agents — this is where the skill provides the most value.

### ✅ Correctness (+0.30) — Strong Impact (Threshold)

At exactly +0.30, this is at the boundary of strong impact. The skill pushes agents from mediocre (0.55) to good (0.85) technical correctness. The 0.55 without-skill baseline suggests agents frequently make mistakes in error handling logic — wrong error codes, incorrect exception hierarchies, missing error propagation.

### ⚠️ Completeness (+0.10) — Marginal Impact

Barely above the noise floor. Both variants produce moderately complete outputs (0.60–0.70), meaning the skill doesn't significantly help agents think about *which* errors to handle. The skill teaches how to handle errors well, but not comprehensively.

### 🚩 Edge Cases (-0.10) — Negative Impact

The most concerning finding. The skill reduces edge case coverage: **with = 0.40**, **without = 0.50**. Agents guided by the skill become *worse* at handling edge cases.

Likely cause: the skill establishes such strong patterns that agents follow them rigidly, losing the "what if?" exploration mindset that finds edge cases. This is the "strong pattern, narrow vision" anti-pattern.

## Cross-Dimension Insight

The pattern is clear:

```
pattern_adherence ↑↑  + edge_cases ↓   = over-prescription
correctness ↑↑        + completeness →  = focused but narrow
```

The skill teaches a **narrow band of high-quality patterns** but doesn't encourage comprehensive thinking. It's like a recipe that produces perfect dishes but only teaches 3 recipes.

## Actionable Recommendations

1. **Add edge case sections** to the skill with explicit lists of edge cases per error category. Don't restructure the existing pattern guidance — extend it with "after applying this pattern, check for these edge cases: [...]"

2. **Add a completeness checklist**: "For each external dependency, enumerate: timeout, rate limit, auth failure, network partition, malformed response, partial success." This addresses the +0.10 completeness without disrupting patterns.

3. **Do NOT weaken pattern guidance**. The +0.45 pattern_adherence is the skill's crown jewel. New content should complement, not compete with, existing pattern instructions.

4. **Target after revision**: edge_cases delta ≥ +0.10, completeness delta ≥ +0.20, overall win rate ≥ 70%. Re-run benchmark with same tasks to measure improvement.
