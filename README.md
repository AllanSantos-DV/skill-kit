# Skill Kit

Coleção de **skills** e **agents** para o **GitHub Copilot** no VS Code.

> **Convenção de idioma**: Os arquivos `SKILL.md`, `.agent.md` e `references/` são escritos em **inglês** — o leitor é o agente de IA, treinado predominantemente em inglês. Os `README.md` são em **português** — o leitor é o desenvolvedor humano.

## Agents

Agents são **personas determinísticas** que controlam como o Copilot opera. Cada agent restringe as tools disponíveis e injeta instruções especializadas. Selecione-os no dropdown de agents do Chat.

| Agent | Escopo | Tools | Propósito |
|-------|--------|-------|-----------|
| [researcher](agents/researcher.agent.md) | Read-only | Busca, leitura, fetch | Entender intent, pesquisar, verificar fatos. Não edita nada. |
| [validator](agents/validator.agent.md) | Read-only | Busca, leitura, fetch | Análise estruturada dos 6 eixos, classificar confiança, pesquisa ativa. Não edita nada. |
| [implementor](agents/implementor.agent.md) | Full | Todas | Implementar com disciplina — planeja, raciocina, documenta decisões. |

### Cadeia de Agents (Handoffs)

Os agents formam um workflow guiado com transições automáticas:

```
┌─────────────┐   Validate →   ┌─────────────┐   Implement →   ┌─────────────┐
│  Researcher │ ───────────────▶│  Validator   │───────────────▶│ Implementor │
│             │                 │              │                 │             │
│ ENTENDE     │                 │ ANALISA      │                 │ EXECUTA     │
│ Pesquisa    │                 │ 6 eixos      │                 │ Plano →     │
│ Verifica    │                 │ Confiança    │                 │ Código →    │
│ Pergunta    │                 │ Pesquisa     │                 │ Task Map    │
│             │                 │ ativa        │                 │             │
│ 🔒 Read-only│                 │ 🔒 Read-only │                 │ 🔓 Full     │
└─────────────┘                 └──────────────┘                 └─────────────┘
                                                                       │
                                                                 ← Research More
                                                                       │
                                                                 (volta pro Researcher
                                                                  se descobrir gaps)
```

**O workflow é guiado, não forçado.** Você pode:
- Seguir a cadeia completa: Researcher → Validator → Implementor
- Pular etapas: selecionar Implementor direto pra tarefas simples
- Voltar atrás: o Implementor tem handoff de volta pro Researcher se descobrir que precisa de mais pesquisa

### Por que isso funciona

| Sem agents | Com agents |
|------------|-----------|
| Agente edita código na hora sem pensar | Researcher **não consegue** editar — só pesquisa |
| "A spec não é pública" (sem checar) | Researcher/Validator **verificam ativamente** com fetch antes de declarar |
| Validação depende de boa vontade do LLM | Tools do Validator são **fisicamente** restritas a leitura |
| Uma persona faz tudo (mal) | Cada agent faz **uma coisa bem** |

### Instalação dos Agents

Para **uso direto** (sem extensão): copie a pasta `agents/` para `~/.copilot/agents/`.

Para **uso por projeto**: copie para `.github/agents/` no repositório.

Os agents aparecem automaticamente no dropdown do Chat no VS Code.

## Skills

| Skill | Descrição |
|-------|-----------|
| [contextacao](skills/contextacao/) | Análise estruturada de contexto antes de agir — questionar premissas, dependências e pontos cegos |
| [task-intent](skills/task-intent/) | Entender antes de implementar — força o agente a compreender POR QUÊ/PRA QUÊ/PRA QUEM antes de escrever código |
| [task-map](skills/task-map/) | Externalizar análise e encadear tarefas — persiste decisões e contexto entre sessões |
| [skill-creator](skills/skill-creator/) | Guia completo para criar skills bem estruturadas do zero |
| [skill-manager-guide](skills/skill-manager-guide/) | Como usar a extensão Skill Manager for Copilot |

