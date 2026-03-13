---
name: cc-agent-creator
description: "**WORKFLOW SKILL** — Create custom VS Code Copilot agents (.agent.md). USE FOR: new agents, tool restrictions, handoffs, orchestration patterns, discipline constraints. DO NOT USE FOR: general coding, VS Code extension development."
---
# Agent Creator — Complete Guide to Building Custom Agents

You are an expert at creating custom agents for VS Code Copilot. When the user asks you to create an agent, follow this guide to produce a complete, well-structured `.agent.md` file.

## What is a Custom Agent?

A **custom agent** is an `.agent.md` file that defines a specialized AI persona with its own instructions, tool access, and handoff capabilities. Agents appear as selectable modes in VS Code Copilot Chat.

**User-level agents** live in `~/.copilot/agents/` and are available across all workspaces. **Workspace-level agents** live in `.github/agents/` within a project and are scoped to that workspace.

The agent receives the body of `.agent.md` as **system-level instructions** — everything you write becomes the agent's operating discipline.

## File Structure — Anatomy of `.agent.md`

Every agent file has two parts: a YAML frontmatter block and a Markdown body.

```yaml
---
name: my-agent
description: "What this agent does — used for discovery"
tools:
  - search
  - read
agents:
  - sub-agent-name
handoffs:
  - label: "Forward →"
    agent: target-agent
    prompt: "Context for the receiving agent."
    send: false
---

# Agent Name — Subtitle

<Body: instructions the agent follows>
```

### Frontmatter Field Reference

| Field | Required | Type | Purpose |
|-------|----------|------|---------|
| `name` | **Yes** | string | Identifier. Must match filename (without `.agent.md`). |
| `description` | **Yes** | string | What the agent does. Used for **discovery** — Copilot reads this to decide routing. |
| `tools` | No | string[] | Tool sets the agent can use. **Omit = inherit all. Declare = override.** |
| `agents` | No | string[] | Sub-agents this agent can invoke. `[]` = none, `['*']` = all, list = specific. |
| `handoffs` | No | object[] | Transition buttons shown to the user after the agent responds. |
| `model` | No | string | Force a specific model (e.g. `copilot-chat-fast`). |
| `user-invocable` | No | boolean | If `false`, agent can't be selected directly by users. Default: `true`. |
| `disable-model-invocation` | No | boolean | If `true`, other agents/model can't auto-invoke this agent. Default: `false`. |

### Handoff Object Fields

| Field | Required | Type | Purpose |
|-------|----------|------|---------|
| `label` | **Yes** | string | Button text shown to user (e.g. "Implement →") |
| `agent` | **Yes** | string | Target agent name |
| `prompt` | No | string | Context/instructions passed to the receiving agent |
| `send` | No | boolean | If `true`, auto-sends without user confirmation. Default: `false`. |

## Tool Configuration — The Critical Design Decision

This is the most consequential choice you'll make. Tool access defines what an agent **can and cannot do**.

### Available Tool Sets

| Tool Set | Capabilities | Typical Use |
|----------|-------------|-------------|
| `search` | Codebase search, file search, text search, usages, changes | Understanding code |
| `read` | Read files, list dirs, problems, terminal output, selection | Inspecting state |
| `edit` | Edit files, create files, rename | Modifying code |
| `terminal` | Run commands, background processes | Build, test, install |
| `agent` | Invoke sub-agents via `runSubagent` | Orchestration |
| `todo` | Track items in TODO list | Progress tracking |
| `web` | Fetch URLs, search GitHub repos, open browser | Research |

For MCP servers, use `<server-name>/*` syntax: `atlassian-mcp/*`, `context7/*`, etc.

> **Full tool sets reference** with detailed tool breakdowns and role-based combinations: read `references/tool-sets-reference.md`

### The Inheritance Rule

This is the rule that governs all tool access:

- **`tools` OMITTED** → Agent inherits ALL tools from its parent (or from the system if top-level).
- **`tools` DECLARED** → Agent gets ONLY what's listed. This **overrides** inheritance.

There is NO `tools: ['*']` syntax. The only way to grant all tools is to **omit the field entirely**.

**Practical consequences:**
- **Orchestrators OMIT `tools`** → sub-agents inherit ALL. Orchestrator is constrained by body instructions ("NEVER edit/run"), not by tool restrictions.
- **Sub-agents that are read-only DECLARE `tools`** → overrides inheritance with a restricted set (e.g. `search`, `read`).
- **Sub-agents that need full access OMIT `tools`** → inherit ALL from parent.

### Tool Configuration Workflow

When creating an agent, follow this decision workflow to determine the correct `tools` strategy:

