# HeapSleuth Improvement Changelog

This document records technical decisions and measured experiments in
chronological order. Decisions describe why the implementation changed.
Experiments will report observed evidence and will not claim improvements before
evaluation data exists.

## 2026-08-28 — Foundation decision

### Context

The initial repository contained only `docs/PROJECT_PLAN.md`. The plan requires
a clean `npm install` command, while its proposed structure gives the benchmark
a separate package. It also postpones exact dependency pinning until the browser
spike even though reproducible tooling is part of the project foundation.

### Decision

- Use a single root npm package during Block 1 and reserve npm workspaces for
  the benchmark package when Block 2 needs it. This keeps the documented root
  install contract valid without creating an empty benchmark package.
- Target Node.js 20.19 or newer and use ECMAScript modules throughout the
  project.
- Enable strict TypeScript compilation and separate type-checking from
  execution.
- Use Zod for runtime schemas, dotenv for local environment loading, Vitest for
  tests, ESLint for static analysis, and Prettier for formatting.
- Pin direct dependency versions exactly and commit the generated npm lockfile.
- Treat the first eight P0 cases, including the healthy control, as the MVP
  dataset. The two P1 cases remain outside the MVP until its acceptance criteria
  pass.
- Store observable agent actions and decision summaries in future trajectories,
  but never private reasoning traces.

### Expected effect

The foundation should install with one root command, reject invalid
configuration and metadata early, and provide deterministic quality checks
before browser work begins.

### Evidence

No performance or diagnosis improvement is claimed at this stage. `npm install`
added 135 packages, generated the lockfile, and reported zero known
vulnerabilities. `npm run validate` then passed the formatting check, ESLint,
strict TypeScript type-check, all 7 tests across 3 test files, and the
production build.

## 2026-08-28 — Browser evidence spike adapter decision

### Context

Block 2 requires a programmatic and reproducible browser-memory evidence loop.
The active Codex environment does not expose a Chrome DevTools MCP integration
that the HeapSleuth program can call. The machine does have Google Chrome
151.0.7922.174 installed locally.

### Decision

- Apply the Section 15 pivot rule immediately instead of spending the spike
  window attempting to build around an unavailable integration.
- Use `playwright-core` to launch the installed Chrome executable and create a
  direct Chrome DevTools Protocol session.
- Do not download a bundled browser and do not implement a second production
  adapter during the spike.
- Use forced garbage collection, before/after heap usage, DOM counters, CDP
  event-listener inspection, and a benchmark-controlled handler invocation as
  the bounded evidence signals.
- Treat an increased listener count that remains attached to `window` and can
  still execute after forced garbage collection as the spike's targeted
  retention signal. This demonstrates retention for the synthetic case but is
  not a general proof for arbitrary applications.

### Acceptance checklist

1. Start the Vite benchmark automatically.
2. Warm up and complete repeated deterministic mount/unmount cycles.
3. Force garbage collection before baseline and final measurements.
4. Capture validated heap, DOM, and listener evidence before and after the
   measured cycles.
5. Show that the added listeners remain attached and executable after garbage
   collection.
6. Save the validated evidence as structured JSON.
7. Pass focused tests and the complete project validation command.

### Evidence

The clean `npm run spike` run used Chrome 151.0.7922.174, completed 3 warm-up
cycles and 20 measured mount/unmount cycles, and finished in 5,219 ms. Both
samples were captured after two `HeapProfiler.collectGarbage` calls.

| Signal                             | Baseline after GC |  Final after GC |            Delta |
| ---------------------------------- | ----------------: | --------------: | ---------------: |
| JavaScript heap used               |   5,237,928 bytes | 5,462,604 bytes |   +224,676 bytes |
| Backing storage                    |   4,164,969 bytes | 9,407,867 bytes | +5,242,898 bytes |
| All DOM event listeners            |               163 |             183 |              +20 |
| Target event listeners on `window` |                 3 |              23 |              +20 |
| Target handlers invoked after GC   |                 3 |              23 |              +20 |
| DOM nodes                          |                42 |              42 |                0 |

The measured cycles added exactly one target listener each. CDP still found all
23 target listeners attached to `window` after the final forced garbage
collection, and a benchmark-controlled event dispatch invoked all 23 handlers.
The unchanged DOM-node count helps distinguish this case from detached-DOM
growth. The 5,242,898-byte backing-storage increase is consistent with the 20
retained 256 KiB payloads plus small runtime overhead.

The validated artifact is saved at `results/spike/event-listener/evidence.json`.
The runner writes the JSON, reads it back from disk, and validates it against
the runtime schema before reporting success. The first final validation attempt
revealed that ESLint's root-only `dist/**` ignore pattern scanned the generated
benchmark bundle. Changing the pattern to `**/dist/**` fixed the workspace
boundary without suppressing source checks. The complete `npm run validate`
rerun passed formatting, linting, both strict TypeScript projects, 11 tests
across 5 test files, the core production build, and the Vite production build.
No diagnosis-accuracy improvement is claimed because baseline and solution
evaluation have not run.

## 2026-08-29 — Benchmark dataset architecture decision

### Context

Block 3 expands the proven single-case Vite benchmark into the complete P0
dataset. The cases must remain deterministic and isolated, while hidden answers
must never enter the browser bundle or a future agent input boundary.

### Decision

- Use one shared Vite/React shell with a safe browser manifest for route titles,
  neutral descriptions, and case components.
- Give every case the same recorded mount/unmount scenario contract and stable
  selectors so one runner can exercise all routes without case-specific UI
  automation.
- Run every browser smoke scenario in a fresh browser context. Module-level
  registries are therefore isolated between cases and each run starts from a
  reproducible state.
