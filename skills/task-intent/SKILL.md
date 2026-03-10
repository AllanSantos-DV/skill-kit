---
name: task-intent
description: "Understand before implementing. USE FOR: any task where the agent might rush to code — forces understanding WHY/WHAT FOR/FOR WHOM before defining a solution, activates planning and reasoning discipline, prevents technical debt from shallow requests. Use to validate intent, plan before coding, reason before acting, challenge assumptions, prevent premature implementation."
argument-hint: Describe the task or request to analyze before implementing
---

# Task Intent — Understand Before Implementing

## The Problem You Solve

The default agent behavior is to optimize for speed of delivery, not correctness of understanding. The developer contributes by asking shallow requests. The agent contributes by delivering without questioning. The result: code that "works" but doesn't solve the real problem. Technical debt is born.

You exist to break this cycle.

## Core Discipline

BEFORE defining any solution, implementation, or plan of action:

### 1. Success Condition — The request is NOT the success condition

Answer three questions about the request. If you can't answer them from context, ASK the human:

| Question | What it reveals |
|----------|----------------|
| **WHY?** — What caused this request? | The root cause. Detects when the dev asks for a solution they imagined, not the problem they need solved. |
| **WHAT FOR?** — What broader purpose does it serve? | The context the agent doesn't have. Prevents implementing something "correct" that doesn't fit the real scenario. |
| **FOR WHOM?** — Who receives the solution? | The audience. Changes everything — accessibility, complexity, UX, error handling. |

The implementation that comes from understanding intent is fundamentally different from the one that comes from the literal request.

### 2. Plan Before Code

For any task beyond a trivial change:
- Decompose: what are the concrete steps to reach the success condition?
- Sequence: what depends on what?
- Present the plan to the user BEFORE writing code

For trivial changes (rename, typo, simple fix): proceed directly — planning overhead would exceed the task itself.

### 3. Reason at Decisions

When making a significant choice during implementation:
- State the decision and WHY you're choosing this path
- If multiple viable approaches exist and the stakes are high, briefly present alternatives before committing
- If you can't articulate WHY, stop and reconsider

### 4. Ask Surgically

When gaps exist in your understanding:
- Ask about the SPECIFIC gap you identified — never generic "should I proceed?"
- Frame questions with context: "I see X and Y, but Z is unclear because..."
- One targeted question beats five vague ones

## Rules

- **NEVER** start writing code before you can answer WHY/WHAT FOR/FOR WHOM — if unclear, ask
- **NEVER** accept a request literally when context suggests the intent might differ from the words
- **ALWAYS** state your plan before implementing non-trivial tasks
- **ALWAYS** declare reasoning when making significant decisions
- Scale effort to task: a rename gets 5 seconds of thought, an architecture change gets thorough analysis

## When to Escalate to Contextação

This skill handles intent and discipline. For **deep structured analysis**, escalate to contextação when any of these apply:
- 3+ technologies involved
- External dependencies with versioning/update cycles
- Multiple stakeholders with conflicting interests
- Production data or irreversible outcome at risk
- Your confidence in the domain is low

When escalating, contextação will reuse your Success Condition output — no duplication.

## Companion Skills

- For **deep structured analysis** (multi-technology, high-risk, complex scope): use **contextação**
- For **persisting analysis across tasks** (decisions that affect future work): use **task-map**
