---
name: timescale
description: Estimate software delivery for AI-assisted execution using repository evidence, critical-path analysis, proof slices, validation cost, human decisions, and external waits. Use when the user asks how long a coding task, migration, project, or delivery plan will take, especially when traditional person-week estimates may not match an agent-led workflow.
---

# Timescale

Estimate how the work will actually be executed. Do not start with a traditional team estimate and apply an arbitrary AI discount.

## Build the forecast

1. Inspect the request, repository, relevant code, tests, and delivery constraints when they are available.
2. State the intended outcome and the definition of done. Include implementation, validation, integration, review, and rollout work that is genuinely required.
3. Separate the timeline into:
   - agent-active work: implementation, investigation, and validation performed in the execution loop;
   - human involvement: product decisions, review, credentials, specialist judgment, and approvals;
   - external elapsed time: CI queues, deploy windows, third parties, data backfills, legal review, and other waits.
4. Map dependencies and identify the critical path. Do not add parallel tasks as if they were sequential. Do not invent extra engineers when one coherent agent-led workflow is faster.
5. Identify the uncertainty that could move the estimate most. When safe, perform or propose the smallest proof slice that resolves it.
6. Produce a range from evidence. Use repository complexity, observed progress, similar completed work, integration surface, and verification cost. Widen the range when those inputs are weak.
7. Define the checkpoint that should trigger a re-estimate.

## Calibrate confidence

- **High:** the code path is inspected, the approach is established, validation is local and deterministic, and no material dependency is unresolved.
- **Medium:** the approach is likely but one integration, data, or product assumption remains.
- **Low:** the target is underspecified, access is missing, the system is unfamiliar, or success depends on untested external behavior.

Do not create false precision. Use hours for bounded work, days for multi-stage delivery, and milestones for uncertain programs.

## Output

Report:

- **Likely elapsed range:** the end-to-end critical-path forecast.
- **Agent-active work:** hands-on implementation and validation time.
- **Human involvement:** the specific decisions, reviews, or approvals needed.
- **External waits:** elapsed time outside the execution loop.
- **Confidence:** level, evidence, and assumptions.
- **Main uncertainty:** the factor with the largest schedule impact.
- **Next calibration step:** the cheapest proof or milestone that reduces uncertainty.

For larger work, add a compact critical-path breakdown. Distinguish effort from elapsed time.

## Guardrails

- Treat estimates as forecasts, not commitments.
- Do not count generated code as completed delivery before integration and verification.
- Do not compress security, migrations, compliance, production observation, or rollback planning without evidence.
- Do not assume AI speedup where the bottleneck is a human decision or an external system.
- Do not convert a one-agent task into person-weeks for appearance.
- Re-estimate from observed progress after the proof slice or first milestone.