- Expose a small benchmark-controlled runtime state for bounded smoke
  assertions. This state reports resource creation, retention, release, and
  invocation counts; it is an observable test signal, not evaluator ground
  truth.
- Keep neutral case metadata in `dataset/cases.json` and evaluator answers in
  the separate `dataset/ground-truth.json` file. Browser source code will not
  import either dataset file, and the smoke runner will read only the neutral
  case dataset.
- Validate both JSON files with runtime schemas and cross-file invariant tests.
  Bundle inspection will additionally reject hidden mechanism labels or ground
  truth filenames in generated browser assets.
- Preserve the Block 2 event-listener route and its direct-CDP instrumentation
  so the original saved-evidence workflow remains a regression gate.

### Expected effect

This design should provide the eight reproducible P0 scenarios required for
later fair baseline and agentic evaluation without implementing those later
blocks or exposing their accepted answers.

### Observed evidence

The first `npm run smoke:benchmark` attempt stopped before case execution
because Chrome requested an undefined favicon and Vite returned HTTP 404. A
local SVG favicon and explicit document link removed the browser-console error;
the complete clean rerun then passed.

Chrome 151.0.7922.174 loaded the root index with all eight case links and ran
each route in a fresh browser context. Every recorded scenario completed three
mount/unmount cycles and six actions, followed by two forced garbage-collection
requests. No route or browser-console error occurred. After garbage collection,
each of the seven retention cases reported three created, active, and retained
resources. The healthy control reported three created resources, zero active,
zero retained, and three released resources.

The dataset tests validate exact counts, unique IDs and routes, deterministic
scenario records, source-file existence, seven-leak/one-control balance,
complete evaluator metadata, cross-file ID alignment, and expected validation
failures. The smoke runner imports only `dataset/cases.json`. Production bundle
inspection found no ground-truth filename, evaluator field name, or accepted
mechanism label in generated browser assets.

The original Block 2 command also passed against the expanded shell: 20 measured
cycles produced a +20 target-listener delta that survived forced garbage
collection, a +243,460-byte used-heap delta, and a +5,242,898-byte
backing-storage delta. This is a regression result for the existing synthetic
case, not an evaluation result.

### Limitations

- The per-case counters are controlled observability hooks for deterministic
  smoke testing. They do not replace later CDP heap summaries, retaining paths,
  or case-specific evidence collection.
- Three cycles verify scenario behavior and cleanup but are not a calibrated
  memory-growth measurement.
- The synthetic cases establish a reproducible dataset; they do not demonstrate
  diagnosis accuracy or generalize retention behavior to arbitrary websites.

No diagnosis-accuracy improvement is claimed because baseline and solution
evaluation have not run.

## 2026-08-29 — Static baseline protocol decision

### Context

Block 4 must establish the hackathon's simple comparison point without giving
the baseline any runtime advantage or evaluator-only answer. The existing
configuration reserves `AI_API_KEY` and `AI_MODEL`, but no model provider is
implemented and neither value is currently configured.

### Decision

- Use the OpenAI Responses API through the Node.js native `fetch`
  implementation. This adds no dependency and leaves one small provider boundary
  that the later agentic solution can reuse with the same model.
- Send one non-streaming request per case with `store: false`, no tools,
  temperature `0`, a 1,200-token output limit, and strict structured output
  matching the common diagnosis schema.
- Use one versioned, case-neutral prompt. Its only case-specific inputs are the
  case ID, neutral description, and exact source files listed in
  `dataset/cases.json`.
- Do not retry provider, JSON, or schema failures. Continue the batch, save each
  failure, and return a nonzero process exit when any selected case fails.
- Resolve source paths against the repository root and reject absolute,
  traversing, missing, directory, or unlisted paths before a provider request.
- Persist only validated diagnoses, validated failures, validated run metadata,
  and sanitized input manifests. Do not persist authorization headers, API keys,
  full provider envelopes, evaluator data, or benchmark runtime state.
- Keep the official baseline batch separate from injected-provider test
  fixtures. With no configured credentials, implementation gates will run but no
  official result will be fabricated.

The request shape follows the official OpenAI Responses API documentation:
https://developers.openai.com/api/reference/resources/responses/methods/create

### Expected effect

This protocol should create a reproducible static starting point whose model,
inputs, request count, failures, latency, and token usage can later be compared
fairly with the runtime-evidence workflow.

### Evidence status

The protocol is now implemented behind an injectable model-provider boundary.
The command supports a deterministic all-case batch and `--case <case-id>`
selection. Focused tests used an in-memory fake provider and verified all eight
cases in dataset order, exactly one request for each selected case, continued
batch execution after a failure, no retries, strict diagnosis validation,
source-only evidence validation, path-boundary rejection, secret sanitization,
and validated artifact round trips. Provider tests used an injected `fetch`
implementation and made no network request.

The evaluator schema was separated from the agent-visible case schema so the
baseline's transitive imports do not initialize evaluator fields. Direct source
and production-bundle scans found no ground-truth filename, evaluator field,
accepted mechanism label, or expected answer in the baseline input path or
browser output. The repository-wide secret and browser-artifact scans were also
clean.

`npm run baseline` stopped at the configuration gate before creating a provider
or output directory because both `AI_API_KEY` and `AI_MODEL` are absent. The
official request count is therefore zero, and there are no official successes,
failures, duration, token usage, or cost measurements to report. The first
measured baseline batch and its dependent output-saving checklist item remain
blocked until those values are configured. No fake official result was saved,
and no model-quality or diagnosis-accuracy claim is made.

The final pre-documentation quality pass completed with 34 tests across 10 test
files, strict TypeScript checks for both workspaces, linting, formatting, both
production builds, and browser smoke coverage for all eight benchmark routes.

### Limitations

