---
name: contextacao
description: 'Análise estruturada de contexto antes de agir. Use quando precisar questionar premissas, levantar dependências, identificar pontos cegos e validar escopo de qualquer tarefa ou assunto. Use para contextualizar, questionar, analisar antes de implementar, revisar premissas, evitar alucinação, levantamento estruturado.'
argument-hint: 'Descreva o assunto ou tarefa que precisa ser contextualizada'
---

# Contextação — Análise Estruturada de Contexto

## Propósito

Antes de responder, implementar ou criar qualquer coisa, esta skill força uma análise crítica e estruturada do contexto. O objetivo é **levantar o que realmente importa** antes de agir, evitando respostas superficiais, premissas incorretas e pontos cegos.

## Quando Usar

- Antes de criar uma skill, agente ou qualquer artefato complexo
- Quando o assunto envolve tecnologias, APIs ou padrões que podem ter mudado
- Quando a tarefa tem múltiplas interpretações possíveis
- Quando o impacto de uma decisão errada é alto
- Sempre que o usuário pedir para "contextualizar", "questionar" ou "analisar antes de agir"

## Procedimento

### Fase 0 — Triagem de Complexidade

Antes de tudo, classifique a tarefa usando os critérios objetivos abaixo. Basta **1 critério** do nível para classificar nele:

| Nível | Critérios objetivos | Profundidade |
|-------|----------------------|--------------|
| **Simples** | • 1 tecnologia envolvida • 0 dependências externas • Resultado reversível • 1 stakeholder | Fase 1 resumida (1 pergunta por eixo) + Fase 3 (só perguntas) + Fase 4 |
| **Média** | • 2-3 tecnologias • 1+ dependência externa • Múltiplas interpretações possíveis • Resultado difícil de reverter | Fases 1-4 completas |
| **Complexa** | • 4+ tecnologias • Domínio com atualizações frequentes (APIs, specs, compliance) • Múltiplos stakeholders • Impacto em produção ou dados de usuários | Fases 1-4 completas + consulta obrigatória a [frameworks](./references/frameworks.md) + exemplos de [análise boa vs. ruim](./references/exemplos.md) |

Na dúvida, classifique para cima. É melhor analisar demais do que de menos.

### Fase 1 — Decomposição do Assunto

Quebre o assunto/tarefa nos seguintes eixos. Para cada eixo, faça pelo menos 2 perguntas críticas (1 se triagem = Simples):

#### 1.1 Premissas — *"O que estou tratando como fato sem evidência?"*
- O que estou assumindo como verdade sem verificar?
- Alguma dessas premissas depende de dados que podem estar desatualizados?
- Qual premissa, se estiver errada, invalida toda a abordagem?

#### 1.2 Escopo — *"O que está dentro, fora e indefinido?"*
- O que está explicitamente incluído?
- O que está explicitamente excluído?
- O que está ambíguo e precisa de definição?

#### 1.3 Dependências — *"O que precisa existir ou funcionar para que a solução funcione?"*
- Quais tecnologias, serviços ou sistemas estão envolvidos?
- Alguma dependência tem versionamento ou ciclo de atualização que pode afetar a solução?
- Existem dependências implícitas que não foram mencionadas?

#### 1.4 Fontes de Verdade — *"De onde vem o conhecimento e ele é confiável?"*
- O conhecimento necessário está no meu treinamento ou precisa de consulta externa?
- Os dados envolvidos mudam com frequência? Se sim, qual a data da última fonte confiável que possuo?
- Existe documentação oficial que deveria ser consultada antes de prosseguir?

#### 1.5 Modos de Falha — *"Como isso pode dar errado e o que eu não enxergo?"*
- O que eu (LLM) provavelmente **não sei** sobre este assunto?
- Se essa solução falhasse em produção, qual seria a causa mais provável? (pre-mortem)
- Existe viés de "entrega rápida" na minha primeira resposta?

#### 1.6 Stakeholders e Impacto — *"Quem é afetado e quem decide?"*
- Quem será afetado pela decisão/entrega?
- Existe conflito entre o que é rápido e o que é correto?
- O resultado precisa ser validado por alguém antes de ser aplicado?

> **Fronteiras entre eixos**: Premissas = o que assumo. Fontes de Verdade = de onde vem o que sei. Modos de Falha = consequências de erros. Se um ponto se encaixa em mais de um eixo, coloque no eixo onde a **ação corretiva** é mais clara.

