# Pesquisa: Disciplina de Agente — Como Evitar Entrega Prematura

> Documento de pesquisa para embasar a criação de uma skill que force agentes LLM a planejar, validar e contextualizar antes de implementar.
>
> **Nota sobre idioma**: Este documento foi construído iterativamente. Seções §1-§6 estão predominantemente em português (fase de exploração com o usuário). Seções §7-§10 estão em inglês (fase de refinamento orientada ao agente). A skill final será inteiramente em inglês.

---

## 1. O Problema

O comportamento padrão de agentes LLM é **otimizar para velocidade de entrega**, não para **correção do entendimento**. Isso causa:

- Implementação antes de entender o escopo
- Premissas assumidas sem validação
- Ausência de gates de qualidade
- Geração de dívida técnica silenciosa

O humano contribui pedindo de forma rasa. O agente contribui entregando sem questionar. O resultado é código que "funciona" mas não resolve o problema real.

---

## 2. Padrões de LLM que Atacam Esse Problema

### 2.1 ReAct — Reasoning + Acting (Yao et al., 2022)

**Conceito**: Intercalar traces de raciocínio com ações concretas, ao invés de gerar ações diretas.

**Como funciona**:
```
Thought: The user wants X, but I need to verify Y first
Action: Search for Y
Observation: Y says Z
Thought: Z contradicts my assumption, I should adjust
Action: Implement adjusted solution
```

**Por que funciona**: O trace de raciocínio força o modelo a:
1. Verbalizar premissas antes de agir
2. Detectar exceções e contradições mid-stream
3. Gerar trajectórias interpretáveis pelo humano

**Aplicação na skill** *(nota: ideia inicial — ver §9, Principle 5 para a versão refinada)*: Forçar o agente a declarar o raciocínio antes de cada ação significativa. Se o agente não consegue articular *por que* está fazendo algo, não deveria fazer.

**Paper**: arXiv:2210.03629 (ICLR 2023)

---

### 2.2 Plan-and-Solve Prompting (Wang et al., 2023)

**Conceito**: Dividir em duas etapas explícitas:
1. **Plan** — Decompor a tarefa em subtarefas ANTES de executar
2. **Solve** — Executar cada subtarefa seguindo o plano

**Por que funciona**: Elimina "missing-step errors" — o erro mais comum é pular etapas que pareciam óbvias mas não eram. Planejar primeiro força enumeração explícita de todas as etapas.

**Dados**: Supera zero-shot Chain-of-Thought em 10 datasets de raciocínio. Comparável a 8-shot CoT com zero exemplos.

**Aplicação na skill** *(nota: ideia inicial — superada por §6.2 e §9. Gates fixos foram rejeitados em favor de rigor adaptativo. O plano é gerado quando a complexidade justifica, não sempre)*: O agente DEVE gerar um plano numerado antes de escrever qualquer código. O humano valida o plano antes da execução.

**Paper**: arXiv:2305.04091 (ACL 2023)

---

### 2.3 Tree of Thoughts (Yao et al., 2023)

**Conceito**: Em vez de seguir um caminho linear, explorar múltiplas possibilidades e auto-avaliar cada uma antes de commitar.

**Por que funciona**: Permite backtracking. Se o caminho A se mostra ruim, volta e segue o caminho B. LLMs lineares se comprometem com a primeira ideia e afundam nela.

**Dados**: GPT-4 com CoT resolve 4% do Game of 24. Com ToT: 74%. A diferença é explorar antes de commitar.

**Aplicação na skill** *(nota: ideia inicial — ver §9, Principle 6 para a versão refinada. Ativado pela condição de sucesso, não por regra fixa)*: Para decisões arquiteturais, o agente deve listar pelo menos 2 abordagens, avaliar trade-offs de cada uma, e só então recomendar.

**Paper**: arXiv:2305.10601 (NeurIPS 2023)

---

### 2.4 Reflexion (Shinn et al., 2023)

**Conceito**: Após executar, o agente reflete verbalmente sobre o resultado e mantém um buffer de memória episódica. Esse feedback textual melhora as tentativas seguintes.

**Por que funciona**: LLMs sem reflexão repetem erros. Com reflexão verbal, o modelo identifica padrões de falha e os evita em iterações seguintes. Atingiu 91% pass@1 no HumanEval (vs. 80% do GPT-4 sem reflexão).

**Aplicação na skill** *(nota: ideia inicial — ver §9, Principle 8 para a versão refinada. O feedback agora alimenta o FEEDBACK.md como memória episódica entre sessões)*: Após cada entrega, o agente deve auto-avaliar: "O que ficou de fora? O que poderia falhar? O que o humano não pediu mas precisa?" Isso alimenta a fase de retrospectiva da contextação.