- No official baseline result exists without a configured model and API key.
- The selected model may reject an optional request setting; such a response is
  recorded as one provider failure without retry so the one-request rule remains
  intact.
- Native `fetch` keeps the baseline dependency-free but intentionally supports
  only the selected Responses API contract during Block 4.
- Cost cannot be calculated before a real run and is not inferred from test
  fixtures.

## 2026-08-29 — Gemini free-tier baseline provider pivot

### Context

The first baseline batch could not run because OpenAI API billing is separate
from the available ChatGPT subscription. The project owner requested a Gemini
free-tier path before supplying a provider credential.

### Decision

- Replace only the Block 4 production provider with the Gemini Developer API;
  keep the provider interface, prompt, input boundary, one-request rule,
  validation, persistence, and failure behavior unchanged.
- Use `gemini-2.5-flash` as the explicit default evaluation model. Google lists
  free input and output tokens for this generally available model, and it
  accepts the deterministic temperature setting already defined by the baseline
  protocol.
- Call the non-streaming `models.generateContent` REST endpoint through native
  `fetch`, authenticate with an `x-goog-api-key` header, enable JSON structured
  output, and provide no tools or grounding configuration.
- Rename the credential variable to `GEMINI_API_KEY` while retaining the generic
  `AI_MODEL` field so future baseline and investigator runs can record and reuse
  the exact same model.
- Do not retain the unused OpenAI production adapter. The spike remains one
  production adapter, and injected-provider tests remain network-free.

The implementation follows Google's official Gemini API reference, structured
output guide, and current pricing table:

- https://ai.google.dev/api/generate-content
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/pricing

### Expected effect

This pivot should remove the immediate paid-API prerequisite while preserving a
fair static baseline that can later be compared with the agentic workflow under
the same Gemini model.

### Evidence status

The provider decision was recorded before implementation. The first browser
smoke regression attempt exposed that a blank `GEMINI_API_KEY=` placeholder was
being rejected by shared configuration before unrelated browser commands could
start. Empty optional credentials now normalize to “not configured”; the
baseline command remains responsible for enforcing the key with a focused
configuration error. No live Gemini request has been made and no model-quality
or diagnosis-accuracy claim is made.

The final provider tests verify one header-authenticated request, no credential
in the URL or body, no tool configuration, the full diagnosis JSON Schema,
successful response and thinking-token accounting, incomplete-output rejection,
quota-error classification, and transport failure without retry. The complete
offline validation passes formatting, linting, both strict TypeScript projects,
38 tests across 10 files, and both production builds. The browser smoke rerun
passes all eight routes in Chrome 151.0.7922.174. Ground-truth scans remain
clean for the baseline implementation and browser bundle, `.env` remains
ignored, and the dependency lockfile is unchanged.

With the placeholder key still blank, `npm run baseline` exits at the focused
configuration gate before a network request or results directory is created. The
official baseline batch therefore remains pending until the project owner adds
the Gemini key and explicitly requests the run.

### Limitations

- Free-tier quotas and model availability are controlled by Google and may
  change.
- Google states that free-tier content may be used to improve its products. The
  baseline sends only the benchmark case description and listed source files,
  but users should still review this tradeoff before running it.

## 2026-08-29 — First Gemini batch and model-availability pivot

### Context

After the project owner configured the Gemini key and explicitly authorized the
official batch, all eight one-prompt requests reached the provider. Google
returned HTTP 404 for every case because `gemini-2.5-flash` is no longer
available to new API users and recommended a current Gemini 3 Flash model and
the Interactions API.

### Observed evidence

- Eight cases were attempted in dataset order with exactly one request each.
- All eight failures were categorized as provider failures and saved with
  validated input manifests and run metadata.
- Per-case durations ranged from 203 ms to 636 ms. No response token usage was
  reported because generation never started.
- The command continued through every case and exited nonzero with zero
  successes and eight failures, confirming the designed failure behavior.
- The API key was not present in console output or saved artifacts.

### Decision

- Preserve the complete failed batch under the baseline results tree before a
  corrected run so the required failure evidence is not overwritten.
- Replace the now-unavailable model with the current generally available
  `gemini-3.7-flash` free-tier model.
- Follow Google's recommendation to use the Interactions API with top-level
  structured response format, `store: false`, no tools, a fixed seed, bounded
  output, and an explicitly recorded thinking level.
- Remove the deprecated temperature request parameter rather than sending a
  setting that Gemini 3.7 rejects.

The correction follows the current official model and Interactions API
documentation:

- https://ai.google.dev/gemini-api/docs/latest-model
- https://ai.google.dev/api/interactions-api
- https://ai.google.dev/gemini-api/docs/structured-output

### Expected effect

The corrected adapter should retain the exact static input and one-request
baseline contract while using a model and endpoint available to new free-tier
users.

No diagnosis-accuracy claim is made from this failed provider batch.

## 2026-08-29 — Gemini 3.7 provider-failure cleanup and stable-model pivot

### Context

The first corrected Interactions API batch used `gemini-3.7-flash`, which had
been released only days earlier. All eight requests failed at the provider
boundary: four returned HTTP 500, two returned HTTP 429, and two ended in
transport failures after approximately five minutes. No diagnosis output or
token usage was returned.

### Decision

- Preserve the validated 3.7 failure artifacts under `results/baseline/attempts`
  and remove them from the active per-case result directories before rerunning.
- Keep the single direct Interactions API adapter because its request structure
  matches Google's current official REST documentation.
- Change the baseline default to the generally available `gemini-3.6-flash`,
  which Google originally recommended in the 2.5 model rejection and which has a
  longer stable release history while remaining free-tier eligible.
- Pace the sequential batch by 15 seconds between cases to reduce free-tier
  request-rate pressure without adding retries or additional model attempts.
