# Skill Kit

Ensine ao GitHub Copilot novas habilidades, discipline seu comportamento e garanta qualidade automaticamente.

[![Skill Manager Marketplace](https://img.shields.io/badge/Skill%20Manager%20for%20Copilot-Marketplace-blue?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=allansantos-dv.copilot-skill-manager)

> **Convenção de idioma**: Os arquivos `SKILL.md`, `.agent.md` e `references/` são escritos em **inglês** — o leitor é o agente de IA. Os `README.md` são em **português** — o leitor é o desenvolvedor humano.

---

## Quick Start (3 passos)

1. Instale o [Skill Manager for Copilot](https://marketplace.visualstudio.com/items?itemName=allansantos-dv.copilot-skill-manager) no VS Code
2. Ctrl+Shift+P → Skill Manager: Add Repository → cole `https://github.com/AllanSantos-DV/skill-kit.git`
3. Skill Manager: Pull All — pronto, agents, skills e hooks instalados

> Sem a extensão, este repositório é apenas texto. A extensão dá vida aos agents, skills e hooks.

---

## O que é isso?

- Skills: conhecimento especializado que o Copilot consulta sob demanda — como ter um especialista sussurrando no ouvido.
- Agents: personas com restrições determinísticas — por exemplo, um researcher que SÓ lê e um implementor com acesso total.
- Hooks: scripts que rodam automaticamente em eventos do chat — guardrails em tempo real que aplicam políticas e verificações.

---

## O que vem incluído

- Agents: 4
- Skills: 12
- Hooks: 8

Abaixo estão as listas incluídas neste repositório (mantidas na íntegra):

### Agents (4)

Agents são **personas determinísticas** que controlam como o Copilot opera. Cada agent restringe as tools disponíveis e injeta instruções especializadas. Selecione-os no dropdown de agents do Chat.

| Agent | Escopo | Tools | Propósito |
|-------|--------|-------|-----------|
| [orchestrator](agents/orchestrator.agent.md) | Coordenação | Leitura + delegação | Avalia pedidos, coleta sinais, delega ao especialista certo com contexto enriquecido. Não edita código. |
| [researcher](agents/researcher.agent.md) | Read-only | Busca, leitura, fetch | Entender intent, pesquisar, verificar fatos. Não edita nada. |
| [validator](agents/validator.agent.md) | Read-only | Busca, leitura, fetch | Análise estruturada, classificar confiança, pesquisa ativa. Não edita nada. |
| [implementor](agents/implementor.agent.md) | Full | Todas | Implementar com disciplina — planeja, raciocina, documenta decisões. |

### Skills (12)

| Skill | Descrição |
|-------|-----------|
| [agent-creator](skills/agent-creator/) | Guia completo para criar custom agents (.agent.md) — tool restrictions, handoffs, orchestration |
| [contextacao](skills/contextacao/) | Análise estruturada de contexto antes de agir — questionar premissas, dependências e pontos cegos |
| [doc-to-markdown](skills/doc-to-markdown/) | Converter documentos (Word, Excel, PDF, PowerPoint, etc.) para Markdown consumível por LLMs |
| [error-learning](skills/error-learning/) | Registrar e generalizar erros do agente em lições reutilizáveis |
| [hooks-creator](skills/hooks-creator/) | Criar e configurar hooks de lifecycle para agents (PreToolUse, Stop, etc.) |
| [markdown-to-document](skills/markdown-to-document/) | Gerar documentos formatados (PPTX, DOCX, XLSX, PDF) a partir de Markdown |
| [safety-check](skills/safety-check/) | Análise de risco com peso variável — Light (scan rápido), Standard (análise dimensional), Deep (investigação completa) |
| [skill-benchmark](skills/skill-benchmark/) | Framework de benchmark A/B para medir eficácia de skills com dados |
| [skill-creator](skills/skill-creator/) | Guia completo para criar skills bem estruturadas do zero |
| [skill-manager-guide](skills/skill-manager-guide/) | Como usar a extensão Skill Manager for Copilot |
| [task-intent](skills/task-intent/) | Entender antes de implementar — força o agente a compreender POR QUÊ/PRA QUÊ/PRA QUEM antes de escrever código |
| [task-map](skills/task-map/) | Externalizar análise e encadear tarefas — persiste decisões e contexto entre sessões |

### Hooks (8)

Hooks são **scripts de lifecycle** que rodam automaticamente durante a interação do agente. Funcionam como guardrails em tempo real. Cada hook é um arquivo JavaScript (`.js`) cross-platform, executado via Node.js. Os hooks **globais** são configurados em `hooks/hooks.json` e os **agent-scoped** ficam no frontmatter de cada agent.

| Hook | Evento | Escopo | Propósito |
|------|--------|--------|-----------|
| [pre-commit-guard](hooks/pre-commit-guard.js) | PreToolUse | Global | Garante conventional commits. Bloqueia commits sem formato adequado e operações destrutivas. |
| [lesson-injector](hooks/lesson-injector.js) | PreToolUse | Global | Injeta lições aprendidas relevantes (do error-learning) no contexto. |
| [verify-claims](hooks/verify-claims.js) | Stop | Global | Exige verificação de fatos antes de declarar afirmações. |
| [context-confidence-check](hooks/context-confidence-check.js) | Stop | Global | Avalia confiança do contexto antes de agir — previne hallucination. |
| [skill-feedback](hooks/skill-feedback.js) | Stop | Global | Captura feedback de skills usadas com Feedback Protocol. |
| [output-format](hooks/output-format.js) | Stop | Agent | Injeta regras de formatação de output (researcher/validator). |
| [stop-checklist](hooks/stop-checklist.js) | Stop | Agent | Checklist de qualidade antes de encerrar (implementor). |
| [subagent-audit](hooks/subagent-audit.js) | SubagentStart | Agent | Audita delegações de sub-agentes (orchestrator). |

---

## Cadeia de Agents (Handoffs)

O **orchestrator** é o ponto de entrada. Ele avalia o pedido, coleta sinais (escopo, risco, incógnitas) e delega ao especialista certo:

```
                                    ┌──────────────┐
                                    │ Orchestrator  │
                                    │               │
                                    │ AVALIA        │
                                    │ Coleta sinais │
                                    │ Delega        │
                                    │               │
                                    │ 🎯 Coordenação│
                                    └──────┬────────┘
                              ┌────────────┼────────────┐
                              ▼            ▼            ▼
                    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
                    │  Researcher  │ │  Validator   │ │ Implementor  │
                    │              │ │              │ │              │
                    │ ENTENDE      │ │ ANALISA      │ │ EXECUTA      │
                    │ 🔒 Read-only │ │ 🔒 Read-only │ │ 🔓 Full      │
                    └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
                           │     Validate → │  Implement →   │
                           └────────────────┘────────────────┘
                                             │
                                       ← Research More
```

**O workflow é guiado, não forçado.** Você pode:

- Usar o Orchestrator como ponto de entrada — ele decide a rota
- Seguir a cadeia completa: Researcher → Validator → Implementor
- Pular etapas: selecionar Implementor direto pra tarefas simples
- Voltar atrás: o Implementor tem handoff de volta pro Researcher se descobrir que precisa de mais pesquisa

---

## Composição de Skills

As skills aceitam **peso variável** — a mesma skill pode ser invocada em profundidades diferentes. O orchestrator calibra a profundidade com base em sinais (escopo, risco, incógnitas):

```
Tarefa simples (rename, fix):
  → task-intent (Light) → implementa

Tarefa moderada (feature, refactor):
  → task-intent (Standard) → plano + raciocínio
  → task-map (Standard) → externaliza decisões

Tarefa complexa (arquitetura, migração):
  → task-intent (Deep) → análise profunda
  → contextação (Complex) → 6 eixos
  → safety-check (Standard/Deep) → análise de risco dimensional
  → task-map (Deep) → mapa com chain context

Quando o agente erra:
  → error-learning → registra, generaliza, previne recorrência
```

O modelo de peso (Light / Standard / Deep) permite que o esforço escale com a complexidade. Uma tarefa trivial recebe validação rápida; uma migração crítica recebe análise completa com avaliação de riscos.

---

## Na prática

As skills de disciplina (**task-intent**, **task-map**, **contextação**, **safety-check**, **error-learning**) trabalham juntas, mas sem cerimônia. Não é um processo burocrático — é um reflexo que o agente incorpora.

**O fluxo real:**

1. **Você pede algo ao agente.** "Cria a autenticação do projeto" ou "Refatora o módulo de pagamento."
2. **task-intent entra em cena automaticamente.** O agente, antes de sair codando, vai parar e pensar: *por que estão pedindo isso? pra quê serve no contexto maior? quem vai usar?* Se ele não consegue responder, te pergunta — de forma cirúrgica, não genérica.
3. **O agente planeja e raciocina.** Decompõe a tarefa, apresenta o plano antes de escrever código, e declara o raciocínio em decisões importantes. Se tem alternativas com trade-offs relevantes, mostra antes de escolher.
4. **Se a tarefa impacta trabalho futuro → task-map.** O agente produz um mapa leve (`docs/maps/`) com a intenção, decisões-chave e — o mais importante — o **"For Next"**: o que a próxima tarefa precisa saber.
5. **Se a tarefa é complexa → contextação.** Quando envolve múltiplas tecnologias, dependências externas, risco em produção — o agente aprofunda com análise dos 6 eixos (premissas, escopo, dependências, fontes de verdade, modos de falha, stakeholders).
6. **Se há risco → safety-check.** Avalia dimensões de risco (segurança, integridade de dados, compatibilidade, reversibilidade) com profundidade proporcional ao impacto.
7. **Se o agente erra → error-learning.** Quando você corrige o agente, a skill registra o erro, analisa a causa raiz e generaliza em uma lição que previne recorrência.

**O que muda:**

| Sem as skills | Com as skills |
|--------------|---------------|
| "Cria um CRUD de usuários" → agente implementa literalmente | "Cria um CRUD de usuários" → agente pergunta: "é pra admin ou end-user? precisa de soft delete? tem requisito de auditoria?" |
| Cada tarefa começa do zero | Cada tarefa lê o **For Next** da anterior e começa informada |
| Decisões se perdem quando a conversa fica longa | Decisões ficam no mapa — sobrevivem à compressão de contexto |
| Agente entrega rápido mas errado | Agente entrega certeiro porque entendeu a intenção real |
| Agente repete o mesmo erro | error-learning registra a lição — o erro não se repete |
| Mudança arriscada sem avaliação | safety-check dimensiona o risco antes de agir |

---

## Neural Link Runtime

O **Neural Link** é um runtime inteligente que intercepta e otimiza hooks dos agentes Copilot. Ele é distribuído como parte do Skill Kit, no diretório `neural-link/`.

O runtime é detectado e instalado automaticamente pelo [Skill Manager for Copilot](https://marketplace.visualstudio.com/items?itemName=allansantos-dv.copilot-skill-manager). Para detalhes, veja o [README do Neural Link](neural-link/README.md).

> **Nota:** Os arquivos de runtime (`src/`, `bin/`, etc.) são sincronizados automaticamente via CI. O diretório `neural-link/` contém apenas a estrutura base no repositório público.

---

## Como Usar (manual)

### Skills (via extensão)

1. Instale a extensão [Skill Manager for Copilot](https://marketplace.visualstudio.com/items?itemName=allansantos-dv.copilot-skill-manager)
2. No VS Code → `Ctrl+Shift+P` → `Skills: Add Repository`
3. Cole: `https://github.com/AllanSantos-DV/skill-kit.git`
4. Execute `Skills: Pull All`

### Agents e Hooks (manual)

1. Clone ou baixe este repositório
2. Copie as pastas `agents/` e `hooks/` para:
   - **Global**: `~/.copilot/agents/` e `~/.copilot/hooks/` (disponível em todos os workspaces)
   - **Por projeto**: `.github/agents/` e `.github/hooks/` (compartilhado com o time)
3. Os agents aparecem no dropdown de agents do Chat no VS Code

---

## Testes

Testes estruturais em `tests/structural/` validam a integridade dos agents e skills:

- **Agents**: verifica frontmatter, hooks referenciados, references, sincronia com cópias instaladas
- **Skills**: verifica frontmatter, estrutura de diretório, mecanismo de feedback, sincronia

Para rodar:

```powershell
# Agents
powershell -NoProfile -ExecutionPolicy Bypass -File "tests/structural/test-agents-structure.ps1"

# Skills
powershell -NoProfile -ExecutionPolicy Bypass -File "tests/structural/test-skills-structure.ps1"
```

---

## Contribuindo

### Skills

Crie uma pasta em `skills/` com um `SKILL.md`:

```
skills/
  nome-da-skill/
    SKILL.md        ← Obrigatório (em inglês)
    FEEDBACK.md     ← Obrigatório (captura de feedback)
    references/     ← Opcional (em inglês)
```

Use a skill **skill-creator** para orientação completa:
```
/skill-creator Descreva o domínio ou tópico da nova skill
```

### Agents

Crie um arquivo `.agent.md` em `agents/`:

```
agents/
  nome-do-agent.agent.md   ← Em inglês (leitor = LLM)
```

Consulte a [documentação de custom agents](https://code.visualstudio.com/docs/copilot/customization/custom-agents) do VS Code.

### Hooks

Crie scripts `.js` em `hooks/`:

```
hooks/
  nome-do-hook.js   ← JavaScript cross-platform (Node.js)
  hooks.json        ← Config de hooks globais
```

Use a skill **hooks-creator** para orientação completa:
```
/hooks-creator Descreva o evento e propósito do hook
```

---

## Licença

MIT