```
1. Will this agent have sub-agents (orchestrator/coordinator)?
   ├─ YES → OMIT `tools`. Constrain via body instructions.
   │        Reason: Declaring tools restricts what sub-agents inherit.
   │        If you declare [search, read, agent, todo], a full-access
   │        sub-agent that omits `tools` inherits ONLY that subset.
   └─ NO  → Go to 2.

2. Does this agent need full access (edit, terminal, etc.)?
   ├─ YES → OMIT `tools` (inherits everything from parent or system).
   └─ NO  → Go to 3.

3. Is this agent read-only (research, validation, review)?
   ├─ YES → DECLARE tools: [search, read, web, todo] (or appropriate subset).
   └─ NO  → Ask the user what capabilities the agent needs and
            DECLARE only those tool sets.
```

**IMPORTANT:** Always follow this workflow. Do not default to declaring tools on an orchestrator.

### Quick Reference Matrix

| Agent Role | Tool Strategy | Why |
|-----------|--------------|-----|
| Orchestrator (has sub-agents) | **Omit `tools`** (instruction-constrained) | Ensures sub-agents inherit ALL tools. Restriction is via body ("NEVER edit/run"). |
| Read-only agent (research, validation) | Declare: `search`, `read`, `web`, `todo` | Enforces no-edit constraint at tool level |
| Full-access agent (implementation) | **Omit `tools`** | Inherits everything from parent |
| Restricted specialist | Declare only what's needed | Principle of least privilege |

### Anti-Pattern: Omitting `tools` on a Read-Only Agent

```yaml
# WRONG — inherits edit + terminal from parent
name: reviewer
# tools: (omitted)
```

```yaml
# CORRECT — explicitly restricts to read-only
name: reviewer
tools:
  - search
  - read
```

If the agent's body says "NEVER edit files" but tools aren't restricted, the soft constraint can fail. **Combine discipline (body) with enforcement (tools).**

### Anti-Pattern: Declaring `tools` on an Orchestrator with Sub-Agents

```yaml
# WRONG — restricts what sub-agents inherit
---
name: orchestrator
tools:
  - search
  - read
  - agent
  - todo
agents:
  - researcher
  - implementor
---
# Result: implementor omits `tools` → inherits ONLY [search, read, agent, todo]
# Implementor has NO edit, NO terminal → BROKEN
```

```yaml
# CORRECT — omit tools, constrain via body instructions
---
name: orchestrator
# tools: omitted — inherits ALL.
# Constrained by body: "NEVER edit files, run commands, or write code"
agents:
  - researcher
  - implementor
---
# Result: implementor omits `tools` → inherits ALL → can edit, run terminal
# Orchestrator's restriction is via body instructions, not tool restrictions
```

**The rule:** Orchestrators with full-access sub-agents must **OMIT** `tools`. The orchestrator's constraint is behavioral (body instructions), not structural (tool restrictions). Declaring tools on the orchestrator poisons the inheritance chain.

## Handoffs — Designing Agent Transitions

Handoffs create explicit transition points between agents. They appear as buttons after an agent's response.

### Forward Handoffs (→)

Pass work downstream to the next specialist:

```yaml
handoffs:
  - label: "Implement →"
    agent: implementor
    prompt: "Implement the validated plan above. Follow the key decisions and constraints identified."
    send: false
```

### Backward Handoffs (←)

Return upstream when more context is needed:

```yaml
handoffs:
  - label: "← Research More"
    agent: researcher
    prompt: "I need more research before continuing. Investigate the following gaps."
    send: false
```

### Handoff Design Rules

1. **Prompts must be specific** — "Implement the task above" loses context. "Implement the validated plan above, following the key decisions and constraints identified" preserves it.
2. **Use `send: false`** — Let the user review before sending. Only use `send: true` for fully automated pipelines.
3. **Label conventions** — Forward: `"Action →"`. Backward: `"← Action"`. This visual pattern communicates direction.
4. **Each handoff should carry context** — The prompt field is instruction to the receiving agent. Tell it what to do with the accumulated context.

## Orchestration Patterns

Three proven patterns for multi-agent systems. Brief overview here — **for complete examples with real frontmatter and body content, read `references/orchestration-patterns.md`**.

### Pattern 1: Coordinator/Worker

One orchestrator routes to specialists. The orchestrator never does the work.

```
User → Orchestrator → Researcher | Validator | Implementor
```

**When to use:** Tasks vary in type (research vs implementation vs review). One entry point simplifies UX.