- Bound each provider call to 120 seconds and preserve useful structured or
  plain-text provider errors. Each case still receives exactly one attempt.

Official references checked for this pivot:

- https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash
- https://ai.google.dev/api/interactions-api
- https://ai.google.dev/gemini-api/docs/rate-limits
- https://ai.google.dev/gemini-api/docs/pricing

### Evidence status

This entry records provider reliability evidence only. It does not establish or
claim any improvement in memory-leak diagnosis accuracy.

## 2026-08-29 — Gemini 3.6 response-envelope compatibility correction

### Observed evidence

The clean `gemini-3.6-flash` batch reached the API successfully for all eight
cases. Responses arrived in 2.8–19.2 seconds, but the local adapter rejected
each successful HTTP response before diagnosis parsing because its Interactions
envelope schema required fields that Google documents as optional and supported
only one of the documented response shapes.

### Decision

- Keep `gemini-3.6-flash`; the live evidence confirms that the model, key, and
  endpoint are available.
- Accept both direct and wrapped Interaction resources, both `steps` and legacy
  text `outputs`, an omitted top-level status on a completed synchronous
  response, and partial optional usage fields.
- Require output text, reject any explicit non-completed status, and validate
  the extracted diagnosis against HeapSleuth's strict result schema. Treat the
  interaction ID as optional because the live API omits it when `store: false`;
  record it only when Google returns one.
- Archive this parser-failure batch separately before the next clean run. Do not
  count it as a completed baseline or as evidence of diagnosis accuracy.

## 2026-08-29 — First validated Gemini 3.6 baseline batch

### Execution

After the response-envelope correction passed focused and full validation, the
official baseline cases ran sequentially with one request per case and no
automatic retries. The first seven cases produced schema-valid diagnoses. The
final `healthy-control` request returned HTTP 429 because the free-tier project
had reached its 20-request quota; the provider requested a retry after about 32
seconds, but the baseline correctly preserved the failure instead of retrying.

### Validated results

- `event-listener`: succeeded in 3,843 ms; 853 input, 409 output including
  thought, and 1,262 total tokens.
- `interval`: succeeded in 4,084 ms; 579 input, 323 output including thought,
  and 902 total tokens.
- `resize-observer`: succeeded in 4,752 ms; 588 input, 641 output including
  thought, and 1,229 total tokens.
- `detached-dom`: succeeded in 7,252 ms; 652 input, 530 output including
  thought, and 1,182 total tokens.
- `global-cache`: succeeded in 6,697 ms; 564 input, 371 output including
  thought, and 935 total tokens.
- `closure-registry`: succeeded in 3,532 ms; 575 input, 451 output including
  thought, and 1,026 total tokens.
- `event-bus`: succeeded in 4,578 ms; 596 input, 487 output including thought,
  and 1,083 total tokens.
- `healthy-control`: failed at the provider boundary in 511 ms with HTTP 429; no
  diagnosis or token usage was returned.

The seven successful responses used 4,407 input tokens, 3,212 output tokens
including thought tokens, and 7,619 total tokens. An independent schema pass
validated every active input manifest and run-metadata file, all seven diagnosis
results, and the saved healthy-control failure. Every active case records one
attempt. Earlier provider and parser failures remain isolated under
`results/baseline/attempts` and are not mixed with the active batch.

### Interpretation and limitations

This completes the first baseline batch and the requirement to save every
output, including failures. It does not complete an accuracy evaluation and does
not establish that the seven leak verdicts are correct. The missing
healthy-control diagnosis remains a known free-tier quota limitation for later
evaluation and reporting.

## 2026-08-29 — Investigator bounded-tool protocol decision

### Context

Block 5 must add runtime evidence to the same diagnosis task without exposing
evaluator-only ground truth, implementing the later Verifier, or widening the
MVP dataset. The existing direct-CDP spike and deterministic benchmark runner
already provide the smallest reliable browser boundary.

### Decision

- Reuse the direct CDP/Playwright adapter selected in Block 2. Do not add a
  second browser adapter or a model-controlled general-purpose browser.
- Orchestrate a fixed, auditable tool sequence for each selected case: read only
  the source files listed in neutral case metadata, warm up in an isolated
  browser context, collect a post-GC baseline, run the recorded scenario in a
  fresh context, collect a post-GC final sample, summarize listeners, and read
  captured console errors.
- Give the Investigator only the neutral description, recorded scenario, allowed
  source contents, and validated browser evidence. Never load or import
  evaluator ground truth in the Investigator path.
- Reuse the exact Gemini model and request settings from the baseline so later
  comparisons do not confound the evidence change with a model change.
- Require the common diagnosis schema plus case-specific grounding checks: the
  returned case ID must match, any root-cause file must be in the allowed source
  list, and every cited evidence category must have been supplied.
- Record JSONL trajectories containing observable instructions, bounded tool
  calls and summarized results, run checkpoints, and the validated final result.
  Do not store API keys, authorization data, provider envelopes, hidden prompts,
  or private reasoning.
- Limit the first working execution to `event-listener` and `healthy-control`,
  as required by Block 5. Other cases, the Verifier, evaluation, and repair stay
  in later blocks.

### Acceptance checklist

1. A case-scoped browser run completes warm-up and the exact recorded scenario
   with baseline and final samples captured after forced garbage collection.
2. Structured evidence includes heap usage, DOM counters, benchmark runtime
   state, listener summaries, and console errors, and passes a saved-file schema
   round trip.
3. Source access rejects absolute, traversing, missing, and unlisted files.
4. A versioned Investigator prompt enforces the evidence guardrails from the
   project plan and requests the common diagnosis schema.
5. Invalid model JSON, schema violations, mismatched case IDs, unsupported
   evidence citations, and out-of-bound root-cause files fail closed.
