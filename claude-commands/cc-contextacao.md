---
name: cc-contextacao
description: "**WORKFLOW SKILL** — Structured context analysis before acting. USE FOR: questioning assumptions, mapping dependencies, identifying blind spots, validating scope of any task or subject. Use to contextualize, question, analyze before implementing, review premises, prevent hallucination, structured assessment. DO NOT USE FOR: simple tasks where task-intent suffices, direct implementation, code review."
---
# Contextação — Structured Context Analysis

## Purpose

Before answering, implementing, or creating anything, this skill forces a critical and structured analysis of the context. The goal is to **surface what truly matters** before acting, avoiding shallow responses, incorrect assumptions, and blind spots.

## When to Use

- Before creating a skill, agent, or any complex artifact
- When the subject involves technologies, APIs, or patterns that may have changed
- When the task has multiple possible interpretations
- When the impact of a wrong decision is high
- Whenever the user asks to "contextualize", "question", or "analyze before acting"

## Procedure

### Phase 0 — Complexity Triage

First, classify the task using the objective criteria below. A single criterion from a level is enough to classify at that level:

| Level | Objective criteria | Depth |
|-------|-------------------|-------|
| **Simple** | • 1 technology involved • 0 external dependencies • Reversible outcome • 1 stakeholder | Phase 1 summarized (1 question per axis) + Phase 3 (questions only) + Phase 4 |
| **Medium** | • 2-3 technologies • 1+ external dependency • Multiple possible interpretations • Hard-to-reverse outcome | Phases 1-4 complete |
| **Complex** | • 4+ technologies • Domain with frequent updates (APIs, specs, compliance) • Multiple stakeholders • Production or user data impact | Phases 1-4 complete + mandatory use of questioning frameworks (see below) + good vs. bad analysis examples (see below) |

When in doubt, classify upward. Over-analyzing is better than under-analyzing.

#### Visual Triage Flow

```
START → How many technologies involved?
  │
  ├─ 1 tech, 0 deps, reversible, 1 stakeholder
  │   └─ ✅ SIMPLE → Phase 1 (1 question/axis) → Phase 3 → Phase 4
  │
  ├─ 2-3 techs, OR 1+ deps, OR ambiguous, OR hard to reverse
  │   └─ ⚠️ MEDIUM → Phases 1-4 complete
  │
  └─ 4+ techs, OR frequently-changing domain, OR multiple stakeholders, OR production data
      └─ 🔴 COMPLEX → Phases 1-4 + frameworks + examples consultation
```

### Phase 1 — Subject Decomposition

Break the subject/task into the following axes. For each axis, ask at least 2 critical questions (1 if triage = Simple):

#### 1.1 Assumptions — *"What am I treating as fact without evidence?"*
- What am I assuming to be true without verification?
- Do any of these assumptions depend on data that may be outdated?
- Which assumption, if wrong, invalidates the entire approach?

#### 1.2 Scope — *"What is in, out, and undefined?"*
- What is explicitly included?
- What is explicitly excluded?
- What is ambiguous and needs definition?

#### 1.3 Dependencies — *"What needs to exist or work for the solution to work?"*
- What technologies, services, or systems are involved?
- Does any dependency have versioning or update cycles that could affect the solution?
- Are there implicit dependencies that were not mentioned?

#### 1.4 Sources of Truth — *"Where does the knowledge come from and is it reliable?"*
- Is the required knowledge in my training data or does it need external consultation?
- Does the data involved change frequently? If so, when was my last reliable source?
- Is there official documentation that should be consulted before proceeding?
- **Active Research Gate**: For each factual claim identified in axes 1.1-1.3, ask: *Can I verify this right now using available tools?* If yes, **do it** — don't defer. Fetch the doc, search the repo, read the spec. A claim you CAN verify but DON'T is an unforced error.

#### 1.5 Failure Modes — *"How can this go wrong and what am I not seeing?"*
- What do I (LLM) probably **not know** about this subject?
- If this solution failed in production, what would be the most likely cause? (pre-mortem)
- Is there a "fast delivery" bias in my first response?

#### 1.6 Stakeholders and Impact — *"Who is affected and who decides?"*
- Who will be affected by the decision/delivery?
- Is there a conflict between what is fast and what is correct?
- Does the result need validation by someone before being applied?