**Key design:**
- Orchestrator: **Omit `tools`** (instruction-constrained via body). `agents: [list of workers]`
- Workers: Specialized tools per role (read-only declare, full-access omit)

### Pattern 2: Pipeline

Sequential handoffs create a quality chain:

```
Researcher → Validator → Implementor
```

**When to use:** Every task benefits from the same sequence. Research → validate → implement is the canonical example.

**Key design:**
- Each agent has one forward handoff to the next stage
- Implementor has a backward handoff for gaps

### Pattern 3: Multi-Perspective

Parallel sub-agents provide different viewpoints:

```
Coordinator → Security Reviewer
            → Performance Reviewer
            → UX Reviewer
            → Coordinator (synthesize)
```

**When to use:** Reviews, audits, or decisions that benefit from multiple lenses.

**Key design:**
- Coordinator invokes sub-agents via `runSubagent`, synthesizes results
- Sub-agents are not user-invocable (`user-invocable: false`)

## Writing the Body — Effective Agent Instructions

### Use Imperative Voice

The body is a directive to the AI. Tell it what to DO.

```markdown
# GOOD
- **NEVER** edit files — you are read-only
- **ALWAYS** verify claims before stating them as fact
- When the user asks for X, respond with Y

# BAD
- This agent is designed to be read-only
- It's generally a good idea to verify claims
- X is something users commonly ask about
```

### Role Tables

Define what the agent does and doesn't do:

```markdown
## What You Do
1. Research and gather context
2. Verify facts with tools
3. Produce structured summaries

## What You NEVER Do
- Edit files
- Run commands
- Skip to solutions
```

### Capability Matrices

For agents that triage or classify:

```markdown
| Level | Criteria | Action |
|-------|----------|--------|
| Simple | 1 technology, reversible | Quick pass |
| Medium | 2-3 technologies, dependencies | Full analysis |
| Complex | 4+ technologies, production | Deep research |
```

### Quality Checklists

For agents that validate work:

```markdown
Before delivering, verify:
- [ ] At least 1 assumption identified?
- [ ] Each risk has a concrete consequence?
- [ ] Questions are context-specific?
```

### Output Format Templates

Define exactly how the agent should structure its output:

```markdown
## Output Format

End your response with:

### Summary
- Finding 1
- Finding 2

### Recommendation
[Action to take]
```

## Writing the Description

The description determines whether the agent gets discovered and invoked correctly.

### Rules

1. **Front-load the role** — Start with what the agent IS: "Research and understand before acting."
2. **Include capability keywords** — "Investigates intent, gathers context, verifies facts."
3. **State constraints** — "Read-only — cannot edit files or run commands."
4. **Keep under 200 chars** — Descriptions get truncated. Be dense.

### Patterns

**Worker agent:**
```yaml
description: "Research and understand before acting. Investigates intent, gathers context, verifies facts. Read-only — cannot edit files or run commands."
```

**Orchestrator agent:**
```yaml
description: "Smart entry point. Analyzes what you need and routes to the right specialist agent."
```

**Specialist agent:**
```yaml
description: "SQL query optimizer. Analyzes query plans, suggests indexes, rewrites slow queries. Read-only access to database schemas."
```

## Discipline Constraints — Making Rules Stick

### Soft Constraints (Instruction-Based)

Written in the body. The agent SHOULD follow them but CAN violate them if it reasons incorrectly.

```markdown
- **NEVER** declare APIs as available without checking
- **ALWAYS** plan before implementing non-trivial tasks
```

**Strengthen soft constraints with:**
- Explicit consequences: "If you skip verification, the implementation will be built on assumptions."
- Self-check checklists: Force the agent to verify compliance before responding.
- Role framing: "You are read-only" creates identity-level anchoring.

### Hard Constraints (Tool-Based)

Enforced via `tools` field. The agent literally cannot perform restricted actions.

```yaml
# Agent CAN'T edit even if it wants to
tools:
  - search
  - read
```

### When to Use Each

| Scenario | Strategy |
|----------|----------|
| Agent must never edit files | **Hard** — omit `edit` from tools |
| Agent must never run commands | **Hard** — omit `terminal` from tools |
| Agent should verify before claiming | **Soft** — body instruction + checklist |
| Agent should ask before destructive actions | **Soft** — body instruction |
| Agent must only use specific MCP server | **Hard** — declare only that server in tools |

**Best practice:** Combine both. Hard constraints prevent the action. Soft constraints explain WHY, so the agent's reasoning stays aligned.

## Visibility Controls

### `user-invocable`

Controls whether users can select this agent directly from the chat mode picker.

