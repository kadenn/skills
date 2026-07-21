# Kadenn Skills

Six portable, tested workflows for AI agents. Each skill follows the open Agent Skills format and can be installed independently. The repository can also be installed as a plugin to enable optional lifecycle hooks.

| Skill | Purpose |
| --- | --- |
| `timescale` | Estimate AI-assisted delivery from evidence and critical-path work. |
| `socratic` | Learn through focused questions or turn settled thinking into output. |
| `pushback` | Challenge consequential plans without becoming an obstruction. |
| `chronos` | Use reliable wall-clock context for deadlines, schedules, and stuck loops. |
| `shipit` | Move changes through git, commits, pushes, PRs, and merges safely. |
| `senior-review` | Review architecture first, then report high-confidence implementation defects. |

## Install a skill

Preview community skills before installing them:

```bash
gh skill preview kadenn/skills timescale
```

Install one skill for a supported agent:

```bash
gh skill install kadenn/skills timescale --agent codex --scope user
gh skill install kadenn/skills socratic --agent claude-code --scope user
```

GitHub CLI supports Codex, Claude Code, Copilot, Cursor, Gemini CLI, OpenCode, Windsurf, and many other hosts. You can also use the Vercel installer:

```bash
npx skills add kadenn/skills --skill timescale --agent codex -g -y
```

## Install the enhanced plugin

The plugin installs all six skills and enables the hooks described below.

Claude Code:

```bash
claude plugin marketplace add kadenn/skills
claude plugin install kadenn-skills@kadenn-skills
```

Codex:

```bash
codex plugin marketplace add kadenn/skills
codex plugin add kadenn-skills@kadenn-skills
```

Plugin hooks require an explicit trust review before they run.

## Portable core and enhanced hooks

Every skill works from `SKILL.md` alone. Installing the plugin adds two verified enhancements:

- `chronos` injects a compact local timestamp and tracks repeated tool actions without storing prompt or tool-output content.
- `shipit` inspects staged content before agent-issued `git commit` commands and blocks likely secrets as a defense-in-depth guardrail.

`pushback` intentionally does not scrape cross-project memory. It uses conversation context, repository evidence, and memory that the host already exposes. This avoids silently moving unrelated project content into a session.

The secret check is not a replacement for GitHub secret scanning, gitleaks, or another dedicated scanner. The timestamp hook is advisory and does not override explicit user instructions.

Optional hook configuration lives at `$XDG_CONFIG_HOME/kadenn-skills/config.json`, or `~/.config/kadenn-skills/config.json` when `XDG_CONFIG_HOME` is unset:

```json
{
  "chronos": {
    "enabled": true,
    "mode": "default",
    "timezone": "Europe/London",
    "trackRepetition": true
  },
  "shipit": {
    "secretScan": true
  }
}
```

## Quality gates

The `evals/` suite covers triggering, behavior, safety boundaries, and with-skill versus baseline runs. CI runs structural validation and deterministic tests. Release candidates additionally run live Codex and Claude Code evals plus install smoke tests.

```bash
python3 scripts/validate_repo.py
python3 -m unittest discover tests
python3 evals/run_eval.py --agent codex --all
python3 evals/run_eval.py --agent claude --all
```

See [evals/README.md](evals/README.md) for the protocol and acceptance criteria.

## Versioning

Repository releases version the collection. Install a release tag or commit SHA when reproducibility matters. The six legacy repositories remain available, but this repository is the canonical source for new releases.

## License

MIT
