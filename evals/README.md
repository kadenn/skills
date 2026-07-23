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

Each case combines two grading layers:

- Deterministic gates enforce exact boundaries such as a successful process exit, forbidden claims or leaked values, question limits, and response-size limits.
- A rubric-based LLM judge evaluates usefulness, reasoning quality, evidence, and whether the answer materially satisfies each criterion.

Positive regex matches are diagnostics, not semantic pass conditions. They remain useful for spotting vocabulary drift, but a valid paraphrase does not fail merely because it omitted an expected keyword. Judge failures and subject-agent process failures are reported separately from capability failures.

Behavior cases run three times by default and require at least a two-thirds pass rate. A case is marked flaky when outcomes vary across scored runs. Use `--repetitions` and `--min-pass-rate` to change those thresholds.

The runner retries one judge process or schema failure by default and records every attempt. Use `--judge-retries 0` to disable recovery. A trial remains invalid when the final attempt fails, so infrastructure gaps cannot silently become capability passes.

## Live runs

Run one skill:

```bash
python3 evals/run_eval.py --agent codex --skill timescale
```

The other supported agent is the semantic judge by default. For example, a Codex subject run uses Claude as judge. Pin either side when reproducibility requires a specific model:

```bash
python3 evals/run_eval.py --agent codex --judge-agent claude \
  --model SUBJECT_MODEL --judge-model JUDGE_MODEL --skill timescale
```

Run the complete behavior suite:

```bash
python3 evals/run_eval.py --agent codex --all
python3 evals/run_eval.py --agent claude --all
```

Add `--baseline` to run the same task without the skill instructions. The judge receives anonymous A/B outputs and does not know which answer used the skill. The first arm is randomized per case, then alternated across repetitions to control position bias. Results record the seed and arm mapping for auditability.

Results are written under `evals/results/` and include final outputs, deterministic diagnostics, per-criterion semantic judgments, system and judge failures, duration, pass rate, flakiness, blind-arm mapping, and pairwise preference. Stored command metadata omits Claude prompt arguments, and stderr traces are omitted by default to avoid duplicating prompts, tool output, fixture contents, or private workflow instructions.

Cases containing credential-like fixture values declare `redact_patterns`. The runner evaluates exact leak gates against the original subject output, then recursively redacts matching values from stored subject traces, judge output, and result metadata. This prevents evaluation artifacts from becoming a second disclosure path without allowing redaction to hide a failed safety gate.

Run the primary case for every skill with a baseline:

```bash
python3 evals/run_eval.py --agent codex --primary --baseline
```

For a fast plumbing check, run one repetition. This is not a release-quality reliability measurement:

```bash
python3 evals/run_eval.py --agent codex --primary --baseline --repetitions 1
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
- every behavior case reaches the configured repeated-run pass rate without subject or judge infrastructure failures;
- no skill has a routing false-positive rate above 10 percent on the checked-in set;
- every skill improves or matches its blind baseline on its primary rubric across repeated runs;
- Codex and Claude Code plugin validation passes;
- Chronos hook output remains compact and contains no prompt or tool-output content;
- Shipit blocks the synthetic secret commit in direct and host-level integration tests;
- installation into an isolated directory preserves all skill resources and provenance metadata.

The LLM judge provides repeatable semantic coverage, not ground truth. Release review should sample raw outputs and judgments, especially low-confidence decisions, ties, flaky cases, and disagreements with trace or execution evidence. Trace and execution evidence take precedence over a judge verdict when they conflict.
