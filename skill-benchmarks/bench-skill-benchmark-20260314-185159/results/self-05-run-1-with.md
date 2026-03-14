# Mixed Benchmark Results Analysis: Database Query Optimization Skill

## The Signal

| Dimension | Delta | Interpretation |
|-----------|:-----:|----------------|
| pattern_adherence | **+0.4** | Strong impact (> 0.3 threshold) |
| completeness | **-0.1** | Negative impact (< -0.1 threshold) — red flag |

This is a **classic over-prescription signal**: the skill teaches strong patterns effectively but narrows the agent's coverage in doing so.

## What +0.4 Pattern Adherence Means

The skill is *highly effective* at teaching database optimization patterns. Agents with the skill consistently:
- Apply the indexing strategies the skill teaches
- Follow the query plan analysis methodology
- Use the N+1 detection patterns
- Implement connection pooling as prescribed

A +0.4 delta is well into the "strong impact" range, meaning the skill's pattern guidance is clear, specific, and actionable. Agents adopt these patterns reliably.

## What -0.1 Completeness Means

This is concerning. The with-skill agent produces *less complete* outputs than the without-skill agent. Specifically, the skill is likely causing the agent to:

1. **Over-index on indexing and query plans** — the skill probably emphasizes these topics heavily, so the agent spends most of its output on indexes and EXPLAIN plans
2. **Under-cover connection pooling** — if the skill mentions this topic briefly, the agent may skip or barely address it
3. **Miss adjacent topics entirely** — the agent follows the skill's pattern guidance so closely that it doesn't explore related areas (e.g., caching strategy, read replica routing, query result pagination)

The agent without the skill, having no prescribed focus, distributes its attention more broadly — and incidentally covers more ground.

## Root Cause: Focus Asymmetry in the Skill

The most likely explanation is **uneven topic depth in the skill**:

```
Skill content distribution (probable):
  ████████████ Indexing strategies (dominant section)
  █████████    Query plan analysis (large section)
  ████         N+1 detection (medium section)
  ██           Connection pooling (brief mention)
```

If the skill dedicates 70% of its content to indexing and query plans, the agent mirrors that distribution in its output — producing excellent indexing guidance but barely touching connection pooling. The without-skill agent, lacking this focus bias, produces a more balanced (if shallower) treatment.

## Specific Recommendations

### 1. Rebalance Topic Coverage (Priority: Critical)

Audit the skill's content for word count per topic:
- If indexing strategies has 3x the content of connection pooling, that's the problem
- Add equal-depth sections for N+1 detection and connection pooling
- Target roughly equal depth for all 4 topics (doesn't need to be exact — within 2x is fine)

### 2. Add a Completeness Prompt (Priority: High)

Add a section to the skill:

> **Coverage checklist — always address all four pillars:**
> 1. ✅ Indexing: appropriate index types, composite index design, index maintenance
> 2. ✅ Query plans: EXPLAIN usage, seek vs. scan identification, join optimization
> 3. ✅ N+1: detection, eager loading, batch queries, query count monitoring
> 4. ✅ Connection pooling: pool sizing, connection lifecycle, idle timeout, health checks

This explicitly signals to the agent that all topics require coverage, counteracting the natural tendency to focus on the longest skill sections.

### 3. Don't Weaken Pattern Guidance (Priority: Important)

The +0.4 pattern adherence is valuable. The fix is to **add breadth without reducing depth** on patterns. Extend the pattern guidance to connection pooling and other under-covered topics rather than trimming the indexing section.

### 4. Consider Topic-Specific Edge Cases

The completeness gap may also mean the skill lacks edge cases for under-covered topics:
- Connection pooling: what happens under connection exhaustion? pool poisoning? cloud provider connection limits?
- N+1: N+1 in GraphQL resolvers? N+1 in ORM eager-loading that itself creates N+1?

Adding these would simultaneously improve completeness and edge_cases dimensions.

## Expected Post-Revision Results

| Dimension | Current | Target |
|-----------|:-------:|:------:|
| pattern_adherence | +0.4 | ≥ +0.3 (maintain) |
| completeness | -0.1 | ≥ +0.15 |
| correctness | (unknown) | monitor |
| edge_cases | (unknown) | monitor |

Re-benchmark after revision with the same task set to validate the improvement.
