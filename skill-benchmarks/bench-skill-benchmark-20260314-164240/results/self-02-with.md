# Scoring: Retry Mechanism Outputs

## Scoring Methodology

I'll score each output against the rubric criteria independently, then compare. Scores are on a 0.0–1.0 scale following the standard: 0.0 = completely fails, 0.25 = barely addresses, 0.5 = partially meets, 0.75 = mostly meets with minor gaps, 1.0 = fully satisfies.

---

## Output A (with skill) — Scores

### correctness: **0.75**
*Criterion: Implements exponential backoff with jitter*

Output A implements exponential backoff: `base_delay * (2 ** attempt)` and adds jitter with `random.uniform(0, 0.5)`. The backoff formula is correct. However, the jitter range is fixed (0–0.5s) rather than proportional to the delay, which is a minor deviation from ideal full-jitter implementations. The core criterion is met with a minor gap.

### completeness: **0.5**
*Criterion: Covers timeout, 429, 5xx, and network errors*

Output A catches `TimeoutError` and `ConnectionError`, which covers timeout and network errors. However, it does NOT handle HTTP 429 (Too Many Requests) or 5xx status codes — these would require checking the response status code, not just catching exceptions. The function only catches Python exceptions, not HTTP-level error responses. This is a significant gap: 2 of 4 required error types are missing.

### pattern_adherence: **1.0**
*Criterion: Uses the decorator/wrapper pattern*

Output A uses a clean decorator pattern with `@retry(max_retries=3, base_delay=1.0)`. It's a proper three-level nested function (decorator factory → decorator → wrapper). This fully satisfies the criterion.

### edge_cases: **0.5**
*Criterion: Handles max retries exceeded and non-retryable errors*

Max retries exceeded: When `attempt == max_retries - 1`, it re-raises the last exception. This is correct — the caller gets a meaningful error. However, non-retryable errors are NOT handled: the `except` clause only catches `TimeoutError` and `ConnectionError`, which means non-retryable errors (like `ValueError`, `TypeError`, or HTTP 400) would propagate immediately — but this is accidental rather than intentional design. There's no explicit distinction between retryable and non-retryable errors. Partially meets.

### Output A Total: **0.6875** (avg)

---

## Output B (without skill) — Scores

### correctness: **0.25**
*Criterion: Implements exponential backoff with jitter*

Output B uses `time.sleep(1)` — a fixed 1-second delay with no backoff and no jitter. This completely fails the exponential backoff criterion. The only reason it's not 0.0 is that it does implement a retry loop (basic retry exists, just not with the specified algorithm).

### completeness: **0.25**
*Criterion: Covers timeout, 429, 5xx, and network errors*

Output B catches bare `Exception`, which technically catches everything — but this is a design flaw, not a feature. It doesn't differentiate between error types at all. There's no handling of HTTP status codes (429, 5xx). It catches everything indiscriminately, which means it retries non-retryable errors too. Barely addresses the criterion through over-broad catching.

### pattern_adherence: **0.25**
*Criterion: Uses the decorator/wrapper pattern*

Output B is a standalone function `call_with_retry(func, retries=3)` that takes a callable. This is NOT the decorator/wrapper pattern — it's a direct invocation helper. The caller must wrap their call as `call_with_retry(lambda: api_call())` rather than decorating. Barely addresses: it's a wrapper of sorts, but not the specified pattern.

### edge_cases: **0.25**
*Criterion: Handles max retries exceeded and non-retryable errors*

Max retries exceeded: raises a generic `Exception('All retries failed')`, which discards the original error information. This is worse than Output A's approach. Non-retryable errors: catches bare `Exception`, so it retries EVERYTHING including non-retryable errors like `KeyError` or `TypeError`. This is actively wrong — it delays failure rather than failing fast. Barely addresses.

### Output B Total: **0.25** (avg)

---

## Comparative Summary

| Dimension | Output A (with) | Output B (without) | Delta |
|-----------|:---------------:|:------------------:|:-----:|
| correctness | 0.75 | 0.25 | +0.50 |
| completeness | 0.50 | 0.25 | +0.25 |
| pattern_adherence | 1.00 | 0.25 | +0.75 |
| edge_cases | 0.50 | 0.25 | +0.25 |
| **Average** | **0.6875** | **0.25** | **+0.4375** |

Output A is clearly stronger, particularly in pattern_adherence (decorator pattern used correctly) and correctness (exponential backoff + jitter implemented). However, Output A still has gaps in completeness (missing HTTP status code handling) and edge_cases (no explicit retryable vs. non-retryable distinction).
