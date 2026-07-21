#!/usr/bin/env python3
"""Validate repository structure, skill contracts, eval data, and manifests."""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SKILLS = ("timescale", "socratic", "pushback", "chronos", "shipit", "full-review")
FRONTMATTER_KEYS = {"name", "description"}
FORBIDDEN_TEXT = ("\u2013", "\u2014", "USER/", "[TODO", "not published yet", "scaffold")
TURKISH_SPECIFIC = set("çğıöşüÇĞİÖŞÜ")
TEXT_SUFFIXES = {".md", ".py", ".js", ".json", ".yaml", ".yml", ".txt", ".diff"}


def parse_frontmatter(path: Path) -> dict[str, str]:
    text = path.read_text()
    match = re.match(r"\A---\n(.*?)\n---\n", text, re.DOTALL)
    if not match:
        raise ValueError("missing or malformed frontmatter")
    values: dict[str, str] = {}
    for line in match.group(1).splitlines():
        key, separator, value = line.partition(":")
        if not separator:
            raise ValueError(f"unsupported multiline frontmatter line: {line!r}")
        values[key.strip()] = value.strip().strip('"')
    return values


def relative_links(text: str) -> list[str]:
    return re.findall(r"\[[^\]]+\]\((?!https?://|#)([^)]+)\)", text)


def validate_skill(name: str) -> list[str]:
    errors: list[str] = []
    directory = ROOT / "skills" / name
    skill_path = directory / "SKILL.md"
    if not skill_path.is_file():
        return [f"skills/{name}: missing SKILL.md"]
    try:
        frontmatter = parse_frontmatter(skill_path)
    except ValueError as error:
        return [f"{skill_path.relative_to(ROOT)}: {error}"]

    if set(frontmatter) != FRONTMATTER_KEYS:
        errors.append(f"skills/{name}/SKILL.md: frontmatter keys must be name and description only")
    if frontmatter.get("name") != name:
        errors.append(f"skills/{name}/SKILL.md: name must match directory")
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name):
        errors.append(f"skills/{name}: invalid skill name")
    description = frontmatter.get("description", "")
    if not 1 <= len(description) <= 1024:
        errors.append(f"skills/{name}/SKILL.md: description must be 1 to 1024 characters")

    text = skill_path.read_text()
    if len(text.splitlines()) >= 500:
        errors.append(f"skills/{name}/SKILL.md: must stay under 500 lines")
    if len(text.split()) >= 5000:
        errors.append(f"skills/{name}/SKILL.md: must stay under 5000 words")
    if (directory / "README.md").exists():
        errors.append(f"skills/{name}: README.md belongs at repository level, not inside a skill")

    for link in relative_links(text):
        target = (directory / link).resolve()
        try:
            target.relative_to(directory.resolve())
        except ValueError:
            errors.append(f"skills/{name}/SKILL.md: link escapes skill directory: {link}")
            continue
        if not target.exists():
            errors.append(f"skills/{name}/SKILL.md: missing linked resource: {link}")

    openai_yaml = directory / "agents" / "openai.yaml"
    if not openai_yaml.is_file():
        errors.append(f"skills/{name}: missing agents/openai.yaml")
    else:
        metadata = openai_yaml.read_text()
        for field in ("display_name", "short_description", "default_prompt"):
            if not re.search(rf"^\s*{field}:\s*\".+\"\s*$", metadata, re.MULTILINE):
                errors.append(f"skills/{name}/agents/openai.yaml: missing quoted {field}")
        if f"${name}" not in metadata:
            errors.append(f"skills/{name}/agents/openai.yaml: default prompt must mention ${name}")
    return errors


def load_json(path: Path, errors: list[str]) -> Any:
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"{path.relative_to(ROOT)}: invalid JSON: {error}")
        return None