**Paper**: arXiv:2303.11366 (NeurIPS 2023)

---

## 3. Estratégias de Engenharia de Software

### 3.1 Definition of Ready (DoR)

**Conceito**: Antes de qualquer trabalho começar, critérios mínimos devem ser atendidos. Se não estão, o trabalho NÃO começa.

**Critérios INVEST**:
- **I**ndependent — Auto-contido, sem dependências não-resolvidas
- **N**egotiable — Há espaço para discutir a implementação
- **V**aluable — O valor para o stakeholder é claro
- **E**stimable — O escopo é entendido o suficiente para estimar
- **S**mall — Granular o suficiente para um ciclo de trabalho
- **T**estable — Tem critérios de aceitação claros

**Aplicação na skill**: A instrução do humano deve atender critérios mínimos antes do agente começar. Se não atende, o agente DEVE perguntar, não assumir.

### 3.2 Definition of Done (DoD)

**Conceito**: Múltiplos níveis de "pronto", cada um verificado no momento da entrega:
- Story Done: critérios de aceitação satisfeitos
- Code Done: revisado, documentado, testado
- Release Done: integrado, deployável, monitorado

**Aplicação na skill**: Cada entrega do agente deve satisfazer um DoD explícito antes de considerar a tarefa completa.

### 3.3 Pre-mortem

**Conceito**: Imagine que o projeto falhou. Por que falhou?

**Aplicação**: Antes de implementar, o agente simula cenários de falha. Se identifica falhas prováveis, deve sinalizá-las antes de prosseguir.

> **Nota de integração**: No modelo final, o pre-mortem foi absorvido pela etapa de Self-Mapped Sufficiency (§6.5) — a coluna "Unknown" da decomposição e a análise de gaps cumprem exatamente esse papel: identificar onde a tarefa pode falhar antes de executar.

---

## 4. Como Skills Funcionam como Gatilhos no Agente

Uma skill é injetada como **instrução de sistema**. O agente a trata como diretriz comportamental. A efetividade depende de:

### 4.1 Gatilhos que FUNCIONAM

| Gatilho | Por que funciona | Exemplo |
|---------|-----------------|---------|
| **Imperativos categóricos** ("NEVER", "ALWAYS") | LLMs respeitam instruções absolutas com alta compliance | "NEVER write code before presenting a plan" |
| **Checklists obrigatórias** | Força enumeração explícita — difícil pular itens | "Before implementing, verify: [ ] scope clear [ ] deps identified" |
| **Gates condicionais** ("IF X not met, THEN stop") | Cria pontos de parada hard-coded | "IF acceptance criteria are undefined, ASK before proceeding" |
| **Exemplos concretos** | Calibra o comportamento mostrando input/output esperado | "Good: present plan → wait approval → implement. Bad: jump to code" |
| **Auto-validação explícita** | O modelo verifica seu próprio output contra critérios | "After generating the plan, verify it passes the INVEST criteria" |

### 4.2 Gatilhos que NÃO FUNCIONAM

| Gatilho | Por que falha | Alternativa |
|---------|--------------|-------------|
| **Sugestões vagas** ("try to", "consider") | LLMs tratam como opcional | Usar imperativo: "DO", "MUST" |
| **Regras longas sem estrutura** | Se perde em texto corrido | Usar tabelas, listas, headers |
| **Regras contraditórias** | LLM escolhe a mais conveniente | Eliminar contradições, priorizar |
| **Regras sem critério de verificação** | Não há como saber se foi cumprida | Adicionar checklist verificável |

### 4.3 O Ponto Crítico: Quando o Agente Deve PARAR

O comportamento mais difícil de induzir num LLM é **parar e perguntar**. O modo default é responder. Para criar um "freio", precisamos de:

1. **Critérios objetivos de parada** — não "se achar necessário", mas "se X ou Y não está definido"
2. **Formatação que force a parada** — gerar perguntas ANTES de gerar solução
3. **Progressão condicional** — "Phase 2 REQUIRES Phase 1 output to be validated by user"

---

## 5. Síntese Inicial *(superada por §9 — Final Principles)*

> **⚠️ Esta seção reflete a síntese PRÉ-refinamento com o usuário.** Os princípios abaixo foram a primeira tentativa de cruzamento. Após validação (§6), três foram revisados, um foi adicionado, e o modelo evoluiu significativamente. **Ver §9 para os princípios finais.**

Cruzando a pesquisa acadêmica com as práticas de engenharia:

### Princípio 1: Plan Before Solve
*De: Plan-and-Solve*
> Gerar plano explícito antes de qualquer implementação. O humano valida o plano.

