---
name: shipit
description: Run a safe, repository-aware git delivery workflow covering status inspection, explicit staging, commit-message matching, validation, pushes, pull requests, rebases, and merges. Use when the user asks to commit, push, open or update a PR, rebase, merge, ship changes, or handle version control end to end. Preserve unrelated work, scan for secrets, and require immediate confirmation before merges or destructive git actions.
---

# Shipit

Treat version control as part of delivery, not cleanup at the end. Move the current change forward while preserving the user's work and repository conventions.

## Secret handling

Treat every credential-like value as sensitive until it is removed or independently proven safe. A label or user assertion that a value is fake is not independent proof; use the repository's documented test-value convention or scanner allowlist when one exists. Never quote the triggering line, token, or right-hand-side value in a response, including values labeled fake, example, test, or placeholder. Report only the pattern type and file, using `[REDACTED]` if a snippet is necessary.

## Start with evidence

Before mutating git state:

1. Read applicable `AGENTS.md`, `CONTRIBUTING.md`, and repository instructions.
2. Inspect status, current branch, remotes, upstream divergence, and the complete diff.
3. Identify unrelated, generated, sensitive, or user-owned changes. Do not include them implicitly.
4. Inspect recent commit subjects and any PR template. Match the dominant local convention instead of imposing one.
5. Determine the user's requested stopping point: commit, push, PR, or merge.

Read-only inspection is safe to perform as part of the workflow. Do not treat a request to "ship" as blanket permission for destructive recovery, force-push, or merge.

## Prepare a commit

1. Group changes by one coherent purpose. If the working tree contains independent concerns, propose a split before staging.
2. Stage explicit paths or hunks. Never use `git add .` without first accounting for every untracked and modified file.
3. Inspect the staged diff.
4. Run the repository's relevant tests, linters, or targeted validation in proportion to risk.
5. Scan staged filenames and added lines for likely credentials and private keys. Prefer an installed dedicated scanner such as gitleaks when available. Treat the plugin hook as defense in depth, not proof of safety.
6. Draft a concise commit message that matches the dominant history. Use a ticket prefix only when the branch, request, or repository evidence supplies the ticket.
7. Commit only the intended staged set. If hooks fail, fix the issue and retry. Do not use `--no-verify` unless the user explicitly requests it for that commit.

Do not add co-author or generated-by trailers unless the user or repository requires them.
When the user asks only for a commit message, return the message itself unless they request rationale. Do not invent body details that are not supported by the inspected diff.

## Push and open a PR

- Name a newly created branch immediately.
- Push the named feature branch and set upstream when needed.
- Never force-push a protected branch. Ask before any force-push to another branch and prefer `--force-with-lease` after checking remote state.
- Rebase or merge the target branch according to repository policy. Do not resolve semantic conflicts by choosing an entire side.
- For a large or multi-concern diff, propose reviewable PR boundaries. Preserve the original branch until split branches are safely committed.
- Use the repository PR template when present. Otherwise include a short summary, meaningful changes, and an evidence-based test plan.
- Return the PR URL and clearly state any failing, pending, or unrun checks.

## Merge gate

Immediately before merging:

1. refresh PR state, target branch, required checks, approvals, and unresolved threads;
2. state the exact PR, merge method, and branch-deletion behavior;
3. obtain explicit confirmation for this merge;
4. merge only after confirmation and required policy checks pass.

Never enable auto-merge, merge with admin bypass, change the PR base, or delete a branch without explicit authorization for that action.

## Recovery and destructive actions

- Do not use `reset --hard`, `clean -fd`, broad checkout/restore, rebase abort/skip, or stash operations without inspecting their effect on user work.
- Before a risky history operation, record the current branch, HEAD, status, and recovery path.
- Prefer reversible checkpoints such as a temporary branch or named stash only when they are appropriate and the user understands what will move.
- Stop when the target branch, ownership of changes, or intended recovery result is unclear.

## Handoff

Report:

- what changed in git state;
- commit SHA and branch, when created;
- validation performed and remaining failures;
- push or PR URL;
- the exact next action that still requires user confirmation.