| Value | Effect | Use Case |
|-------|--------|----------|
| `true` (default) | Agent appears in mode picker | Most agents |
| `false` | Hidden from picker, only reachable via sub-agent call or handoff | Internal workers, sub-agents |

### `disable-model-invocation`

Controls whether other agents or the model can auto-invoke this agent.

| Value | Effect | Use Case |
|-------|--------|----------|
| `false` (default) | Can be invoked by model routing | Normal agents |
| `true` | Only user can invoke via explicit selection | Sensitive agents, disruptive workflows |

### `agents` — Sub-Agent Visibility

| Value | Effect |
|-------|--------|
| `agents: [a, b, c]` | Can invoke only listed agents |
| `agents: ['*']` | Can invoke any available agent |
| `agents: []` | Cannot invoke any sub-agents |
| (omitted) | Same as `[]` — no sub-agents |

**Anti-pattern:** Using `agents: ['*']` on an orchestrator without control — the model may invoke unexpected agents. Prefer explicit lists.

## When the User Asks for Help

- **"Create an agent for..."** → Run the full workflow: clarify role → choose tool strategy → design handoffs → write body → apply checklist.
- **"How do I restrict tools?"** → Explain the inheritance rule and decision matrix from the Tool Configuration section.
- **"How do I make agents communicate?"** → Explain handoffs (forward/backward) and sub-agent invocation via the `agent` tool set.
- **"My agent doesn't have access to..."** → Debug tool inheritance: check if `tools` is omitted (inherits) or declared (overrides). Check MCP syntax.
- **"How do I design a multi-agent system?"** → Present the 3 orchestration patterns and help choose based on their workflow.
- **"Agent ignores my NEVER rule"** → Explain soft vs hard constraints. Recommend combining body rules with tool restrictions.

## Quality Checklist

Before considering an agent complete, verify:

- [ ] `name` matches filename (without `.agent.md`)
- [ ] `description` is specific, role-focused, and under 200 chars
- [ ] `tools` follows the inheritance rule correctly for this role (omit for full access, declare for restriction)
- [ ] Body opens with role context — "You are a..." or "You are the..."
- [ ] `NEVER`/`ALWAYS` rules are clear, specific, and testable
- [ ] Handoff prompts carry specific context (not generic "do the task above")
- [ ] Output format is defined (if the agent produces structured responses)
- [ ] If part of an orchestration, the agent chain is coherent (forward + backward handoffs)
- [ ] Tested: agent invoked in Copilot Chat behaves as expected

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Fix |
|-------------|-------------|-----|
| Vague description | Agent not discovered or misrouted | Front-load role + capability keywords |
| `tools` omitted on read-only agent | Inherits `edit` + `terminal` from parent | Declare explicit read-only tool set |
| Generic handoff prompts | Receiving agent loses accumulated context | Write prompts that summarize what to do with the context |
| `NEVER` rules without tool enforcement | Agent can violate soft constraints | Combine body rules + tool restrictions |
| Monolithic agent (does everything) | Context bloated, inconsistent behavior | Split into coordinator + specialists |
| `agents: ['*']` without control | Model may invoke unexpected agents | Use explicit agent lists |
| Too many tool sets on a specialist | Agent gets distracted by capabilities | Principle of least privilege |
| No output format defined | Inconsistent, unstructured responses | Add explicit format template |

## Quick Reference

| I need to... | Go to section | Key decision |
|-------------|---------------|-------------|
| Create a new agent from scratch | File Structure → Tool Configuration → Body | Tool strategy: omit vs declare? |
| Make an agent read-only | Tool Configuration → Quick Reference Matrix | Declare `tools: [search, read]` |
| Set up an orchestrator with workers | Orchestration Patterns → Pattern 1 | **Omit** `tools` on orchestrator |
| Add agent-to-agent transitions | Handoffs | Forward (→) vs backward (←), `send: false` |
| Restrict which agents can be invoked | Visibility Controls → `agents` | Explicit list vs `['*']` |
| Hide an agent from the user picker | Visibility Controls → `user-invocable` | Set `user-invocable: false` |
| Write effective body instructions | Writing the Body | Imperative voice, role tables, checklists |
| Debug "agent can't access X" | Tool Configuration → Inheritance Rule | Check if `tools` is declared or omitted |
| Make constraints stick | Discipline Constraints | Hard (tool-based) + soft (body) combined |

## Companion Skills

- For **creating the skills that agents use**: use **skill-creator**
- For **managing and syncing skills across repos**: use **skill-manager-guide**


---

## References

# Orchestration Patterns — Deep Dive

Complete examples with frontmatter and body content for each pattern. Includes a real-world case study.

---