### Composição de Skills

As skills são projetadas para se **complementar** conforme a complexidade da tarefa:

```
Tarefa simples (rename, fix):
  → task-intent (rápido: "por quê?" → implementa)

Tarefa moderada (feature, refactor):
  → task-intent (entende intenção → planeja → raciocina)
  → task-map (externaliza decisões que afetam trabalho futuro)

Tarefa complexa (arquitetura, migração):
  → task-intent (análise profunda de intenção)
  → task-map (mapa completo com chain context)
  → contextação (análise estruturada dos 6 eixos)
```

### Na prática: como usar no dia a dia

As três skills de disciplina (**task-intent**, **task-map**, **contextação**) trabalham juntas, mas sem cerimônia. Não é um processo burocrático — é um reflexo que o agente incorpora.

**O fluxo real:**

1. **Você pede algo ao agente.** "Cria a autenticação do projeto" ou "Refatora o módulo de pagamento."

2. **task-intent entra em cena automaticamente.** O agente, antes de sair codando, vai parar e pensar: *por que estão pedindo isso? pra quê serve no contexto maior? quem vai usar?* Se ele não consegue responder, te pergunta — de forma cirúrgica, não genérica.

3. **O agente planeja e raciocina.** Decompõe a tarefa, apresenta o plano antes de escrever código, e declara o raciocínio em decisões importantes. Se tem alternativas com trade-offs relevantes, mostra antes de escolher.

4. **Se a tarefa impacta trabalho futuro → task-map.** O agente produz um mapa leve (`docs/maps/`) com a intenção, decisões-chave e — o mais importante — o **"For Next"**: o que a próxima tarefa precisa saber. Isso cria uma corrente de continuidade no projeto.

5. **Se a tarefa é complexa → contextação.** Quando envolve múltiplas tecnologias, dependências externas, risco em produção — o agente aprofunda com análise dos 6 eixos (premissas, escopo, dependências, fontes de verdade, modos de falha, stakeholders).

**O que muda:**

| Sem as skills | Com as skills |
|--------------|---------------|
| "Cria um CRUD de usuários" → agente implementa literalmente | "Cria um CRUD de usuários" → agente pergunta: "é pra admin ou end-user? precisa de soft delete? tem requisito de auditoria?" |
| Cada tarefa começa do zero | Cada tarefa lê o **For Next** da anterior e começa informada |
| Decisões se perdem quando a conversa fica longa | Decisões ficam no mapa — sobrevivem à compressão de contexto |
| Agente entrega rápido mas errado | Agente entrega certeiro porque entendeu a intenção real |

**Nota:** o agente escala esforço naturalmente. Um rename não ganha análise de 6 eixos. Uma migração de banco ganha tudo. Eficiência sem burocracia.

## Como Usar

### Skills (via extensão)

1. Instale a extensão [Skill Manager for Copilot](https://marketplace.visualstudio.com/items?itemName=allansantos-dv.copilot-skill-manager)
2. No VS Code → `Ctrl+Shift+P` → `Skills: Add Repository`
3. Cole: `https://github.com/AllanSantos-DV/skill-kit.git`
4. Execute `Skills: Pull All`

### Agents (manual)

1. Clone ou baixe este repositório
2. Copie a pasta `agents/` para:
   - **Global**: `~/.copilot/agents/` (disponível em todos os workspaces)
   - **Por projeto**: `.github/agents/` (compartilhado com o time)
3. Os agents aparecem no dropdown de agents do Chat no VS Code

### Tudo junto

Skills + Agents formam o ecossistema completo. Os agents consomem a disciplina das skills e garantem que ela seja aplicada via restrições determinísticas de tools.

## Contribuindo

### Skills

Crie uma pasta em `skills/` com um `SKILL.md`:

```
skills/
  nome-da-skill/
    SKILL.md        ← Obrigatório (em inglês)
    FEEDBACK.md     ← Opcional
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

## Licença

MIT
