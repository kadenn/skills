# Architecture review reference

Use this reference when one of the six architecture questions is not obviously `OK`.

## Right layer

Look for feature knowledge leaking into generic infrastructure, transport logic owning domain policy, UI code enforcing authorization that belongs downstream, or shared helpers branching on product-specific identifiers.

Name the layer that should own the rule. A complaint without an alternative is not an architecture finding.

## Right abstraction

Check whether a flag, options bag, string dispatch, normalizer, or pass-through exists because boundaries were not modeled directly. Prefer types and interfaces that encode the domain invariant.

Ask whether the abstraction remains coherent under the next likely requirement. Avoid platform machinery for a one-off, and avoid one-off hacks for a recurring platform need.

## Root cause

Ask: if the upstream contract were correct, would this code still be needed? If not, the change may be compensating for a symptom.

In model-driven systems, a post-processor that only repairs predictable model output is a signal to inspect the schema, field name, examples, and validation before adding more prompt prose or coercion.

## Existing capability

Search for more than matching helper names. Look for an existing registry, writer, lifecycle hook, state reducer, request client, component, or framework primitive that already owns the capability and its logging, validation, or metadata.

Do not use "the sibling does it" as proof that the sibling is correct. Reuse sound capabilities, not inherited defects.

## Consistency and completeness

Trace the full chain:

- entry point and authorization;
- parsing and validation;
- internal representation;
- persistence or state transition;
- producer and consumer contracts;
- enabled and disabled rollout paths;
- retries, partial failure, and rollback;
- user-visible output and observability.

For cross-service fields, verify name, type, shape, meaning, ownership, and deploy order in the current consumer.

## Scale and cost

Question unbounded inputs that multiply queries, fan-out, memory, model calls, or elapsed work. A minimum without a maximum is not enough when cost grows with the value.

Treat reference implementations and ports as fidelity evidence, not correctness evidence. A faithful port can preserve the source bug.
