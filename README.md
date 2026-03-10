# Skill Kit

Coleção de skills para a extensão **Skill Manager for Copilot** no VS Code.

> **Convenção de idioma**: Os arquivos `SKILL.md` e `references/` são escritos em **inglês** — o leitor é o agente de IA, treinado predominantemente em inglês. Os `README.md` são em **português** — o leitor é o desenvolvedor humano.

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

1. Instale a extensão [Skill Manager for Copilot](https://marketplace.visualstudio.com/items?itemName=allansantos-dv.copilot-skill-manager)
2. No VS Code → `Ctrl+Shift+P` → `Skills: Add Repository`
3. Cole: `https://github.com/AllanSantos-DV/skill-kit.git`
4. Execute `Skills: Pull All`

Ou adicione como repositório oficial direto pelo prompt de primeiro uso da extensão.

## Contribuindo

Quer adicionar uma skill? Crie uma pasta em `skills/` com um `SKILL.md`:

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

## Licença

MIT
