# Trace-verified measurement

Use this reference to define the metric before the first change.

## Choose observable ground truth

The success signal should prove the behavior the feature exists to perform. Prefer, in order:

1. a completed side effect read back from its durable destination;
2. a successful tool or workflow completion event with validated output;
3. a structured state transition consumed by the next component;
4. a final response assertion only when the task is purely textual.

Do not accept a model statement such as "the operation completed" when the trace contains no corresponding execution event.

For negative scenarios, success may mean that a mechanism did not run. Define both the forbidden event and the expected safe response.

## Separate failure classes

Keep at least these categories distinct:

- `SUCCESS`: required execution evidence is present and valid;
- `AGENT_FAILURE`: routing, tool arguments, recovery, or final behavior is wrong;
- `SYSTEM_FAILURE`: unavailable dependency, expired authorization, runner crash, or test infrastructure failure;
- `UNSCORABLE`: missing or corrupt evidence prevents a defensible decision.

Report system failures alongside the capability score rather than silently counting or dropping them. Re-run them only under a documented policy applied consistently to baseline and candidate.

## Build a small deterministic classifier

Prefer a task-specific analyzer over manual judgment when the same trace structure repeats. Keep the rules narrow and inspectable.

```python
def classify(run, scenario):
    events = run.get("events", [])
    completed = any(
        event.get("type") == "tool.completed"
        and event.get("name") == scenario["required_tool"]
        and event.get("status") == "ok"
        for event in events
    )
    system_error = any(
        event.get("type") == "runner.failed"
        for event in events
    )
    if system_error:
        return "SYSTEM_FAILURE"
    if scenario.get("must_not_run"):
        return "SUCCESS" if not completed else "AGENT_FAILURE"
    return "SUCCESS" if completed else "AGENT_FAILURE"
```

Adapt fields and markers to the actual trace format. Add a rule only when a raw artifact proves it is needed.

## Compare fairly

- Use the same scenario set, inputs, environment class, model configuration, and repetition count.
- Record the exact baseline and candidate revisions.
- Report `successes / scored runs` per scenario and overall.
- Show system failures and unscorable runs separately.
- Treat small changes near the noise floor as inconclusive unless repeated evidence supports them.
- Inspect regressions even when the overall score rises.

Evaluator scores can explain user-visible quality, but they do not replace execution evidence. When they disagree, show both and base the keep-or-revert decision on the metric tied to the intended mechanism.
