# Skill Kit

A collection of skills for the **Skill Manager for Copilot** VS Code extension.

## Skills

| Skill | Description |
|-------|-------------|
| [skill-creator](skills/skill-creator/) | Create complete, well-structured Copilot skills from scratch |
| [skill-manager-guide](skills/skill-manager-guide/) | How to use the Skill Manager extension |

## Usage

1. Install the [Skill Manager for Copilot](https://marketplace.visualstudio.com/items?itemName=allansantos-dv.copilot-skill-manager) extension
2. Open VS Code → `Ctrl+Shift+P` → `Skills: Add Repository`
3. Paste: `https://github.com/AllanSantos-DV/skill-kit.git`
4. Run `Skills: Pull All`

Or add it as the official repo directly from the extension's first-run prompt.

## Contributing

Want to add a skill? Create a folder under `skills/` with a `SKILL.md`:

```
skills/
  your-skill-name/
    SKILL.md        ← Required
    FEEDBACK.md     ← Optional
    references/     ← Optional
```

See [Creating Skills](skills/skill-manager-guide/references/creating-skills.md) for details.

## License

MIT
