# Iteration state and authority

Use a durable state record so a long-running loop can resume without reconstructing decisions from chat history.

## Loop state template

```markdown
# Reliability loop

## Contract
- System and scope:
- Real success signal:
- Failure signal:
- Scenario set and repetitions:
- Overall target and per-scenario floor:
- Regression budget:
- Authorized actions:

## Baseline
- Revision and environment:
- Trace-verified result:
- Evaluator result:
- System failures:
- Dominant agent failure:

## Iterations
| ID | Hypothesis | One change | Candidate | Real result | Judge result | Regressions | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Current state
- Environment revision:
- Kept candidate:
- Next action:
- Known limitations:
```

Reference raw artifacts by stable run IDs or paths. Do not copy secrets, user data, full prompts, or large tool outputs into the state document.

## Authority checklist

Record whether the user has authorized each action independently:

- edit local files;
- create a local commit or checkpoint;
- deploy to an isolated test environment;
- run paid or rate-limited evaluations;
- push a branch or update a pull request;
- revert an owned candidate;
- modify shared or production systems.

Permission for one item does not imply the others. Stop and ask when the next required action exceeds the granted scope.

## Environment freshness

Before scoring a candidate, prove that the test environment runs that candidate:

- compare the deployed or staged revision with the candidate revision;
- verify configuration and model overrides;
- record the deployment completion time and test start time when relevant;
- reject results from a stale or mixed environment.

After reverting, restage or redeploy the accepted baseline and verify freshness again before continuing.
