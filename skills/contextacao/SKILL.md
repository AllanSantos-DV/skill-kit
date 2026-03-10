---
name: contextacao
description: "Structured context analysis before acting. USE FOR: questioning assumptions, mapping dependencies, identifying blind spots, validating scope of any task or subject. Use to contextualize, question, analyze before implementing, review premises, prevent hallucination, structured assessment."
argument-hint: Describe the subject or task that needs context analysis
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
| **Complex** | • 4+ technologies • Domain with frequent updates (APIs, specs, compliance) • Multiple stakeholders • Production or user data impact | Phases 1-4 complete + mandatory consultation of [frameworks](./references/frameworks.md) + [good vs. bad analysis examples](./references/examples.md) |

When in doubt, classify upward. Over-analyzing is better than under-analyzing.

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
| 🟡 Medium | I have partial or possibly outdated knowledge | Flag and seek validation |
| 🔴 Low | I lack sufficient data or know it's outdated | Stop and seek external source (RAG/docs/human) |

### Phase 3 — Action Plan

Based on the analysis, generate:

1. **Questions for the user** (MANDATORY) — list questions that need human answers before proceeding. Every analysis MUST generate at least 1 question. If there are no questions, the analysis was probably shallow.
2. **What can be answered now** — with high confidence
3. **What needs consultation** — specify where to look (docs, APIs, internal knowledge base)
4. **What needs human validation** — decisions the model should not make alone
5. **What should NOT be done** — actions that would be premature without more context

Use the [output template](./assets/output-template.md) to structure the delivery.

### Phase 4 — Transparency

Always declare:
- Which assumptions were made and not verified
- The overall confidence level of the analysis
- What was left out and why

### Phase 5 — Feedback Loop

After delivering the analysis and the user acts on it, record the learning:

1. **Evaluate the outcome**: did the analysis get it right? Wrong? What was not anticipated?
2. **Record in staging**: add an entry in [retrospectives.md](./references/retrospectives.md) in the format:
   ```
   ### [DATE] — [SUBJECT]
   **What happened**: [short description]
   **Learning**: [concise rule]
   **Axis affected**: [axis from SKILL.md]
   ```
3. **Check the cap**: if staging reached 5 entries, start the [distillation procedure](./references/retrospectives.md#distillation)
4. **Capture real examples**: if the analysis was particularly good or bad, save in [examples.md](./references/examples.md) under "Real Cases"

> Phase 5 is optional for Simple triage. Mandatory for Medium and Complex.

## Rules

- **NEVER** jump straight to the solution without going through Phases 1-3
- **NEVER** say "not necessary" without justifying with evidence
- **NEVER** classify all axes as 🟢 — if everything seems safe, question whether you're being overconfident
- **ALWAYS** flag when your knowledge may be outdated
- **ALWAYS** generate at least 1 question for the user in Phase 3 (if there are no questions, the analysis was shallow)
- **ALWAYS** ask the user when ambiguity is high
- If the user asks for speed, flag the risks but respect the decision

## Quality Checklist (self-validation)

Before delivering the analysis, verify:

- [ ] At least 1 assumption that, if false, invalidates the entire approach?
- [ ] At least 1 axis classified as 🟡 or 🔴?
- [ ] At least 1 question for the user in Phase 3?
- [ ] Questions are context-specific (not generic)?
- [ ] Each risk has a concrete consequence (not just "could cause problems")?
- [ ] Explicitly declared what you don't know?

If any item fails, refine the analysis before delivering. Consult [good vs. bad analysis examples](./references/examples.md) to calibrate.

## References

- [Questioning frameworks](./references/frameworks.md)
- [Good vs. bad analysis examples](./references/examples.md)
- [Retrospectives — learning staging](./references/retrospectives.md)

## Companion Skills

- For **understanding intent before implementing** (WHY/WHAT FOR/FOR WHOM — lighter than full contextação): use **task-intent**
- For **persisting analysis across tasks** (externalizing decisions so they survive context compression): use **task-map**

When task-intent has already been applied, its Success Condition output (WHY/WHAT FOR/FOR WHOM) can be used directly — no need to re-derive it in Phase 1.6.
