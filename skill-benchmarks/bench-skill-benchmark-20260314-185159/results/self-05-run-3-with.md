# Benchmark Interpretation: Database Query Optimization

## Delta Analysis

Applying the benchmark interpretation framework:

- **pattern_adherence +0.4** → Strong positive impact. Exceeds the 0.3 threshold by a significant margin. The skill's pattern guidance is clear and consistently applied by agents.
- **completeness -0.1** → At the negative impact threshold. The with-skill agent covers *fewer* aspects than the without-skill agent. This is a red flag that requires investigation.

## Diagnosis: The Over-Indexing Problem

The likely cause is **content imbalance** in the skill itself. The skill teaches four topics:

1. Indexing strategies
2. Query plan analysis
3. N+1 detection
4. Connection pooling

If the skill devotes substantially more content to indexing strategies and query plan analysis (combined ~70% of content), the agent mirrors this distribution. It produces excellent indexing and query plan guidance but under-serves N+1 detection and especially connection pooling.

**Evidence chain:**
- High pattern_adherence (+0.4) means the agent follows what's written closely
- Negative completeness (-0.1) means the agent's output has gaps
- The combination implies: the agent is faithfully reproducing the skill's own gaps

In contrast, the without-skill agent has no content bias. It distributes attention more evenly (if less precisely) across all database optimization concerns, resulting in broader but shallower coverage.

## The "Pattern Tunnel Vision" Effect

When an agent receives explicit pattern instructions, it shifts from exploratory mode to compliance mode:

```
Without skill: "What might help optimize this database?" → explores broadly
With skill: "Which taught patterns apply here?" → applies patterns specifically
```

This mode shift improves pattern quality but reduces coverage breadth. It's not that the skill teaches wrong things — it's that it teaches *some* things so well that others get crowded out.

## Actionable Recommendations

### 1. Audit Content Balance (Immediate)

Count the word/paragraph allocation per topic in the skill. If any topic gets < 20% of the coverage, it needs expansion. Target distribution:

| Topic | Current (estimate) | Target |
|-------|:---------:|:------:|
| Indexing strategies | ~35% | 25% |
| Query plan analysis | ~30% | 25% |
| N+1 detection | ~20% | 25% |
| Connection pooling | ~15% | 25% |

### 2. Add "Coverage Completeness" Meta-Instruction (Immediate)

At the end of the skill, add:

> **Completeness check:** When advising on database optimization, ensure your response addresses ALL of the following: indexing, query plan analysis, N+1 query prevention, and connection pooling. Adjust depth per context, but do not omit any pillar.

This gives the agent a "breadth signal" that counteracts the natural depth-focus of detailed pattern sections.

### 3. Add Connection Pooling Patterns (Short-term)

If connection pooling currently has 2 paragraphs while indexing has 10, add pattern-level guidance for:
- Pool size calculation heuristics
- Connection lifecycle management
- Idle timeout configuration
- Pool exhaustion detection and alerting
- Connection health checking patterns

Use the same instructional style as the indexing section — concrete patterns with do/don't examples.

### 4. Preserve Pattern Guidance (Guard Rail)

The +0.4 pattern_adherence is the skill's strength. When rebalancing content:
- **DO** add depth to under-covered topics
- **DON'T** trim existing indexing/query plan content
- **DO** use the same teaching pattern (concrete examples, do/don't pairs) for new content
- **DON'T** add vague "also consider..." statements — add patterns

### 5. Re-Benchmark (Validation)

After applying changes:
- Run same tasks with same rubrics
- Target: pattern_adherence ≥ +0.30, completeness ≥ +0.10
- If pattern_adherence drops below +0.25, the rebalancing went too far — restore pattern content

## Meta-Lesson

This result pattern (+pattern, -completeness) is a **skill design feedback signal**. Skills that teach narrow topics deeply will always risk this trade-off. The antidote is a coverage directive that explicitly tells the agent to address all topics — not just the ones best represented in the skill content.