6. Successful and failed runs save validated metadata and an auditable JSONL
   trajectory without secrets or evaluator data.
7. One leak case and the healthy control complete with one model request each;
   focused tests, `npm run validate`, and clean reproduction commands pass.

### Evidence status

The implementation now exposes a required single-case command:

```text
npm run solution -- --case <case-id>
```

It validates and saves `browser-evidence.json`, `input-manifest.json`,
`result.json` or `failure.json`, `run-metadata.json`, and a run-ID-scoped JSONL
trajectory. A previous active run is copied to
`results/solution/attempts/<case-id>/<run-id>/` before replacement. The command
does not retry a model request automatically.

The first official `event-listener` attempt collected valid browser evidence,
then received HTTP 429 from the Gemini free-tier 20-request quota. It saved one
provider failure and one complete trajectory. After the provider's requested
wait interval, a new independent run archived that failure and completed with
one model request. The successful diagnosis returned `leak`, localized
`EventListenerCase`, and passed all schema and grounding checks. The official
`healthy-control` run also used one request and returned `no-leak` with no root
cause or recommended fix.

Both browser runs used Chrome 151.0.7922.174, one isolated warm-up cycle, three
measured mount/unmount cycles, six measured actions, and two forced garbage
collections before each sample. Neither run emitted a browser error.

| Signal                           | Event listener | Healthy control |
| -------------------------------- | -------------: | --------------: |
| Used heap after-GC delta         | +487,348 bytes |  +486,704 bytes |
| Backing storage after-GC delta   | +786,944 bytes |      +477 bytes |
| All DOM listener delta           |             +3 |               0 |
| Target listener delta            |             +3 |               0 |
| Created resources                |             +3 |              +3 |
| Active resources after unmount   |             +3 |               0 |
| Retained resources after unmount |             +3 |               0 |
| Released resources               |              0 |              +3 |

The similar positive used-heap deltas demonstrate why HeapSleuth does not use
heap size alone as proof. The targeted listener and runtime-retention signals
separate this leak case from the healthy control after garbage collection.

The successful event-listener run completed in 8,036 ms and used 2,520 input,
358 output including thought, and 2,878 total tokens. The healthy-control run
completed in 16,946 ms and used 2,144 input, 491 output including thought, and
2,635 total tokens. Active artifacts are under
`results/solution/event-listener/` and `results/solution/healthy-control/`;
trajectories are under the matching case directories in `trajectories/`.

An independent saved-artifact pass validated both active results, all three
trajectories, the archived quota failure, and a scan for secrets and evaluator
fields. `npm run validate` passed formatting, ESLint, both strict TypeScript
projects, 56 tests across 16 test files, both production builds, and the final
eight-case Chrome smoke regression.

The Investigator currently uses compact heap, DOM, listener, runtime, and
console summaries rather than a full heap snapshot or arbitrary retaining-path
search. Block 5 tests only one known leak case and the healthy control; the
Verifier, full dataset run, evaluator, automatic repair, and broader benchmark
remain later work. These two diagnoses are acceptance checks, not an accuracy
evaluation, so no diagnosis-accuracy improvement is claimed.

## 2026-08-29 — Independent Verifier protocol decision

### Context

Block 6 must challenge a validated Investigator diagnosis without rerunning the
browser, consulting the baseline, or exposing evaluator-only answers. The
current solution already produces fresh, schema-valid browser evidence and a
bounded source set, while the Gemini provider currently supports only the
diagnosis response shape.

### Decision

- Keep one integrated solution run: collect fresh evidence, run and validate the
  Investigator, then hand the same bounded inputs and original diagnosis to a
  separately prompted Verifier.
- Treat independence as a distinct skeptical role, prompt, model request,
  validation boundary, metadata stage, and trajectory identity. Reuse the same
  model family and deterministic settings so the later comparison does not add a
  model-change confounder.
- Extend the provider request with a closed response-format selector for only
  `diagnosis` and `verification`. Do not expose arbitrary schemas or add another
  provider.
- Replace the permissive verification object with a discriminated union:
  `accept` requires no issues and no revision, `revise` requires issues and a
  revised diagnosis, and `inconclusive` requires issues and an inconclusive
  revised diagnosis.
- Apply the same case ID, allowed-source, and supplied-evidence grounding checks
  to every revised diagnosis. Resolve the final diagnosis with a pure function
  rather than model-dependent post-processing.
- Persist the original Investigator diagnosis, Verifier output, final verified
  diagnosis, fresh browser evidence, input hashes, per-agent request metadata,
  failures, and one linked JSONL trajectory containing both agent identities.
- Archive the current Block 5 active artifacts before the first integrated run.
  Preserve all earlier successful and failed artifacts.
- Fail closed: one request per agent, no automatic retry, no Verifier call after
  an Investigator failure, and no unverified final result after a Verifier
  failure.

### Acceptance checklist

1. A versioned English Verifier prompt attempts to falsify the original
   diagnosis and receives only the neutral case, authorized sources, current-run
   browser evidence, original diagnosis, and explicit limitations.
2. Strict runtime validation enforces accept, revise, and inconclusive
   invariants plus case, source, and evidence grounding.
3. A deterministic resolver selects the original, revised, or inconclusive final
   diagnosis exactly as specified.
4. The integrated command makes exactly one Investigator request and one
   Verifier request, never calls the Verifier after an Investigator failure,
   never retries automatically, and preserves every failure.
5. Saved artifacts distinguish the original diagnosis, verification, and final
   result; metadata and trajectories expose per-agent observable actions,
   latency, usage, prompts, and handoff without secrets or evaluator data.
6. Focused tests cover accept, deliberate false-positive revision, weak-evidence
   inconclusive, invalid combinations, grounding failures, request counts,
   failure behavior, saved-file round trips, and final-result resolution.
