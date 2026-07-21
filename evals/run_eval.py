#!/usr/bin/env python3
"""Run read-only behavior and routing evaluations against local agent CLIs."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
CASES_DIR = REPO_ROOT / "evals" / "cases"
FIXTURES_DIR = REPO_ROOT / "evals" / "fixtures"
RESULTS_DIR = REPO_ROOT / "evals" / "results"
SKILLS_DIR = REPO_ROOT / "skills"
SKILL_NAMES = ("timescale", "socratic", "pushback", "chronos", "shipit", "full-review")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent", choices=("codex", "claude"), required=True)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--skill", choices=SKILL_NAMES)
    target.add_argument("--all", action="store_true")
    target.add_argument("--primary", action="store_true", help="Run the first case for every skill")
    target.add_argument("--routing", action="store_true")
    parser.add_argument("--case", help="Run one behavior case id")
    parser.add_argument("--baseline", action="store_true", help="Also run without the skill")
    parser.add_argument("--model", help="Optional model override for the selected CLI")
    parser.add_argument("--timeout", type=int, default=300)
    return parser.parse_args()


def load_behavior_cases(skill: str) -> list[dict[str, Any]]:
    payload = json.loads((CASES_DIR / f"{skill}.json").read_text())
    if payload.get("skill") != skill:
        raise ValueError(f"case file skill mismatch for {skill}")
    return payload["cases"]


def parse_frontmatter(skill: str) -> dict[str, str]:
    text = (SKILLS_DIR / skill / "SKILL.md").read_text()
    match = re.match(r"\A---\n(.*?)\n---\n", text, re.DOTALL)
    if not match:
        raise ValueError(f"invalid frontmatter for {skill}")
    values: dict[str, str] = {}
    for line in match.group(1).splitlines():
        key, separator, value = line.partition(":")
        if separator:
            values[key.strip()] = value.strip().strip('"')
    return values


def prepare_workspace(case: dict[str, Any], skill: str | None) -> Path:
    root = Path(tempfile.mkdtemp(prefix="kadenn-skills-eval-"))
    fixture_name = case.get("fixture")
    if fixture_name:
        fixture = FIXTURES_DIR / fixture_name
        if not fixture.is_dir():
            raise FileNotFoundError(f"missing fixture: {fixture}")
        shutil.copytree(fixture, root, dirs_exist_ok=True)
    if skill:
        destination = root / ".agents" / "skills" / skill
        shutil.copytree(SKILLS_DIR / skill, destination)
        claude_destination = root / ".claude" / "skills" / skill
        shutil.copytree(SKILLS_DIR / skill, claude_destination)
    return root


def behavior_prompt(agent: str, case: dict[str, Any], skill: str | None) -> str:
    constraint = (
        "This is a read-only evaluation. Inspect local files when relevant, but do not modify "
        "files, use the network, publish, push, commit, or perform external actions."
    )
    task = case["prompt"]
    if not skill:
        return f"{constraint}\n\n{task}"
    if agent == "codex":
        return f"{constraint}\n\nUse ${skill} for this task.\n\n{task}"
    return f"/{skill} {constraint}\n\n{task}"


def agent_command(agent: str, workspace: Path, prompt: str, model: str | None) -> tuple[list[str], str]:
    if agent == "codex":
        command = [
            "codex",
            "exec",
            "--ephemeral",
            "--ignore-user-config",
            "--sandbox",
            "read-only",
            "--skip-git-repo-check",
            "--color",
            "never",
            "-C",
            str(workspace),
        ]
        if model:
            command.extend(["--model", model])
        command.append("-")
        return command, prompt

    command = [
        "claude",
        "--print",
        "--no-session-persistence",
        "--setting-sources",
        "project",
        "--permission-mode",
        "dontAsk",
        "--tools",
        "Read,Glob,Grep,Bash",
        "--output-format",
        "text",
    ]
    if model:
        command.extend(["--model", model])
    command.append(prompt)
    return command, ""


def run_agent(
    agent: str,
    workspace: Path,
    prompt: str,
    model: str | None,
    timeout: int,
) -> dict[str, Any]:
    command, stdin = agent_command(agent, workspace, prompt, model)
    env = os.environ.copy()
    env["NO_COLOR"] = "1"
    started = time.monotonic()
    try:
        completed = subprocess.run(
            command,
            cwd=workspace,
            input=stdin,
            text=True,
            capture_output=True,
            timeout=timeout,
            env=env,
            check=False,
        )
        return {
            "command": command,
            "exit_code": completed.returncode,
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
            "duration_seconds": round(time.monotonic() - started, 3),
        }
    except subprocess.TimeoutExpired as error:
        return {
            "command": command,
            "exit_code": 124,
            "stdout": (error.stdout or "").strip(),
            "stderr": f"timed out after {timeout} seconds",
            "duration_seconds": round(time.monotonic() - started, 3),
        }


def check_output(case: dict[str, Any], output: str, exit_code: int) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    checks.append({"check": "agent exit code", "passed": exit_code == 0, "actual": exit_code})
    for pattern in case.get("must_match", []):
        passed = re.search(pattern, output, re.MULTILINE) is not None
        checks.append({"check": f"must match {pattern}", "passed": passed})
    for pattern in case.get("must_not_match", []):
        passed = re.search(pattern, output, re.MULTILINE) is None
        checks.append({"check": f"must not match {pattern}", "passed": passed})
    if "max_questions" in case:
        count = output.count("?")
        checks.append({
            "check": "maximum question marks",
            "passed": count <= case["max_questions"],
            "actual": count,
            "expected_max": case["max_questions"],
        })
    if "max_words" in case:
        count = len(output.split())
        checks.append({
            "check": "maximum words",
            "passed": count <= case["max_words"],
            "actual": count,
            "expected_max": case["max_words"],
        })
    return {"passed": all(check["passed"] for check in checks), "checks": checks}


def run_behavior_case(
    agent: str,
    skill: str,
    case: dict[str, Any],
    baseline: bool,
    model: str | None,
    timeout: int,
) -> dict[str, Any]:
    workspace = prepare_workspace(case, None if baseline else skill)
    try:
        prompt = behavior_prompt(agent, case, None if baseline else skill)
        run = run_agent(agent, workspace, prompt, model, timeout)
        grade = check_output(case, run["stdout"], run["exit_code"])
        return {
            "skill": skill,
            "case": case["id"],
            "variant": "baseline" if baseline else "with_skill",
            "prompt": case["prompt"],
            "rubric": case.get("rubric", []),
            "run": run,
            "grade": grade,
        }
    finally:
        shutil.rmtree(workspace, ignore_errors=True)


def extract_json(text: str) -> Any:
    decoder = json.JSONDecoder()
    for index, char in enumerate(text):
        if char not in "[{":
            continue
        try:
            value, _ = decoder.raw_decode(text[index:])
            return value
        except json.JSONDecodeError:
            continue
    raise ValueError("agent output did not contain valid JSON")


def routing_prompt() -> tuple[str, list[dict[str, str]]]:
    skills = [
        {"name": name, "description": parse_frontmatter(name)["description"]}
        for name in SKILL_NAMES
    ]
    cases = json.loads((REPO_ROOT / "evals" / "routing.json").read_text())["cases"]
    prompt = (
        "You are evaluating skill routing. For each request, select exactly one skill from the "
        "provided metadata or select 'none'. Use only name and description. Do not solve the requests. "
        "Return strict JSON with this shape: {\"selections\":[{\"id\":\"case-id\","
        "\"skill\":\"skill-name-or-none\"}]}.\n\n"
        f"Skills:\n{json.dumps(skills, indent=2)}\n\n"
        f"Requests:\n{json.dumps([{'id': case['id'], 'prompt': case['prompt']} for case in cases], indent=2)}"
    )
    return prompt, cases


def run_routing(agent: str, model: str | None, timeout: int) -> dict[str, Any]:
    workspace = Path(tempfile.mkdtemp(prefix="kadenn-skills-routing-"))
    try:
        prompt, cases = routing_prompt()
        run = run_agent(agent, workspace, prompt, model, timeout)
        checks: list[dict[str, Any]] = []
        selections: dict[str, str] = {}
        parse_error = None
        try:
            payload = extract_json(run["stdout"])
            selections = {item["id"]: item["skill"] for item in payload["selections"]}
        except (KeyError, TypeError, ValueError) as error:
            parse_error = str(error)
        for case in cases:
            actual = selections.get(case["id"])
            checks.append({
                "id": case["id"],
                "expected": case["expected"],
                "actual": actual,
                "passed": actual == case["expected"],
            })
        return {
            "kind": "routing",
            "agent": agent,
            "run": run,
            "parse_error": parse_error,
            "passed": run["exit_code"] == 0 and parse_error is None and all(item["passed"] for item in checks),
            "checks": checks,
        }
    finally:
        shutil.rmtree(workspace, ignore_errors=True)


def write_results(agent: str, payload: dict[str, Any]) -> Path:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ")
    path = RESULTS_DIR / f"{timestamp}-{agent}-{payload['kind']}.json"
    path.write_text(json.dumps(payload, indent=2) + "\n")
    return path


def main() -> int:
    args = parse_args()
    if args.routing:
        payload = run_routing(args.agent, args.model, args.timeout)
        path = write_results(args.agent, payload)
        passed = payload["passed"]
        print(f"routing: {'PASS' if passed else 'FAIL'}")
        for check in payload["checks"]:
            marker = "PASS" if check["passed"] else "FAIL"
            print(f"  {marker} {check['id']}: expected={check['expected']} actual={check['actual']}")
        print(f"results: {path}")
        return 0 if passed else 1

    skills = list(SKILL_NAMES) if args.all or args.primary else [args.skill]
    results: list[dict[str, Any]] = []
    for skill in skills:
        cases = load_behavior_cases(skill)
        if args.primary:
            cases = cases[:1]
        if args.case:
            cases = [case for case in cases if case["id"] == args.case]
            if not cases:
                raise ValueError(f"unknown case for {skill}: {args.case}")
        for case in cases:
            result = run_behavior_case(args.agent, skill, case, False, args.model, args.timeout)
            results.append(result)
            print(f"{skill}/{case['id']}: {'PASS' if result['grade']['passed'] else 'FAIL'}")
            if args.baseline:
                baseline = run_behavior_case(args.agent, skill, case, True, args.model, args.timeout)
                results.append(baseline)
                print(f"{skill}/{case['id']} baseline: {'PASS' if baseline['grade']['passed'] else 'FAIL'}")

    payload = {
        "kind": "behavior",
        "agent": args.agent,
        "generated_at": dt.datetime.now(dt.UTC).isoformat(),
        "results": results,
        "passed": all(result["grade"]["passed"] for result in results if result["variant"] == "with_skill"),
    }
    path = write_results(args.agent, payload)
    print(f"results: {path}")
    return 0 if payload["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
