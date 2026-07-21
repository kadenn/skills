# Agent-system review reference

Use for LLM applications, tool calling, agent graphs, prompts, evaluators, and generated state.

## Trace the complete behavior

Follow tool registration, schema exposure, model selection, routing, tool execution, state updates, final response, and feature gates together. A tool that exists in code but is absent from the model-visible schema is unavailable in practice.

## Model-controlled input

Treat tool arguments as untrusted. Constrain file paths, commands, package names, query expressions, URLs, and output destinations before they reach a real sink.

Pydantic or schema descriptions are part of the model interface. Verify names, enums, descriptions, defaults, and examples against runtime validation.

## State

Reducers should not mutate shared input state. A shallow copy still aliases nested values. Handle empty and malformed tool results without poisoning later turns.

Trace each field through checkpoints, handoffs, parallel branches, and replay. Confirm that a write has a reader and that the reducer semantics match replace, append, or merge intent.

## Errors and terminal behavior

Return structured, model-correctable errors for invalid tool arguments. Raise infrastructure and developer failures. Remove or mark failed work so the graph does not repeat the same broken action indefinitely.

Use terminal or direct-return behavior when a tool result is already the final answer. An unnecessary model turn adds cost and can alter a correct result.

## Prompts and model choice

Do not use prompt text to compensate for a structural constraint that belongs in a schema or validator. Avoid naming another tool inside a description when availability can vary.

Question expensive models and repeated model calls when a deterministic step or smaller model satisfies the requirement. Verify model and provider override precedence.

## Evals and traces

Prefer task-level evidence and traces over a single judge score. Separate infrastructure failures from model capability failures. Test enabled and disabled paths, malformed tool calls, retries, and prompt-injection attempts.
