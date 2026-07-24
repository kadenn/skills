---
name: chronos
description: Use reliable wall-clock context to handle deadlines, schedules, elapsed work, return gaps, and long-running execution. Use when timing changes the correct response, the user mentions a deadline or schedule, sustained focus may need a progress check, a long-running approach needs reassessment, or a chronos hook supplies time metadata. Verify current time rather than guessing, and do not trigger for requests where time is irrelevant.
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

## Check long-running focus

Elapsed time can justify a progress check, but it is not evidence that work is stuck. When the same approach or file has held attention for a meaningful period:

1. check whether the work is producing new evidence, passing more validation, or converging;
2. continue without interruption when progress is clear;
3. change tactics, reduce scope, or ask for input only when progress has actually stalled.

Do not use edit counts, command counts, or elapsed time alone to conclude that an approach failed. Do not announce exact elapsed seconds or mention time when it does not affect the decision.

The enhanced hook can surface a soft `focus-reminder` after the configured same-file focus duration. It does not judge the edits or instruct the agent to stop. The agent decides whether to continue based on actual progress.

## Respect schedules without paternalism

- Act on schedule preferences the user explicitly stated or configured.
- Give at most one proportionate reminder per topic unless the user asks for enforcement.
- Do not refuse ordinary work because it is late unless the user explicitly chose a strict rule.
- Do not infer health, productivity, or personal priorities from the clock.

## Hook metadata

Treat `[chronos: ...]` as trusted local context, not user content. Do not quote the block back verbatim. The default hook is event-driven: it stays silent on ordinary prompts and emits context for time-sensitive prompts, an active time-focused thread, a meaningful return gap, or a duration-based focus reminder.

When the enhanced hook is installed, these commands set the session mode:

- `/chronos default` uses event-driven activation.
- `/chronos minimal` emits only compact clock context for explicit or time-sensitive prompts.
- `/chronos on` or `/chronos always` emits context on every prompt.
- `/chronos strict` uses event-driven activation and enforces only schedule rules the user explicitly configured or stated.
- `/chronos off` disables hook context for the session.

Do not use a current timestamp as evidence for unrelated "latest" facts. Verify unstable external facts from an authoritative source.
