# Scoring: Retry Mechanism A/B Comparison

## Approach

Scoring each output against the 4 rubric dimensions independently on a 0.0–1.0 scale. I will reference the exact rubric criteria and justify deductions.

---

### 1. Correctness (Implements exponential backoff with jitter)

**Output A: 0.75**
- Implements exponential backoff: `base_delay * (2 ** attempt)` ✅
- Includes jitter: `+ random.uniform(0, 0.5)` ✅
- Minor issue: jitter range is constant (0–0.5) instead of scaling with the delay. For attempt 0, jitter is up to 50% of the delay (good). For attempt 2, jitter is only ~6% of the 4s delay (bad). This means correlation between retrying clients increases as retries continue, partially undermining the purpose of jitter.
- Score: 0.75 (correct structure, imperfect jitter scaling)

**Output B: 0.25**
- Uses `time.sleep(1)` — constant delay, no backoff, no jitter
- Fails the criterion almost entirely
- Giving 0.25 instead of 0.0 because it does implement retry with a delay — just not the right kind
- Score: 0.25

### 2. Completeness (Covers timeout, 429, 5xx, and network errors)

**Output A: 0.50**
- `TimeoutError` ✅ — handles timeout
- `ConnectionError` ✅ — handles network errors (base class for `ConnectionRefusedError`, `ConnectionResetError`)
- HTTP 429 ❌ — not handled (would need response status code checking)
- HTTP 5xx ❌ — not handled
- Score: 0.50 (2 of 4 error categories covered)

**Output B: 0.25**
- Catches `Exception` — this is a catch-all, not selective coverage
- Technically catches timeouts and connection errors, but also catches `SyntaxError`, `TypeError`, etc.
- No HTTP status code awareness at all
- Score: 0.25 (accidental coverage via overly broad catch, but no intentional handling of any category)

### 3. Pattern Adherence (Uses the decorator/wrapper pattern)

**Output A: 1.0**
- Three-layer decorator factory: `retry()` → `decorator(func)` → `wrapper(*args, **kwargs)`
- Supports `@retry(max_retries=3)` syntax
- Properly forwards `*args, **kwargs` to the wrapped function
- Only gap: missing `@functools.wraps(func)` which preserves function metadata — cosmetic, not structural
- Score: 1.0

**Output B: 0.25**
- Plain function `call_with_retry(func, retries=3)`
- Does NOT use decorator pattern — must be called as `call_with_retry(my_func, 3)`
- Function signature only accepts `func()` with no arguments (no `*args/**kwargs` forwarding)
- Giving 0.25 because it does wrap the function call in a loop, which is the conceptual essence of wrapping, even if not the decorator pattern
- Score: 0.25

### 4. Edge Cases (Handles max retries exceeded and non-retryable errors)

**Output A: 0.50**
- Max retries exceeded: Re-raises original exception on final attempt ✅
- Non-retryable errors: Does NOT distinguish — `TimeoutError` subclasses that are non-retryable would still be retried ❌
- Missing: no logging or callback for retry events
- Score: 0.50

**Output B: 0.25**
- Max retries exceeded: Raises `Exception('All retries failed')` — loses original exception ⚠️
- Non-retryable errors: Zero handling — retries everything ❌
- The generic error message makes debugging harder in production
- Score: 0.25

---

## Final Scores

| Dimension | Output A | Output B | Delta |
|-----------|:--------:|:--------:|:-----:|
| correctness | 0.75 | 0.25 | +0.50 |
| completeness | 0.50 | 0.25 | +0.25 |
| pattern_adherence | 1.0 | 0.25 | +0.75 |
| edge_cases | 0.50 | 0.25 | +0.25 |
| **Average** | **0.6875** | **0.25** | **+0.4375** |

Notable: Both outputs share a ceiling problem in completeness — neither handles HTTP response codes. The skill evidently teaches good patterns and error handling but hasn't equipped the agent to handle response-level failures (429/5xx). The highest delta is in pattern_adherence, which is an all-or-nothing criterion (decorator pattern).