### Princípio 2: Reason Before Act
*De: ReAct*
> Declarar premissas, raciocínio e justificativa antes de cada ação significativa.

### Princípio 3: Explore Before Commit
*De: Tree of Thoughts*
> Para decisões com múltiplos caminhos, explorar alternativas antes de se comprometer.

### Princípio 4: Gate Before Progress
*De: Definition of Ready / INVEST*
> A instrução deve atender critérios mínimos antes do trabalho começar. Se não atende, perguntar.

### Princípio 5: Reflect Before Close
*De: Reflexion*
> Após a entrega, auto-avaliar: o que ficou incompleto? O que pode falhar?

### Princípio 6: Verify at Each Level
*De: Definition of Done (multi-level)*
> Cada entrega é verificada contra critérios explícitos — não basta "funcionar".

---

## 6. Refinamento: Insights do Usuário

Após validação com o usuário, três insights redefiniram o modelo:

### 6.1 Feedback ≠ Coleta de Dados → Aprendizado do Agente

A extensão Skill Manager já implementa FEEDBACK.md por skill. A questão não é SE haverá retroalimentação, mas COMO fazer o agente LLM **compreender que a aplicação da skill gerou ganho** — e identificar o que poderia estar mais claro na skill para decisões mais certeiras.

Isso muda a natureza do feedback:
- **Não é**: métrica pós-entrega para o humano analisar
- **É**: sinal que o agente usa para calibrar seu próprio comportamento

Conexão com Reflexion (§2.4): o buffer de memória episódica do Reflexion faz exatamente isso — armazena reflexões textuais que melhoram iterações futuras. O FEEDBACK.md funciona como esse buffer entre sessões. A skill precisa **instruir o agente a ler feedbacks anteriores e ajustar** sua intensidade de verificação.

### 6.2 Gates Dinâmicos, Não Fixos

O pipeline de 4 gates fixos (proposto na primeira versão deste documento, antes do refinamento) foi rejeitado. Razão: cada tarefa exige nuance diferente. Um rename de variável não precisa dos mesmos gates que uma reestruturação arquitetural. Gates fixos geram:
- Resistência de uso ("a skill atrapalha mais do que ajuda")
- Overhead desproporcional em tarefas simples
- Falsa sensação de segurança em tarefas complexas (cumprir 4 gates ≠ entender o problema)

O modelo correto é **intensidade adaptativa**: o agente avalia a complexidade da tarefa e escala o rigor proporcionalmente. Isso ecoa o padrão de triage da skill contextação — que já classifica confiança em 🟢🟡🔴 e escala profundidade.

### 6.3 Skill = Bússola, Não Processo

Insight mais importante: a skill não é um processo que o agente executa. É uma **bússola de suficiência contextual** — um direcionador que ajuda o agente a avaliar:

> "Tenho contexto suficiente sobre esta tarefa para seguir sem gerar dívida técnica?"

O contexto varia de dev para dev, de projeto para projeto. A skill não pode prever isso. Mas pode **ensinar o agente a se fazer as perguntas certas** para qualquer combinação de dev + projeto + tarefa.

Isso implica:
- A skill não impõe processo → guia autoavaliação
- A skill não define "pronto" → ensina a perguntar "isso está pronto?"
- A skill não fixa gates → escala rigor conforme lacunas detectadas

### 6.4 Classificação é Natural — Basta Ativar

O agente LLM não é estático. Dado contextos diferentes, ele já responde de maneira diferente. Ele já sabe definir tópicos a seguir, adaptar profundidade, variar tom. Logo, **avaliar a complexidade de uma tarefa antes de iniciar** não é um comportamento novo — é um comportamento que o agente já possui mas não ativa por padrão.

A skill não precisa ensinar o agente a classificar. Precisa **fazer ele acionar essa capacidade de forma direta e concreta**, definindo níveis adequados dado a análise de contexto já integrada. Existem diversos métodos que fazem o agente decidir isso de maneira natural e sem gerar fricção — o segredo é tornar a autoavaliação um reflexo, não um checklist.

Implicação para a skill: linguagem imperativa simples. "Assess this task before starting" é suficiente — o agente já sabe como. O que falta é o gatilho.

### 6.5 Suficiência = Mapa Mental Autogerado

A pergunta "contexto suficiente?" não precisa de critérios externos. O agente gera a resposta sozinho:

1. **Decomposição**: O agente imagina cada ponto da tarefa que precisará desenvolver
2. **Documentação**: Para cada ponto, documenta o que sabe e o que não sabe
3. **Análise de fluxograma**: Desenha a sequência de definições que leva ao resultado
4. **Teste de completude**: Verifica se todos os pontos do checklist e fluxograma têm resolução

