# scores.json Analysis: api-error-handling Skill

## Overall Assessment

The api-error-handling skill shows **moderate overall impact** with an average delta of +0.18 and a 60% win rate. This is below the 70% win rate threshold that indicates a reliably effective skill. The results are mixed — the skill has clear strengths in some areas but a concerning weakness in others.

## Dimension-by-Dimension Analysis

### Pattern Adherence: δ = +0.45 (Strong Impact ✅)

This is the skill's strongest dimension. A +0.45 delta is well above the 0.3 threshold for "strong impact." The skill is highly effective at teaching specific error handling patterns — agents with the skill produce code that follows established patterns (structured error types, consistent error propagation, standardized response formats) much more consistently than agents without it.

**Interpretation:** The skill's pattern instructions are clear, specific, and actionable.

### Correctness: δ = +0.30 (Strong Impact ✅)

Right at the strong impact threshold. The with-skill variant (0.85) produces technically correct error handling substantially more often than the without-skill variant (0.55). This suggests the skill teaches fundamentally sound approaches — agents without it make errors in error handling logic roughly half the time.

**Interpretation:** The skill improves technical accuracy significantly. The 0.55 baseline without skill suggests error handling is a genuine knowledge gap for unaugmented agents.

### Completeness: δ = +0.10 (Moderate Impact ⚠️)

Barely above the "no significant impact" boundary. Both variants score in the 0.60–0.70 range, meaning neither covers all relevant aspects comprehensively. The skill adds marginal completeness improvement.

**Interpretation:** The skill teaches correct patterns but doesn't push agents to be thorough in coverage. Agents with the skill handle the cases they handle well, but still miss some error scenarios.

### Edge Cases: δ = -0.10 (Negative Impact 🚩)

**Red flag.** The without-skill variant (0.50) actually outperforms the with-skill variant (0.40) on edge cases. This is a concerning negative delta that suggests the skill may be *narrowing* the agent's focus. When the agent follows the skill's prescribed patterns, it may become less exploratory about edge cases and error boundaries.

**Interpretation:** The skill's strong pattern guidance may create "tunnel vision" — the agent follows the patterns so closely that it stops thinking about unusual scenarios the patterns don't explicitly cover.

## Cross-Dimension Analysis

There's a characteristic pattern here: **high pattern_adherence (+0.45) paired with negative edge_cases (-0.10)**. This is the "over-prescription" anti-pattern — the skill teaches strong patterns so effectively that it reduces creative thinking about edge cases.

The combination of strong correctness (+0.30) with weak completeness (+0.10) reinforces this: the agent does the right thing *for the cases it handles*, but handles fewer total cases.

## Win Rate: 60%

At 60%, the skill wins 3 out of 5 tasks. This is below the 70% threshold for a "good" skill, which means the skill's benefit is inconsistent across task types.

## Recommendations

### 1. Add Edge Case Coverage (Priority: High)

The negative edge_cases delta is the most actionable finding. The skill should explicitly add:
- A section on "Common edge cases in error handling" with specific examples
- Guidance on testing error boundaries (what happens at limits?)
- A checklist: "After implementing the pattern, verify these edge cases: [list]"

### 2. Improve Completeness Guidance (Priority: Medium)

The skill teaches *how* to handle errors correctly but not *which errors to handle*. Add:
- A systematic error enumeration approach (e.g., "for each external call, consider: network failure, timeout, rate limit, auth failure, malformed response")
- Coverage checklists per integration type

### 3. Preserve Pattern Strength (Priority: Low — Don't Regress)

The +0.45 pattern_adherence is excellent. When adding edge case content, frame it as "extensions to the core patterns" rather than creating new patterns. Don't dilute the strong pattern teaching.

### 4. Re-benchmark After Changes

After updating the skill with edge case content:
- Expect edge_cases delta to improve to at least +0.10
- Watch that pattern_adherence doesn't drop below +0.30
- Target overall win rate ≥ 70%
