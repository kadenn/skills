# Repository instructions

- Write code, prompts, documentation, tests, and commit messages in English.
- Use ASCII hyphens instead of Unicode long dashes.
- Keep `skills/<name>/SKILL.md` as the portable source of truth.
- A skill must remain useful without lifecycle hooks. Hooks may add verified capabilities, but documentation must identify the degraded behavior when hooks are absent.
- Do not claim a feature in the README until an automated test or a documented live eval covers it.
- Keep skill frontmatter to `name` and `description`.
- Keep `SKILL.md` concise. Move details to directly linked files under `references/`.
- Preserve user control over destructive, publishing, merge, and privacy-sensitive actions.
- Run `python3 scripts/validate_repo.py` and `python3 -m unittest discover tests` before publishing.