7. Clean integrated event-listener and healthy-control runs, independent
   artifact validation, `npm run validate`, and the eight-case browser smoke
   regression pass with at least one successful Verifier trajectory.

### Evidence status

The bounded implementation is now in place. It adds the versioned English
Verifier prompt, discriminated validation schema, grounded revision checks,
deterministic final-result resolver, separate provider response format, distinct
Investigator/Verifier/final artifacts, per-agent metadata, and a shared
trajectory with explicit agent identities. No additional provider, benchmark
case, evaluator, repair flow, dashboard, or later-block feature was added.

Focused tests passed for all three decisions, deliberate healthy-control false
positive revision, deliberately weak-evidence inconclusive handling, invalid
decision combinations, malformed JSON, ungrounded revisions, exact request
counts, fail-closed behavior, prompt isolation, saved artifact round trips, and
provider schema selection. The focused run passed 22 tests across 4 files. The
full validation gate passed 69 tests across 18 files, formatting, linting,
strict TypeScript checks for the core and benchmark, and both production builds.

The clean integrated `event-listener` run `5159cfc3-2b45-484e-aefd-e91e72a32390`
succeeded with one Investigator request and one Verifier request. The Verifier
decision was `accept`, and the final verdict remained `leak`. After two forced
garbage-collection passes per sample, the run retained 3 resources and 3
`heapsleuth:notification` listeners; used heap increased by 487,160 bytes and
backing storage by 786,944 bytes. Total model usage was 6,144 tokens: 2,894 for
the Investigator and 3,250 for the Verifier. The integrated run took 9,440 ms.

The healthy-control browser evidence was also reproducible: the measured runs
created 3 resources, released all 3, retained 0, and had a listener delta of 0
after forced garbage collection. Initial bounded attempts received Gemini HTTP
429 at either the Investigator or Verifier stage. Each failure was saved and
archived without an automatic retry or an unverified final result. After the
free-tier key was replaced, clean integrated run
`86f9706c-2a32-4701-8ca0-05e9ba24ce8d` succeeded with one Investigator request
and one Verifier request. The Investigator returned `no-leak`, the Verifier
returned `accept`, and the final verdict remained `no-leak`. Used heap changed
from 4,867,840 to 5,354,644 bytes, but backing storage changed by only 464
bytes, the listener delta remained 0, all 3 resources were released, and none
remained active or retained after forced garbage collection. Total model usage
was 5,297 tokens: 2,772 for the Investigator and 2,525 for the Verifier. The
integrated run took 9,027 ms. Acceptance item 7 is now satisfied and Block 6 is
complete.

An independent local audit parsed 45 solution artifacts, 10 trajectory files,
and 213 trajectory events with the compiled schemas. The active healthy-control
audit also confirmed that the accepted final result exactly matches the
Investigator diagnosis and that both agent identities appear across its 26
events. A separate scan found no evaluator answer fields, ground-truth path,
environment-key name, or Gemini key pattern in solution artifacts or
trajectories. The eight-case browser smoke regression passed in Chrome
151.0.7922.174 with forced garbage collection and no browser errors.

Known limitations remain explicit: both agents use separate requests to the same
model family and deterministic settings; free-tier rate limits can prevent a
complete two-request run; browser evidence is bounded to the synthetic benchmark
and does not provide arbitrary production retaining-path search; and heap-size
deltas alone are not treated as leak proof. These checks validate the Verifier
workflow, not diagnosis accuracy. No accuracy-improvement claim is made because
evaluation has not run.

## 2026-08-29 — Frozen full-evaluation protocol decision

### Context

Block 7 must compare the static baseline with the verified runtime-evidence
solution across the same eight-case MVP without tuning either approach after
seeing scores. Before this decision, commit `c5043e3` passed the full validation
gate with 69 tests and the Chrome smoke regression for all eight cases. The
active `event-listener` and `healthy-control` solution artifacts also passed
schema, request-count, and trajectory checks as clean one-Investigator plus
one-Verifier runs.

### Frozen protocol

- Freeze the eight entries in `dataset/cases.json`, benchmark sources and
  scenarios, direct-CDP evidence collector, baseline/Investigator/Verifier
  prompts, diagnosis and verification schemas, `gemini-3.6-flash`, and the
  recorded deterministic provider settings at commit `c5043e3`.
- Run one new official baseline batch and one new official solution run for
  every case. Requests remain sequential, bounded, and without automatic retry.
  Provider failures remain evaluation outcomes and are never deleted.
- Archive every previously active raw run before replacement. The evaluator
  selects only the active run present when `npm run evaluate` starts; it never
  searches archives for a better answer. The cohort manifest records each
  selected run ID, status, frozen settings, artifact paths, and the fixed
  selection reason before ground truth is loaded or a score is calculated.
- Keep `dataset/ground-truth.json` evaluator-only. Baseline, Investigator,
  Verifier, prompts, browser and source tools, input manifests, and trajectories
  remain unable to import it. The scorer is deterministic and uses no model.
- Count all eight cases in each RCLA denominator. A case is correct only when
  verdict and accepted mechanism match and, for a leak, either accepted source
  file or accepted symbol matches. Failed and inconclusive cases score as not
  RCLA-correct and remain visible.
- Derive runtime and token counts only from validated run metadata. Human time
  is `null` because no reliable per-case human timer exists. Estimated list cost
  is also `null` unless an official, model-specific price can be represented
  without inference; actual billed cost is `null` because the evaluator cannot
  inspect the Google project's billing ledger.
- Implement the qualitative evidence rubric as a documented conservative
  mechanical score: 0 for no evidence or an invalid/failed result; 1 when cited
  evidence lacks the required category or contradicts the verdict; 2 when the
  required category is represented but limitations are absent; and 3 only when
  required evidence is represented, the structured observations support the
  verdict, and limitations are acknowledged. Any signal mapping is explicit in
  evaluator code and tests.