O contexto é **suficiente quando o mapa que o agente desenhou cobre todos os pontos da tarefa sem lacunas**. Se há lacunas, o agente sabe exatamente o que perguntar — porque ele mesmo identificou os buracos.

Isso é elegante porque:
- Não depende de critérios fixos (escala pra qualquer tarefa)
- O agente é o melhor juiz do que ele mesmo não sabe
- As perguntas ao humano são cirúrgicas, não genéricas

### 6.6 Condição de Sucesso ≠ Entregável

Insight mais transformador: **o pedido do humano não é a condição de sucesso**.

"Crie um CRUD de usuários" → O agente que trata isso como condição de sucesso vai implementar um CRUD de usuários. Tecnicamente correto. Contextualmente pode ser completamente errado.

A condição de sucesso se dá por três perguntas que precedem qualquer definição de implementação:

#### POR QUÊ? (Why)
O que gerou este pedido? Definir a causa raiz ajuda a avaliar se o pedido em si é a solução certa.

O dev enviesado já falha aqui — ele pede a solução que imaginou, não o problema que precisa resolver. O agente que aceita o pedido literalmente herda esse viés.

#### PRA QUÊ? (What for)
Qual o contexto mais amplo? O agente muitas vezes não tem a visão do todo e implementa algo que, do ponto de vista do treinamento dele, faz sentido — mas no contexto real, não.

> **Exemplo**: "Crie um jogo da velha." O agente faz um jogo da velha visual padrão. Mas os jogadores são cegos. Sem saber PRA QUÊ, o agente nunca vai incluir controle por voz e sinais sonoros de alerta para indicar processos.

#### PRA QUEM? (For whom)
Quem recebe a solução? Dependendo do público, todo o contexto e definição mudam. Esta pergunta tem relação direta com "pra quê" — juntas definem o alvo real da solução.

Estas três perguntas formam o **Triângulo de Condição de Sucesso**:

```
           POR QUÊ?
          (causa raiz)
              △
             / \
            /   \
           /     \
          / SUCCESS\
         / CONDITION \
        /      △      \
       /_______________\
  PRA QUÊ?         PRA QUEM?
  (propósito)      (audiência)
```

O agente que responde essas três perguntas ANTES de definir o que implementar transforma o pedido raso em entendimento profundo. A implementação que nasce desse entendimento é fundamentalmente diferente da que nasce do pedido literal.

---

## 7. Modelo Revisado: Bússola de Suficiência

Substituindo o pipeline fixo por um modelo adaptativo com condição de sucesso no centro:

```
┌─────────────────────────────────────────────────────────┐
│                   INSTRUÇÃO DO HUMANO                   │
└──────────────────────────┬──────────────────────────────┘
                           ▼
              ┌────────────────────┐
              │  SUCCESS CONDITION │  ← ANTES de qualquer definição
              │  TRIANGLE          │
              │                    │
              │  POR QUÊ?   → causa raiz do pedido
              │  PRA QUÊ?   → propósito/contexto amplo
              │  PRA QUEM?  → audiência/stakeholder
              │                    │
              └─────────┬──────────┘
                        │
              Agent can answer all 3?
                        │
            ┌─── NO ────┴──── YES ────┐
            ▼                         ▼
     ┌────────────┐          ┌──────────────────┐
     │ ASK before │          │  TRIAGE NATURAL  │  ← Agent assesses
     │ proceeding │          │                  │     complexity using
     │ (targeted  │          │  Agent activates │     its own judgment
     │  questions)│          │  context analysis│
     └────────────┘          │  capabilities    │
                             └────────┬─────────┘
                                      │
                             Rigor scaled to task
                                      │
                                      ▼
                           ┌──────────────────┐
                           │  SELF-MAPPED     │  ← Agent builds its own
                           │  SUFFICIENCY     │     mental map:
                           │                  │
                           │  1. Decompose task points
                           │  2. Document known/unknown per point
                           │  3. Draw definition flowchart
                           │  4. All points resolved?
                           │                  │
                           └────────┬─────────┘
                                    │
                          ┌─── NO ──┴── YES ───┐
                          ▼                    ▼
                   ┌────────────┐       ┌─────────────┐
                   │ ASK the    │       │ IMPLEMENT   │
                   │ human      │       │ with trace  │
                   │ (surgical  │       │ (reasoning  │
                   │  questions │       │  declared   │
                   │  from gaps │       │  at each    │
                   │  found)    │       │  decision)  │
                   └────────────┘       └──────┬──────┘
                                               ▼
                                    ┌──────────────────┐
                                    │   REFLECT        │  ← A skill ajudou?
                                    │   (Calibrate:    │     Condição de sucesso
                                    │    Was success   │     foi atendida?
                                    │    condition     │     O que poderia ser
                                    │    actually met?)│     mais claro?
                                    └──────────────────┘
```

