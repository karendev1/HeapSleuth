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