- Generate per-case JSON and Markdown from one validated evaluation object, then
  generate the ordered comparison and changelog evidence from those same
  objects. Raw model, browser, and trajectory artifacts are never rewritten by
  scoring.

### Acceptance checklist

1. All eight cases have one selected baseline run and one selected solution run
   under the frozen protocol, including explicit failed or inconclusive states.
2. Ground truth is loaded only inside the deterministic evaluator and evaluator
   fields do not appear in any model-visible or trajectory artifact.
3. Strict schemas and focused tests cover RCLA, every documented secondary
   metric, failure states, evidence scores 0 through 3, stable ordering, and
   JSON/Markdown consistency.
4. `results/summary/evaluation-cohort.json` is written before scoring and uses
   the predetermined active-run selection rule without archive cherry-picking.
5. Per-case `metrics.json` and `report.md` plus summary comparison and changelog
   evidence artifacts are reproducible from validated raw artifacts.
6. Every provider interruption and additional attempt is preserved and reported
   without silently changing the official scoring rule.
7. Independent artifact, isolation, and report-consistency audits pass together
   with `npm run evaluate`, `npm run validate`, `npm run smoke:benchmark`, and
   `git diff --check`.
8. Only measured results determine whether runtime browser evidence improved
   RCLA; no improvement claim is made before the complete comparison exists.

### Evidence status

The deterministic evaluator and official Block 7 cohort completed on 2026-08-30
without changing the frozen dataset, prompts, model, provider settings, or
scoring rule after results were visible.

- The official baseline completed all eight cases with one request per case: 8/8
  runs succeeded, total recorded runtime was 81,189 ms, and recorded usage was
  8,687 tokens.
- The official solution completed all eight cases with one Investigator and one
  Verifier request per selected run: 8/8 selected runs succeeded, total recorded
  runtime was 206,326 ms, and recorded usage was 43,213 tokens. The Verifier
  accepted seven `leak` diagnoses and the `healthy-control` `no-leak` diagnosis.
- The first `global-cache` attempt reached the Verifier before HTTP 429, and two
  controlled resumes failed at the Investigator while the original key remained
  rate-limited. Run IDs `90cc2ba1-244b-43d1-9980-9e22d1427c00`,
  `de53f99f-6005-46c1-aee1-774b18076b6d`, and
  `62c13691-22f1-4dcf-bd6d-a408351a1561` remain preserved under
  `results/solution/attempts/global-cache/`. After the user configured a key
  with available quota, only the missing case resumed; selected run
  `daf38717-f707-4796-a283-1715021fd90a` then succeeded. No already successful
  case was rerun for score selection.
- Primary RCLA improved from 3/8 (37.5%) for the baseline to 5/8 (62.5%) for the
  solution, a measured increase of 25 percentage points on the frozen eight-case
  synthetic cohort.
- Both approaches achieved 8/8 verdict accuracy, 0/1 false positives, 7/7 source
  localization, and 0/8 inconclusive results. Mechanism classification improved
  from 2/7 to 4/7. Mean deterministic evidence-grounding score improved from 1.0
  to 3.0.
- The three remaining solution RCLA misses localized the correct source but did
  not satisfy the predeclared accepted-mechanism token rule. Mechanism
  classification is therefore the evidence-selected candidate for Block 8; no
  Block 8 prompt or implementation change is included here.
- Human time, estimated list cost, and actual billed cost remain `null` because
  validated run artifacts do not contain reliable values. The result is limited
  to synthetic benchmark cases, and both Investigator and Verifier use the same
  Gemini model family.

The selected cohort and its hash are saved in
`results/summary/evaluation-cohort.json`. Machine-readable and rendered
comparisons are saved in `results/summary/comparison.json` and
`results/summary/comparison.md`; every baseline and solution case also contains
validated `metrics.json` and `report.md` artifacts. The measured claim above is
derived from cohort SHA-256
`6c8c0f3f9fa017deb386e9b947c5a897a41dbb9d152f5157eadea6fa50980dff`.

## 2026-08-30 — Block 8 mechanism-precision experiment

### Observed failure

The frozen Block 7 solution localized all seven leak cases and classified every
verdict correctly, but only four of seven mechanism descriptions satisfied the
predeclared mechanism matcher. The `detached-dom`, `global-cache`, and
`event-bus` final diagnoses described relevant source behavior but omitted one
or more distinguishing concepts required by the frozen rule. The Verifier
accepted all three instead of challenging their imprecise mechanism wording.

### Hypothesis and focused intervention

Change only the Verifier prompt. Require it to check whether a supported leak
mechanism explicitly distinguishes the retained resource or relationship, its
owning scope, and the lifecycle cleanup failure or growth bound. If the verdict,
evidence, and source are supported but those mechanism dimensions are materially
incomplete, the Verifier must return a grounded revision instead of accepting
the diagnosis.

The prompt will use generic frontend memory terminology and will not contain
case IDs, accepted mechanism labels, evaluator notes, or mappings from cases to
answers. The Investigator prompt, model, provider settings, dataset, benchmark,
browser evidence, schemas, evaluator ground truth, and deterministic scoring
rule remain unchanged.

### Evaluation protocol and keep/remove rule

- Increment only the Verifier prompt version and rerun the complete integrated
  solution on the same eight cases. Keep the committed Block 7 baseline as the
  unchanged reference; rerunning a stochastic baseline would add cost and an
  unrelated source of variation.
- Preserve every Block 7 solution artifact before replacement and preserve any
  provider failure or additional attempt. Do not retry automatically.