### Key Differences from Original Pipeline:

| Aspect | Fixed Pipeline (v1) | Adaptive Compass (v2) | Compass + Success Condition (v3) |
|--------|--------------------|-----------------------|----------------------------------|
| First step | Check readiness | Triage complexity | Understand WHY/WHAT FOR/FOR WHOM |
| Structure | 4 sequential gates | Triage → scaled rigor | Success condition → natural triage → self-mapped sufficiency |
| Classification | External criteria | Agent assessment | Agent's natural context analysis activated |
| Sufficiency | Predefined checklist | Risk-based | Agent-generated mental map with completeness test |
| Human gate | After plan (always) | Only when gaps detected | When success condition unclear OR map has holes |
| Agent role | Execute a process | Self-assess sufficiency | Understand intent → self-map → self-assess → implement |
| Overhead | Same for all tasks | Proportional | Organic — agent scales naturally |

### How Feedback Drives Learning:

```
Session N:  Agent applies skill → delivers → generates FEEDBACK.md
                                                    │
                                                    ▼
Session N+1: Agent reads FEEDBACK.md ← "Last time, the agent missed X
             because the skill didn't emphasize Y"
                    │
                    ▼
             Agent applies skill with heightened attention to Y
```

The feedback loop doesn't change the skill text automatically — it teaches the AGENT reading the skill to weight certain aspects more heavily based on historical patterns.

---

## 8. The Missing Layer: Persistent Documentation Model

### 8.1 The Problem: Context Window Compression

Everything up to this point happens **inside the agent's context window**. The Success Condition Triangle, the self-mapped sufficiency, the triage — all of it lives in volatile memory. When the context window compresses (long conversations, session boundaries, model switching), **relevant information is silently lost**.

This means:
- An excellent analysis of Task A doesn't exist by the time Task B starts
- Each task begins from zero context, even within the same project
- The "chain" between related tasks is broken
- Previous decisions, assumptions, and reasoning evaporate

This isn't a theoretical risk — it's the **default behavior**. Context compression is when the model summarizes earlier messages to fit the window, and nuanced analysis is the first casualty.

### 8.2 The Solution: Externalized Analysis Artifacts

The agent must **write down** its analysis, not just think it. The output is a persistent file that:
- Survives context window compression
- Becomes input for the next task in the same project
- Creates a contextualized chain where each analysis builds on previous ones
- Serves as the actual Definition of Done — the document IS the proof that analysis happened

### 8.3 The Document: Task Analysis Map

For every non-trivial task, the agent produces a **Task Analysis Map** — a lightweight, structured artifact that externalizes the mental model:

```
## Task: [brief description]
Date: [timestamp]
Related: [links to previous analysis maps if any]

### Success Condition
- WHY: [cause — what generated this request]
- WHAT FOR: [purpose — broader context it serves]
- FOR WHOM: [audience — who receives the solution]

### Decomposition
| Point | Known | Unknown | Resolution |
|-------|-------|---------|------------|
| ...   | ...   | ...     | ...        |

### Key Decisions
| Decision | Reasoning | Alternatives Considered |
|----------|-----------|------------------------|
| ...      | ...       | ...                    |

### Definition of Done
- [ ] [concrete, verifiable criterion derived from success condition]
- [ ] [...]

### Open Questions
- [questions that need human input, if any]

### Chain Context
[What the NEXT task in this area should know about.
 Decisions that constrain future work.
 Assumptions that should be re-validated if context changes.]
```

### 8.4 Why This Structure Works

| Section | Solves | Survives compression? |
|---------|--------|-----------------------|
| Success Condition | Agent forgets WHY halfway through | ✅ Written in file |
| Decomposition | Self-mapped sufficiency evaporates | ✅ Table persists |
| Key Decisions | Reasoning lost, same debates repeated | ✅ Rationale recorded |
| Definition of Done | "Is it done?" has no answer | ✅ Checklist in file |
| Open Questions | Gaps identified but never asked | ✅ Explicit list |
| Chain Context | Next task starts from zero | ✅ Bridges tasks |

### 8.5 The Chain Effect

The most powerful aspect: **Chain Context**. Each Task Analysis Map links to and builds on previous maps in the same project. This creates a living thread:

```
Task Map #1 (auth module)
  └─ Chain Context: "Auth uses JWT with refresh tokens. 
      Rate limiting is NOT implemented yet."
        │
        ▼
Task Map #2 (rate limiting)
  └─ Reads #1's chain context → starts with full awareness
  └─ Chain Context: "Rate limiting uses sliding window. 
      Shares Redis with session store — capacity constraint."
        │
        ▼
Task Map #3 (session optimization)
  └─ Reads #2's chain context → knows about Redis constraint
  └─ Doesn't re-discover what #2 already mapped
```