### Fase 2 — Classificação de Confiança

> ⚠️ **Disclaimer**: A classificação abaixo é uma **estimativa do modelo**, não um fato. LLMs tendem a ser overconfident — ou seja, classificar como 🟢 o que deveria ser 🟡. Sempre que a análise for usada para decisões de impacto, a classificação deve ser **validada por um humano** antes de prosseguir.

Para cada eixo, classifique seu nível de confiança:

| Nível | Significado | Ação |
|-------|-------------|------|
| 🟢 Alto | Tenho dados confiáveis e atualizados | Prosseguir |
| 🟡 Médio | Tenho conhecimento parcial ou possivelmente defasado | Sinalizar e buscar validação |
| 🔴 Baixo | Não tenho dados suficientes ou sei que estão desatualizados | Parar e buscar fonte externa (RAG/docs/humano) |

### Fase 3 — Plano de Ação

Com base na análise, gere:

1. **Perguntas ao usuário** (OBRIGATÓRIO) — liste as perguntas que precisam de resposta humana antes de prosseguir. Toda análise DEVE gerar pelo menos 1 pergunta. Se não há perguntas, a análise provavelmente foi superficial.
2. **O que pode ser respondido agora** — com confiança alta
3. **O que precisa de consulta** — indicar onde buscar (docs, APIs, base interna)
4. **O que precisa de validação humana** — decisões que o modelo não deveria tomar sozinho
5. **O que NÃO deve ser feito** — ações que seriam prematuras sem mais contexto

Use o [template de output](./assets/output-template.md) para estruturar a entrega.

### Fase 4 — Transparência

Sempre declare:
- Quais premissas foram assumidas e não verificadas
- Qual o nível de confiança geral da análise
- O que ficou de fora e por quê

### Fase 5 — Feedback Loop

Após entregar a análise e o usuário agir sobre ela, registre o aprendizado:

1. **Avalie o resultado**: a análise acertou? Errou? O que não foi previsto?
2. **Registre no staging**: adicione uma entrada em [retrospectivas.md](./references/retrospectivas.md) no formato:
   ```
   ### [DATA] — [ASSUNTO]
   **O que aconteceu**: [descrição curta]
   **Aprendizado**: [regra concisa]
   **Eixo afetado**: [eixo do SKILL.md]
   ```
3. **Verifique o cap**: se o staging atingiu 5 entradas, inicie o [procedimento de destilação](./references/retrospectivas.md#destilação)
4. **Capture exemplos reais**: se a análise foi particularmente boa ou ruim, salve em [exemplos.md](./references/exemplos.md) na seção "Casos Reais"

> A Fase 5 é opcional para triagem Simples. Obrigatória para Média e Complexa.

## Regras

- **NUNCA** pule direto para a solução sem passar pelas Fases 1-3
- **NUNCA** diga "não é necessário" sem justificar com evidência
- **NUNCA** classifique todos os eixos como 🟢 — se tudo parece seguro, questione se você não está sendo overconfident
- **SEMPRE** sinalize quando seu conhecimento pode estar defasado
- **SEMPRE** gere pelo menos 1 pergunta ao usuário na Fase 3 (se não há perguntas, a análise foi rasa)
- **SEMPRE** pergunte ao usuário quando a ambiguidade for alta
- Se o usuário pedir velocidade, sinalize os riscos mas respeite a decisão

## Checklist de Qualidade (auto-validação)

Antes de entregar a análise, verifique:

- [ ] Pelo menos 1 premissa que, se falsa, invalida a abordagem inteira?
- [ ] Pelo menos 1 eixo classificado como 🟡 ou 🔴?
- [ ] Pelo menos 1 pergunta ao usuário na Fase 3?
- [ ] Perguntas são específicas ao contexto (não genéricas)?
- [ ] Cada risco tem consequência concreta (não apenas "pode dar problema")?
- [ ] Declarou explicitamente o que não sabe?

Se algum item falhar, refine a análise antes de entregar. Consulte [exemplos de análise boa vs. ruim](./references/exemplos.md) para calibrar.

## Referências

- [Frameworks de questionamento](./references/frameworks.md)
- [Exemplos de análise boa vs. ruim](./references/exemplos.md)
- [Retrospectivas — staging de aprendizados](./references/retrospectivas.md)
