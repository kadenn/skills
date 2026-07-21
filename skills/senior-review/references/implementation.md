# Implementation review reference

Load this reference for non-trivial Phase 2 reviews.

## Correctness

- Test null, empty, zero, one, many, maximum, and malformed boundaries that apply.
- Trace replace versus merge behavior, identifier semantics, timezones, inclusive versus exclusive ranges, pagination, truncation, and read/write symmetry.
- Check cleanup after successful acquisition and every early return.
- Verify that cached and uncached paths return the same contract.
- Follow changed values through serialization, persistence, retries, and final rendering.

## Errors and partial results

Classify errors by who can act. Developer or infrastructure faults should fail loudly with context. User-correctable input should return a stable, actionable boundary error.

Look for broad catches, ignored errors, empty fallbacks, partial reads presented as complete, retries without bounds, and failure paths that leave corrupt or misleading state.

## Configuration and overrides

Enumerate every key accepted by a new override surface. For each merge, ask who wins. A default or `setdefault` does not enforce an invariant when callers can provide the opposite value.

Validate type and shape at the boundary. Prevent provider-specific or environment-specific values from leaking into the wrong path.

## Feature flags and rollout

Search by feature identifiers, tool names, routes, and messages, not only by the flag name. Enumerate registration, prompt, routing, state, persistence, and output behavior.

The disabled path should match pre-feature behavior unless the change explicitly defines otherwise. Verify missing-flag behavior, combinations with related flags, and deploy order.

## Security

Trace attacker-controlled and model-controlled values into:

- authorization decisions;
- SQL, search filters, regular expressions, and templates;
- files, subprocesses, package installers, and network destinations;
- logs, traces, analytics, and client-visible errors.

Require deny-by-default authorization for new privileged surfaces. Prefer parameterized APIs and established escaping helpers. Keep secrets and personal data out of output and process arguments.

## Concurrency and retries

Check ownership, cancellation, timeouts, ordering, idempotency, duplicate delivery, stale responses, and shared-state mutation. A retry must not repeat a non-idempotent side effect without protection.

## Tests

Ask what production line could be removed while the tests still pass. If the answer includes the behavior under review, mocks are hiding the contract.

Prefer behavioral assertions at the riskiest boundary, exact mock arguments where mocks are necessary, persisted read-back for writes, and explicit unauthorized and dependency-failure cases.

## Dead and duplicated code

Name the producer or caller for a new branch. If none exists, it is speculative or dead. Search both writers and readers of new keys, fields, cache entries, and state markers.
