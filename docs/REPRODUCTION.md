# HeapSleuth Reproduction Guide

This guide supports two different goals:

1. **Audit the submitted result without an API key.** Validate the code, browser
   harness, saved artifacts, and deterministic evaluator inputs.
2. **Regenerate model outputs.** Run the baseline and agentic solution with a
   Gemini API key. Model output and latency can vary, and this path replaces
   active per-case artifacts.

Use a disposable clone for full regeneration if the submitted active cohort must
remain unchanged.

For the scoring protocol and canonical result, see
[`docs/EVALUATION.md`](EVALUATION.md). Return to the project overview in
[`README.md`](../README.md).

## Requirements

The documented environment is:

| Component         | Required or recorded version                            |
| ----------------- | ------------------------------------------------------- |
| Node.js           | `>=20.19.0`; frozen runs used `v20.19.0`                |
| npm               | frozen documentation environment used `10.8.2`          |
| TypeScript        | `5.9.3`                                                 |
| Vite              | `8.2.2`                                                 |
| React / React DOM | `19.2.8`                                                |
| Playwright Core   | `1.62.1`                                                |
| Vitest            | `4.1.11`                                                |
| Zod               | `4.5.2`                                                 |
| Model             | `gemini-3.6-flash`                                      |
| Provider          | `gemini-interactions`                                   |
| Browser adapter   | direct Chrome DevTools Protocol through Playwright Core |

All direct JavaScript dependency versions are pinned exactly in the two package
manifests and the lockfile.

The browser runner searches common Google Chrome, Microsoft Edge, Chromium, and
Chrome paths on Windows, macOS, and Linux. Set `CHROME_PATH` when the browser is
elsewhere. The frozen run used Chrome `151.0.7922.174` on Windows x64; another
Chromium build can produce different absolute heap sizes.

Full live regeneration requires network access and a Gemini API key authorized
for the configured model. It uses eight baseline requests and sixteen solution
requests (one Investigator and one Verifier per case), for 24 successful
requests total. Confirm that the project's quota can support the batch; a
free-tier limit may be smaller. Failed requests are saved and are not silently
retried.

## Install from a clean checkout

POSIX shell:

```bash
git clone <repository-url> heapsleuth
cd heapsleuth
npm ci
cp .env.example .env
```

Windows PowerShell:

```powershell
git clone <repository-url> heapsleuth
Set-Location heapsleuth
npm ci
Copy-Item .env.example .env
```

`npm ci` installs both the root project and the `benchmark` workspace from
`package-lock.json`. Do not commit `.env`.

## Configuration

```env
GEMINI_API_KEY=
AI_MODEL=gemini-3.6-flash
BROWSER_HEADLESS=true
RESULTS_DIR=results
CHROME_PATH=
```

| Variable           | Meaning                                                                        |
| ------------------ | ------------------------------------------------------------------------------ |
| `GEMINI_API_KEY`   | Required only for live baseline or solution calls.                             |
| `AI_MODEL`         | Gemini model identifier. Keep `gemini-3.6-flash` to match the frozen protocol. |
| `BROWSER_HEADLESS` | `true` for headless evidence collection; `false` to watch the browser.         |
| `RESULTS_DIR`      | Root for generated result artifacts; defaults to `results`.                    |
| `CHROME_PATH`      | Optional absolute path to a supported Chromium executable.                     |

Do not paste credentials into commands, logs, issues, or submission files.

## Path A: audit saved evidence without Gemini

```bash
npm run validate
npm run smoke:benchmark
npm run evaluate
```

The evaluator uses the currently active saved baseline and solution artifacts.
It freezes their run IDs before loading evaluator-only ground truth and
regenerates:

- `results/summary/evaluation-cohort.json`;
- `results/summary/comparison.json`;
- `results/summary/comparison.md`;
- `results/summary/changelog-evidence.json`.

The expected primary result is baseline RCLA `3/8` and solution RCLA `5/8`, with
cohort hash `6c8c0f3f9fa017deb386e9b947c5a897a41dbb9d152f5157eadea6fa50980dff`.

## Inspect the benchmark UI

```bash
npm run benchmark
```

Vite prints the port it selected. Open that exact URL with a valid route, for
example:

```text
http://localhost:<printed-port>/cases/event-listener
```

Other case IDs are listed in the full-cohort section below. Stop Vite with
`Ctrl+C`.

## Run one browser-evidence smoke test

```bash
npm run spike
```

This command does not call Gemini. It runs the event-listener spike, forces
garbage collection when supported, validates the evidence, and saves
`results/spike/event-listener/evidence.json`.

## Run one live baseline or solution case

```bash
npm run baseline -- --case event-listener
npm run solution -- --case event-listener
```

The solution command starts and stops its own benchmark server. It emits the
result directory, trajectory path, and request counts. Each successful solution
case should report one Investigator and one Verifier request.

## Regenerate the full cohort

The frozen order is:

```text
event-listener
interval
resize-observer
detached-dom
global-cache
closure-registry
event-bus
healthy-control
```

Run the full baseline:

```bash
npm run baseline
```

Then run the solution once per case. POSIX shell:

```bash
for case_id in event-listener interval resize-observer detached-dom global-cache closure-registry event-bus healthy-control; do
  npm run solution -- --case "$case_id" || break
done
```

Windows PowerShell:

```powershell
$caseIds = @(
  'event-listener',
  'interval',
  'resize-observer',
  'detached-dom',
  'global-cache',
  'closure-registry',
  'event-bus',
  'healthy-control'
)

foreach ($caseId in $caseIds) {
  npm run solution -- --case $caseId
  if ($LASTEXITCODE -ne 0) { break }
}
```

Finally:

```bash
npm run evaluate
```

Do not compare a partially regenerated solution cohort with an older baseline
without disclosing that fact. `evaluation-cohort.json` records every selected
run ID, model, prompt version, hash, and selection reason.

## Artifact layout

For each active baseline case:

```text
results/baseline/<case-id>/
  input-manifest.json
  metrics.json
  report.md
  result.json
  run-metadata.json
```

For each active solution case:

```text
results/solution/<case-id>/
  browser-evidence.json
  input-manifest.json
  investigator-result.json
  metrics.json
  report.md
  result.json
  run-metadata.json
  verification.json

trajectories/<case-id>/<run-id>.jsonl
```

When a case is rerun, the previous active directory is copied into `attempts/`
before replacement. Provider failures are preserved with `failure.json`; they
are not fabricated as successful evidence.

## Failure recovery

- **Quota or rate limit:** wait for the provider quota window or use an
  appropriately authorized project, then rerun only the failed case. Preserve
  the failure artifact.
- **Model not found:** verify `AI_MODEL` access. Changing the model changes the
  evaluation protocol and must be disclosed.
- **Browser not found:** set `CHROME_PATH` to the executable's absolute path.
- **Unknown benchmark route:** use `/cases/<case-id>`, not the root page.
- **Schema validation failure:** keep the saved failure and rerun after the
  provider is healthy; do not hand-edit a model result into passing form.
- **Different scores after regeneration:** model outputs are not guaranteed
  byte-for-byte deterministic. Report the new cohort hash and do not present it
  as the submitted frozen cohort.

## Final verification checklist

```bash
npm run validate
npm run smoke:benchmark
npm run evaluate
git diff --check
```

Before packaging, confirm that `.env`, `node_modules`, credentials, and personal
files are absent. Block 10 performs the independent final-ZIP extraction test.
