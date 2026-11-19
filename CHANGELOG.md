# Changelog

Todas as mudanças notáveis do projeto são documentadas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [0.9.0] — 2026-11-18

### Adicionado
- **doc-to-markdown**: `convert.py --ocr` agora usa o plugin `markitdown-ocr` com cliente LLM (novo `--llm-model`) e falha com mensagem clara se faltar o plugin, o `openai` ou o modelo.
- **neural-link**: `neural-link activity` resume os logs de ativação (por evento, handler e decisão, com `--last`, `--event`, `--handler`, `--session`, `--json`); `neural-link prune --days N [--dry-run]` apaga logs e debug antigos; a ajuda deixou de anunciar o `dashboard` inexistente.
- **subagent-audit**: cada delegação e cada término de subagente (`SubagentStop`: agente, sessão, id do subagente e tamanho da mensagem final, sem o texto) vai para o log JSONL do neural-link; o `orchestrator` declara os dois eventos.
- **lesson-injector**: `--check "<texto>"` mostra o pool de lições com score e o corte (0.68), sem injetar; falha alto se o daemon não responde.
- **pre-commit-guard**: `--check "<comando>"` mostra a decisão sem executar.
- **session-context**: após compactação aponta o último snapshot do `context-save` (menos de 24 h).
- **skill-feedback**: avisa quando as reviews de uma skill ou de um agent atingem o `threshold` do `FEEDBACK.md` / `agents/.feedback/<agent>.md`.
- **pre-commit-guard**: nega `git commit` cujo diff staged adiciona credencial (formatos de provedor com prefixo e tamanho fixos, cabeçalho de chave privada) ou prepara arquivo de credencial (`.env`, `*.pem`, `id_rsa`; `.env.example` passa), e nega escrita de agente (Write/Edit/MultiEdit/`create_file`…) com credencial no conteúdo. O motivo diz arquivo, linha e tipo, nunca o valor. Saída de emergência do usuário: `SKILL_KIT_ALLOW_SECRETS=1` ou o marcador `skill-kit:allow-secret` na linha.
- **stop-alert**: alerta desktop (PowerShell oculto no Windows, bell no resto) quando uma execução longa termina; desligado por padrão, `SKILL_KIT_STOP_ALERT=<segundos>` liga, `SKILL_KIT_STOP_ALERT_CMD` troca o alerta; duração desconhecida fica em silêncio.
- **post-edit-lint**: depois de uma edição roda o linter do projeto (`.skill-kit/lint.json`, opt-in) no arquivo e devolve a saída como contexto; nunca bloqueia, e config quebrada ou linter que não roda aparecem no contexto.
- **agents**: os comandos de hook declaram `--hook-origin=skill-kit`.
- **tests/hooks/doc-to-markdown-skill.test.js** — 6 testes que prendem a redação da skill ao que o markitdown converte de fato.
- **guard**: staging escopado, dirty-check nos comandos destrutivos e cobertura de `tool_name`; normalização de caixa do comando sem afetar os flags (inclui o alias curto).
- **hooks**: dispatcher único do neural-link com a calibragem viajando em cada hook (`<hook>.neural-link.json`); descoberta de companions em `hooks/scripts`; publicação no engine-registry.

### Corrigido
- **doc-to-markdown**: `.doc` e `.ppt` deixam de ser listados como lidos pelo markitdown (converter antes com LibreOffice); `.xls` só pelo extra `[xls]`; imagem rende EXIF e legenda, texto exige o plugin de OCR e um cliente LLM; `[all]` não traz OCR e pode resolver para versão antiga. `SUPPORTED` dos scripts alinhado.
- **agents**: `implementor`, `orchestrator`, `researcher` e `validator` declaram `PreToolUse` no frontmatter (agent só com `Stop`/`SubagentStart` derruba o subagente).
- **hooks**: companions selados para o host parar de rejeitá-los; `verify-claims` checa existência no disco; companion sem caminho fixo; o aviso de calibragem não desliga mais o `SessionStart`; `executor` repassa os args do handler.
- **install**: recusa evento que o host não entrega e não aponta a máquina inteira para um checkout de desenvolvimento.
- **docs**: README e guide dos hooks descrevem o registro pelo dispatcher, sem o `hooks.json` removido; exemplo do skill-creator sem nome pessoal.

### Removido
- Workflow de CI hospedado (rodava testes em runner Windows); os testes rodam localmente.
- Backups `.legado` do controle de versão.

## [0.8.0] — 2026-07-01

### Adicionado
- **Recall semântico de lições** — nova pipeline que substitui o keyword-match do `lesson-injector` por busca vetorial via daemon MCP Memory (namespace fixo `__lessons__`, cross-project):
  - `hooks/_lib/mcp-lessons-client.js` — cliente MCP Streamable HTTP (zero deps, fail-open, nunca escreve em stdout/stderr, nunca lança). Exporta `searchLessons`/`addLessons`/`deleteLessons`/`syncLessons` + helpers puros testáveis. O `searchLessons` pede ao daemon um pool de candidatos com `minScore:0` e aplica o threshold real **client-side** (com ordenação por score): o filtro `minScore` do próprio daemon é evitado de propósito porque acima de ~0.68 ele troca para uma métrica não-cosseno (BM25-like), devolvendo scores incomparáveis — o filtro client-side garante recall determinístico e seletivo.
  - `hooks/_lib/lessons-store.js` — parse do corpus on-disk (`~/.copilot/lessons/L*.md`) em documentos (título + resumo = conteúdo embutido) + manifesto de sincronização por fingerprint.
  - `hooks/lessons-sync.js` — hook `SessionStart` silencioso que reconcilia o namespace com o disco a cada sessão (upsert do delta, prune do removido), incremental via manifesto e deadline-aware. Guarda contra prune em massa quando o disco lê zero lições.
  - `tests/hooks/mcp-lessons-client.test.js`, `tests/hooks/lesson-injector.test.js`, `tests/hooks/lessons-store.test.js`, `tests/hooks/lessons-sync.test.js` — 63 testes (mock in-process do daemon MCP; hooks exercitados como processo-filho real).