## Pattern 1: Coordinator/Worker

One orchestrator analyzes the request and delegates to the right specialist. The orchestrator **never does the work itself** — it routes.

### When to Use

- Tasks vary in type (research, implementation, review)
- You want a single entry point for the user
- Specialists need different tool access

### Architecture

```
User → Orchestrator ─┬→ Worker A (e.g. researcher)
                      ├→ Worker B (e.g. implementor)
                      └→ Worker C (e.g. reviewer)
```

### Template — Orchestrator

```yaml
---
name: orchestrator
description: "Entry point. Analyzes requests and routes to the right specialist."
# tools: omitted — inherits ALL tools.
# Orchestrator is instruction-constrained ("NEVER edit/run").
# Omitting ensures sub-agents without explicit tools inherit the full set.
agents:
  - worker-a
  - worker-b
  - worker-c
handoffs:
  - label: "Worker A"
    agent: worker-a
    prompt: "Handle the task described above using your specialization."
    send: false
  - label: "Worker B"
    agent: worker-b
    prompt: "Handle the task described above using your specialization."
    send: false
---

# Orchestrator

You are the entry point. Analyze requests and delegate.

## Routing Logic

| Signal | Route To | Why |
|--------|----------|-----|
| Questions, exploration | worker-a | Needs research first |
| Clear action items | worker-b | Ready for execution |
| Review, verification | worker-c | Needs quality check |

## Rules

- **NEVER** do work yourself — route only
- **NEVER** edit files, run commands, or write code
- **ALWAYS** explain your routing: "This is a X task because..."
- **ALWAYS** pass full user context to the worker
```

### Template — Worker

```yaml
---
name: worker-a
description: "Specialist in <domain>. <Constraint>."
tools:
  - search
  - read
  # Only the tools this specialist needs
agents: []
handoffs:
  - label: "Next Step →"
    agent: worker-b
    prompt: "Proceed with the output above."
    send: false
---

# Worker A — <Domain> Specialist

You are a <domain> specialist. Your scope is limited to <X>.

## What You Do
1. <Primary capability>
2. <Secondary capability>

## What You NEVER Do
- <Explicit exclusion>
```

### Key Design Decisions

| Decision | Guidance |
|----------|----------|
| Orchestrator tools | **OMITTED** — instruction-constrained via body ("NEVER edit/run"). Omitting ensures full-access workers inherit ALL tools. |
| Worker tools | Only what the role needs. Read-only workers: `search` + `read`. Full-access workers: omit `tools`. |
| `agents` on orchestrator | Explicit list — never `['*']` to prevent unexpected routing. |
| `agents` on workers | `[]` unless they need to invoke sub-workers. |
| Handoff prompts | Specific to each worker's role, not generic. |

---

## Pattern 2: Pipeline

Sequential handoffs form a quality chain. Each stage refines the previous stage's output.

### When to Use

- Every task benefits from the same sequence
- Each stage adds distinct value (research → validation → implementation)
- You want built-in quality gates

### Architecture

```
Researcher ──→ Validator ──→ Implementor
    ↑                            │
    └────── ← Research More ─────┘
```

### Template — Pipeline Stage (First)

```yaml
---
name: researcher
description: "Investigate and understand before acting. Read-only."
tools:
  - search
  - read
  - web
  - todo
agents: []
handoffs:
  - label: "Validate →"
    agent: validator
    prompt: "Validate the research and analysis above. Check assumptions and classify confidence."
    send: false
---

# Researcher — Understand First

You investigate. You don't implement.

## Workflow
1. Clarify intent (WHY, WHAT FOR, FOR WHOM)
2. Gather context with tools
3. Produce structured summary

## Output Format
### Research Summary
- Key findings (verified)
- Open questions
- Assumptions (unverified)
- Recommendation
```

### Template — Pipeline Stage (Middle)

```yaml
---
name: validator
description: "Stress-test assumptions and verify claims. Read-only."
tools:
  - search
  - read
  - web
  - todo
agents: []
handoffs:
  - label: "Implement →"
    agent: implementor
    prompt: "Implement the validated plan. Follow key decisions and constraints."
    send: false
---

# Validator — Verify Before Building

You validate. You don't implement.

## Workflow
1. Classify complexity
2. Analyze along key axes
3. Classify confidence per axis
4. Produce action plan with questions
```

### Template — Pipeline Stage (Final)

