# Changelog

Todas as mudanças notáveis do projeto são documentadas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Unreleased]

### Adicionado
- Seção "Adaptive Delegation" no agente orchestrator — detecta automaticamente se `delegate_child` está disponível e adapta mecanismo de delegação

### Changed
- **hooks**: Migrated all 8 hooks from PS1/SH pairs to JavaScript (cross-platform, single file per hook). Reorganized: 5 global hooks via `hooks/hooks.json` + 3 agent-scoped hooks in frontmatter.
- **hooks-creator**: Added UTF-8 BOM and em-dash/en-dash rules to PS 5.1 compatibility gotchas

## [0.6.0] — 2026-04-13

### Adicionado
- Redesign completo do `index.html` — tema dark (#0d1117), hero com gradient, seção Neural Link com badge "NEW", glassmorphism cards
- Redesign dos 3 guides (`agents/guide.html`, `skills/guide.html`, `hooks/guide.html`) — design system unificado com index.html
- Neural Link runtime incluído no Skill Kit (em `neural-link/`)
- Documentação de `permissionDecisionReason` na skill hooks-creator (SKILL.md, platform-reference.md, examples.md)
- Seção "Como Usar na Prática" adicionada em `index.html` (Pages) — tutoriais práticos sobre agents, skills e hooks
- Seção de adaptive delegation no agent `orchestrator` — documentação e exemplos de uso para delegação adaptativa

### Alterado
- `pre-commit-guard` hooks (.ps1/.sh): adicionado campo `permissionDecisionReason` ao output JSON — VS Code agora exibe motivo descritivo no prompt de confirmação "ask"/"deny"
- README.md reestruturado com foco em onboarding: header com tagline, Quick Start, e explicações acessíveis
- **hooks-creator**: Adicionadas regras de BOM UTF-8 e tratamento de em-dash/en-dash para compatibilidade com PowerShell 5.1

### Removido
- `docs/` removido do versionamento (agora controle local apenas)

## [0.5.0] — 2026-03-18

### Alterado
- `pre-commit-guard` hook: `git reset --hard` policy changed from deny to ask (recoverable via reflog)
- `pre-commit-guard` hook: `git push --force-with-lease` now distinguished from `--force` — ask instead of deny
- `pre-commit-guard` hook: `git clean -f` policy changed from deny to ask (routine cleanup operation)

### Adicionado
- CI com GitHub Actions: testes estruturais e de hooks em matrix Windows + Ubuntu
- Testes unitários para hook `pre-commit-guard` (PS1 + SH, 20 casos cada)
- Skill **safety-check**: análise de risco com peso variável (Light/Standard/Deep)
- Skill **error-learning**: registro e generalização de erros em lições reutilizáveis
- Hook **lesson-injector**: injeta lições aprendidas no contexto do agente
- Orchestrator evoluído para modelo de signal matrix (substitui paths fixos A/B/C/D)
- Modelo de peso variável para skills (Light/Standard/Deep)
- Testes estruturais para agents e skills (`tests/structural/`)
- Seção de Hooks no README
- Seção de Testes no README
- Referência de hooks na skill agent-creator
- Regra de prioridade de fontes nos agents

### Alterado
- Agents deduplicados: referenciam skills em vez de duplicar conteúdo
- Orchestrator agora tem awareness explícito de skills com tabela de profundidade
- `pre-commit-guard` suporta comandos encadeados (`;`, `&&`, `||`)
- Guides HTML atualizados com error-learning, safety-check e PreToolUse hooks
- `FEEDBACK.md` agora obrigatório para todas as skills (não mais opcional)

### Corrigido
- Bug de crash de subagent com hooks que tinham apenas `Stop` (sem `PreToolUse`)
- `.sh` hook tests fazem SKIP no Windows em vez de FAIL

## [0.4.0] — 2026-03-17

### Adicionado
- Skill **skill-benchmark**: framework de benchmark A/B para medir efetividade de skills
- Task prompts expandíveis no skill-benchmark
- Sistema de feedback ativo com hooks `skill-feedback`
- Hook `context-confidence-check` registrado em todos os 4 agents
- Evidência de ferramentas na tabela de confiança da skill contextação

### Alterado
- `skill-feedback` usa formato `block+reason` para output visível ao agente
- `pre-commit-guard` output encapsulado em `hookSpecificOutput`
- Hook `verify-claims` com escopo limitado à interação atual e tools de busca adicionadas

### Corrigido
- Stop hook enforcement na skill hooks-creator
- `systemMessage` movido para top-level nos hooks
- `hookSpecificOutput` warning documentado na hooks-creator
- Audit fixes em hooks diversos
- Hook `skill-feedback` com `block+reason`
- Top-level `decision/reason` em Stop hooks de custom agents
- Substituição de `%USERPROFILE%` por `$HOME` nos agents
- Escape de `\v` em YAML (backslash-v interpretado como vertical tab)
- Compatibilidade com PowerShell 5.1 nos hooks
- Conformidade com spec de conventional commits

## [0.3.0] — 2026-03-17

### Adicionado
- Hook **pre-commit-guard**: guarda contra `git push`, `git tag` sem confirmação; valida conventional commits
- Hook **verify-claims**: verifica afirmações do agente contra evidências
- Scripts auxiliares `audit_overflow` e `check_placeholders`
- Modo inject para PPTX/XLSX/Project na skill markdown-to-document
- Hooks guides e documentação atualizada

### Alterado
- Qualidade e robustez dos hook scripts melhoradas
- Hooks-creator skill atualizada com regras de escopo e schema de output Stop

### Removido
- **BREAKING**: Comandos e infraestrutura do Claude Code removidos (`feat!: remove Claude Code`)

## [0.2.0] — 2026-03-16

### Adicionado
- Skill **hooks-creator**: criação de hooks de lifecycle para agents
- Skill **doc-to-markdown**: conversão de documentos binários para Markdown (inclui MS Project)
- Skill **markdown-to-document**: geração de documentos formatados a partir de Markdown
- Hook scripts no diretório `hooks/` para distribuição via extensão
- Lifecycle hooks adicionados a todos os 4 agents
- Suporte a comandos Claude Code (`cc-` prefixed) e hooks Claude
- Seções de Companion Skills nas skills existentes
- HTML guides para skills, agents e hooks

### Alterado
- Agents alinhados com LLM best practices (duas rodadas de refactoring)
- Skills padronizadas com patterns do hub oficial
- Frontmatter descriptions padronizadas
- Skill-manager-guide usa placeholder `YYYY-MM-DD`
- Scripts de hooks movidos para `~/.copilot/hooks/scripts/` (global)

### Corrigido
- Leitura de stdin em hooks PS1
- `hooks-config.json` cross-platform
- Quoting de hooks Claude
- Single-quote path em comandos Windows
- Qualidade de dados em hooks (13 correções)

## [0.1.0] — 2026-03-11

### Adicionado
- Skill **skill-manager-guide**: guia de uso da extensão Skill Manager
- Skill **skill-creator**: criação de skills estruturadas
- Skill **contextação**: análise estruturada de contexto antes de agir
- Skill **task-intent**: validação de intent antes de implementar
- Skill **task-map**: persistência de decisões entre tarefas
- Diretiva de pesquisa ativa (Active Research)
- Cadeia determinística de agents: Researcher → Validator → Implementor
- Agent **orchestrator**: coordenador inteligente (evoluído de router puro para smart coordinator)
- Feedback files para agents
- `.skillconfig.json` com `forceGlobal`

### Alterado
- Convenções de idioma do repo padronizadas
- Agents usam tool sets + integração MCP
- Regras de herança de tools corrigidas (implementor sem whitelist explícita)
