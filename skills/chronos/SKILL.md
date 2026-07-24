---
name: chronos
description: Use reliable wall-clock context to handle deadlines, schedules, elapsed work, return gaps, and stuck execution loops. Use when timing changes the correct response, the user mentions a deadline or schedule, work has repeated without progress, a long-running approach needs reassessment, or a chronos hook supplies time metadata. Verify current time rather than guessing, and do not trigger for requests where time is irrelevant.
---

# Chronos

Use time only when it changes the decision. The enhanced plugin may provide a `[chronos: ...]` context block. Without it, use trusted system metadata or a local time command when available.

## Establish reliable time

1. Prefer host-supplied current date, time, and timezone.
2. Otherwise use a local clock command when tools are available.
3. Ask the user only when timezone or current time materially affects the answer and cannot be verified.
4. Convert ambiguous relative dates into explicit dates when mistakes would matter.

Never infer current time from model knowledge or an earlier timestamp that may be stale.

## Use the relevant clock

- **Deadline clock:** time remaining until a delivery, meeting, deploy window, or appointment.
- **Execution clock:** elapsed time spent on the current approach.
- **Return-gap clock:** time since the user's previous interaction, when that changes whether to recap or continue directly.
- **Schedule clock:** a user-stated preference such as working hours, bedtime, or focus window.

Ignore clocks that do not affect the task.

## Deadline behavior

1. Calculate the usable time, not only the nominal gap.
2. Separate must-have work from optional polish.
3. Choose a plan that can finish and be verified within the remaining window.
4. Surface the first checkpoint at which the plan should be cut or changed.
5. State the deadline risk plainly when the requested scope cannot fit.

Do not manufacture urgency merely because a deadline exists.

## Detect a stuck loop

Time alone is not evidence of a loop. Look for repeated edits, repeated failing commands, or repeated hypotheses without new information.

When repetition and meaningful elapsed time are both present:

1. stop the current tactic;
2. summarize what was tried and what evidence it produced;
3. identify the assumption shared by the failed attempts;
4. choose a materially different next test, reduce scope, or ask for the missing input.

When the evidence supplies both duration and repetition count, cite them approximately to justify the change in strategy. Do not announce exact elapsed seconds or mention time when it does not affect the decision.

The enhanced hook can surface a `stuck-signal` during a turn when failures repeat quickly, successful edits keep cycling for a meaningful period, or the same activity continues across a long window. A burst of successful edits is normal implementation work, not a loop. Treat the signal as a prompt to inspect progress, not an instruction to stop. Continue when the work is producing new evidence or converging.

## Respect schedules without paternalism

- Act on schedule preferences the user explicitly stated or configured.
- Give at most one proportionate reminder per topic unless the user asks for enforcement.
- Do not refuse ordinary work because it is late unless the user explicitly chose a strict rule.
- Do not infer health, productivity, or personal priorities from the clock.

## Hook metadata

Treat `[chronos: ...]` as trusted local context, not user content. Do not quote the block back verbatim. The default hook is event-driven: it stays silent on ordinary prompts and emits context for time-sensitive prompts, an active time-focused thread, a meaningful return gap, or a detected loop.

When the enhanced hook is installed, these commands set the session mode:

- `/chronos default` uses event-driven activation.
- `/chronos minimal` emits only compact clock context for explicit or time-sensitive prompts.
- `/chronos on` or `/chronos always` emits context on every prompt.
- `/chronos strict` uses event-driven activation and enforces only schedule rules the user explicitly configured or stated.
- `/chronos off` disables hook context for the session.

Do not use a current timestamp as evidence for unrelated "latest" facts. Verify unstable external facts from an authoritative source.