Without this chain, Task #3 might propose a Redis-heavy solution that conflicts with the capacity constraint discovered in Task #2. With the chain, the agent **starts informed**.

### 8.6 Scaling: When to Produce What

Not every task needs a full map. The triage from §6.4 determines the artifact:

| Complexity | Artifact | Reason |
|-----------|----------|--------|
| Simple (rename, typo fix) | None or one-line note | Overhead > value |
| Moderate (feature, refactor) | Focused map (success condition + decomposition + DoD) | Key decisions need recording |
| Complex (architecture, migration) | Full map with chain context + alternatives | Future tasks WILL depend on these decisions |

The agent decides. The skill instructs: "Externalize your analysis proportionally to the task's impact on future work."

---

## 8b. The Fourth Pillar: Feedback as Episodic Memory

### 8b.1 Why Feedback Needs Equal Footing

The three previous pillars (Success Condition, Self-Mapped Sufficiency, Persistent Documentation) handle the **current task**. But the agent's ability to improve **across tasks** depends on a fourth mechanism: structured feedback that survives between sessions.

Without feedback, the agent applies the skill identically every time — regardless of whether it helped or failed in previous iterations. With feedback, the agent **learns which aspects of the skill to weight more heavily** based on observed patterns.

### 8b.2 Feedback ≠ Rating → Calibration Signal

The feedback is not a satisfaction score. It's a **calibration signal** that tells the agent:
- Which part of the skill's guidance was most valuable in practice
- Where the skill was unclear and the agent had to guess
- What the agent missed despite following the skill
- Whether the success condition was actually met after delivery

This directly implements the Reflexion pattern (§2.4): verbal self-reflection stored as episodic memory that improves future iterations.

### 8b.3 The Feedback → Skill → Agent Loop

