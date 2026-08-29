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
