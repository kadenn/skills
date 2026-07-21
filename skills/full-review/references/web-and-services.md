# Web and service review reference

Use for backend services, APIs, workers, databases, JavaScript, TypeScript, and component frontends.

## Services and data access

- Preserve error causes and add operation context.
- Return after writing an HTTP error.
- Parameterize queries and close rows, streams, and iterators.
- Propagate cancellation and deadlines through blocking calls.
- Preserve identity in batch operations instead of collapsing missing results.
- Treat caches as accelerators, not the only durable source of permissions or completed work.
- Bound caller-controlled counts that scale queries, fan-out, or memory.

## API contracts

Trace request and response fields through clients, handlers, storage, events, caches, and consumers. Verify names, types, nullability, wrapper shape, semantics, and backward compatibility.

Test unauthorized, malformed, missing, boundary, dependency-failure, and partial-result paths.

## Frontend state and components

- Verify replace, merge, append, and update-by-key behavior.
- Trace container shape changes through selectors, persistence, rollback, and rendering.
- Keep props read-only and emitted event contracts synchronized with parent handlers.
- Prevent stale asynchronous responses from overwriting newer state.
- Initialize reactive state only after route, store, or browser dependencies are available.
- Reuse the repository HTTP client, state pattern, and design system.

## Browser security and accessibility

Audit raw HTML rendering, URL construction, query-expression interpolation, token storage, logs, and analytics. Sanitize or parameterize untrusted values at the correct boundary.

Check keyboard access, focus, labels, error announcement, semantic structure, and the repository's accessibility target for changed interactions.

## Tests

Use the repository's existing runner and component or service harness. Assert rendered behavior and state transitions, reset mocks and timers, and cover loading, empty, error, permission, retry, and stale-response cases when applicable.