```yaml
---
name: implementor
description: "Execute with discipline. Full tool access."
# tools: omitted — inherits ALL
agents:
  - researcher
handoffs:
  - label: "← Research More"
    agent: researcher
    prompt: "More research needed. Investigate these gaps."
    send: false
---

# Implementor — Build with Discipline

You build. But you plan first.

## Workflow
1. Confirm intent (or inherit from previous stages)
2. Verify external facts
3. Plan before coding
4. Implement
5. Produce task map
```

### Key Design Decisions

| Decision | Guidance |
|----------|----------|
| Forward handoffs | Each stage has ONE forward handoff to the next. |
| Backward handoffs | Only the final stage needs backward handoff (for gaps discovered during implementation). |
| Tool progression | Restrictive → Restrictive → Full access. This prevents premature action. |
| Output format | Each stage defines its output format. The next stage expects it. |

---

## Pattern 3: Multi-Perspective

Multiple sub-agents provide parallel viewpoints. A coordinator synthesizes.

### When to Use

- Reviews or audits that benefit from different lenses
- Decision-making that needs multiple perspectives
- Quality gates before production deployment

### Architecture

```
Coordinator ─┬→ Security Reviewer (sub-agent)
              ├→ Performance Reviewer (sub-agent)
              └→ UX Reviewer (sub-agent)
              ↓
         Synthesize results
```

### Template — Coordinator

```yaml
---
name: review-coordinator
description: "Coordinates multi-perspective review. Invokes specialists and synthesizes findings."
tools:
  - search
  - read
  - agent
  - todo
# NOTE: tools are explicitly declared here because ALL sub-agents (security-reviewer,
# performance-reviewer, ux-reviewer) declare their own read-only tools.
# No sub-agent relies on inheriting from the coordinator.
# For orchestrators with full-access workers, OMIT tools instead.
agents:
  - security-reviewer
  - performance-reviewer
  - ux-reviewer
---

# Review Coordinator

You coordinate reviews. For each review request:

1. Invoke all relevant sub-agents via `runSubagent`
2. Collect their findings
3. Synthesize into a unified report with prioritized actions

## Invoking Sub-Agents

Call each reviewer with the same context. Let them analyze independently.
Synthesize their outputs — resolve conflicts, prioritize by severity.

## Output Format
### Review Summary
| Perspective | Key Findings | Severity |
|------------|-------------|----------|
| Security | ... | Critical/High/Medium/Low |
| Performance | ... | ... |
| UX | ... | ... |

### Prioritized Actions
1. [Most critical issue]
2. [Second priority]
```

### Template — Sub-Agent (Reviewer)

```yaml
---
name: security-reviewer
description: "Security review specialist. Analyzes code for vulnerabilities and security patterns."
tools:
  - search
  - read
agents: []
user-invocable: false
---

# Security Reviewer

You review code from a security perspective.

## Checklist
- [ ] Input validation on all boundaries
- [ ] No hardcoded secrets
- [ ] Auth/authz checks present
- [ ] SQL injection prevention
- [ ] XSS prevention

## Output Format
### Security Findings
| Issue | Location | Severity | Recommendation |
|-------|----------|----------|----------------|
| ... | file:line | Critical/High/Medium/Low | ... |
```

### Key Design Decisions

| Decision | Guidance |
|----------|----------|
| Sub-agent visibility | Set `user-invocable: false` — users interact via coordinator only. |
| Invocation method | Coordinator uses `runSubagent` (via `agent` tool set), not handoffs. |
| Sub-agent tools | Read-only. Reviewers observe, they don't change. |
| Synthesis | Coordinator handles conflicts between reviewers and produces one output. |

---

## Case Study — Real Orchestration Ecosystem

This is a real-world implementation of the **Coordinator/Worker + Pipeline** hybrid pattern.

### The Agents

**Orchestrator** (entry point → routes to specialists):

```yaml
---
name: orchestrator
description: "Smart entry point. Analyzes what you need and routes to the right specialist agent — researcher, validator, or implementor."
# tools: omitted — inherits ALL tools. Orchestrator is instruction-constrained ("NEVER edit/run").
# This ensures subagents without explicit tools (e.g. implementor) inherit the full set.
agents:
  - researcher
  - validator
  - implementor
handoffs:
  - label: "Research This"
    agent: researcher
    prompt: "Research and gather context for the task described above."
    send: false
  - label: "Validate This"
    agent: validator
    prompt: "Validate the analysis and assumptions described above."
    send: false
  - label: "Implement This"
    agent: implementor
    prompt: "Implement the task described above."
    send: false
---
```

- Routes via classification: exploration → researcher, verification → validator, action → implementor
- `tools`: **OMITTED** — inherits ALL. Constrained via body instructions ("NEVER edit files, run commands, or write code"). This ensures sub-agents that also omit `tools` (like implementor) inherit the full tool set.
- `agents`: explicit list of 3 workers — not `['*']`

