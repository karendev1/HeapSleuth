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
