# Evaluation protocol

The suite measures four separate properties:

1. **Structure:** valid Agent Skills packages, manifests, references, and hook configuration.
2. **Routing:** metadata selects the intended skill and avoids unrelated tasks.
3. **Behavior:** the selected skill improves a realistic task without violating its boundaries.
4. **Integration:** Codex and Claude Code load the package, execute hooks, and preserve expected safety behavior.

Keeping these layers separate prevents a strong behavior result from hiding a bad description, or a valid package from hiding an unhelpful workflow.

## Behavior cases

Each file under `cases/` contains at least three tasks for one skill:

- a representative success path;
- an ambiguity, non-trigger, or anti-overreach path;
- a high-risk or adversarial boundary where the skill must remain safe.

Cases include coarse deterministic checks and a human-readable rubric. Regex checks catch obvious regressions. They are not a substitute for reviewing the complete output.

## Live runs

Run one skill:

```bash
python3 evals/run_eval.py --agent codex --skill timescale
```

Run the complete behavior suite:

```bash
python3 evals/run_eval.py --agent codex --all
python3 evals/run_eval.py --agent claude --all
```

Add `--baseline` to run the same task without the skill instructions. Results are written under `evals/results/` and include command status, output, deterministic checks, duration, and the case rubric.

Run the primary case for every skill with a baseline:

```bash
python3 evals/run_eval.py --agent codex --primary --baseline
```

Live runs are read-only. Fixture directories are copied to temporary workspaces. The runner does not publish comments, push branches, create repositories, or merge pull requests.

## Routing runs

`routing.json` contains positive and confusable-negative requests. The routing evaluator presents only skill metadata, not skill bodies, and asks the model to select one skill or `none`.

```bash
python3 evals/run_eval.py --agent codex --routing
python3 evals/run_eval.py --agent claude --routing
```

## Hook integration

The hook smoke runner creates isolated temporary git repositories. For each host, it proves that a safe commit succeeds, a staged synthetic credential is blocked, and the credential value is not echoed in host output.

```bash
python3 evals/run_hook_smoke.py --host all
```

## Acceptance criteria

A release candidate must satisfy all of the following:

- structural validation and deterministic tests pass;
- every behavior case passes required safety checks;
- no skill has a routing false-positive rate above 10 percent on the checked-in set;
- every skill improves or matches its baseline on its primary rubric;
- Codex and Claude Code plugin validation passes;
- Chronos hook output remains compact and contains no prompt or tool-output content;
- Shipit blocks the synthetic secret commit in direct and host-level integration tests;
- installation into an isolated directory preserves all skill resources and provenance metadata.

Human review is required before release for subjective dimensions such as usefulness, specificity, proportionality, and whether a challenge or question genuinely changes the decision.
