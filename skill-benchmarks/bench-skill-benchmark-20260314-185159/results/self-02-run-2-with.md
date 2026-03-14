# Rubric-Based Scoring: Retry Mechanism

Evaluating both outputs dimension-by-dimension against the stated rubric criteria, using a 0.0–1.0 scale.

---

## Correctness
**Criterion:** Implements exponential backoff with jitter

| Output | Score | Justification |
|--------|:-----:|---------------|
| A (with skill) | **0.75** | Implements `base_delay * (2 ** attempt) + random.uniform(0, 0.5)`. This is exponential backoff with additive jitter. Deducting 0.25 because the jitter component is small and fixed rather than proportional to the delay (full jitter would be `random.uniform(0, base_delay * 2**attempt)`). |
| B (without skill) | **0.0** | Uses `time.sleep(1)` — fixed 1-second delay with no backoff and no jitter. Completely fails this criterion. |

**Delta: +0.75**

## Completeness
**Criterion:** Covers timeout, 429, 5xx, and network errors

| Output | Score | Justification |
|--------|:-----:|---------------|
| A (with skill) | **0.50** | Explicitly catches `TimeoutError` (covers timeout) and `ConnectionError` (covers network errors). Missing: no HTTP status code handling for 429 or 5xx — the code only deals with exception types, not response codes. Covers 2 of 4 required categories. |
| B (without skill) | **0.25** | Catches bare `Exception` which is overly broad. While it technically intercepts all errors, it demonstrates no awareness of the specific error categories listed. It's a catch-all, not targeted coverage. Giving 0.25 rather than 0.0 because timeouts and network errors would be caught. |

**Delta: +0.25**

## Pattern Adherence
**Criterion:** Uses the decorator/wrapper pattern

| Output | Score | Justification |
|--------|:-----:|---------------|
| A (with skill) | **1.0** | Textbook decorator factory: `retry(max_retries, base_delay)` returns `decorator(func)` which returns `wrapper(*args, **kwargs)`. Supports `@retry()` syntax with configurable parameters. |
| B (without skill) | **0.0** | A standalone function `call_with_retry(func, retries)`. This is not a decorator — it requires wrapping at the call site rather than using `@` syntax at the definition. Does not satisfy the criterion. |

**Delta: +1.0**

## Edge Cases
**Criterion:** Handles max retries exceeded and non-retryable errors

| Output | Score | Justification |
|--------|:-----:|---------------|
| A (with skill) | **0.50** | Handles max retries: re-raises the original exception on the final attempt (`if attempt == max_retries - 1: raise`). Does NOT handle non-retryable errors — any `TimeoutError` or `ConnectionError` triggers retry regardless of whether it's retryable. A `ConnectionRefusedError` (non-transient) would be retried. |
| B (without skill) | **0.25** | Raises `Exception('All retries failed')` after exhaustion — loses the original exception chain. Catches everything indiscriminately, retrying `KeyError`, `ValueError`, etc. No non-retryable error handling. Partial credit for attempting max-retry handling. |

**Delta: +0.25**

---

## Aggregate

| Dimension | With Skill | Without Skill | Delta |
|-----------|:----------:|:-------------:|:-----:|
| correctness | 0.75 | 0.0 | +0.75 |
| completeness | 0.50 | 0.25 | +0.25 |
| pattern_adherence | 1.0 | 0.0 | +1.0 |
| edge_cases | 0.50 | 0.25 | +0.25 |
| **Average** | **0.6875** | **0.125** | **+0.5625** |

Key observation: pattern_adherence shows the largest delta (+1.0), which makes sense — the decorator pattern is a discrete skill that you either know or don't. Both outputs have shared weaknesses in completeness (neither handles HTTP status codes) and edge_cases (neither distinguishes retryable from non-retryable errors).