def validate_evals() -> list[str]:
    errors: list[str] = []
    ids: set[str] = set()
    for skill in SKILLS:
        path = ROOT / "evals" / "cases" / f"{skill}.json"
        payload = load_json(path, errors)
        if not isinstance(payload, dict):
            continue
        if payload.get("skill") != skill:
            errors.append(f"{path.relative_to(ROOT)}: skill field mismatch")
        cases = payload.get("cases")
        if not isinstance(cases, list) or len(cases) < 3:
            errors.append(f"{path.relative_to(ROOT)}: expected at least three cases")
            continue
        for case in cases:
            if not isinstance(case, dict):
                errors.append(f"{path.relative_to(ROOT)}: each case must be an object")
                continue
            case_id = case.get("id")
            if not isinstance(case_id, str) or not case_id:
                errors.append(f"{path.relative_to(ROOT)}: case missing id")
            elif f"{skill}:{case_id}" in ids:
                errors.append(f"{path.relative_to(ROOT)}: duplicate case id {case_id}")
            else:
                ids.add(f"{skill}:{case_id}")
            if not isinstance(case.get("prompt"), str) or not case["prompt"].strip():
                errors.append(f"{path.relative_to(ROOT)}:{case_id}: missing prompt")
            if not isinstance(case.get("rubric"), list) or not case["rubric"]:
                errors.append(f"{path.relative_to(ROOT)}:{case_id}: missing rubric")
            for field in ("must_match", "must_not_match"):
                for pattern in case.get(field, []):
                    try:
                        re.compile(pattern)
                    except re.error as error:
                        errors.append(f"{path.relative_to(ROOT)}:{case_id}: invalid regex {pattern!r}: {error}")
            fixture = case.get("fixture")
            if fixture and not (ROOT / "evals" / "fixtures" / fixture).is_dir():
                errors.append(f"{path.relative_to(ROOT)}:{case_id}: missing fixture {fixture}")

    routing_path = ROOT / "evals" / "routing.json"
    routing = load_json(routing_path, errors)
    if isinstance(routing, dict):
        valid = set(SKILLS) | {"none"}
        routing_ids: set[str] = set()
        for case in routing.get("cases", []):
            if case.get("id") in routing_ids:
                errors.append(f"evals/routing.json: duplicate id {case.get('id')}")
            routing_ids.add(case.get("id"))
            if case.get("expected") not in valid:
                errors.append(f"evals/routing.json:{case.get('id')}: invalid expected skill")
    return errors


def validate_manifests() -> list[str]:
    errors: list[str] = []
    codex = load_json(ROOT / ".codex-plugin" / "plugin.json", errors)
    claude = load_json(ROOT / ".claude-plugin" / "plugin.json", errors)
    claude_market = load_json(ROOT / ".claude-plugin" / "marketplace.json", errors)
    codex_market = load_json(ROOT / ".agents" / "plugins" / "marketplace.json", errors)
    versions = []
    for payload in (codex, claude):
        if isinstance(payload, dict):
            if payload.get("name") != "kadenn-skills":
                errors.append("plugin manifest name must be kadenn-skills")
            versions.append(payload.get("version"))
    if isinstance(claude_market, dict):
        plugins = claude_market.get("plugins", [])
        if len(plugins) != 1 or plugins[0].get("name") != "kadenn-skills":
            errors.append("Claude marketplace must contain kadenn-skills")
        elif plugins[0].get("version"):
            versions.append(plugins[0]["version"])
    if len(set(versions)) > 1:
        errors.append(f"plugin versions must match: {versions}")
    if isinstance(codex_market, dict):
        plugins = codex_market.get("plugins", [])
        if len(plugins) != 1:
            errors.append("Codex marketplace must contain one plugin")
        else:
            plugin = plugins[0]
            if plugin.get("policy", {}).get("installation") != "AVAILABLE":
                errors.append("Codex marketplace installation policy must be AVAILABLE")
            if plugin.get("policy", {}).get("authentication") != "ON_INSTALL":
                errors.append("Codex marketplace authentication policy must be ON_INSTALL")
    hooks = load_json(ROOT / "hooks" / "hooks.json", errors)
    required_events = {"SessionStart", "UserPromptSubmit", "PostToolUse", "PreToolUse"}
    if isinstance(hooks, dict) and set(hooks.get("hooks", {})) != required_events:
        errors.append("hooks/hooks.json: unexpected lifecycle event set")
    return errors


def validate_text() -> list[str]:
    errors: list[str] = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix not in TEXT_SUFFIXES:
            continue
        relative = path.relative_to(ROOT)
        if "evals/results" in relative.as_posix() or ".git" in relative.parts:
            continue
        if relative == Path("scripts/validate_repo.py"):
            continue
        text = path.read_text(errors="replace")
        for forbidden in FORBIDDEN_TEXT:
            if forbidden in text:
                errors.append(f"{relative}: contains forbidden text {forbidden!r}")
        found_turkish = sorted(set(text) & TURKISH_SPECIFIC)
        if found_turkish:
            errors.append(f"{relative}: contains Turkish-specific characters {''.join(found_turkish)!r}")
    return errors


def validate() -> list[str]:
    errors: list[str] = []
    actual_skills = {path.name for path in (ROOT / "skills").iterdir() if path.is_dir()}
    if actual_skills != set(SKILLS):
        errors.append(f"skills directory mismatch: expected {sorted(SKILLS)}, found {sorted(actual_skills)}")
    for skill in SKILLS:
        errors.extend(validate_skill(skill))
    errors.extend(validate_evals())
    errors.extend(validate_manifests())
    errors.extend(validate_text())
    return errors


def main() -> int:
    errors = validate()
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        print(f"Validation failed with {len(errors)} error(s).")
        return 1
    print("Repository validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