> **Boundaries between axes**: Assumptions = what I assume. Sources of Truth = where my knowledge comes from. Failure Modes = consequences of errors. If a point fits multiple axes, place it in the axis where the **corrective action** is clearest.

### Phase 2 — Confidence Classification

> ⚠️ **Disclaimer**: The classification below is a **model estimate**, not a fact. LLMs tend to be overconfident — i.e., classifying as 🟢 what should be 🟡. Whenever the analysis informs high-impact decisions, the classification should be **validated by a human** before proceeding.

For each axis, classify your confidence level:

| Level | Meaning | Action |
|-------|---------|--------|
| 🟢 High | I have reliable, up-to-date data | Proceed |
| 🟡 Medium | I have partial or possibly outdated knowledge | **Research actively**: use available tools (fetch docs, search repos, read specs) to upgrade to 🟢. If tools exhausted and still 🟡, flag for human validation. |
| 🔴 Low | I lack sufficient data or know it's outdated | **Stop. Research actively** using every available tool before proceeding. Fetch official docs. Search repos. Read specs. Query APIs. Only after exhausting available research paths: escalate to human. Declaring "unknown" without research effort is a failure mode, not an answer. |

### Phase 3 — Action Plan

Based on the analysis, generate:

1. **Questions for the user** (MANDATORY) — list questions that need human answers before proceeding. Every analysis MUST generate at least 1 question. If there are no questions, the analysis was probably shallow.
2. **What can be answered now** — with high confidence
3. **What needs consultation** — specify where to look (docs, APIs, internal knowledge base). **If the source is reachable with available tools, consult it NOW** — don't list it as "needs consultation" when you can resolve it in this session.
4. **What needs human validation** — decisions the model should not make alone
5. **What should NOT be done** — actions that would be premature without more context

Structure the delivery using the output format from Phase 4.

### Phase 4 — Transparency

Always declare:
- Which assumptions were made and not verified
- The overall confidence level of the analysis
- What was left out and why

### Phase 5 — Feedback Loop

After delivering the analysis and the user acts on it, record the learning:

1. **Evaluate the outcome**: did the analysis get it right? Wrong? What was not anticipated?
2. **Record the learning**: note what happened, what was learned, and which axis was affected
3. **Capture real examples**: if the analysis was particularly good or bad, note it for future calibration

> Phase 5 is optional for Simple triage. Mandatory for Medium and Complex.

## Rules

- **NEVER** jump straight to the solution without going through Phases 1-3
- **NEVER** say "not necessary" without justifying with evidence
- **NEVER** classify all axes as 🟢 — if everything seems safe, question whether you're being overconfident
- **NEVER** declare something as unknown, non-existent, or unavailable when you have tools that could verify it — research first, declare after
- **ALWAYS** flag when your knowledge may be outdated
- **ALWAYS** generate at least 1 question for the user in Phase 3 (if there are no questions, the analysis was shallow)
- **ALWAYS** ask the user when ambiguity is high
- **ALWAYS** attempt active research (fetch, search, read) before classifying an axis as 🔴 — the tool exists to be used
- If the user asks for speed, flag the risks but respect the decision

## Quality Checklist (self-validation)

Before delivering the analysis, verify:

- [ ] At least 1 assumption that, if false, invalidates the entire approach?
- [ ] At least 1 axis classified as 🟡 or 🔴?
- [ ] At least 1 question for the user in Phase 3?
- [ ] Questions are context-specific (not generic)?
- [ ] Each risk has a concrete consequence (not just "could cause problems")?
- [ ] Explicitly declared what you don't know?
- [ ] For every 🟡/🔴 classification: did you attempt active research with available tools before accepting it?

If any item fails, refine the analysis before delivering. Consult the analysis examples below to calibrate.

## When the User Asks for Help