```
┌──────────────────────────────────────────────────────┐
│                    SESSION N                          │
│                                                      │
│  Agent reads SKILL.md + previous FEEDBACK.md entries │
│            │                                         │
│            ▼                                         │
│  Agent applies skill with calibrated attention       │
│  (weights certain aspects more based on feedback)    │
│            │                                         │
│            ▼                                         │
│  Agent delivers → generates feedback entry           │
│  - Was success condition met? (Why/why not)          │
│  - Where did the skill help most?                    │
│  - Where was the skill unclear?                      │
│  - What did the agent miss despite the skill?        │
│                                                      │
└──────────────────────┬───────────────────────────────┘
                       │ persists to FEEDBACK.md
                       ▼
┌──────────────────────────────────────────────────────┐
│                    SESSION N+1                        │
│                                                      │
│  Agent reads FEEDBACK.md → recognizes patterns       │
│  "Last 3 tasks: agent consistently missed edge       │
│   cases in the Decomposition phase"                  │
│            │                                         │
│            ▼                                         │
│  Agent applies skill with heightened attention       │
│  to Decomposition thoroughness                       │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 8b.4 Key Design Constraint

The feedback loop doesn't modify the skill text. It teaches the **agent reading the skill** to interpret it differently based on accumulated evidence. The skill remains stable; the agent's application of it evolves.

This mirrors how experienced developers apply the same methodology differently over time — the process didn't change, their judgment about where to apply rigor did.

---

## 9. Final Principles

Revised to reflect the complete model (Success Condition + Adaptive Compass + Self-mapped Sufficiency + Persistent Documentation + Feedback Loop):

### Principle 1: Understand Intent Before Defining Solution
*From: Success Condition Triangle*
> Before defining WHAT to implement, understand WHY it was requested, WHAT FOR it serves, and FOR WHOM it's intended. The request is not the success condition.

### Principle 2: Activate, Don't Teach
*From: §6.4 — Classification is Natural*
> The agent already knows how to assess context, explore alternatives, and scale depth. The skill activates these capabilities — it doesn't teach them from scratch. Simple imperative triggers are sufficient.

### Principle 3: Self-Map Before Acting
*From: §6.5 — Self-Mapped Sufficiency*
> The agent decomposes the task, documents what it knows and doesn't know per point, draws the definition flowchart, and checks completeness. Sufficient = own map has no holes.

### Principle 4: Externalize, Don't Just Think
*From: §8 — Persistent Documentation Model*
> Analysis that lives only in the context window will be lost. Write it down. The Task Analysis Map survives compression, bridges tasks, and creates the contextual chain that prevents each task from starting at zero.

### Principle 5: Reason Before Act
*From: ReAct*
> Declare assumptions, reasoning, and justification before each significant action. If you can't articulate WHY, don't do it.

### Principle 6: Explore Before Commit
*From: Tree of Thoughts*
> For decisions with multiple viable paths, explore alternatives before committing. Especially when the Success Condition reveals complexity.

### Principle 7: Ask Surgically, Not Generically
*From: §6.5 + §6.6*
> Questions to the human come from specific gaps in the self-map or unclear success conditions. Never generic "do you want me to proceed?" — always targeted at the exact missing piece.

### Principle 8: Reflect to Calibrate
*From: Reflexion + §6.1*
> After delivery, reflect: was the success condition actually met? Did the discipline add value? Update the Task Analysis Map's Definition of Done. Feed back into FEEDBACK.md for cross-session learning.

### Principle 9: Guide, Don't Impose
*From: §6.3 — Skill as Compass*
> The skill teaches self-assessment, not process compliance. The agent must understand why each check matters. Efficiency without restriction. Value where it actually matters.

---

## 11. Usability Audit — Cutting the Monster

### 11.1 The Risk

This research document proposes 9 principles, a 3-question triangle, a 4-step sufficiency process, a 7-section Task Analysis Map, a triage system, a feedback loop, and chain context linking. If ALL of this goes into one SKILL.md, the result is a **monster** — a skill so heavy that:

- The agent burns context window just reading the instructions
- The dev gets bombarded with analysis instead of guided toward clarity
- The overhead makes the skill unusable for anything below "major architecture change"
- The agent avoids triggering it because the cost-benefit doesn't justify it

A semantically correct skill that nobody uses is worse than no skill at all.

### 11.2 The Constraint: Skills Are Modular

Modern agents don't run one skill — they run **many skills simultaneously**. This skill doesn't need to cover everything. Others already exist:

| Capability | Already covered by | This skill should... |
|-----------|-------------------|---------------------|
| Structured context analysis | **contextação** (Phase 1: 6 axes) | NOT duplicate it |
| Complexity triage | **contextação** (Phase 0: Simple/Medium/Complex) | NOT duplicate it |
| Confidence classification | **contextação** (Phase 2: 🟢🟡🔴) | NOT duplicate it |
| Pre-mortem / failure modes | **contextação** (Phase 1.5: Failure Modes axis) | NOT duplicate it |
| Question the user about gaps | **contextação** (Phase 3: mandatory questions) | NOT duplicate it |
| Feedback capture | **FEEDBACK.md convention** (per-skill, handled by extension) | Reference it, not build it |

### 11.3 What ONLY This Skill Uniquely Contributes

After stripping everything that already exists, four things remain:

#### 1. Success Condition Triangle — "Don't start from the request, start from the intent"

No other skill or agent behavior addresses this. The agent's default is to take the request literally. The triangle (WHY / WHAT FOR / FOR WHOM) is the one mechanism that transforms a shallow request into a real understanding of what success looks like.

**This is the core.** Simple, memorable, high-impact. Three questions.

#### 2. Discipline — "Plan and reason before implementing"

This is the **reason this skill exists**. The agent's default behavior is to optimize for speed of delivery, not correctness of understanding (§1). It does NOT naturally plan, explore alternatives, or reason before acting — it rushes to implementation. This skill must activate that discipline: assess the task, consider alternatives for key decisions, and articulate reasoning before writing code.

This is NOT about the agent lacking the capability — it has it. It's about the agent not activating it by default. The skill is the trigger.

#### 3. Externalization — "Write it down so it survives"

Context window compression kills analysis. No other skill instructs the agent to **persist its analysis as a file**. The Task Analysis Map is the anti-compression mechanism.

**But** — the 7-section map proposed in §8.3 is too heavy. It needs trimming (see §11.4).

#### 4. Chain Context — "Link tasks so the next one starts informed"

No other mechanism creates continuity between tasks in the same project. This is what prevents "each task starts from zero."

**This is the bridge.** It rides on top of externalization — if you write it down, you can link it forward.

### 11.4 The Waltz: What the Skill Actually Needs to Be

A waltz is guided, not forced. This skill guides with four clear beats:

```
Beat 1: UNDERSTAND        Beat 2: THINK             Beat 3: EXTERNALIZE      Beat 4: CONNECT
(Success Condition)       (Plan & Reason)           (Write it down)          (Chain forward)

 WHY?                     Assess complexity          Task Analysis Map        Chain Context
 WHAT FOR?                Plan before coding         (lightweight, scaled)    (what the next
 FOR WHOM?                Reason at decisions                                 task needs to know)
                          Explore alternatives
                          when stakes are high