**Researcher** (read-only investigation):

```yaml
---
name: researcher
description: "Research and understand before acting. Investigates intent, gathers context, verifies facts. Read-only — cannot edit files or run commands."
tools:
  - search
  - read
  - web
  - todo
agents: []
handoffs:
  - label: "Validate Context →"
    agent: validator
    prompt: "Validate the research and analysis above. Check assumptions, classify confidence, identify gaps, and perform active research on any unverified claims before approving for implementation."
    send: false
---
```

- `tools`: explicitly declared read-only set + `web` for external research
- `agents: []` — cannot invoke sub-agents
- Forward handoff to validator with SPECIFIC prompt about what validation means

**Validator** (read-only verification):

```yaml
---
name: validator
description: "Structured context analysis and validation. Analyzes assumptions, classifies confidence, performs active research on gaps. Read-only — cannot edit files or run commands."
tools:
  - search
  - read
  - web
  - todo
agents: []
handoffs:
  - label: "Implement →"
    agent: implementor
    prompt: "Implement the validated plan above. Follow the key decisions, respect the constraints identified, and produce a task map documenting your implementation decisions."
    send: false
---
```

- Same read-only tool set as researcher
- Forward handoff to implementor with SPECIFIC prompt mentioning key decisions, constraints, and task map

**Implementor** (full-access execution):

```yaml
---
name: implementor
description: "Disciplined implementation agent. Plans before coding, reasons at decisions, verifies external facts, documents with task maps. Full tool access."
# tools: omitted intentionally — grants access to ALL tools (built-in, MCP, extensions)
agents:
  - researcher
  - validator
handoffs:
  - label: "← Research More"
    agent: researcher
    prompt: "I need more research before continuing. Investigate the following gaps identified during implementation."
    send: false
---
```

- `tools`: **OMITTED** — this is the critical design choice. Inherits ALL tools.
- `agents: [researcher, validator]` — can escalate back upstream when gaps appear
- Backward handoff labeled `"← Research More"` — the `←` signals reverse flow

### Why This Design Works

| Principle | Implementation |
|-----------|---------------|
| Tool inheritance | Orchestrator **omits** `tools` → inherits ALL. Sub-agents that also omit (implementor) inherit ALL. Sub-agents that declare (researcher, validator) override with read-only set. |
| Least privilege | Researcher/validator declare read-only tools (hard constraint). Orchestrator is instruction-constrained (soft constraint + identity framing). Only implementor has full access. |
| Quality chain | Research → validate → implement ensures understanding before action. |
| Escape hatch | Implementor's backward handoff prevents dead-end execution. |
| Context preservation | Each handoff prompt tells the receiving agent WHAT to do with the context. |
| Soft + hard constraints | Researcher body says "NEVER edit files" AND tools field omits `edit`. Double enforcement. Orchestrator body says "NEVER edit/run" — soft constraint is sufficient because routing is its only job. |
| Explicit routing | Orchestrator has explicit `agents` list, not `['*']`. No accidental invocation. |

# Tool Sets Reference — Complete Guide

Detailed breakdown of every available tool set for custom agents, with role-based combinations.

---

## Built-In Tool Sets

### `search`

Tools for finding and understanding code across the workspace.

| Tool | What It Does |
|------|-------------|
| Codebase search | Semantic search across workspace files |
| File search | Find files by name/glob pattern |
| Text search (grep) | Exact text or regex search |
| List usages | Find references, definitions, implementations of a symbol |
| Search results | Access VS Code search view results |
| Changed files | Git diffs of current changes |

**Include when:** The agent needs to understand existing code, find files, or track changes.

### `read`

Tools for inspecting files and editor state.

| Tool | What It Does |
|------|-------------|
| Read file | Read contents of a file (with line ranges) |
| List directory | List folder contents |
| Problems/errors | Get compile/lint errors |
| Selection | Get current editor selection |
| Terminal last command | Get last command run in terminal |
| Terminal selection | Get selected text in terminal |

**Include when:** The agent needs to read file contents, check errors, or see terminal output.

### `edit`

Tools for modifying files in the workspace.

| Tool | What It Does |
|------|-------------|
| Replace in file | Edit existing file content (find and replace) |
| Create file | Create a new file with content |
| Rename symbol | Rename across workspace using language server |

**Include when:** The agent needs to modify, create, or rename files. **Omit for read-only agents.**

### `terminal`

Tools for running commands in the integrated terminal.