- **"Analyze this before I implement"** → Run the full procedure: Triage → Phase 1 (decomposition) → Phase 2 (confidence) → Phase 3 (action plan) → Phase 4 (transparency).
- **"Is this safe to proceed with?"** → Focus on Failure Modes (1.5) and Assumptions (1.1). Classify confidence. Flag what could go wrong and what hasn't been verified.
- **"What am I missing?"** → Emphasize blind spots: Dependencies (1.3), Sources of Truth (1.4), and Stakeholders (1.6). Generate targeted questions for the user.
- **"I need a quick sanity check"** → Use Simple triage: 1 question per axis in Phase 1, skip Phase 2, deliver Phase 3 questions + Phase 4 transparency.
- **"Review my assumptions about X"** → Focus on Assumptions (1.1) and Sources of Truth (1.4). For each assumption, classify confidence and attempt active verification with available tools.

## Companion Skills

- For **understanding intent before implementing** (WHY/WHAT FOR/FOR WHOM — lighter than full contextação): use **task-intent**
- For **persisting analysis across tasks** (externalizing decisions so they survive context compression): use **task-map**

When task-intent has already been applied, its Success Condition output (WHY/WHAT FOR/FOR WHOM) can be used directly — no need to re-derive it in Phase 1.6.


---

## References

# Analysis Examples — Good vs. Bad

Reference for distinguishing real context analysis from shallow analysis (compliance theater).

---

## Scenario: "Create a skill for automated deployment"

### ❌ BAD Analysis (theater)

#### Assumptions
| # | Assumed premise | Verified? | Risk if false |
|---|-----------------|-----------|---------------|
| 1 | The team needs automated deployment | No | Low |
| 2 | They use CI/CD | No | Medium |

**Why it's bad**: generic questions that could apply to any subject. Didn't question ANYTHING specific to the context. "Low risk" without justification. Filled the table to comply with the protocol.

---

### ✅ GOOD Analysis (real)

#### Assumptions
| # | Assumed premise | Verified? | Risk if false |
|---|-----------------|-----------|---------------|
| 1 | The problem is deployment itself, not configuration drift between environments | ❌ | **High** — if the real problem is config drift, the skill should be about environment standardization, not deployment |
| 2 | The team already has a working CI/CD pipeline and wants to automate the last stretch | ❌ | **High** — if they don't have CI/CD, a deployment skill is premature |
| 3 | The environments (dev/staging/prod) have infrastructure parity | ❌ | **Medium** — if they don't, automated deployment will fail in prod even if it works in dev |

**Why it's good**: questions whether the original request ("deployment") is really the problem. Identifies that the root cause may be something else (5 Whys). Each assumption has a justified risk with concrete consequences.

---

## Scenario: "I need an authentication API"

### ❌ BAD Analysis

> Dependencies: JWT, database, web framework.
> Confidence: 🟢 — I know authentication well.

**Why it's bad**: listed generic technologies without questioning context. "I know it well" is exactly the overconfidence that leads to errors. Didn't ask: OAuth2 or API Key? Multi-tenant? GDPR/LGPD compliance? Is there existing legacy authentication?

---

### ✅ GOOD Analysis

> **Assumptions**:
> - I'm assuming this is a new authentication system (greenfield), but it could be a legacy system migration — if so, the scope changes completely
> - I'm assuming JWT is acceptable, but if there's a requirement for instant session revocation, pure JWT doesn't meet the need
>
> **Knowledge**:
> | Knowledge | Source | Confidence | Action |
> |---|---|---|---|
> | OAuth2/OIDC standards | Training | 🟡 | Specs update — check latest RFC |
> | Compliance requirements (GDPR, SOC2) | Unknown | 🔴 | Ask user if there are regulatory requirements |
> | Existing infrastructure (API Gateway, IdP) | Unknown | 🔴 | Without this info, any architecture is a guess |

**Why it's good**: questions whether the obvious assumption (greenfield) is correct. Flags a concrete technical limitation (JWT vs. revocation). Classifies confidence with specific justification, not generic. Identifies that without knowing the current infrastructure, proposing architecture is guesswork.

---

## Signs of bad analysis (checklist)

- [ ] Tables filled with generic text that could apply to any subject
- [ ] All risks classified as "Low" or "Medium" without justification
- [ ] Confidence 🟢 everywhere without mentioning model limitations
- [ ] No questions asked to the user
- [ ] No assumption that, if false, would change the approach
- [ ] Zero mention of "I don't know" or "I need to consult"