```

Beat 2 is the **raison d'être** of this skill. Without it, we don't need the skill at all — contextacao handles analysis, and the rest is convention. Beat 2 is specifically: STOP the rush to implementation. Assess. Plan. Reason. Only then code.

Everything else — structured analysis, triage classification, confidence levels, feedback capture — is handled by other skills or existing conventions.

### 11.5 Revised Task Analysis Map (Trimmed)

The 7-section map from §8.3 becomes a 4-section map:

```markdown
## Task: [brief description]
Related: [previous map if any]

### Intent
- WHY: [cause]
- WHAT FOR: [purpose]  
- FOR WHOM: [audience]

### Key Decisions
| Decision | Why this over alternatives |
|----------|--------------------------|
| ...      | ...                      |

### Done When
- [ ] [verifiable criterion from intent]

### For Next
[What constrains or informs future work in this area]
```

What was cut and why:

| Removed | Reason |
|---------|--------|
| Decomposition table | Contextação's Phase 1 already does this better |
| Open Questions section | Contextação's Phase 3 already forces mandatory questions |
| Date/timestamp | File system metadata handles this |
| "Known/Unknown/Resolution" columns | Overkill — the agent's natural analysis covers this |

### 11.6 The 9 Principles → 4 Imperatives

9 principles are too many. The skill shouldn't list principles — it should **embody** them. The agent doesn't need a philosophy lecture. It needs clear imperatives:

| 9 Principles (research) | Distilled to | Imperative |
|-------------------------|-------------|------------|
| P1: Understand Intent | → **Beat 1** | "Before defining a solution, answer: WHY was this requested? WHAT FOR? FOR WHOM?" |
| P2: Activate Don't Teach | → Design choice | Skill uses simple triggers, not explanations |
| P3: Self-Map | → **Beat 2** | "Decompose the task. Plan before coding. Reason at each decision." |
| P4: Externalize | → **Beat 3** | "Write a Task Analysis Map for any task that affects future work" |
| P5: Reason Before Act | → **Beat 2** | "Articulate WHY before each significant action" |
| P6: Explore Before Commit | → **Beat 2** | "For high-stakes decisions, consider alternatives before committing" |
| P7: Ask Surgically | → **Beat 2** | "If gaps exist, ask targeted questions — never generic ones" |
| P8: Reflect to Calibrate | → Convention | FEEDBACK.md |
| P9: Guide Don't Impose | → Design choice | Skill is light, not prescriptive |

Four imperatives survive:
1. **Understand intent before defining solution** (Success Condition)
2. **Plan and reason before implementing** (Discipline)
3. **Externalize analysis that future tasks depend on** (Task Analysis Map)
4. **Link forward what the next task needs to know** (Chain Context)

### 11.7 Conclusion

The research document (§1-§10) explored the full space. The skill should occupy a **precise slice** of that space — the slice that no other skill covers. 

Critically: the discipline to plan and reason before coding is NOT native agent behavior — it's the exact problem that motivated this entire research (§1). The skill must activate this behavior directly and concretely.

The skill should be **short enough to read in 30 seconds, clear enough to apply instantly, and light enough that the agent activates it without hesitation.**

---

## 10. Next Steps (Post-Audit)

1. ~~Design triage criteria~~ → Resolved: agent's natural assessment, activated by imperative trigger
2. ~~Define sufficiency dimensions~~ → Resolved: self-mapped mental checklist with completeness test
3. ~~Define documentation model~~ → Resolved: Task Analysis Map with chain context (§8)
4. ~~Define feedback model~~ → Resolved: Episodic calibration loop (§8b)
5. ~~Usability audit~~ → Resolved: trimmed from 9 principles to 3 imperatives, 7-section map to 4-section map (§11)
6. **Write the skill** — SKILL.md with 4 beats: Understand Intent → Plan & Reason → Externalize → Chain Forward. Short, imperative, delegating to contextação for deep analysis where appropriate.
7. **Design FEEDBACK.md template** — Lightweight, focused on: was intent actually met? What was unclear?
8. **Test** — Invoke on varied tasks and verify: light touch for simple, deeper for complex, always the 3 questions

---

## Referências

- Yao, S. et al. (2022). *ReAct: Synergizing Reasoning and Acting in Language Models*. arXiv:2210.03629
- Wang, L. et al. (2023). *Plan-and-Solve Prompting*. arXiv:2305.04091 (ACL 2023)
- Yao, S. et al. (2023). *Tree of Thoughts: Deliberate Problem Solving with LLMs*. arXiv:2305.10601 (NeurIPS 2023)
- Shinn, N. et al. (2023). *Reflexion: Language Agents with Verbal Reinforcement Learning*. arXiv:2303.11366 (NeurIPS 2023)
- Scrum.org. *Walking Through a Definition of Ready*. INVEST criteria.
- SAFe. *Definition of Done*. Multi-level quality gates.
