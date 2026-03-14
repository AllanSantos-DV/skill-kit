# api-error-handling: Benchmark Results Interpretation

## Executive Summary

This skill achieves a +0.18 average delta and 60% win rate — **moderate but inconsistent impact**. It excels at teaching error handling patterns but has a critical weakness: it actually reduces edge case handling quality.

## Dimension Analysis using Delta Thresholds

| Dimension | Delta | Category | Signal |
|-----------|:-----:|----------|--------|
| pattern_adherence | +0.45 | **Strong impact** (> 0.3) | The skill's best result. Agents produce consistently structured, well-organized error handling. |
| correctness | +0.30 | **Strong impact** (= 0.3) | At the threshold. Agents make fewer technical errors with the skill. Baseline without-skill (0.55) confirms error handling is genuinely tricky. |
| completeness | +0.10 | **Marginal** (0.1–0.3 boundary) | Barely registers. The skill doesn't drive comprehensive error coverage. |
| edge_cases | -0.10 | **Negative impact** (< -0.1) | 🚩 Red flag. The skill *hurts* edge case handling. |

## Root Cause Analysis

The **high pattern_adherence / low edge_cases** combination reveals a common skill failure mode: **over-prescription**.

When the skill provides strong, clear patterns, agents follow them closely — which improves correctness and adherence. But the same focus narrows their thinking. Instead of asking "what could go wrong here?", they ask "which pattern applies here?" — and stop at the pattern's boundary.

Supporting evidence:
- **with-skill correctness (0.85)** vs **with-skill edge_cases (0.40)**: the agent handles the "expected" cases well but the "unexpected" poorly
- **without-skill edge_cases (0.50)**: without pattern guidance, agents actually explore more broadly

## The Completeness Gap

Both variants score 0.60–0.70 on completeness, meaning neither systematically enumerates error categories. The skill teaches *how* to handle errors but not *what* to handle. Adding an error taxonomy or enumeration checklist would address this.

## Specific Skill Improvements

### Priority 1: Edge Case Recovery (Target: δ ≥ +0.15)

Add after each pattern section:

> **Edge cases to verify:**
> - What if the error is intermittent? (retry once, then fail)
> - What if the error message is empty or malformed?
> - What if the error occurs during cleanup/rollback itself?
> - What if multiple errors occur simultaneously?

This preserves the pattern while explicitly expanding the agent's thinking horizon.

### Priority 2: Error Enumeration (Target: completeness δ ≥ +0.20)

Add a "systematic error discovery" section:

> For each external dependency, enumerate: network failure, timeout, authentication failure, authorization failure, rate limiting, malformed response, partial success, service unavailable, version mismatch.

### Priority 3: Maintain Pattern Strength (Target: pattern_adherence δ ≥ +0.35)

The +0.45 is the skill's primary value. When adding edge case and completeness content, frame as supplements: "After applying Pattern X, verify these edge cases" — not "Instead of Pattern X, consider..."

## Post-Revision Target

| Metric | Current | Target |
|--------|:-------:|:------:|
| avg_delta | +0.18 | +0.25 |
| win_rate | 60% | ≥ 70% |
| edge_cases δ | -0.10 | ≥ +0.10 |
| completeness δ | +0.10 | ≥ +0.20 |
| pattern_adherence δ | +0.45 | ≥ +0.35 (maintain) |