| Tool | What It Does |
|------|-------------|
| Run command | Execute a command in VS Code terminal |
| Background process | Start long-running processes (servers, watchers) |
| Get output | Retrieve output from background processes |
| Kill terminal | Stop a background process |

**Include when:** The agent needs to build, test, install, or run commands. **Omit for read-only agents.**

### `agent`

Tools for agent-to-agent communication.

| Tool | What It Does |
|------|-------------|
| Run sub-agent | Invoke another agent programmatically |

**Include when:** The agent orchestrates other agents (coordinators, orchestrators). **Requires `agents` field to list available sub-agents.**

### `todo`

Tools for tracking progress.

| Tool | What It Does |
|------|-------------|
| TODO list | Track items, mark as done |

**Include when:** The agent manages multi-step workflows. Lightweight, safe to include broadly.

### `web`

Tools for external research.

| Tool | What It Does |
|------|-------------|
| Fetch webpage | Get content from a URL |
| GitHub repo search | Search code in a GitHub repository |
| Open browser | Open URL in integrated browser |

**Include when:** The agent needs to research docs, verify APIs, or access external content.

---

## MCP Server Tools

MCP (Model Context Protocol) servers extend agent capabilities with custom tools.

### Syntax

```yaml
tools:
  - <server-name>/*        # All tools from a server
```

### Examples

```yaml
tools:
  - atlassian-mcp/*        # Jira + Confluence access
  - context7/*             # Library documentation lookup
  - my-custom-server/*     # Your custom MCP server
```

MCP tools follow the same inheritance rules as built-in tool sets: declare to restrict, omit `tools` entirely to inherit all (including MCP).

---

## Role-Based Combinations

### Read-Only Research Agent

```yaml
tools:
  - search        # find code
  - read          # read files
  - web           # external research
  - todo          # track progress
```

**Use case:** Researcher, analyst, documentation reviewer.
**Cannot:** Edit files, run commands, invoke sub-agents.

### Read-Only Validator

```yaml
tools:
  - search        # find code to verify
  - read          # read files to check
  - web           # verify external claims
  - todo          # track validation items
```

**Use case:** Code reviewer, assumption checker, quality gate.
**Cannot:** Edit files, run commands, invoke sub-agents.

### Orchestrator / Router

```yaml
# tools: omitted — inherits ALL
# Constrained by body instructions ("NEVER edit/run")
# Omitting ensures full-access sub-agents inherit ALL tools
```

**Use case:** Entry-point coordinator that classifies and delegates.
**Tool access:** ALL (inherited). Restriction is via body instructions ("NEVER edit files, run commands, or write code"), not via `tools` field.
**Why omit instead of declare?** If an orchestrator declares `tools: [search, read, agent, todo]`, sub-agents that omit `tools` (e.g. implementor) inherit only that restricted set — breaking their full-access design. Omitting `tools` on the orchestrator ensures the full tool set flows down to workers that need it.

### Full-Access Implementor

```yaml
# tools: omitted — inherits ALL
```

**Use case:** Agent that writes code, runs tests, creates files.
**Gets:** Everything — built-in tools, MCP tools, extension tools.

### Research + MCP Agent

```yaml
tools:
  - search
  - read
  - web
  - todo
  - atlassian-mcp/*       # Jira/Confluence context
  - context7/*            # Library docs
```

**Use case:** Researcher with access to project management and documentation tools.
**Cannot:** Edit files, run commands.

### Terminal-Only Ops Agent

```yaml
tools:
  - read           # check file state
  - terminal       # run commands
  - todo           # track tasks
```

**Use case:** DevOps agent for builds, deploys, infra tasks.
**Cannot:** Edit files directly, search code, invoke agents.

### Minimal Review Agent

```yaml
tools:
  - search
  - read
```

**Use case:** Focused code reviewer with minimal surface area.
**Cannot:** Anything beyond reading code.

---

## Decision Guide

Use this table to choose the right tool combination:

| The agent needs to... | Include |
|----------------------|---------|
| Find code/files | `search` |
| Read file contents | `read` |
| Edit/create files | `edit` |
| Run shell commands | `terminal` |
| Delegate to other agents | `agent` + set `agents` field |
| Track multi-step progress | `todo` |
| Research external docs/URLs | `web` |
| Use Jira/Confluence/custom tools | `<server-name>/*` |
| Do EVERYTHING | **Omit `tools` entirely** |

### The Inheritance Rule (Quick Reference)

```
tools: omitted     → Inherits ALL from parent (or system)
tools: [list]      → Gets ONLY what's listed (overrides inheritance)
tools: ['*']       → ❌ DOES NOT EXIST — this is NOT valid syntax
```