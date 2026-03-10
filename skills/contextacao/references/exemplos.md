# Exemplos de Análise — Boa vs. Ruim

Referência para distinguir contextação real de contextação superficial (compliance theater).

---

## Cenário: "Crie uma skill de deploy automatizado"

### ❌ Análise RUIM (teatro)

#### Premissas
| # | Premissa assumida | Verificada? | Risco se falsa |
|---|-------------------|-------------|----------------|
| 1 | O time precisa de deploy automatizado | Não | Baixo |
| 2 | Usam CI/CD | Não | Médio |

**Por que é ruim**: perguntas genéricas que poderiam ser sobre qualquer assunto. Não questionou NADA específico do contexto. "Baixo risco" sem justificativa. Preencheu a tabela para cumprir protocolo.

---

### ✅ Análise BOA (real)

#### Premissas
| # | Premissa assumida | Verificada? | Risco se falsa |
|---|-------------------|-------------|----------------|
| 1 | O problema é o deploy em si, e não a configuração entre ambientes | ❌ | **Alto** — se o problema real é config drift, a skill deveria ser de padronização de ambiente, não de deploy |
| 2 | O time já tem pipeline de CI/CD funcional e quer automatizar o último trecho | ❌ | **Alto** — se não têm CI/CD, a skill de deploy é prematura |
| 3 | Os ambientes (dev/staging/prod) têm paridade de infra | ❌ | **Médio** — se não têm, o deploy automatizado vai falhar em prod mesmo funcionando em dev |

**Por que é boa**: questiona se o pedido original ("deploy") é realmente o problema. Identifica que a causa raiz pode ser outra (5 Whys). Cada premissa tem risco justificado com consequência concreta.

---

## Cenário: "Preciso de uma API de autenticação"

### ❌ Análise RUIM

> Dependências: JWT, banco de dados, framework web.
> Confiança: 🟢 — conheço bem autenticação.

**Por que é ruim**: listou tecnologias genéricas sem questionar o contexto. "Conheço bem" é exatamente o overconfidence que gera erro. Não perguntou: OAuth2 ou API Key? Multi-tenant? Compliance com LGPD? Já existe autenticação legada?

---

### ✅ Análise BOA

> **Premissas**:
> - Assumo que é autenticação nova (greenfield), mas pode ser migração de sistema legado — se for, o escopo muda completamente
> - Assumo que JWT é aceitável, mas se houver requisito de revogação instantânea de sessão, JWT puro não atende
>
> **Dados e Conhecimento**:
> | Conhecimento | Fonte | Confiança | Ação |
> |---|---|---|---|
> | Padrões OAuth2/OIDC | Treinamento | 🟡 | Specs atualizam — consultar RFC mais recente |
> | Requisitos de compliance (LGPD, SOC2) | Desconhecido | 🔴 | Perguntar ao usuário se há requisitos regulatórios |
> | Infra existente (API Gateway, IdP) | Desconhecido | 🔴 | Sem essa info, qualquer arquitetura é chute |

**Por que é boa**: questiona se a premissa óbvia (greenfield) está correta. Sinaliza limitação técnica concreta (JWT vs. revogação). Classifica confiança com justificativa específica, não genérica. Identifica que sem saber a infra atual, não deveria propor arquitetura.

---

## Sinais de análise ruim (checklist)

- [ ] Tabelas preenchidas com texto genérico que serve para qualquer assunto
- [ ] Todos os riscos classificados como "Baixo" ou "Médio" sem justificativa
- [ ] Confiança 🟢 em tudo sem mencionar limitações do modelo
- [ ] Nenhuma pergunta feita ao usuário
- [ ] Nenhuma premissa que, se falsa, mudaria a abordagem
- [ ] Zero menção a "não sei" ou "preciso consultar"

## Sinais de análise boa (checklist)

- [x] Pelo menos 1 premissa que, se falsa, invalida a abordagem inteira
- [x] Pelo menos 1 item classificado como 🔴 (se tudo é 🟢, provavelmente é overconfidence)
- [x] Perguntas específicas ao contexto, não genéricas
- [x] Declaração explícita do que o modelo não sabe
- [x] Consequências concretas para cada risco (não apenas "pode dar problema")
- [x] Recomendação de parar ou consultar quando a confiança é baixa

---

## Casos Reais

Exemplos capturados do uso real da skill. Substituem progressivamente os exemplos hipotéticos acima conforme a skill é usada.

_Nenhum caso real registrado ainda._

<!-- Formato por caso:
### [DATA] — [ASSUNTO] — ✅ Boa / ❌ Ruim
**Contexto**: [o que foi pedido]
**O que a análise fez bem / mal**: [detalhe]
**Trecho relevante da análise**: [copiar a parte que exemplifica]
-->
