# Publishing review comments

Load this reference before posting comments or reviews to a remote pull request.

## Freshness

Refresh the PR head SHA, diff, checks, and existing threads immediately before publishing. Do not post an inline comment against a stale line or a finding that was already fixed.

## Evidence

Identify the source of correct behavior: implementation, contract, documentation, compiler, product rule, or reproducible output. Compare against that source, not only a sibling implementation.

Publish an implementation finding only when the concrete scenario and ground truth are both verified. Keep unresolved questions in the report instead of presenting them as bugs.

Architecture comments should cite the established pattern and concrete cost. Post them as top-level review comments when they span multiple files.

## User approval

- Explain the scenario, invariant, evidence, and fix in plain language.
- Draft the exact comment.
- Obtain explicit approval before posting under the user's identity.
- Post one approved comment or an explicitly approved batch.
- Never request reviewers, change the base branch, merge, close, or alter notification-producing state without authorization.

Keep comments concise, evidence-first, and actionable. Do not weaken a valid point with an apologetic closing sentence.
