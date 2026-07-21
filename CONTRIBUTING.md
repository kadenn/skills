# Contributing

Changes should improve observable agent behavior, not only add instructions.

For a skill change:

1. Write or update concrete eval cases before changing the workflow.
2. Keep the main `SKILL.md` focused on decisions and procedure.
3. Put optional depth in directly linked reference files.
4. Test positive triggers, negative triggers, common cases, and at least one adversarial or ambiguous case.
5. Compare the changed skill against the previous version or a no-skill baseline.
6. Run the repository validators and both live-agent smoke suites before release.

Hook changes must also include deterministic input/output tests. Hooks must avoid storing prompt text, tool output, secrets, or unrelated project memory unless the user explicitly opts in.
