## Task: Create the skill-benchmark skill

Related: none (new skill)

### Intent
- **WHY**: Skills lack a way to objectively measure their effectiveness — authors rely on subjective "feels better" judgment
- **WHAT FOR**: Provide a repeatable, data-driven framework to validate skill quality through controlled A/B testing
- **FOR WHOM**: Skill authors who want to prove (or disprove) that their skill improves agent output

### Key Decisions

| Decision | Why this over alternatives | Verified? |
|----------|--------------------------|:---------:|
| Scripts as I/O helpers, not LLM callers | Keeps scripts standard-lib-only, avoids API key management, follows existing doc-to-markdown pattern | ✅ Read doc-to-markdown SKILL.md |
| Two-phase evaluate (prepare → finalize) | Agent handles judgment (scoring), script handles computation (aggregates). Clean separation of concerns | ✅ Matches the user's requirement for "script handles I/O, agent handles judgment" |
| YAML frontmatter parsed via regex, not PyYAML | Avoids external dependency requirement; SKILL.md frontmatter is simple key:value | ✅ Verified existing skills use simple flat frontmatter |
| Chart.js from CDN in report template | Self-contained HTML without npm/build step. CDN is standard for one-off reports | ✅ User specified CDN approach |
| Dark theme for report | User requirement; consistent with developer tooling aesthetic | ✅ Explicit requirement |
| 4 default rubric dimensions | Covers the core quality axes (correct, complete, follows patterns, handles edges). Custom dimensions supported via pass-through | ✅ User-specified dimensions |
| Feedback protocol follows active-capture pattern | Matches agent-creator and doc-to-markdown FEEDBACK.md patterns (never auto-generate feedback) | ✅ Read both FEEDBACK.md files |
| Black-box script pattern with --help | Matches established doc-to-markdown convention, prevents context pollution | ✅ Read doc-to-markdown SKILL.md |
| Self-evaluate via `--self-evaluate` flag | Pre-filled benchmark proves the skill's own value (dogfooding). Tasks hardcoded because WE know what skill-benchmark should teach. `--skill-path` optional, `--count` ignored in self-eval mode | ✅ Tested: syntax check, self-eval output, normal mode backward compat |
| Structured output dir `bench-{name}-{ts}/` | Replaces flat-file output. Keeps data/, results/, and report.html organized per-run. SKILL.md instructs the agent to create the dir; scripts receive explicit --output paths | ✅ Implemented, verified with self-eval run |
| Report i18n via `--lang` flag | TRANSLATIONS dict in report.py with `{{T_*}}` placeholders in template. JS strings injected via `{{TRANSLATIONS_JSON}}`. Supported: en, pt, es. Easy to extend | ✅ Tested: `--lang pt` produces Portuguese report, all strings verified |
| skill-kit internal benchmarks in `skill-benchmarks/` | Fixed path at repo root for dogfooding results. Committed to repo for visibility | ✅ Self-eval run placed in `skill-benchmarks/bench-skill-benchmark-20260314-164240/` |

### Done When

- [x] SKILL.md with comprehensive workflow instructions
- [x] FEEDBACK.md matching kit conventions
- [x] scripts/provision.py — reads SKILL.md, outputs benchmark template
- [x] scripts/evaluate.py — two-phase (prepare/finalize) scoring pipeline
- [x] scripts/report.py — generates HTML dashboard from scores.json
- [x] references/rubric-guide.md — explains dimensions, scoring, criteria writing
- [x] assets/report-template.html — dark theme, Chart.js, responsive
- [x] Task map documenting decisions
- [x] Self-evaluation (dogfooding) — `--self-evaluate` flag on provision.py with 5 pre-filled benchmark tasks
- [x] Structured output directory (`bench-{name}-{ts}/data/`, `results/`, `report.html`)
- [x] Report i18n — `--lang` flag with en/pt/es translations
- [x] skill-kit internal benchmark path (`skill-benchmarks/` at repo root)
- [x] Self-eval re-run with new structure + Portuguese report
- [x] Old flat files cleaned up from `skills/skill-benchmark/`

### For Next

- The provision.py regex-based frontmatter parser handles simple flat YAML only. If skills start using nested YAML (arrays, objects), it will need a proper YAML parser (PyYAML dependency).
- The sub-agent dispatch in Step 3 is described abstractly — the exact mechanism depends on the runtime environment (VS Code sub-agents, API calls, etc.). The agent following SKILL.md must adapt to whatever sub-agent mechanism is available.
- Multiple-run support in report.py averages scores across files. For true statistical analysis (confidence intervals, p-values), a more sophisticated stats module would be needed.
- All scripts target Python 3.9+ with stdlib only. This limits JSON/file I/O to standard patterns.
- Adding new languages: add a dict entry to `TRANSLATIONS` in report.py with the same keys. The template automatically picks it up.
