---
name: full-review
description: Run an architecture-first, high-signal review of a pull request, branch, commit range, patch, or working-tree diff. Use when the user asks for a full review, deep review, architecture review, senior review, or a review that must prioritize concrete bugs and design risks over lint-style commentary. Inspect beyond the diff, lock architectural conclusions, then report only evidence-backed implementation findings.
---

# Full Review

Review in two gated phases. First decide whether the change belongs and is shaped correctly. Then inspect implementation correctness. A line fix is wasted when the code should not exist in that form.

## Resolve scope and delivery mode

Determine the target from the request:

- PR: inspect metadata, base and head SHAs, changed files, checks, and existing review threads.
- Branch or commit range: resolve the merge base and review the resulting diff.
- Working tree: include staged and unstaged changes as requested.
- Supplied patch: treat the patch and provided repository context as the review target.

Default to a report. Use interactive architecture locking when the user requests collaboration. Publish comments or modify code only when explicitly authorized.

## Gather evidence beyond the diff

1. Read applicable repository instructions from the root through modified directories.
2. Read each changed function or component in full, plus relevant callers, consumers, tests, and sibling implementations.
3. Search the repository for existing abstractions, constants, contracts, and feature identifiers related to the change.
4. Trace changed contracts across service or package boundaries. Verify current producers and consumers instead of assuming the other side handles them.
5. Load only the references needed for the target:
   - [architecture.md](references/architecture.md) for difficult design decisions;
   - [implementation.md](references/implementation.md) for detailed correctness and safety checks;
   - [agent-systems.md](references/agent-systems.md) for LLM, tool, prompt, and state changes;
   - [web-and-services.md](references/web-and-services.md) for backend and frontend changes;
   - [publishing.md](references/publishing.md) before posting review comments.

The live repository is authoritative. References are review angles, not a reason to impose a stale convention.

## Phase 1: architecture verdict

Answer every question explicitly with `OK`, `Question`, or `Problem`:

1. Does this code live in the right layer and module?
2. Is the abstraction simpler and more durable than the implementation detail it wraps?
3. Does the change solve the root problem instead of a downstream symptom?
4. Does the repository or framework already provide this capability?
5. Does the approach match how this codebase solves the same class of problem?
6. Is the change complete across callers, consumers, contracts, authorization, rollout, and rollback?

For every `Question` or `Problem`, provide:

- the evidence;
- the concrete cost or failure mode;
- the recommended layer, abstraction, or existing capability to use.

Do not manufacture an architecture issue. A clean verdict is valid.

### Lock the verdict

- In interactive mode, present the architecture verdict and stop until open decisions are accepted, redesigned, or explicitly deferred.
- In report mode, record the verdict first and continue. Mark implementation findings as conditional when an architecture decision could make them moot.

Do not mix architecture observations into a long list of line comments.

## Phase 2: implementation review

Inspect the changed behavior top-down:

1. correctness and boundary cases;
2. error classification, propagation, cleanup, and partial failure;
3. data, API, persistence, and serialization contracts;
4. authorization, injection, secrets, privacy, and unsafe side effects;
5. configuration, override precedence, feature flags, and disabled behavior;
6. concurrency, retries, idempotency, ordering, and cancellation;
7. tests at the riskiest boundary;
8. dead, unreachable, duplicated, or speculative code introduced by the change.

Do not spend review findings on formatting, imports, naming taste, or failures reliably enforced by the compiler, formatter, linter, or existing CI.

## Evidence gate

Keep an implementation finding only when all are true:

- It is introduced by the change or directly exposed by the changed behavior.
- Confidence is at least 80 out of 100.
- A concrete input, state, sequence, or threat produces a wrong result or meaningful risk.
- The relevant code path and repository convention were verified.
- The suggested correction is applicable to this repository.

Architecture findings use a different bar: a senior engineer would raise the issue in design review, the maintenance or delivery cost is concrete, and a better direction is named.

When evidence is incomplete, investigate further or label the observation as an unresolved question. Do not present speculation as a bug.

## Severity

- **HIGH:** data loss, security exposure, authorization bypass, production outage, corrupt state, or a core path that cannot work.
- **MEDIUM:** incorrect behavior in a realistic path, silent partial result, broken rollout, retry or concurrency defect, or substantial avoidable rework.
- **LOW:** real but limited correctness or maintenance cost that a senior reviewer would still ask to change.

Omit nits by default.

## Output

Lead with findings and risks, not a congratulatory summary.

### Architecture verdict

List the six answers compactly. Expand only `Question` and `Problem` items with evidence, cost, and direction.

### Implementation findings

Order by severity. For each finding include:

- severity and a direct title;
- `file:line` or the narrowest available location;
- concrete failure scenario or cost;
- evidence checked;
- a focused fix.

### Coverage

State which files and boundaries were reviewed, what validation ran, and any material area that could not be verified.

If there are no findings, the Implementation findings section must contain exactly `No findings passed the evidence gate.` Put material residual gaps under Coverage. Never add an `I checked for` list or reveal rejected candidates, hypothetical inputs, or the internal filtering process.

## Final self-check

Before returning the review, confirm:

- every changed file is accounted for;
- the architecture verdict is present;
- every reported finding passed the evidence gate;
- severity reflects impact, not stylistic preference;
- high and medium findings have applicable fixes;
- configuration, flag-off behavior, security sinks, and cross-boundary contracts were checked when relevant;
- no comment repeats an already resolved thread without new evidence.