### Changed
- **hooks/lesson-injector.js** — reescrito de keyword-match (injetava até 10 lições por overlap de palavra) para recall semântico: delega ao `mcp-lessons-client`, injeta só lições acima de um score mínimo calibrado empiricamente (0.68 no bge-m3: separa queries reais, que pontuam ≥0.72, de confirmações triviais como "ok"/"obrigado", que ficam ≤0.645), com deadline e clamps de configuração. Elimina a injeção cega que inflava o contexto.
- **hooks/hooks.json** — registrado `lessons-sync.js` no `SessionStart`; timeout do `lesson-injector` elevado de 5s para 10s (agora faz recall pela rede com deadline interno de 4s).
- **CI** — adicionado job que roda os testes de hooks JS (`node --test`) em Windows e Ubuntu.
- **hooks-creator**: description do frontmatter compactada (remoção de sinônimos/duplicidades) para melhorar discoverability sem alteração de comportamento.
- **hooks**: declarado header explícito `// @permissions: <tokens>` em `context-save.js`, `lesson-injector.js`, `session-context.js` e `skill-feedback.js` para compatibilidade com o detector security-supply-chain do Skill Manager v0.23.1 — elimina diálogo "Permission mismatch" no sync.
- **hooks**: `context-confidence-check.js` e `verify-claims.js` refatorados para usar `String.prototype.matchAll` no lugar de `RegExp.prototype.exec` em loops — evita falso-positivo do detector que confunde `regex.exec()` com `child_process.exec`. Semântica equivalente (flag `g` preservada, capturas idênticas).

## [0.7.0] — 2026-04-27

### Changed
- Hooks: extracted shared I/O utilities to `hooks/_lib/hook-io.js`, reducing ~160 LoC of duplication across 10 hooks (stdin reading, stop-guard, transcript reading, stop-output formatting)
- Neural Link: extracted sensitive data sanitizer to `src/infra/sanitize.js` (was duplicated in `index.js` and `pipeline/executor.js`, security-critical)
- Neural Link: extracted config path cascade to `src/infra/config-paths.js` (was duplicated in `config.js` and `snapshot.js`)

### Removed
- Hooks PowerShell (.ps1) e Bash (.sh) — todos migrados para JavaScript (.js). Arquivos de teste legados (`tests/hooks/*.ps1`, `tests/hooks/*.sh`) também removidos.

### Fixed
- Agents: removed duplicated sections (Review Format / Consolidation) inside orchestrator.agent.md, researcher.agent.md, validator.agent.md

### Refactored
- Neural Link: deduplicated FNV-1a hash into `src/infra/hash.js` (was duplicated in 3 files: `features.js`, `config.js`, `snapshot.js`)

### Adicionado
- `hooks/session-context.js` — injeta contexto git/projeto no início de cada sessão (branch, HEAD, uncommitted, recent commits)
- `hooks/context-save.js` — salva snapshot do estado da sessão em docs/maps/ antes da compactação de contexto (PreCompact)
- Seção "Adaptive Delegation" no agente orchestrator — detecta automaticamente se `delegate_child` está disponível e adapta mecanismo de delegação
- **skill-creator**: tabela de 6 type tags de description (WORKFLOW, ENFORCEMENT, CONVERSION, MEASUREMENT, GUIDE, REFERENCE) com orientação de quando usar cada
- Type tags nas descriptions de `doc-to-markdown` (CONVERSION), `skill-benchmark` (MEASUREMENT) e `skill-manager-guide` (GUIDE)

### Changed
- **hooks-creator**: description e SKILL.md reforçados para invocação mais agressiva e **default explícito = VS Code GitHub Copilot** (Claude Code só com pedido explícito ou evidência de `.claude/`). Adicionada seção "MANDATORY DEFAULT" e regras de Platform Detection com Copilot priorizado. Card do guia atualizado.
- **hooks**: Migrated all 8 hooks from PS1/SH pairs to JavaScript (cross-platform, single file per hook). Reorganized: 5 global hooks via `hooks/hooks.json` + 3 agent-scoped hooks in frontmatter.
- **hooks-creator**: Rewritten to teach JavaScript (Node.js) as the primary hook pattern. Examples, cross-platform scripts, and pitfalls updated to reflect JS-first approach.
- **skill-creator**: limite de 300 chars reformulado como sugestão (sweet spot para atenção da LLM, max real é 1024). Se description passar de 400 chars, considerar dividir a skill em duas mais focadas.
- **copilot-instructions.md**: regras de hooks atualizadas de "PS1+SH pairs" para "JavaScript (.js) files — Node.js only, no external dependencies"

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