- Run the same deterministic evaluator after all eight cases are represented.
- Keep the prompt change only if solution RCLA exceeds 5/8 and mechanism
  classification exceeds 4/7, with no regression from 8/8 verdict accuracy, 0/1
  false positives, 7/7 localization, or mean evidence score 3.0.
- In addition to the cohort score, require attribution evidence: at least one
  previously mechanism-incorrect pattern must be corrected by a Verifier
  `revise` decision rather than only by variation in a new Investigator
  response. Otherwise remove the prompt change even if the aggregate score
  happens to improve.

### Evidence status

The pre-change worktree at commit `0d35152` was clean, and `npm run validate`
passed formatting, linting, strict TypeScript, 79 tests across 22 files, and
both production builds. The focused v2 prompt and version-boundary tests then
passed before any model request; the complete gate passed 80 tests.

The eight-case integrated iteration produced five successful runs and three
preserved provider failures. `resize-observer` received an HTTP 500 high-demand
response at the Verifier, `closure-registry` received an incomplete response at
the Investigator, and `event-bus` timed out after 120 seconds at the Verifier.
No failed case was retried. The deterministic cohort scorer reported:

| Metric                   | Block 7 solution | Verifier v2 iteration |
| ------------------------ | ---------------: | --------------------: |
| RCLA                     |              5/8 |                   3/8 |
| Mechanism classification |              4/7 |                   2/7 |
| Verdict accuracy         |              8/8 |                   5/8 |
| Source localization      |              7/7 |                   4/7 |
| False positives          |              0/1 |                   0/1 |
| Mean evidence grounding  |              3.0 |                 1.875 |

The iteration recorded 34,129 tokens and 410,551 ms across its eight selected
runs. Its cohort SHA-256 is
`f997b454ca63b4f6952eb0fa2227683ad078b0705c8a15bd268310e1e49fccaf`.

The attribution rule also failed independently of provider reliability.
`detached-dom` and `global-cache` completed, but v2 returned `accept` for both
Investigator mechanisms rather than the required targeted revision. The third
target, `event-bus`, reached the Verifier but timed out. No previously incorrect
mechanism pattern was demonstrably corrected by a v2 `revise` decision.

The prompt change was therefore removed. Active code, prompt version, solution
artifacts, and summary reports were restored to the committed Block 7 state. The
complete rejected experiment remains under `results/iterations/verifier-v2/`,
including the candidate prompt, per-case artifacts, trajectories, failures,
cohort manifest, and comparison. Original Block 7 artifacts copied before the
experiment remain under `results/solution/attempts/`, and the pre-iteration
summary remains under `results/summary/attempts/`. This is a measured removed
experiment, not an improvement claim.

After restoration, `npm run validate` passed formatting, linting, strict
TypeScript, all 79 active tests across 22 files, and both production builds. The
eight-case Chrome smoke regression passed with forced garbage collection and no
browser errors. Independent checks parsed 55 archived JSON files and all 8
archived JSONL trajectories, found no secret or evaluator-answer pattern in
model-visible artifacts, confirmed that no `verifier-v2` reference remains in
active source, tests, or results, and passed `git diff --check`.

## 2026-08-30 — Block 9 documentation protocol

### Acceptance checklist

Block 9 is limited to documenting and validating the frozen MVP. It must not
rerun model evaluation, change the active cohort, or add a later-block feature.
The block is accepted only when:

- the README leads with the measured claim and its boundary, explains the
  architecture, and provides a no-key review path;
- the reproduction guide documents the actual commands, POSIX and PowerShell
  differences, browser and API prerequisites, quota and failure behavior, and
  artifact locations;
- the evaluation guide defines RCLA, scorer isolation, fairness controls, exact
  results, runtime, tokens, unavailable monetary cost, limitations, cohort hash,
  and the removed experiment;
- exact direct dependency, runtime, browser, provider, model, and prompt
  versions are recorded from manifests and validated run metadata;
- representative integrated trajectories expose both Investigator and Verifier
  behavior for one leak and the healthy control;
- links, commands, English-language content, credential boundaries, formatting,
  tests, types, linting, builds, and the browser smoke suite pass validation.

### Documentation decisions

The reviewer flow is split into a no-key audit of the committed frozen evidence
and an optional live regeneration. This prevents the documentation from implying
that an evaluator must spend API quota to inspect the submission. It also states
that a live case archives the current active artifact and that model output may
not reproduce byte-for-byte.

The docs report the measured 287.515 seconds and 51,900 tokens across both
approaches. Estimated list cost and actual billed cost remain unavailable
because the validated metadata contains no billing evidence. Free-tier
credentials are not treated as proof of zero monetary cost.

### Evidence status

The completed block added `README.md`, `docs/REPRODUCTION.md`,
`docs/EVALUATION.md`, `docs/TRAJECTORIES.md`, a documented optional
`CHROME_PATH`, and focused documentation contract tests. All relative links in
the four reviewer-facing documents resolve, every documented npm script exists,
the two selected trajectories parse as JSONL and contain both agents plus a
final result, and the environment template contains no credential.

`npm run validate` passed formatting, linting, strict TypeScript, 88 tests
across 23 files, and both production builds. `npm run smoke:benchmark` passed
the index and all eight routes in Chrome 151.0.7922.174 with forced garbage
collection and no browser errors. The healthy control created and released three
resources with zero retained resources; each intentional leak case retained
three.

Repository-wide scans found no tracked Gemini key pattern and no selected common
Portuguese-language terms in source, documentation, tests, dataset, saved
results, or trajectories. `.env` remains ignored and untracked,
`git diff --check` passed, and no file under active `results/` or
`trajectories/` changed. No model request or evaluation rerun occurred during
Block 9. The final clean-ZIP extraction test remains explicitly assigned to
Block 10.
