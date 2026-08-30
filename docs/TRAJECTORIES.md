# Representative Agent Trajectories

HeapSleuth stores one JSONL trajectory per solution run. Each line is a
validated observable event such as a run start, bounded source read, browser
measurement, model request, parsed response, verifier decision, or final result.
The files expose actions and decision summaries, not private chain-of-thought or
credentials.

## Leak diagnosis: event listener

**Selected trajectory:**
[`trajectories/event-listener/890e02a2-d6f4-4f5c-997b-ab3a35416cba.jsonl`](../trajectories/event-listener/890e02a2-d6f4-4f5c-997b-ab3a35416cba.jsonl)

Why it is representative:

- it contains both the Investigator and Verifier requests;
- it records three deterministic mount/unmount cycles;
- the browser forces garbage collection twice around each sample;
- the final runtime state reports three retained resources and three additional
  listeners after GC;
- the Investigator localizes the issue to `EventListenerCase.tsx`;
- the Verifier accepts the leak diagnosis based on source and retained runtime
  evidence.

Supporting artifacts:

- [`browser-evidence.json`](../results/solution/event-listener/browser-evidence.json)
- [`investigator-result.json`](../results/solution/event-listener/investigator-result.json)
- [`verification.json`](../results/solution/event-listener/verification.json)
- [`report.md`](../results/solution/event-listener/report.md)
- [`run-metadata.json`](../results/solution/event-listener/run-metadata.json)

This trajectory demonstrates the complete browser → Investigator → Verifier path
with a positive retained signal.

## No-leak diagnosis: healthy control

**Selected trajectory:**
[`trajectories/healthy-control/26d5d537-0007-4963-b12b-816cfdfdbaed.jsonl`](../trajectories/healthy-control/26d5d537-0007-4963-b12b-816cfdfdbaed.jsonl)

Why it is representative:

- it exercises the same browser and two-agent workflow as leak cases;
- three instances are created and all three resources are released;
- retained resources and listener delta remain zero after forced GC;
- the Investigator returns `no-leak` rather than treating heap growth alone as
  proof;
- the Verifier accepts the result while preserving limitations.

Supporting artifacts:

- [`browser-evidence.json`](../results/solution/healthy-control/browser-evidence.json)
- [`investigator-result.json`](../results/solution/healthy-control/investigator-result.json)
- [`verification.json`](../results/solution/healthy-control/verification.json)
- [`report.md`](../results/solution/healthy-control/report.md)
- [`run-metadata.json`](../results/solution/healthy-control/run-metadata.json)

This is the clearest guard against a false conclusion based only on a positive
heap-byte delta.

## Reading a JSONL trajectory

Each line is an independent JSON object. Useful fields include:

- `timestamp`: event time;
- line order: stable event order within the run;
- `caseId`: benchmark case identifier;
- `agent`: workflow owner when applicable;
- `type`: observable event category;
- `summary`: concise human-readable description;
- `data`: structured bounded inputs or outputs.

The exact event schema is validated by the project tests. A failed provider
request also remains in its trajectory and result attempt directory instead of
being hidden.

## Privacy boundary

Trajectories intentionally exclude the Gemini API key, `.env` contents, external
hidden prompts, and private reasoning traces. They contain the prompts
HeapSleuth authored, bounded synthetic source and evidence, provider-visible
response summaries, usage metadata, and validation outcomes needed to audit the
workflow.

## Removed experiment

The rejected `verifier-v2` experiment has its own trajectories under
[`results/iterations/verifier-v2/trajectories`](../results/iterations/verifier-v2/trajectories/).
They are retained to show why the candidate was removed; they are not part of
the active v1 result.