## Signs of good analysis (checklist)

- [x] At least 1 assumption that, if false, invalidates the entire approach
- [x] At least 1 item classified as 🔴 (if everything is 🟢, it's probably overconfidence)
- [x] Context-specific questions, not generic ones
- [x] Explicit declaration of what the model doesn't know
- [x] Concrete consequences for each risk (not just "could cause problems")
- [x] Recommendation to stop or consult when confidence is low

---

## Real Cases

Examples captured from real usage of the skill. These progressively replace the hypothetical examples above as the skill is used.

_No real cases recorded yet._

<!-- Format per case:
### [DATE] — [SUBJECT] — ✅ Good / ❌ Bad
**Context**: [what was requested]
**What the analysis did well / poorly**: [detail]
**Relevant excerpt from the analysis**: [copy the part that exemplifies]
-->

# Questioning Frameworks

## 5 Whys

Ask "why?" 5 times to reach the root cause.

**Application in context analysis**: when the user asks for something, question the motivation until you find the real problem.

Example:
1. Why do we need a deployment skill? → Because deployment fails frequently
2. Why does deployment fail? → Because configs change between environments
3. Why do configs change? → Because there's no standardization
4. Why is there no standardization? → Because each dev configures manually
5. Why do they configure manually? → Because there's no template/automation

**Result**: the real skill should be about config standardization, not deployment.

---

## First Principles

Decompose the problem down to fundamental facts, discarding assumptions.

**Application in context analysis**: separate what is a **verifiable fact** from what is an **inherited assumption**.

Key questions:
- What do I know for certain (fact)?
- What am I assuming by convention?
- If I started from scratch, would I reach the same conclusion?

---

## Pre-mortem

Imagine the solution failed. Ask: **why did it fail?**

**Application in context analysis**: before creating/implementing, simulate failure scenarios.

Key questions:
- If this went wrong in production, what would be the most likely cause?
- What did I overlook that someone more experienced in the domain would catch?
- Which part of the solution is most fragile?

---

## MECE (Mutually Exclusive, Collectively Exhaustive)

Ensure the analysis covers everything without overlap.

**Application in context analysis**: when decomposing the subject into the 6 axes (assumptions, scope, dependencies, sources of truth, failure modes, stakeholders), each point should be in exactly one axis, and together they should cover 100% of the relevant context.

---

## Inversion

Instead of asking "how to do it right?", ask "how to guarantee it goes wrong?"

**Application in context analysis**: identify anti-patterns and pitfalls before proposing the solution.

Key questions:
- What would I do if I wanted this skill to fail?
- What's the fastest way to deliver something useless?
- What would a critical reviewer say about this approach?

# Retrospectives — Learning Staging

> **Cap**: maximum **5 entries**. When reaching 5, run the [distillation procedure](#distillation) before adding new ones.

## Entries (staging)

<!-- Format per entry:
### [DATE] — [SUBJECT]
**What happened**: [short description of what went right or wrong]
**Learning**: [concise rule that would prevent the error or replicate the success]
**Axis affected**: [Assumptions | Scope | Dependencies | Sources of Truth | Failure Modes | Stakeholders]
-->

_No entries yet. Entries will be added as the skill is used._

---

## Distillation

When staging reaches **5 entries**, execute:

### Step 1 — Synthesize

Read the 5 entries and generate at most **3 distilled rules**, answering:
- What pattern repeats across entries?
- What concise rule (1 sentence) would prevent the errors or replicate the successes?
- In which SKILL.md axis should this rule be added?

### Step 2 — Apply

For each distilled rule:
- If it's an **axis rule** (Assumptions, Scope, etc.): add as a bullet in the corresponding SKILL.md axis
- If it's a **general rule**: add to the "Rules" section of SKILL.md
- If it's a **real example** of good or bad analysis: add to `references/examples.md` under "Real Cases"

### Step 3 — Clean

After applying, **replace** the 5 staging entries with:

```
_Last distillation: [DATE]. [N] rules applied to SKILL.md. Staging cleared._
```

### Step 4 — Confirm with the user

**NEVER** apply distillation without user approval. Present the proposed rules and ask for confirmation before editing SKILL.md.

---

## Distillation History

_No distillation performed yet._