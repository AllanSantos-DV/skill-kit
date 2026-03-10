# Skill Kit

Coleção de skills para a extensão **Skill Manager for Copilot** no VS Code.

> **Convenção de idioma**: Os arquivos `SKILL.md` e `references/` são escritos em **inglês** — o leitor é o agente de IA, treinado predominantemente em inglês. Os `README.md` são em **português** — o leitor é o desenvolvedor humano.

## Skills

| Skill | Descrição |
|-------|-----------|
| [contextacao](skills/contextacao/) | Análise estruturada de contexto antes de agir — questionar premissas, dependências e pontos cegos |
| [skill-creator](skills/skill-creator/) | Guia completo para criar skills bem estruturadas do zero |
| [skill-manager-guide](skills/skill-manager-guide/) | Como usar a extensão Skill Manager for Copilot |

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
