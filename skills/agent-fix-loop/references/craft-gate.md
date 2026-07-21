# Pre-delivery craft gate

Run this after the measured target is met and before publishing the change. The behavioral metric answers whether the candidate works on the sample, not whether the implementation belongs in the codebase.

## Architecture and reuse

- Search for existing helpers, schemas, lifecycle hooks, routing primitives, and retry policies before keeping new machinery.
- Confirm the change lives at the layer that owns the invariant.
- Prefer a schema or deterministic constraint when prompt prose is compensating for a structural problem.
- Verify every new state field has a producer, consumer, and defined merge or replacement behavior.

## Speculative and dead behavior

- Name the real trace, caller, or producer that requires every fallback and normalization branch.
- Delete branches justified only by hypothetical malformed input.
- Remove experiments, debug output, temporary evaluators, and unused compatibility paths.

## Consistency and safety

- Sweep all call sites after changing a shared contract.
- Check authorization, privacy, injection, secret handling, and unsafe side effects at tool boundaries.
- Bound retries, fan-out, context growth, and model calls.
- Verify cancellation, timeout, duplicate delivery, and idempotency behavior where applicable.

## Tests and delivery

- Add deterministic coverage at the failure boundary fixed by the iteration.
- Keep E2E evidence separate from unit-test evidence.
- Review the complete candidate diff, not only the last iteration.
- Confirm rollback or disable behavior and document material residual risk.

Do not keep a workaround merely because it raised the score. Keep it only when both the behavioral evidence and the code-quality review support it.
