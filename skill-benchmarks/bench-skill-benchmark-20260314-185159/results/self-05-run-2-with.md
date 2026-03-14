# Analysis: Database Query Optimization — Mixed Benchmark Results

## Signal Interpretation

Using the standard delta interpretation scale:

| Dimension | Delta | Category |
|-----------|:-----:|----------|
| pattern_adherence | +0.4 | **Strong positive impact** (threshold: > 0.3) |
| completeness | -0.1 | **Negative impact** (threshold: < -0.1) |

This combination is the **"strong pattern, narrow vision" anti-pattern** — the skill teaches patterns so well that it restricts the agent's scope of thinking.

## Why Pattern Adherence is High (+0.4)

The skill's core teachings are being absorbed effectively:
- **Indexing strategies** → agents apply appropriate index types and design composite indexes correctly
- **Query plan analysis** → agents use EXPLAIN and identify scan vs. seek operations
- **N+1 detection** → agents identify and fix N+1 query patterns
- **Connection pooling** → agents implement pool patterns (if mentioned)

The +0.4 delta indicates the skill's technical content is well-written and actionable. This is a strong foundation to build on.

## Why Completeness is Negative (-0.1)

The with-skill agent produces **less comprehensive** outputs. Three likely mechanisms:

### 1. Uneven Content Depth
The skill probably gives disproportionate coverage to some topics. If indexing gets 40% of content and connection pooling gets 10%, the agent mirrors this imbalance.

### 2. Pattern Tunnel Vision
When the agent receives strong pattern guidance, it enters "pattern matching" mode — applying taught patterns rather than thinking holistically. It answers "which patterns apply?" instead of "what does this system need?"

### 3. Missing Coverage Signal
The skill doesn't explicitly tell the agent to address ALL topics. Without that meta-instruction, the agent optimizes for depth on familiar patterns rather than breadth across all areas.

## The Trade-off

```
                    Pattern Adherence
                         ↑ (+0.4)
                         │
  Over-prescribed ───────┼─────── Sweet spot
  (current state)        │
                         │
    ─────────────────────┼─────────── Completeness
                    (-0.1)            (+target)
```

The skill is in the "over-prescribed" quadrant. The goal is to move to the "sweet spot" — maintaining pattern quality while adding coverage breadth.

## Recommendations

### Critical: Add topic coverage directive

Insert at the top of the skill:

> When advising on database query optimization, always address all four pillars:
> 1. Indexing strategies
> 2. Query plan analysis
> 3. N+1 detection and prevention
> 4. Connection pooling and management
>
> Do not over-weight any single topic at the expense of others.

This counteracts the focus bias without diluting pattern quality.

### Important: Balance section lengths

If the skill has 500 words on indexing and 100 on connection pooling, expand connection pooling to at least 300 words with the same pattern specificity.

### Preserve: Pattern guidance style

The +0.4 on pattern_adherence proves the skill's pattern teaching works. Don't restructure this content — extend the same teaching style to under-covered topics.

### Future: Re-benchmark

After changes, run the same benchmark tasks. Target:
- pattern_adherence: ≥ +0.3 (slight decrease acceptable for breadth)
- completeness: ≥ +0.10 (flipped from negative to positive)
