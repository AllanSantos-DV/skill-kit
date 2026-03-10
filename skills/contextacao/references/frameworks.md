# Frameworks de Questionamento

## 5 Whys (5 Porquês)

Pergunte "por quê?" 5 vezes para chegar à causa raiz.

**Aplicação na contextação**: quando o usuário pede algo, questione a motivação até encontrar o problema real.

Exemplo:
1. Por que precisamos de uma skill de deploy? → Porque o deploy falha frequentemente
2. Por que o deploy falha? → Porque as configs mudam entre ambientes
3. Por que as configs mudam? → Porque não temos padronização
4. Por que não temos padronização? → Porque cada dev configura manualmente
5. Por que configuram manualmente? → Porque não existe template/automação

**Resultado**: a skill real deveria ser de padronização de configs, não de deploy.

---

## First Principles (Primeiros Princípios)

Decomponha o problema até os fatos fundamentais, descartando suposições.

**Aplicação na contextação**: separe o que é **fato verificável** do que é **suposição herdada**.

Perguntas-chave:
- O que sei com certeza (fato)?
- O que estou assumindo por convenção?
- Se eu começasse do zero, chegaria à mesma conclusão?

---

## Pre-mortem

Imagine que a solução falhou. Pergunte: **por que falhou?**

**Aplicação na contextação**: antes de criar/implementar, simule os cenários de falha.

Perguntas-chave:
- Se isso der errado em produção, qual seria a causa mais provável?
- O que eu ignorei que alguém mais experiente no domínio pegaria?
- Qual parte da solução é mais frágil?

---

## MECE (Mutuamente Exclusivo, Coletivamente Exaustivo)

Garanta que a análise cobre tudo sem sobreposição.

**Aplicação na contextação**: ao decompor o assunto nos 6 eixos (premissas, escopo, dependências, dados, riscos, stakeholders), cada ponto deve estar em exatamente um eixo, e juntos devem cobrir 100% do contexto relevante.

---

## Inversão

Em vez de perguntar "como fazer certo?", pergunte "como garantir que dê errado?"

**Aplicação na contextação**: identifique anti-padrões e armadilhas antes de propor a solução.

Perguntas-chave:
- O que eu faria se quisesse que essa skill falhasse?
- Qual a maneira mais rápida de entregar algo inútil?
- O que um revisor crítico diria sobre essa abordagem?
