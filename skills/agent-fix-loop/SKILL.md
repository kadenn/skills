---
name: agent-fix-loop
description: Run a measured reliability loop for LLM-agent and model-driven features. Use when the user asks to harden an agent, improve eval reliability, diagnose judge-versus-trace disagreement, reduce flaky tool use, or autonomously repeat fix-test-measure cycles toward a defined target. Establish a trace-verified baseline, isolate one failure mode, make one minimal change, validate it, compare repeated trials, keep or revert, and stop at the agreed threshold. Do not use for a one-off deterministic bug that does not require behavioral measurement.
---

# Agent Fix Loop

Improve observed agent behavior through attributable experiments. Treat evaluator verdicts as supporting evidence, not ground truth. The headline metric must prove that the intended mechanism actually ran and produced the required effect.

## Establish the loop contract

Resolve these before changing code:

- system under test and repository scope;
- representative scenarios and repetitions per scenario;
- execution-level success and failure signals;
- current trace-verified baseline;
- overall target, per-scenario floor, and regression budget;
- available unit, integration, deployment, and E2E paths;
- user authorization for commits, deployments, remote writes, and reversions.

Inspect local evidence when values are discoverable. Ask only about missing choices that would materially change the experiment. Never infer permission to deploy, push, publish, or touch production.

## Build a trustworthy baseline

1. Read the raw traces or run artifacts, not only summary scores.
2. Classify infrastructure failures separately from agent capability failures.
3. Define deterministic evidence that the intended mechanism completed. Model text claiming success is not execution evidence.
4. Measure the same scenarios and repetitions that later iterations will use.
5. Report numerators and denominators overall and per scenario. Do not hide weak slices behind an average.

Read [measurement.md](references/measurement.md) when defining signals, building a classifier, or interpreting evaluator disagreement.

## Run one measured iteration

1. Select the largest real failure mode from the baseline.
2. Inspect several failing traces and the relevant code path. State one falsifiable root-cause hypothesis.
3. Make one coherent, minimal change to the mechanism that produces the target behavior. Do not count an evaluator, reporting, or acceptance-only gate as a feature fix unless detection itself is the contract. Do not combine prompt, schema, retry, routing, and model changes in the same measurement.
4. Run deterministic tests at the changed boundary.
5. Create a reversible checkpoint only when authorized and appropriate for the repository.
6. Stage or deploy to an isolated test environment when required and authorized. Verify that the tested environment runs the exact candidate revision.
7. Run the same E2E sample and repetitions as the baseline. Record raw run identifiers and environmental failures.
8. Reclassify outcomes using the execution-level signal, then compare overall and per-scenario results.
9. Keep the change only if the evidence improves and no material regression exceeds the agreed budget.

If missing source, authorization, or environment access blocks implementation, stop before the mutation but still finish the proposed iteration with an explicit same-sample remeasurement plan and keep-or-revert condition.

For a long external run, record the loop state before yielding. Use the host's wait or monitoring mechanism instead of repeatedly polling or starting unrelated changes.

## Decide without compounding uncertainty

- **Keep:** trace-verified behavior improves, regressions stay within budget, and deterministic checks pass.
- **Revert:** behavior regresses or a new safety, correctness, cost, or latency failure appears. Reverse only the owned candidate change with a repository-appropriate, non-destructive method, then verify the environment is back on the exact baseline revision. If that restored baseline already meets the agreed target, end the loop instead of proposing another experiment.
- **Inconclusive:** evidence is too noisy, the sample changed, or infrastructure failures dominate. Restore comparability before another code change.

Never stack another speculative fix on a regressed or inconclusive candidate. Never use destructive git recovery without explicit user authorization.

## Run the craft gate

A reliability metric can reward brittle prompts, duplicate code, permissive fallbacks, excessive retries, and wrong-layer workarounds. Before delivery, read [craft-gate.md](references/craft-gate.md) and review the whole candidate diff independently of the score.

## Stop at the defined target

Stop when all are true:

- the overall target and every per-scenario floor are met;
- no material regression is open;
- deterministic and E2E checks pass;
- the tested environment is confirmed fresh;
- the craft gate passes;
- remaining limitations and evidence gaps are documented.

Do not chase 100 percent after the agreed target when remaining cases are unsupported, ambiguous, or too sparse to justify more complexity.

## Preserve resumable state

Maintain a compact record of the baseline, each hypothesis, candidate revision, test sample, trace-verified results, evaluator results, regressions, decision, and next action. Use [iteration-state.md](references/iteration-state.md) for the template and authority checklist.

In every progress report, lead with the current trace-verified result, the decision for the latest candidate, and the evidence supporting the next action. Never claim reliability beyond the measured sample.
